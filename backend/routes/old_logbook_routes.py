import io
import json
from datetime import date, datetime
from typing import Any, Dict, List

from bson import ObjectId
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook

from services.db_handler import MongoService


router = APIRouter(prefix="/api/old-logbook", tags=["Old Logbook"])

OLD_LOGBOOK_DB = "Old_logbook"

COLLECTION_CONFIG: Dict[str, Dict[str, Any]] = {
    "shutdown": {
        "collection": "shutdown",
        "label": "Shutdown",
        "element": "ElementName",
        "outage_date": "ActualOutageDate",
        "outage_time": "ActualOutageTime",
        "revival_date": "ActualRestoreDate",
        "revival_time": "ActualRestoreTime",
        "reason_fields": ["Reason"],
        "planned_fields": ["PlannedOutage", "PlannedRestore"],
        "element_type": "EntityId",
    },
    "tripping": {
        "collection": "Tripping",
        "label": "Tripping",
        "element": "Name",
        "outage_date": "TripDate",
        "outage_time": "TripTime",
        "revival_date": "RevivalDate",
        "revival_time": "RevivalTime",
        "reason_fields": ["EndRelayReasonOne", "EndRelayReasonTwo"],
        "reason_label": "Relay",
    },
    "outage": {
        "collection": "Outage",
        "label": "Outage",
        "element": "Name",
        "outage_date": "LogDate",
        "outage_time": "LogTime",
        "revival_date": "RestoreDate",
        "revival_time": "RestoreTime",
        "reason_fields": ["Reason"],
    },
}

ELEMENT_TYPE_LABELS = {
    "AC_TRANSMISSION_LINE_CIRCUIT": "Transmission Line",
    "TRANSFORMER": "Transformer",
    "BUS_REACTOR": "Bus Reactor",
    "LINE_REACTOR": "Line Reactor",
    "BUS": "Bus",
    "BAY": "Bay",
    "GENERATING_UNIT": "Generating Unit",
    "AUTO_RECLOSER": "Auto Recloser",
    "HVDC_POLE": "HVDC Pole",
    "STATCOM": "STATCOM",
}

OLD_LOGBOOK_ELEMENT_TYPE_MAP = {
    "14": "AC_TRANSMISSION_LINE_CIRCUIT",
    "TRANSMISSION LINE": "AC_TRANSMISSION_LINE_CIRCUIT",
    "9": "TRANSFORMER",
    "TRANSFORMER": "TRANSFORMER",
    "4": "BUS_REACTOR",
    "BUS REACTOR": "BUS_REACTOR",
    "5": "LINE_REACTOR",
    "LINE REACTOR": "LINE_REACTOR",
    "16": "BUS",
    "BUS": "BUS",
    "25": "BAY",
    "BAY": "BAY",
    "8": "GENERATING_UNIT",
    "GENERATING UNIT": "GENERATING_UNIT",
    "26": "AUTO_RECLOSER",
    "AUTO RECLOSER": "AUTO_RECLOSER",
    "15": "HVDC_POLE",
    "HVDC POLE": "HVDC_POLE",
    "STATCOM": "STATCOM",
}


def to_jsonable(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): to_jsonable(val) for key, val in value.items()}
    return value


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(to_jsonable(value)).strip()
    if text.lower() in {"none", "nan", "nat", "null"}:
        return ""
    return text


def combine_datetime(doc: dict, date_key: str, time_key: str) -> str:
    date_part = clean_text(doc.get(date_key))
    time_part = clean_text(doc.get(time_key))
    return " ".join(part for part in [date_part, time_part] if part)


def combine_fields(doc: dict, fields: List[str], separator: str = " | ") -> str:
    values = [clean_text(doc.get(field)) for field in fields]
    return separator.join(value for value in values if value)


def normalize_element_type_key(value: Any) -> str:
    text = clean_text(value)
    if not text:
        return ""
    compact = text.upper().replace("_", " ").replace("-", " ")
    compact = " ".join(compact.split())
    return OLD_LOGBOOK_ELEMENT_TYPE_MAP.get(compact, OLD_LOGBOOK_ELEMENT_TYPE_MAP.get(text.upper(), text.upper()))


