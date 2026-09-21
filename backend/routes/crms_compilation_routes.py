from concurrent.futures import ThreadPoolExecutor
import json
from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import StreamingResponse
from crew_legacy.admin_logic.auth_utils import get_authenticated_user, require_page_view
from services.db_handler import MongoService
from services.crms_compilation import normalize_ranges, Measurements, compile_messages, export_report

router = APIRouter(prefix="/api/frequency/crms-compilation", tags=["Frequency Report"])


def fetch_day(day):
    from routes.frequency_routes import (get_legacy_session_no_verify, CRMS_MESSAGE_URL,
        CRMS_VIOLATION_TYPES, parse_crms_message_datetime, normalize_crms_message)
    with get_legacy_session_no_verify() as session:
        response = session.get(CRMS_MESSAGE_URL, params={"startDate": day, "endDate": day}, timeout=30, verify=False)
        response.raise_for_status()
        payload = response.json()
    records = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        raise ValueError("Unexpected CRMS response.")
    messages, invalid = [], 0
    for item in records:
        if not isinstance(item, dict):
            invalid += 1
            continue
        if str(item.get("violationType") or item.get("violation_type") or "").strip().lower() not in CRMS_VIOLATION_TYPES:
            continue
        dt = parse_crms_message_datetime(item.get("messageDate") or item.get("message_date"))
        if dt is None:
            invalid += 1
            continue
        messages.append(normalize_crms_message(item, dt))
    return messages, invalid


@router.post("/generate")
def generate(payload: dict = Body(...), user=Depends(get_authenticated_user)):
    require_page_view(user, "frequency_report")
    try:
        sections, days = normalize_ranges(payload.get("ranges"))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    messages, warnings, failed = [], [], []
    with ThreadPoolExecutor(max_workers=4) as pool:
        tasks = [(day, pool.submit(fetch_day, day)) for day in days]
        for day, task in tasks:
            try:
                found, invalid = task.result()
                messages.extend(found)
                if invalid:
                    warnings.append(f"{day}: {invalid} malformed CRMS record(s) could not be included.")
            except Exception:
                failed.append(day)
                warnings.append(f"{day}: CRMS fetch failed. This date is incomplete; generate again to retry.")
    if len(failed) == len(days):
        raise HTTPException(502, "CRMS messages could not be fetched for the selected dates. Please try again.")
    db = MongoService()
    mappings = list(db.map_collection.find({"is_state": True}, {"_id": 0}))
    ids = [str(item["plant_id"]) for item in mappings if item.get("plant_id")]
    ids += ["SYSTEM_FREQUENCY", "STATE_BIHAR", "STATE_DVC", "STATE_JHARKHAND", "STATE_ODISHA", "STATE_SIKKIM", "STATE_WEST_BENGAL"]
    raw = list(db.db["frequency_event_raw_data"].find({"date": {"$in": days}, "plant_id": {"$in": ids}}, {"_id": 0}))
    events = list(db.db["frequency_events"].find({"$or": [
        {"start_time": {"$lt": section["stop"].isoformat(timespec="minutes")}, "end_time": {"$gte": section["start"].isoformat(timespec="minutes")}}
        for section in sections]}, {"data_points": 1, "_id": 0}).sort("updated_at", -1))
    report = compile_messages(sections, messages, mappings, Measurements(raw, events), warnings)
    for section in report["sections"]:
        section["fetch_failed"] = section["start"][:10] in failed
    report["partial"] = bool(failed)
    return report


@router.post("/export/{format}")
def export(format: str, report: dict = Body(...), user=Depends(get_authenticated_user)):
    require_page_view(user, "frequency_report")
    if format not in ("xlsx", "pdf"):
        raise HTTPException(422, "Choose Excel or PDF.")
    if len(json.dumps(report)) > 8_000_000:
        raise HTTPException(413, "Report is too large; select fewer dates.")
    if not isinstance(report.get("sections"), list) or len(report["sections"]) > 100:
        raise HTTPException(422, "Generate a report before exporting.")
    try:
        stream = export_report(report, format)
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(422, "Invalid report data; generate the report again.") from exc
    media = "application/pdf" if format == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return StreamingResponse(stream, media_type=media,
        headers={"Content-Disposition": f'attachment; filename="CRMS_Message_Compilation.{format}"'})
