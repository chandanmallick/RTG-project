import ssl
import requests
import traceback
import urllib3
from datetime import date, datetime
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
from services.db_handler import MongoService
from services.pipeline_config_service import PipelineConfigService
from services.pipeline_logger import PipelineLogger

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class LegacySSLAdapter(HTTPAdapter):
    """
    HTTP adapter that enables unsafe legacy SSL renegotiation.
    Required for connecting to report.erldc.in which uses legacy TLS
    that is blocked by default in OpenSSL 3.x.
    """
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.options |= 0x4  # OP_LEGACY_SERVER_CONNECT
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


class PSPService:

    LOGIN_URL = "https://report.erldc.in/POSOCO/Account/Login"
    DATA_URL  = "https://report.erldc.in/POSOCO/PSP/GetPSPData"
    NLDC_PSP_DEMAND_URL = (
        "https://reporting.nldc.in/Reporting_API/API/NLDCReport/"
        "GetMaxDemandMetTimeDataByDate/{date_text}"
    )
    INDIA_15_MIN_DEMAND_URL = (
        "https://report.erldc.in/posoco_api/api/StgHourlyStateData/"
        "GetStgHourlyStateDataNRByMonthNLDC/{date_from}/{date_to}/1"
    )
    ALL_STATE_DEMAND_URL = (
        "https://reporting.nldc.in/Reporting_API/API/NLDCReport/"
        "GetPowerSupplyPositionStatesDataByDate/{date_text}"
    )

    @staticmethod
    def _create_session():
        """Create a requests session with legacy SSL support and login."""
        session = requests.Session()
        session.mount("https://", LegacySSLAdapter())

        config = PipelineConfigService().get_config("PSP") or {}
        login_url = config.get("psp_login_url") or PSPService.LOGIN_URL
        username = config.get("psp_username") or "erldc"
        password = config.get("psp_password") or "erldc1"

        # Login via POST
        headers = {'User-Agent': 'Mozilla/5.0'}
        payload = {'User_Name': username, 'password': password}
        resp = session.post(login_url, headers=headers, data=payload, verify=False, timeout=30)
        resp.raise_for_status()

        return session

    @staticmethod
    def fetch_and_save_date(dt: date, session=None):
        logger = PipelineLogger()
        date_str_db = dt.strftime("%Y-%m-%d")
        revision_id = f"PSP_{dt.strftime('%Y%m%d')}"

        try:
            # Create authenticated session if not provided
            if session is None:
                session = PSPService._create_session()

            # GET PSP data for the date
            config = PipelineConfigService().get_config("PSP") or {}
            psp_data_url = config.get("psp_data_url") or PSPService.DATA_URL
            PSP_Rep_URL = "{}?date={}".format(psp_data_url, dt.strftime("%d-%m-%Y"))
            resp_rep = session.get(PSP_Rep_URL, verify=False, timeout=30)
            resp_rep.raise_for_status()

            psp_json = resp_rep.json()

            # Inject metadata
            psp_json["date"] = date_str_db
            psp_json["fetched_at"] = datetime.utcnow().isoformat()

            # Upsert into MongoDB
            db = MongoService()
            db.psp_collection.update_one(
                {"date": date_str_db},
                {"$set": psp_json},
                upsert=True
            )

            # Log success
            logger.log(
                revision_id=revision_id,
                pipeline_type="PSP",
                process_name="PSP_FETCH",
                status="SUCCESS",
                message=f"PSP data fetched and stored successfully for {date_str_db}"
            )

            return {
                "success": True,
                "date": date_str_db,
                "message": f"Successfully synced PSP data for {date_str_db}"
            }

        except Exception as e:
            logger.log(
                revision_id=revision_id,
                pipeline_type="PSP",
                process_name="PSP_FETCH",
                status="FAILED",
                message=f"PSP fetch failed for {date_str_db}: {str(e)}",
                traceback_error=traceback.format_exc()
            )
            raise e

    @staticmethod
    def fetch_and_save_range(start_dt: date, end_dt: date, progress_callback=None):
        """Fetch PSP data for a date range using a single authenticated session."""
        session = PSPService._create_session()

        from datetime import timedelta
        total_days = (end_dt - start_dt).days + 1
        completed = 0
        curr_dt = start_dt

        while curr_dt <= end_dt:
            if progress_callback:
                progress_callback(total_days, completed, curr_dt.strftime("%Y-%m-%d"), "RUNNING")

            try:
                PSPService.fetch_and_save_date(curr_dt, session=session)
                completed += 1
            except Exception as e:
                print(f"[PSP] Failed for {curr_dt}: {e}")
                completed += 1

            curr_dt += timedelta(days=1)

        if progress_callback:
            progress_callback(total_days, completed, "", "COMPLETED")

        return completed

    @staticmethod
    def fetch_and_save_nldc_demand_date(dt: date):
        date_str_db = dt.strftime("%Y-%m-%d")
        date_text = dt.strftime("%d-%m-%Y")
        config = PipelineConfigService().get_config("PSP") or {}
        template = config.get(
            "nldc_demand_api_url",
            PSPService.NLDC_PSP_DEMAND_URL
        )
        url = template.format(
            date_text=date_text
        )

        session = requests.Session()
        session.mount("https://", LegacySSLAdapter())

        response = session.get(
            url,
            verify=False,
            timeout=90,
            headers={
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0"
            }
        )
        response.raise_for_status()

        rows = response.json()
        if not isinstance(rows, list):
            raise ValueError("NLDC demand API did not return a list.")

        normalized_rows = []
        region_map = {}

        for row in rows:
            description = str(
                row.get("DESCRIPTION") or ""
            ).strip()

            normalized = {
                "id": row.get("ID"),
                "region": description,
                "max_demand_met": row.get("MAX_DEMAND_MET"),
                "max_demand_met_time": row.get("MAX_DEMAND_MET_TIME"),
                "max_demand_met_solar": row.get("MAX_DEMAND_MET_SOLAR"),
                "max_demand_met_solar_time": row.get("MAX_DEMAND_MET_SOLAR_TIME"),
                "max_demand_met_non_solar": row.get("MAX_DEMAND_MET_NON_SOLAR"),
                "max_demand_met_non_solar_time": row.get("MAX_DEMAND_MET_NON_SOLAR_TIME"),
                "date_key": row.get("DATE_KEY")
            }

            normalized_rows.append(normalized)

            if description:
                region_map[description.upper()] = normalized

        document = {
            "date": date_str_db,
            "date_text": date_text,
            "date_key": int(dt.strftime("%Y%m%d")),
            "source": "NLDC GetMaxDemandMetTimeDataByDate",
            "source_url": url,
            "fetched_at": datetime.utcnow().isoformat(),
            "record_count": len(rows),
            "regions": region_map,
            "rows": normalized_rows,
            "raw_rows": rows
        }

        db = MongoService()
        db.nldc_psp_demand_collection.update_one(
            {"date": date_str_db},
            {"$set": document},
            upsert=True
        )

        return {
            "success": True,
            "date": date_str_db,
            "records": len(rows),
            "message": f"NLDC PSP demand synced for {date_str_db}"
        }

    @staticmethod
    def fetch_and_save_india_15_min_demand_date(dt: date):
        date_str_db = dt.strftime("%Y-%m-%d")
        date_text = dt.strftime("%d-%m-%Y")
        config = PipelineConfigService().get_config("PSP") or {}
        template = config.get(
            "india_15_min_demand_api_url",
            PSPService.INDIA_15_MIN_DEMAND_URL
        )
        url = template.format(
            date_from=date_text,
            date_to=date_text
        )

        session = requests.Session()
        session.mount("https://", LegacySSLAdapter())

        response = session.get(
            url,
            verify=False,
            timeout=90,
            headers={
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0"
            }
        )
        response.raise_for_status()

        rows = response.json()
        if not isinstance(rows, list):
            raise ValueError("India 15 Min demand API did not return a list.")

        normalized_rows = []
        states = {}

        for row in rows:
            state = str(row.get("STATE_NAME") or "").strip()
            state_key = state.upper()

            normalized = {
                "id": row.get("ID"),
                "data_date": row.get("DATA_DATE"),
                "hour_id": row.get("HOUR_ID"),
                "region_id": row.get("REGION_ID"),
                "state_id": row.get("STATE_ID"),
                "state_name": state,
                "state_short_name": row.get("STATE_SHORT_NAME"),
                "hour_demand": row.get("HOUR_DEMAND"),
                "hour_demand_unrestricted": row.get("HOUR_DEMAND_UNRESTRICTED"),
                "hour_load_shedding": row.get("HOUR_LOAD_SHEDDING"),
                "hour_load_shed_unrestricted": row.get("HOUR_LOAD_SHED_UNRESTRICTED"),
                "created_date": row.get("CREATED_DATE"),
                "modified_date": row.get("MODIFIED_DATE")
            }

            normalized_rows.append(normalized)

            if state_key:
                states.setdefault(state_key, []).append(normalized)

        document = {
            "date": date_str_db,
            "date_text": date_text,
            "source": "GetStgHourlyStateDataNRByMonthNLDC",
            "source_url": url,
            "fetched_at": datetime.utcnow().isoformat(),
            "record_count": len(rows),
            "states": states,
            "rows": normalized_rows,
            "raw_rows": rows
        }

        db = MongoService()
        db.india_15_min_demand_collection.update_one(
            {"date": date_str_db},
            {"$set": document},
            upsert=True
        )

        return {
            "success": True,
            "date": date_str_db,
            "records": len(rows),
            "message": f"India 15 Min demand synced for {date_str_db}"
        }

    @staticmethod
    def fetch_and_save_all_state_demand_date(dt: date):
        date_str_db = dt.strftime("%Y-%m-%d")
        date_text = dt.strftime("%d-%m-%Y")
        config = PipelineConfigService().get_config("PSP") or {}
        template = config.get(
            "all_state_demand_api_url",
            PSPService.ALL_STATE_DEMAND_URL
        )
        url = template.format(
            date_text=date_text
        )

        session = requests.Session()
        session.mount("https://", LegacySSLAdapter())

        response = session.get(
            url,
            verify=False,
            timeout=90,
            headers={
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0"
            }
        )
        response.raise_for_status()

        rows = response.json()
        if not isinstance(rows, list):
            raise ValueError("All State demand API did not return a list.")

        normalized_rows = []
        state_map = {}
        region_map = {}

        def number_or_none(value):
            if value is None:
                return None
            try:
                return float(value)
            except (TypeError, ValueError):
                return None

        for row in rows:
            state_name = str(row.get("STATE_NAME") or "").strip()
            display_state_name = str(row.get("DISPLAY_STATE_NAME") or state_name).strip()
            region = str(row.get("REGION") or "").strip()
            state_key = state_name.upper()
            region_key = region.upper()

            normalized = {
                "id": row.get("ID"),
                "date_key": row.get("DATE_KEY"),
                "region": region,
                "state_name": state_name,
                "display_state_name": display_state_name,
                "max_demand_met_during_day_mw": number_or_none(row.get("MAX_DEMAND_MET_DURING_DAY_MW")),
                "shortage_during_max_demand_mw": number_or_none(row.get("SHORTAGE_DURING_MAX_DEMAND_MW")),
                "energy_met_mu": number_or_none(row.get("ENERGY_MET_MU")),
                "drawal_schedule_mu": number_or_none(row.get("DRAWAL_SCHEDULE_MU")),
                "od_ud_mu": number_or_none(row.get("OD_UD_MU")),
                "max_od_mw": number_or_none(row.get("MAX_OD_MW")),
                "energy_shortage_mu": number_or_none(row.get("ENERGY_SHORTAGE_MU"))
            }

            normalized_rows.append(normalized)

            if state_key:
                state_map[state_key] = normalized
            if region_key:
                region_map.setdefault(region_key, []).append(normalized)

        document = {
            "date": date_str_db,
            "date_text": date_text,
            "date_key": int(dt.strftime("%Y%m%d")),
            "source": "GetPowerSupplyPositionStatesDataByDate",
            "source_url": url,
            "fetched_at": datetime.utcnow().isoformat(),
            "record_count": len(rows),
            "states": state_map,
            "regions": region_map,
            "rows": normalized_rows,
            "raw_rows": rows
        }

        db = MongoService()
        db.all_state_demand_collection.update_one(
            {"date": date_str_db},
            {"$set": document},
            upsert=True
        )

        return {
            "success": True,
            "date": date_str_db,
            "records": len(rows),
            "message": f"All State demand synced for {date_str_db}"
        }
