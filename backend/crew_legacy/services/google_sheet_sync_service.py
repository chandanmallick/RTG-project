import logging
import threading
import requests
from datetime import datetime
from crew_legacy.database.database_mongo import (
    employee_daily_collection,
    leave_request_collection,
    employee_collection,
    roster_master_collection,
    system_settings_collection,
)

logger = logging.getLogger(__name__)

DEFAULT_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwgB2PbVe9eAeMNNk7PYm38q23YTMpbgDDJItkceM5XXQeWyMBXsiEtWbGw_2WDGAmm/exec"

MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTH_NAMES_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

DUTY_CODE_MAP = {
    "M1": "Morning",
    "M2": "Morning",
    "M": "Morning",
    "MORNING": "Morning",
    "E1": "Evening",
    "E2": "Evening",
    "E": "Evening",
    "EVENING": "Evening",
    "N1": "Night",
    "N2": "Night",
    "N": "Night",
    "NIGHT": "Night",
    "O1": "OFF",
    "O2": "OFF",
    "OFF": "OFF",
    "G": "General",
    "GEN": "General",
    "GENERAL": "General",
}


def get_webhook_url() -> str:
    """Retrieve webhook URL from system settings or default."""
    try:
        setting = system_settings_collection.find_one({"type": "google_sheet_config"})
        if setting and setting.get("webhookUrl"):
            return setting["webhookUrl"].strip()
    except Exception:
        pass
    return DEFAULT_WEBAPP_URL


def get_sheet_tab_name(year: int, month: int) -> str:
    """Returns Google Sheet tab name, e.g. 'Nov 26'."""
    short_m = MONTH_NAMES_SHORT[month - 1]
    short_y = str(year)[-2:]
    return f"{short_m} {short_y}"


def push_to_google_sheet(payload: dict) -> dict:
    """Synchronously send payload to Google Apps Script Webhook."""
    url = get_webhook_url()
    try:
        resp = requests.post(url, json=payload, timeout=60, allow_redirects=True)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.error(f"[GoogleSheetSync] Error pushing to Google Sheet: {exc}")
        return {"status": "error", "message": str(exc)}


def push_to_google_sheet_async(payload: dict):
    """Fire-and-forget background push to avoid blocking API responses."""
    def _run():
        try:
            res = push_to_google_sheet(payload)
            logger.info(f"[GoogleSheetSync] Background sync result: {res}")
        except Exception as err:
            logger.error(f"[GoogleSheetSync] Background sync failed: {err}")

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()


def sync_leave_or_replacement_update(
    date_str: str,
    employee_id: str,
    duty_or_leave: str,
    is_leave: bool = False,
    is_replacement: bool = False,
    employee_name: str = "",
    note: str = "",
):
    """
    Push a single leave, replacement, or duty change to the corresponding monthly sheet.
    """
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        year, month = dt.year, dt.month
        sheet_name = get_sheet_tab_name(year, month)

        if not employee_name:
            emp = employee_collection.find_one({"$or": [{"userId": employee_id}, {"employeeId": employee_id}]})
            if emp:
                employee_name = emp.get("name") or employee_id

        payload = {
            "sheetName": sheet_name,
            "month": month,
            "year": year,
            "updates": [
                {
                    "employeeId": employee_id,
                    "employeeName": employee_name,
                    "date": date_str,
                    "duty": duty_or_leave,
                    "isLeave": is_leave,
                    "isReplacement": is_replacement,
                    "note": note,
                }
            ],
        }
        push_to_google_sheet_async(payload)
    except Exception as exc:
        logger.error(f"[GoogleSheetSync] Failed to queue sync for {employee_id} on {date_str}: {exc}")


