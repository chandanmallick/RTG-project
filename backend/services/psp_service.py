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