def display_element_type(value: Any) -> str:
    key = normalize_element_type_key(value)
    return ELEMENT_TYPE_LABELS.get(key, clean_text(value))


def parse_logbook_date(value: Any):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = clean_text(value)
    if not text:
        return None
    text = text.replace("T", " ").split(" ")[0]
    for fmt in (
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%d.%m.%Y",
        "%d-%b-%Y",
        "%d/%b/%Y",
        "%d-%B-%Y",
        "%d/%B/%Y",
    ):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def in_date_range(doc: dict, date_key: str, start_date: date, end_date: date) -> bool:
    parsed = parse_logbook_date(doc.get(date_key))
    return parsed is not None and start_date <= parsed <= end_date


def normalize_record(doc: dict, kind: str) -> dict:
    config = COLLECTION_CONFIG[kind]
    raw = to_jsonable(doc)
    reason_fields = config.get("reason_fields", [])
    element_type_raw = clean_text(raw.get(config.get("element_type", "Type")))
    normalized = {
        "id": clean_text(raw.get("_id")),
        "kind": kind,
        "kind_label": config["label"],
        "element_name": clean_text(raw.get(config["element"])),
        "revival_time": combine_datetime(raw, config["revival_date"], config["revival_time"]),
        "outage_time": combine_datetime(raw, config["outage_date"], config["outage_time"]),
        "reason": combine_fields(raw, reason_fields),
        "reason_label": config.get("reason_label", "Reason"),
        "sub_category": clean_text(raw.get("Nature")),
        "element_type": display_element_type(element_type_raw),
        "element_type_key": normalize_element_type_key(element_type_raw),
        "audit_history": raw.get("AuditHistory", ""),
        "planned_period": "",
        "raw": raw,
    }
    if config.get("planned_fields"):
        normalized["planned_period"] = combine_fields(raw, config["planned_fields"], " to ")
    return normalized


def analyze_attributes(docs: List[dict]) -> List[dict]:
    stats: Dict[str, Dict[str, Any]] = {}
    total = len(docs)
    for doc in docs:
        for key, value in doc.items():
            text = clean_text(value)
            if key not in stats:
                stats[key] = {
                    "name": key,
                    "present_count": 0,
                    "filled_count": 0,
                    "types": set(),
                    "samples": [],
                }
            item = stats[key]
            item["present_count"] += 1
            item["types"].add(type(value).__name__)
            if text:
                item["filled_count"] += 1
                if len(item["samples"]) < 3 and text not in item["samples"]:
                    item["samples"].append(text[:160])

    result = []
    for item in stats.values():
        result.append({
            "name": item["name"],
            "present_count": item["present_count"],
            "filled_count": item["filled_count"],
            "missing_count": max(0, total - item["present_count"]),
            "types": sorted(item["types"]),
            "samples": item["samples"],
        })
    return sorted(result, key=lambda row: row["name"].lower())


def old_logbook_query(search: str, config: dict) -> dict:
    search = (search or "").strip()
    if not search:
        return {}
    fields = [
        config["element"],
        "Nature",
        "Type",
        "EntityId",
        "Reason",
        "EndRelayReasonOne",
        "EndRelayReasonTwo",
        "AuditHistory",
    ]
    return {
        "$or": [
            {field: {"$regex": search, "$options": "i"}}
            for field in fields
        ]
    }


def iter_filtered_docs(collection, config: dict, search: str, element_type: str, start_date: date, end_date: date):
    element_type_filter = normalize_element_type_key(element_type)
    for doc in collection.find(old_logbook_query(search, config)):
        if not in_date_range(doc, config["outage_date"], start_date, end_date):
            continue
        doc_element_type = normalize_element_type_key(doc.get(config.get("element_type", "Type")))
        if element_type_filter and doc_element_type != element_type_filter:
            continue
        yield doc