def sync_month_to_sheet(year: int, month: int, force_recreate: bool = False) -> dict:
    """
    Sync all daily roster records, draft rosters, leaves and replacements for the specified month.
    """
    import calendar
    from bson import ObjectId
    _, num_days = calendar.monthrange(year, month)
    start_date = f"{year:04d}-{month:02d}-01"
    end_date = f"{year:04d}-{month:02d}-{num_days:02d}"
    sheet_name = get_sheet_tab_name(year, month)

    daily_records = list(employee_daily_collection.find({
        "month": month,
        "year": year,
    }))

    leaves = list(leave_request_collection.find({
        "date": {"$regex": f"^{year:04d}-{month:02d}"},
        "finalStatus": "Approved"
    }))
    leave_map = {(l.get("employeeId"), l.get("date")): l for l in leaves}

    updates = []

    if daily_records:
        for d in daily_records:
            eid = str(d.get("employeeId") or "").strip()
            date_str = str(d.get("date") or "").strip()
            ename = str(d.get("name") or d.get("employeeName") or "").strip()
            assigned_duty = str(d.get("assignedDuty") or d.get("actualStatus") or "OFF").strip()

            # Check if on leave
            l_doc = leave_map.get((eid, date_str))
            is_leave = bool(l_doc or d.get("leaveStatus") == "Approved")
            duty_val = l_doc.get("leaveType") if l_doc else (d.get("leaveType") if is_leave else assigned_duty)

            is_rep = bool(d.get("replacementDuty") or d.get("isActingSIC"))
            if is_rep and not is_leave:
                duty_val = assigned_duty

            updates.append({
                "employeeId": eid,
                "employeeName": ename,
                "date": date_str,
                "duty": duty_val or "OFF",
                "isLeave": is_leave,
                "isReplacement": is_rep,
            })
    else:
        # Fallback to roster_master_collection (Draft or Final roster not yet pushed)
        roster = roster_master_collection.find_one({"startDate": start_date, "isFinal": True}) or \
                 roster_master_collection.find_one({"startDate": start_date})
        if roster:
            for grp in roster.get("data", []):
                sic = grp.get("shiftInCharge") or {}
                members = grp.get("members", [])
                date_duties = grp.get("data", {})

                all_emp = []
                if sic.get("employeeId"):
                    all_emp.append(sic)
                all_emp.extend(members)

                for person in all_emp:
                    pid = str(person.get("employeeId") or "").strip()
                    pname = str(person.get("name") or "").strip()
                    for d_str, raw_duty in date_duties.items():
                        norm_duty = DUTY_CODE_MAP.get(raw_duty.upper(), raw_duty)
                        l_doc = leave_map.get((pid, d_str))
                        is_l = bool(l_doc)
                        val = l_doc.get("leaveType") if l_doc else norm_duty

                        updates.append({
                            "employeeId": pid,
                            "employeeName": pname,
                            "date": d_str,
                            "duty": val,
                            "isLeave": is_l,
                            "isReplacement": False,
                        })

    payload = {
        "sheetName": sheet_name,
        "month": month,
        "year": year,
        "forceRecreate": force_recreate,
        "updates": updates,
    }

    return push_to_google_sheet(payload)


def sync_month_to_sheet_async(year: int, month: int, force_recreate: bool = False):
    """Asynchronous wrapper for sync_month_to_sheet."""
    def _run():
        try:
            res = sync_month_to_sheet(year, month, force_recreate=force_recreate)
            logger.info(f"[GoogleSheetSync] sync_month_to_sheet_async result: {res}")
        except Exception as err:
            logger.error(f"[GoogleSheetSync] sync_month_to_sheet_async failed: {err}")

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()


def sync_roster_draft_or_final_to_sheet(roster_id: str):
    """
    Called when a roster (draft or final) is created / saved.
    Extracts year and month and triggers sheet creation & population.
    """
    from bson import ObjectId
    try:
        roster = roster_master_collection.find_one({"_id": ObjectId(roster_id)})
        if not roster or not roster.get("startDate"):
            return
        dt = datetime.strptime(roster["startDate"], "%Y-%m-%d")
        sync_month_to_sheet_async(dt.year, dt.month, force_recreate=True)
    except Exception as exc:
        logger.error(f"[GoogleSheetSync] Error syncing saved roster {roster_id}: {exc}")
