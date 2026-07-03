from fastapi import APIRouter
from pydantic import BaseModel
from datetime import date, timedelta, datetime
import ssl
import requests
import urllib3

from services.pipeline_runner import (
    PipelineRunner
)
from services.pipeline_config_service import PipelineConfigService

router = APIRouter(
    prefix="/api/pipeline",
    tags=["Pipeline"]
)

# =========================================
# MANUAL SCHEDULE TRIGGER
# =========================================

@router.post("/run/schedule")
async def run_schedule():

    PipelineRunner.run_schedule_pipeline()

    return {

        "success": True,

        "message":
            "Schedule pipeline triggered"
    }

# =========================================
# MANUAL OUTAGE TRIGGER
# =========================================

@router.post("/run/outage")
async def run_outage():

    PipelineRunner.run_outage_pipeline()

    return {

        "success": True,

        "message":
            "Outage pipeline triggered"
    }

from services.db_handler import (
    MongoService
)

class OutageCategoryRange(BaseModel):
    label: str = ""
    start_date: str
    end_date: str

class OutageCategoryRequest(BaseModel):
    ranges: list[OutageCategoryRange] = []

MIN_OUTAGE_CATEGORY_UNIT_CAPACITY_MW = 500.0

class LegacySSLAdapter(requests.adapters.HTTPAdapter):
    def __init__(self, ssl_context=None, **kwargs):
        self.ssl_context = ssl_context
        super().__init__(**kwargs)

    def init_poolmanager(self, connections, maxsize, block=False):
        self.poolmanager = urllib3.poolmanager.PoolManager(
            num_pools=connections,
            maxsize=maxsize,
            block=block,
            ssl_context=self.ssl_context
        )

def make_legacy_session():
    ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
    ctx.options |= 0x4
    session = requests.session()
    session.mount("https://", LegacySSLAdapter(ctx))
    return session

def normalize_text(value):
    return " ".join(str(value or "").strip().upper().split())

def compact_key(value):
    return "".join(ch for ch in normalize_text(value) if ch.isalnum())

