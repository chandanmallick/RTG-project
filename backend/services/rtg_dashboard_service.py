import ssl
import requests
import urllib3
from concurrent.futures import ThreadPoolExecutor, as_completed
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

    HISTORICAL_METRICS = {
        "schedule": "Schedule",
        "dc": "DC",
        "cap_on_bar": "Capacity on Bar",
        "actual_gen": "Actual",
    }

    @staticmethod
    def _mask_config(config):

        masked = dict(config or {})

        for key in ("rtg_password", "password"):

            if key in masked:

                masked[key] = "***"

        return masked

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
    def _snapshot_local_time(value):
        if not value:
            return None
        if isinstance(value, str):
            try:
                value = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
        if ZoneInfo:
            if value.tzinfo is None:
                value = value.replace(tzinfo=ZoneInfo("UTC"))
            return value.astimezone(ZoneInfo("Asia/Kolkata"))
        return value

    @staticmethod
    def _plant_label(row):
        name = (
            row.get("station_name")
            or row.get("station")
            or row.get("plant_name")
            or row.get("utility_name")
            or "Unknown plant"
        )
        plant_id = row.get("plant_id") or row.get("rtg_plant_id")
        return f"{name} ({plant_id})" if plant_id else str(name)

    @staticmethod
    def _historical_group(row, selections):
        utility_type = str(row.get("utility_type") or "").strip().upper()
        state_name = str(row.get("state_name") or "").strip()
        is_state = utility_type in {"STATE", "STATE_IPP"}
        for selection in selections:
            if selection.startswith("STATE:"):
                selected_state = selection.split(":", 1)[1]
                if is_state and state_name.casefold() == selected_state.casefold():
                    return selected_state
            elif selection == "ISGS" and utility_type == "ISGS":
                return "ISGS"
            elif selection == "IPP" and utility_type == "IPP":
                return "IPP"
        return None

    @staticmethod
    def historical_options():
        db = MongoService()
        latest = db.rtg_dashboard_collection.find_one(
            {}, {"_id": 0, "data": 1}, sort=[("snapshot_time", -1)]
        ) or {}
        states = sorted({
            str(row.get("state_name") or "").strip()
            for row in latest.get("data", [])
            if str(row.get("utility_type") or "").strip().upper()
            in {"STATE", "STATE_IPP"}
            and str(row.get("state_name") or "").strip()
        })
        return {
            "states": states,
            "metrics": [
                {"value": key, "label": label}
                for key, label in RTGDashboardService.HISTORICAL_METRICS.items()
            ],
            "intervals": [5, 15],
        }

    @staticmethod
    def _series_from_payload(payload, keys):
        source = payload
        if isinstance(payload, dict):
            source = next(
                (payload.get(key) for key in keys if isinstance(payload.get(key), list)),
                [],
            )
        if not isinstance(source, list):
            return []
        return [RTGDashboardService._to_number(value) for value in source]

    @staticmethod
    def _resample_day(series, interval_minutes):
        target_points = 1440 // interval_minutes
        if not series:
            return [None] * target_points
        source_minutes = 1440 / len(series)
        values = []
        for target_index in range(target_points):
            start_minute = target_index * interval_minutes
            end_minute = start_minute + interval_minutes
            indexes = [
                index for index in range(len(series))
                if start_minute <= index * source_minutes < end_minute
            ]
            if indexes:
                values.append(round(sum(series[index] for index in indexes) / len(indexes), 3))
            else:
                source_index = min(int(start_minute / source_minutes), len(series) - 1)
                values.append(series[source_index])
        return values

    @staticmethod
    def _fetch_api_historical_matrix(
        start, end, metrics, selections, plant_wise, interval_minutes
    ):
        db = MongoService()
        latest = db.rtg_dashboard_collection.find_one(
            {}, {"_id": 0, "data": 1}, sort=[("snapshot_time", -1)]
        ) or {}
        plants = []
        for row in latest.get("data", []):
            group = RTGDashboardService._historical_group(row, selections)
            plant_id = row.get("plant_id") or row.get("rtg_plant_id")
            if group and plant_id:
                plants.append({"id": str(plant_id), "label": RTGDashboardService._plant_label(row), "group": group})
        unique_plants = {plant["id"]: plant for plant in plants}
        plants = list(unique_plants.values())
        if not plants:
            raise RuntimeError("No RTG plants matched the selected entities")

        config = PipelineConfigService().get_config("RTG") or {}
        required = ("rtg_token_url", "rtg_username", "rtg_password")
        if not all(config.get(key) for key in required):
            raise RuntimeError("RTG historical API authentication is not configured")
        token = TokenService.get_token(
            config["rtg_token_url"], config["rtg_username"], config["rtg_password"]
        )
        headers = {"Authorization": f"Token {token}", "Content-Type": "application/json"}
        urls = {
            "schedule": str(config.get("rtg_schedule_url") or "https://rtgapi.grid-india.in/sendData/wbes-data/").rstrip("/") + "/",
            "actual": str(config.get("rtg_scada_url") or "https://rtgapi.grid-india.in/sendData/scada-data/").rstrip("/") + "/",
            "cap": str(config.get("rtg_cap_on_bar_url") or "https://rtgapi.grid-india.in/sendData/cap-on-bar/").rstrip("/") + "/",
        }
        dates = []
        current = start
        while current <= end:
            dates.append(current.isoformat())
            current += timedelta(days=1)

        needs_schedule = any(metric in metrics for metric in ("schedule", "dc"))
        needs_actual = "actual_gen" in metrics
        needs_cap = "cap_on_bar" in metrics

        def fetch_one(date_value, plant):
            result = {metric: [] for metric in metrics}
            session = get_legacy_session()
            if needs_schedule:
                response = session.get(f'{urls["schedule"]}{date_value}/{plant["id"]}/', headers=headers, verify=False, timeout=20)
                response.raise_for_status()
                payload = response.json() or {}
                if "schedule" in metrics:
                    result["schedule"] = RTGDashboardService._series_from_payload(payload, ("schedule",))
                if "dc" in metrics:
                    result["dc"] = RTGDashboardService._series_from_payload(payload, ("dc",))
            if needs_actual:
                response = session.get(f'{urls["actual"]}{date_value}/{plant["id"]}/', headers=headers, verify=False, timeout=20)
                response.raise_for_status()
                result["actual_gen"] = RTGDashboardService._series_from_payload(response.json(), ("actual", "data", "scada", "values"))
            if needs_cap:
                response = session.get(f'{urls["cap"]}{date_value}/{plant["id"]}/', headers=headers, verify=False, timeout=20)
                response.raise_for_status()
                result["cap_on_bar"] = RTGDashboardService._series_from_payload(response.json(), ("cap_on_bar", "data", "values"))
            return date_value, plant, {
                metric: RTGDashboardService._resample_day(result[metric], interval_minutes)
                for metric in metrics
            }

        fetched = {}
        errors = []
        with ThreadPoolExecutor(max_workers=12) as executor:
            futures = [executor.submit(fetch_one, date_value, plant) for date_value in dates for plant in plants]
            for future in as_completed(futures):
                try:
                    date_value, plant, series = future.result()
                    fetched[(date_value, plant["id"])] = (plant, series)
                except Exception as exc:
                    errors.append(str(exc))
        if not fetched:
            raise RuntimeError(errors[0] if errors else "RTG historical APIs returned no data")

        entities = sorted(
            {plant["label"] if plant_wise else plant["group"] for plant in plants}
        )
        columns = []
        for entity in entities:
            for metric in metrics:
                columns.append({
                    "key": f"c{len(columns) + 1}", "entity": entity,
                    "scope": next((p["group"] for p in plants if (p["label"] if plant_wise else p["group"]) == entity), entity),
                    "metric": metric,
                    "label": f'{entity} - {RTGDashboardService.HISTORICAL_METRICS[metric]} (MW)',
                })
        rows = []
        points = 1440 // interval_minutes
        for date_value in dates:
            for index in range(points):
                timestamp = datetime.strptime(date_value, "%Y-%m-%d") + timedelta(minutes=index * interval_minutes)
                output = {"date": timestamp.strftime("%d-%m-%Y"), "time": timestamp.strftime("%H:%M"), "timestamp": timestamp.isoformat()}
                for column in columns:
                    values = []
                    for plant in plants:
                        entity = plant["label"] if plant_wise else plant["group"]
                        item = fetched.get((date_value, plant["id"]))
                        if entity == column["entity"] and item:
                            value = item[1][column["metric"]][index]
                            if value is not None:
                                values.append(value)
                    output[column["key"]] = round(sum(values), 2) if values else None
                rows.append(output)
        return {
            "start_date": start.isoformat(), "end_date": end.isoformat(),
            "interval_minutes": interval_minutes, "plant_wise": bool(plant_wise),
            "selections": selections, "metrics": metrics, "columns": columns, "rows": rows,
            "source": "RTG historical APIs", "warnings": len(errors),
        }

    @staticmethod
    def fetch_historical_matrix(
        start_date,
        end_date,
        metrics=None,
        selections=None,
        plant_wise=False,
        interval_minutes=15,
    ):
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
        if end < start:
            raise ValueError("End date cannot be before start date")
        if (end - start).days > 31:
            raise ValueError("Select a date range of 31 days or less")

        valid_metrics = RTGDashboardService.HISTORICAL_METRICS
        metrics = [item for item in (metrics or list(valid_metrics)) if item in valid_metrics]
        if not metrics:
            raise ValueError("Select at least one data field")
        selections = selections or ["ISGS", "IPP"]
        interval_minutes = 5 if int(interval_minutes) == 5 else 15

        try:
            return RTGDashboardService._fetch_api_historical_matrix(
                start, end, metrics, selections, plant_wise, interval_minutes
            )
        except Exception as api_error:
            print(f"RTG historical API fetch failed; using stored snapshots: {api_error}")

        db = MongoService()
        end_exclusive = end + timedelta(days=1)
        query = {
            "$or": [
                {"snapshot_date": {"$gte": start.isoformat(), "$lt": end_exclusive.isoformat()}},
                {"snapshot_time": {
                    "$gte": datetime.combine(start, time.min) - timedelta(hours=5, minutes=30),
                    "$lt": datetime.combine(end_exclusive, time.min) - timedelta(hours=5, minutes=30),
                }},
            ]
        }
        snapshots = db.rtg_dashboard_collection.find(
            query, {"_id": 0, "snapshot_time": 1, "data": 1}
        ).sort("snapshot_time", 1)

        bucket_values = {}
        column_meta = {}
        for snapshot in snapshots:
            local_time = RTGDashboardService._snapshot_local_time(snapshot.get("snapshot_time"))
            if not local_time or not (start <= local_time.date() <= end):
                continue
            minute = (local_time.minute // interval_minutes) * interval_minutes
            bucket = local_time.replace(minute=minute, second=0, microsecond=0)
            grouped = {}
            for row in snapshot.get("data", []):
                group = RTGDashboardService._historical_group(row, selections)
                if not group:
                    continue
                entity = RTGDashboardService._plant_label(row) if plant_wise else group
                grouped.setdefault(entity, {metric: 0.0 for metric in metrics})
                for metric in metrics:
                    grouped[entity][metric] += RTGDashboardService._to_number(row.get(metric))
                column_meta[entity] = {
                    "entity": entity,
                    "scope": group,
                    "plant_wise": bool(plant_wise),
                }
            # A later snapshot inside the same 5/15-minute bucket is authoritative.
            bucket_values[bucket] = grouped

        entities = sorted(column_meta, key=lambda value: (column_meta[value]["scope"], value))
        columns = []
        for entity in entities:
            for metric in metrics:
                key = f"c{len(columns) + 1}"
                columns.append({
                    "key": key,
                    "label": f"{entity} - {valid_metrics[metric]} (MW)",
                    "entity": entity,
                    "scope": column_meta[entity]["scope"],
                    "metric": metric,
                })

        rows = []
        for bucket in sorted(bucket_values):
            values = bucket_values[bucket]
            output = {
                "date": bucket.strftime("%d-%m-%Y"),
                "time": bucket.strftime("%H:%M"),
                "timestamp": bucket.isoformat(),
            }
            for column in columns:
                value = values.get(column["entity"], {}).get(column["metric"])
                output[column["key"]] = round(value, 2) if value is not None else None
            rows.append(output)

        return {
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "interval_minutes": interval_minutes,
            "plant_wise": bool(plant_wise),
            "selections": selections,
            "metrics": metrics,
            "columns": columns,
            "rows": rows,
        }

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
        
        print(
            "RTG CONFIG =",
            RTGDashboardService._mask_config(rtg_config)
        )

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

    @staticmethod
    def fetch_snapshot_trend(date_str=None):

        db = MongoService()

        print(
            f"fetch_snapshot_trend input date_str={date_str!r}",
            flush=True
        )

        if date_str:

            target_date = date_str

        elif ZoneInfo:

            target_date = (
                datetime.now(ZoneInfo("Asia/Kolkata")).date()
                - timedelta(days=1)
            ).isoformat()

        else:

            target_date = (
                datetime.utcnow().date()
                - timedelta(days=1)
            ).isoformat()

        def get_day_bounds(day_text):

            target_day = datetime.strptime(
                day_text,
                "%Y-%m-%d"
            ).date()

            if ZoneInfo:

                tz = ZoneInfo("Asia/Kolkata")

                start_utc = datetime.combine(
                    target_day,
                    time.min,
                    tzinfo=tz
                ).astimezone(
                    ZoneInfo("UTC")
                ).replace(tzinfo=None)

                end_utc = datetime.combine(
                    target_day + timedelta(days=1),
                    time.min,
                    tzinfo=tz
                ).astimezone(
                    ZoneInfo("UTC")
                ).replace(tzinfo=None)

            else:

                start_utc = datetime.combine(
                    target_day,
                    time.min
                )

                end_utc = start_utc + timedelta(
                    days=1
                )

            return start_utc, end_utc

        start_utc, end_utc = get_day_bounds(target_date)

        print(
            (
                "fetch_snapshot_trend target_date="
                f"{target_date} start_utc={start_utc} "
                f"end_utc={end_utc}"
            ),
            flush=True
        )

        projection = {
            "_id": 0,
            "snapshot_time": 1,
            "snapshot_date": 1,
            "data": 1
        }

        snapshots = list(
            db.rtg_dashboard_collection.find(
                {
                    "$or": [
                        {
                            "snapshot_date": target_date
                        },
                        {
                            "snapshot_date": {
                                "$gte": start_utc,
                                "$lt": end_utc
                            }
                        },
                        {
                            "snapshot_time": {
                                "$gte": start_utc,
                                "$lt": end_utc
                            }
                        }
                    ]
                },
                projection
            ).sort("snapshot_time", 1)
        )

        print(
            (
                "fetch_snapshot_trend matched "
                f"{len(snapshots)} snapshots for {target_date}"
            ),
            flush=True
        )

        if not snapshots:

            latest = db.rtg_dashboard_collection.find_one(
                {},
                projection,
                sort=[("snapshot_time", -1)]
            )

            if latest:

                print(
                    "fetch_snapshot_trend using latest snapshot fallback",
                    flush=True
                )

                latest_snapshot_date = latest.get(
                    "snapshot_date"
                )

                latest_snapshot_time = latest.get(
                    "snapshot_time"
                )

                if isinstance(latest_snapshot_date, str):

                    target_date = latest_snapshot_date[:10]

                elif latest_snapshot_time and ZoneInfo:

                    target_date = (
                        latest_snapshot_time
                        .replace(tzinfo=ZoneInfo("UTC"))
                        .astimezone(ZoneInfo("Asia/Kolkata"))
                        .date()
                        .isoformat()
                    )

                elif latest_snapshot_time:

                    target_date = (
                        latest_snapshot_time
                        .date()
                        .isoformat()
                    )

                snapshots = list(
                    db.rtg_dashboard_collection.find(
                        {
                            "snapshot_date":
                                latest_snapshot_date
                        },
                        projection
                    ).sort("snapshot_time", 1)
                )

                if not snapshots:

                    latest_start_utc, latest_end_utc = (
                        get_day_bounds(target_date)
                    )

                    snapshots = list(
                        db.rtg_dashboard_collection.find(
                            {
                                "snapshot_time": {
                                    "$gte": latest_start_utc,
                                    "$lt": latest_end_utc
                                }
                            },
                            projection
                        ).sort("snapshot_time", 1)
                    )

        print(
            (
                "fetch_snapshot_trend final snapshot count="
                f"{len(snapshots)} date={target_date}"
            ),
            flush=True
        )

        snapshots = (
            {
                "snapshot_time": item.get(
                    "snapshot_time"
                ),
                "snapshot_date": item.get(
                    "snapshot_date"
                ),
                "data": item.get("data", [])
            }
            for item in snapshots
        )

        trend = []

        for snapshot in snapshots:

            rows = snapshot.get("data", [])

            cap_on_bar = sum(
                RTGDashboardService._to_number(
                    row.get("cap_on_bar")
                )
                for row in rows
            )

            dc = sum(
                RTGDashboardService._to_number(
                    row.get("dc")
                )
                for row in rows
            )

            schedule = sum(
                RTGDashboardService._to_number(
                    row.get("schedule")
                )
                for row in rows
            )

            actual_gen = sum(
                RTGDashboardService._to_number(
                    row.get("actual_gen")
                )
                for row in rows
            )

            snapshot_time = snapshot.get(
                "snapshot_time"
            )

            if ZoneInfo and snapshot_time:

                local_time = (
                    snapshot_time
                    .replace(tzinfo=ZoneInfo("UTC"))
                    .astimezone(
                        ZoneInfo("Asia/Kolkata")
                    )
                )

                display_time = local_time.strftime(
                    "%H:%M"
                )

                display_datetime = local_time.isoformat()

            elif snapshot_time:

                display_time = snapshot_time.strftime(
                    "%H:%M"
                )

                display_datetime = snapshot_time.isoformat()

            else:

                display_time = ""

                display_datetime = ""

            trend.append({
                "time": display_time,
                "snapshot_time": display_datetime,
                "cap_on_bar": round(cap_on_bar, 2),
                "dc": round(dc, 2),
                "schedule": round(schedule, 2),
                "actual_gen": round(actual_gen, 2),
                "dc_schedule_difference": round(
                    dc - schedule,
                    2
                )
            })

        return {
            "date": target_date,
            "records": trend
        }
