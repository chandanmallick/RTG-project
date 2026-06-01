import ssl
import requests
import urllib3
urllib3.disable_warnings(
    urllib3.exceptions.InsecureRequestWarning
)

from datetime import datetime, time, timedelta
from urllib.parse import (
    parse_qsl,
    urlencode,
    urlsplit,
    urlunsplit
)

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None

from services.token_service import TokenService
from services.pipeline_config_service import PipelineConfigService
from services.db_handler import MongoService


class CustomHttpAdapter(
    requests.adapters.HTTPAdapter
):
    def __init__(
        self,
        ssl_context=None,
        **kwargs
    ):
        self.ssl_context = ssl_context
        super().__init__(**kwargs)

    def init_poolmanager(
        self,
        connections,
        maxsize,
        block=False
    ):
        self.poolmanager = (
            urllib3.poolmanager.PoolManager(
                num_pools=connections,
                maxsize=maxsize,
                block=block,
                ssl_context=self.ssl_context
            )
        )


def get_legacy_session():

    ctx = ssl.create_default_context(
        ssl.Purpose.SERVER_AUTH
    )

    ctx.check_hostname = False

    ctx.options |= 0x4

    session = requests.session()

    session.mount(
        "https://",
        CustomHttpAdapter(ctx)
    )

    return session


class RTGDashboardService:

    @staticmethod
    def _current_rtg_date():

        if ZoneInfo:

            return datetime.now(
                ZoneInfo("Asia/Kolkata")
            ).date().isoformat()

        return datetime.now().date().isoformat()

    @staticmethod
    def _with_rtg_date(
        url,
        rtg_date=None
    ):

        date_value = (
            rtg_date
            or RTGDashboardService
            ._current_rtg_date()
        )

        parts = urlsplit(url)

        query_items = [
            (key, value)
            for key, value in parse_qsl(
                parts.query,
                keep_blank_values=True
            )
            if key != "in_date"
        ]

        query = urlencode(
            [
                ("in_date", date_value),
                *query_items
            ]
        )

        return urlunsplit(
            (
                parts.scheme,
                parts.netloc,
                parts.path,
                query,
                parts.fragment
            )
        )

    @staticmethod
    def _to_number(value):

        try:

            return float(value or 0)

        except (TypeError, ValueError):

            return 0

    @staticmethod
    def fetch_snapshot():

        db = MongoService()

        print(
            "PIPELINE CONFIGS =",
            list(
                db.pipeline_config_collection.find(
                    {},
                    {"_id": 0}
                )
            )
        )

        rtg_config = (
            PipelineConfigService()
            .get_config("RTG")
        )

        dashboard_config = (
            PipelineConfigService()
            .get_config("RTG_DASHBOARD")
        )

        if not dashboard_config:

            raise Exception(
                "RTG_DASHBOARD config not found in pipeline_config"
            )
        
        if not rtg_config:

            raise Exception(
                "RTG config not found"
            )
        
        print("RTG CONFIG =", rtg_config)

        print(
            "RTG DASHBOARD CONFIG =",
            dashboard_config
        )

        token = TokenService.get_token(

            rtg_config["rtg_token_url"],

            rtg_config["rtg_username"],

            rtg_config["rtg_password"]
        )

        headers = {

            "Content-Type":
                "application/json",

            "Authorization":
                f"Token {token}"
        }

        url = RTGDashboardService._with_rtg_date(
            dashboard_config[
                "rtg_data_url"
            ]
        )

        print("RTG DASHBOARD FETCH URL =", url)

        session = get_legacy_session()

        response = session.get(

            url,

            headers=headers,

            verify=False,

            timeout=60
        )
        print(
            "RTG RESPONSE STATUS =",
            response.status_code
        )

        

        response.raise_for_status()

        data = response.json()

        import json

        if data:

            print(
                json.dumps(
                    data[0],
                    indent=2
                )
            )

        print("CHANDAN RTG RECORD COUNT =", len(data))

        db = MongoService()

        db.rtg_dashboard_collection.insert_one({

            "snapshot_time":
                datetime.utcnow(),

            "snapshot_date":
                RTGDashboardService._current_rtg_date(),

            "record_count":
                len(data),

            "data":
                data
        })

        return len(data)
    
    @staticmethod
    def fetch_live_data():

        rtg_config = (
            PipelineConfigService()
            .get_config("RTG")
        )

        if not rtg_config:
            raise Exception("RTG config not found")

        token = TokenService.get_token(
            rtg_config["rtg_token_url"],
            rtg_config["rtg_username"],
            rtg_config["rtg_password"]
        )

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Token {token}"
        }

        session = get_legacy_session()

        dashboard_config = (
            PipelineConfigService()
            .get_config("RTG_DASHBOARD")
        )

        url = (
            dashboard_config.get("rtg_data_url")
            if dashboard_config
            else (
                "https://rtgapi.grid-india.in/"
                "sendData/combined-data-view/"
                "?in_region_name=ERLDC"
                "&in_fuel_type=THERMAL"
            )
        )

        url = RTGDashboardService._with_rtg_date(url)

        print("RTG LIVE FETCH URL =", url)

        response = session.get(
            url,
            headers=headers,
            verify=False
        )

        response.raise_for_status()

        return response.json()

    @staticmethod
    def fetch_today_trend():

        db = MongoService()

        if ZoneInfo:

            tz = ZoneInfo("Asia/Kolkata")

            now_local = datetime.now(tz)

            start_local = now_local - timedelta(hours=3)

            end_local = now_local

            start_utc = start_local.astimezone(
                ZoneInfo("UTC")
            ).replace(tzinfo=None)

            end_utc = end_local.astimezone(
                ZoneInfo("UTC")
            ).replace(tzinfo=None)

        else:

            now_utc = datetime.utcnow()

            start_utc = now_utc - timedelta(hours=3)

            end_utc = now_utc

        snapshots = db.rtg_dashboard_collection.find(
            {
                "snapshot_time": {
                    "$gte": start_utc,
                    "$lt": end_utc
                }
            },
            {
                "_id": 0,
                "snapshot_time": 1,
                "data": 1
            }
        ).sort("snapshot_time", 1)

        trend = []

        for snapshot in snapshots:

            rows = snapshot.get("data", [])

            outage = sum(
                RTGDashboardService._to_number(
                    row.get("forced_outage")
                )
                +
                RTGDashboardService._to_number(
                    row.get("planned_outage")
                )
                +
                RTGDashboardService._to_number(
                    row.get("fuel_shortage")
                )
                +
                RTGDashboardService._to_number(
                    row.get("commercial_issues")
                )
                +
                RTGDashboardService._to_number(
                    row.get("rsd")
                )
                for row in rows
            )

            unreq_power = sum(
                RTGDashboardService._to_number(
                    row.get("unreq_margin")
                )
                for row in rows
            )

            snapshot_time = snapshot.get(
                "snapshot_time"
            )

            if ZoneInfo and snapshot_time:

                display_time = (
                    snapshot_time
                    .replace(tzinfo=ZoneInfo("UTC"))
                    .astimezone(
                        ZoneInfo("Asia/Kolkata")
                    )
                    .strftime("%H:%M")
                )

            elif snapshot_time:

                display_time = snapshot_time.strftime(
                    "%H:%M"
                )

            else:

                display_time = ""

            trend.append({
                "time": display_time,
                "outage": round(outage, 2),
                "unreqPower": round(unreq_power, 2)
            })

        return trend