def to_float(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0

def outage_date_strings(start_date: str, end_date: str):
    start_dt = date.fromisoformat(start_date)
    end_dt = date.fromisoformat(end_date)
    if start_dt > end_dt:
        raise ValueError("Start date must be less than or equal to end date.")
    return [(start_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range((end_dt - start_dt).days + 1)]

def ensure_generation_outage_history_config(db):
    default_url = "https://crms.erldc.in/Codebook/GenOutagesHistoryData"
    config = db.db["pipeline_config"].find_one({"config_type": "OUTAGE"}) or {}
    if not config:
        db.db["pipeline_config"].update_one(
            {"config_type": "OUTAGE"},
            {"$set": {"config_type": "OUTAGE", "generation_outage_history_url": default_url}},
            upsert=True
        )
    elif not config.get("generation_outage_history_url"):
        db.db["pipeline_config"].update_one(
            {"config_type": "OUTAGE"},
            {"$set": {"generation_outage_history_url": default_url}}
        )
    return default_url

def get_generation_outage_history_url(db):
    default_url = ensure_generation_outage_history_config(db)
    config = PipelineConfigService().get_config("OUTAGE") or {}
    return config.get("generation_outage_history_url") or default_url

def fetch_generation_outage_history_rows(db, start_date: str, end_date: str, session=None):
    cache_key = f"{start_date}|{end_date}"
    cached = db.db["pipeline_generation_outage_history_range"].find_one({"_id": cache_key})
    if cached:
        return cached.get("rows", []), True, cached.get("source_url", "")

    url = get_generation_outage_history_url(db)
    http = session or make_legacy_session()
    params = {
        "start_date": f"{start_date} 00:00",
        "end_date": f"{end_date} 23:59",
    }
    response = http.get(url, params=params, timeout=120)
    response.raise_for_status()
    rows = response.json()
    if isinstance(rows, dict):
        rows = rows.get("data") or rows.get("rows") or []
    rows = rows if isinstance(rows, list) else []
    db.db["pipeline_generation_outage_history_range"].update_one(
        {"_id": cache_key},
        {"$set": {
            "_id": cache_key,
            "start_date": start_date,
            "end_date": end_date,
            "rows": rows,
            "source_url": response.url,
            "fetched_at": datetime.utcnow().isoformat()
        }},
        upsert=True
    )
    return rows, False, response.url

def build_unit_lookup(db):
    unit_rows = list(db.unit_collection.find(
        {},
        {
            "_id": 0,
            "Unit_Name": 1,
            "utility_type": 1,
            "state_name": 1,
            "Generating_Station_Name": 1,
            "installed_capacity": 1,
            "plant_id": 1,
        }
    ))
    lookup = {}
    for row in unit_rows:
        key = normalize_text(row.get("Unit_Name"))
        if key:
            lookup[key] = row
        compact = compact_key(row.get("Unit_Name"))
        if compact:
            lookup[compact] = row
    return lookup

def normalize_outage_portal_row(row, date_key, unit_lookup):
    element_name = row.get("ELEMENT_NAME") or row.get("elementName") or row.get("ElementName") or ""
    outage_type = row.get("TYPE") or row.get("OUTAGE_TYPE") or row.get("outageCategory") or row.get("OutageCategory") or ""
    unit_row = unit_lookup.get(normalize_text(element_name)) or unit_lookup.get(compact_key(element_name)) or {}
    capacity = (
        unit_row.get("installed_capacity")
        or row.get("INSTALLED_CAPACITY")
        or row.get("installedCapacity")
        or row.get("Installed_Capacity")
    )
    return {
        "date": date_key,
        "element_name": str(element_name or "").strip(),
        "type": str(outage_type or "").strip(),
        "utility_type": str(unit_row.get("utility_type") or "").strip(),
        "state_name": str(unit_row.get("state_name") or "").strip(),
        "unit_name": unit_row.get("Unit_Name") or "",
        "plant_id": unit_row.get("plant_id") or "",
        "generating_station": unit_row.get("Generating_Station_Name") or row.get("GENERATING_STATION_NAME") or "",
        "installed_capacity": to_float(capacity),
        "reason": row.get("OUT_REASON") or row.get("REASON") or row.get("reason") or row.get("Reason") or "",
        "outage_date": row.get("OUTAGE_DATE") or row.get("outageDate") or "",
        "outage_time": row.get("OUTAGE_TIME") or row.get("outageTime") or "",
        "revival_date": row.get("REVIVAL_DATE") or row.get("revivalDate") or "",
        "revival_time": row.get("REVIVAL_TIME") or row.get("revivalTime") or "",
        "expected_revival_date": row.get("EXPECTED_REVIVAL_DATE") or row.get("expectedRevivalDate") or "",
        "expected_revival_time": row.get("EXPECTED_REVIVAL_TIME") or row.get("expectedRevivalTime") or "",
        "tripped_time": row.get("Tripped_Time") or row.get("trippedTime") or "",
        "synchronization_time": row.get("Synchronization_Time") or row.get("synchronizationTime") or "",
        "expected_restoration_time": row.get("exprecteTimeOfRestoration") or row.get("expectedRestorationTime") or "",
        "mapped": bool(unit_row),
    }

def categorize_outage_row(row):
    utility_type = normalize_text(row.get("utility_type"))
    outage_type = normalize_text(row.get("type"))
    if utility_type in {"STATE", "STATE_IPP"} and outage_type == "GENERATOR - PLANNED":
        return "State_Planned"
    if utility_type in {"STATE", "STATE_IPP"} and outage_type == "GENERATOR - FORCED":
        return "State_Forced"
    central_utility = utility_type in {"ISGS", "IPP", "REGIONAL_IPP"} or (utility_type.endswith("_IPP") and utility_type != "STATE_IPP")
    if central_utility and outage_type == "GENERATOR - PLANNED":
        return "Central_Planned"
    if central_utility and outage_type == "GENERATOR - FORCED":
        return "Central_Forced"
    return None

def summarize_outage_range(db, range_item, index, session, unit_lookup):
    start_date = range_item.get("start_date")
    end_date = range_item.get("end_date")
    expected_dates = outage_date_strings(start_date, end_date)
    label = str(range_item.get("label") or "").strip() or f"{start_date} to {end_date}"
    categories = {
        "State_Planned": [],
        "State_Forced": [],
        "Central_Planned": [],
        "Central_Forced": [],
    }
    fetched_dates = []
    cache_dates = []
    unmapped_rows = []

    rows, from_cache, source_url = fetch_generation_outage_history_rows(db, start_date, end_date, session=session)
    fetched_dates = expected_dates[:]
    if from_cache:
        cache_dates = expected_dates[:]

    for raw in rows:
        normalized = normalize_outage_portal_row(raw, raw.get("OUTAGE_DATE") or start_date, unit_lookup)
        if to_float(normalized.get("installed_capacity")) <= MIN_OUTAGE_CATEGORY_UNIT_CAPACITY_MW:
            continue
        if not normalized["mapped"]:
            unmapped_rows.append(normalized)
        category = categorize_outage_row(normalized)
        if category:
            categories[category].append(normalized)

    summary = {}
    for category, rows in categories.items():
        summary[category] = {
            "count": len(rows),
            "mw": round(sum(to_float(row.get("installed_capacity")) for row in rows), 3),
        }

    return {
        "label": label,
        "range_index": index,
        "start_date": start_date,
        "end_date": end_date,
        "expected_dates": expected_dates,
        "fetched_dates": fetched_dates,
        "missing_dates": [],
        "cache_dates": cache_dates,
        "source_url": source_url,
        "categories": categories,
        "summary": summary,
        "unmapped": unmapped_rows,
    }

@router.post("/outage/category-range")
async def get_outage_category_range(req: OutageCategoryRequest):

    try:

        range_items = [item.dict() for item in (req.ranges or [])]

        if not range_items:

            return {
                "success": False,
                "message": "At least one date range is required."
            }

        db = MongoService()
        unit_lookup = build_unit_lookup(db)
        session = make_legacy_session()
        ranges = [
            summarize_outage_range(db, item, index, session, unit_lookup)
            for index, item in enumerate(range_items)
        ]
        category_keys = [
            "State_Planned",
            "State_Forced",
            "Central_Planned",
            "Central_Forced"
        ]
        comparison_rows = []

        for category in category_keys:

            row = {"category": category}

            for range_data in ranges:

                label = range_data["label"]
                summary = range_data["summary"].get(category, {})
                row[f"{label}|count"] = summary.get("count", 0)
                row[f"{label}|mw"] = summary.get("mw", 0.0)

            comparison_rows.append(row)

        return {
            "success": True,
            "source": {
                "portal": "CRMS GenOutagesHistoryData",
                "mapping": "unit_data.Unit_Name -> utility_type, state_name",
                "unit_capacity_filter": f"> {MIN_OUTAGE_CATEGORY_UNIT_CAPACITY_MW:g} MW",
                "config": "pipeline_config.OUTAGE.generation_outage_history_url",
                "cache_collection": "pipeline_generation_outage_history_range",
            },
            "categories": category_keys,
            "ranges": ranges,
            "comparison_rows": comparison_rows,
        }

    except ValueError as exc:

        return {
            "success": False,
            "message": str(exc)
        }

    except Exception as exc:

        import traceback
        traceback.print_exc()

        return {
            "success": False,
            "message": str(exc)
        }



@router.get("/logs/{pipeline_type}/{revision_id}")
async def get_logs(

    pipeline_type: str,

    revision_id: str
):

    db = MongoService()

    logs = list(

        db.pipeline_log_collection.find(

            {

                "revision_id":
                    revision_id,

                "pipeline_type":
                    pipeline_type.upper()
            },

            {"_id": 0}
        )
    )

    return {

        "success": True,

        "logs": logs
    }