def collection_payload(db, kind: str, search: str, element_type: str, limit: int, skip: int, start_date: date, end_date: date) -> dict:
    config = COLLECTION_CONFIG[kind]
    collection = db[config["collection"]]
    page_start = max(0, skip)
    page_end = page_start + max(1, min(limit, 5000))
    total_count = 0
    docs = []
    analysis_docs = []
    for doc in iter_filtered_docs(collection, config, search, element_type, start_date, end_date):
        if len(analysis_docs) < 1000:
            analysis_docs.append(doc)
        if page_start <= total_count < page_end:
            docs.append(doc)
        total_count += 1
    rows = [normalize_record(doc, kind) for doc in docs]
    elements = sorted({
        row["element_name"]
        for row in rows
        if row.get("element_name")
    })
    element_types = sorted({
        row["element_type_key"]
        for row in rows
        if row.get("element_type_key")
    })

    return {
        "kind": kind,
        "label": config["label"],
        "collection": config["collection"],
        "total_count": total_count,
        "returned_count": len(rows),
        "rows": rows,
        "elements": elements,
        "element_types": element_types,
        "attributes": analyze_attributes([to_jsonable(doc) for doc in analysis_docs]),
    }


def export_row(row: dict) -> dict:
    audit = row.get("audit_history")
    if isinstance(audit, (dict, list)):
        audit = json.dumps(to_jsonable(audit), ensure_ascii=False)
    return {
        "Outage Type": row.get("kind_label", ""),
        "Element Name": row.get("element_name", ""),
        "Revival Time": row.get("revival_time", ""),
        "Outage Time": row.get("outage_time", ""),
        "Reason / Relay": row.get("reason", ""),
        "Sub Category": row.get("sub_category", ""),
        "Element Type": row.get("element_type", ""),
        "Planned Period": row.get("planned_period", ""),
        "AuditHistory": clean_text(audit),
    }


@router.get("/historical-outages")
async def get_historical_outages(
    kind: str = Query("all", pattern="^(all|shutdown|tripping|outage)$"),
    start_date: date = Query(...),
    end_date: date = Query(...),
    search: str = "",
    element_type: str = "",
    limit: int = Query(1000, ge=1, le=5000),
    skip: int = Query(0, ge=0),
):
    if end_date < start_date:
        start_date, end_date = end_date, start_date
    service = MongoService()
    db = service.client[OLD_LOGBOOK_DB]
    selected = list(COLLECTION_CONFIG.keys()) if kind == "all" else [kind]
    sections = {
        item: collection_payload(db, item, search, element_type, limit, skip, start_date, end_date)
        for item in selected
    }
    return {
        "success": True,
        "database": OLD_LOGBOOK_DB,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "sections": sections,
    }


@router.get("/historical-outages/export")
async def export_historical_outages(
    kind: str = Query("all", pattern="^(all|shutdown|tripping|outage)$"),
    start_date: date = Query(...),
    end_date: date = Query(...),
    search: str = "",
    element_type: str = "",
):
    if end_date < start_date:
        start_date, end_date = end_date, start_date
    service = MongoService()
    db = service.client[OLD_LOGBOOK_DB]
    selected = list(COLLECTION_CONFIG.keys()) if kind == "all" else [kind]

    workbook = Workbook()
    workbook.remove(workbook.active)
    columns = [
        "Outage Type",
        "Element Name",
        "Revival Time",
        "Outage Time",
        "Reason / Relay",
        "Sub Category",
        "Element Type",
        "Planned Period",
        "AuditHistory",
    ]

    for item in selected:
        config = COLLECTION_CONFIG[item]
        worksheet = workbook.create_sheet(config["label"][:31])
        worksheet.append(columns)
        collection = db[config["collection"]]
        for doc in iter_filtered_docs(collection, config, search, element_type, start_date, end_date):
            normalized = normalize_record(doc, item)
            row = export_row(normalized)
            worksheet.append([row.get(column, "") for column in columns])
        for column_cells in worksheet.columns:
            max_length = max(len(str(cell.value or "")) for cell in column_cells[:200])
            worksheet.column_dimensions[column_cells[0].column_letter].width = min(max(max_length + 2, 14), 42)

    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)
    filename = f"old_logbook_{kind}_{start_date.isoformat()}_to_{end_date.isoformat()}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
