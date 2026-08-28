import calendar
import html
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from crew_legacy.admin_logic.auth_utils import get_authenticated_user, require_page_write
from crew_legacy.admin_logic.notification_service import (
    replacement_mail_settings,
    send_email,
)
from crew_legacy.database.database_mongo import (
    designation_master_collection,
    employee_collection,
    holiday_master_collection,
    morning_presentation_config_collection,
    morning_presentation_roster_collection,
    organization_unit_collection,
    roster_group_collection,
)


router = APIRouter(prefix="/presentation-roster", tags=["Morning Presentation Roster"])

CONFIG_KEY = "morning-presentation"
CYCLE_SEQUENCE_VERSION = "2026-07-approved-v1"
HISTORICAL_SEQUENCE = [
    "Ganesh Kumar", "Gitesh Patel", "Saurabh Vijay Agarwal", "Ramakant Shukla",
    "Roshan Jaiswal", "Doodam Vardhan", "Amit Kumar Chowdhury", "Bibek Agarwal",
    "Ranjit Pal", "Ramashankar Kumar", "Laldhari Kumar", "Soumya Kanti Das",
    "Himanshu Bharti", "Rishav Kumar", "Atanu Mandal", "Ayush Raj",
    "Kritika Debnath", "Subrat Swain", "Manish Kumar Yadav", "Samim Mondal",
    "Srimalya Ghosal", "Gaurav Kumar",
]


def _text_key(value):
    return re.sub(r"[^a-z0-9]+", "", str(value or "").casefold())


def _positive_int(value):
    try:
        result = int(value)
    except (TypeError, ValueError):
        return None
    return result if result > 0 else None


def _list(value):
    if isinstance(value, list):
        source = value
    elif not value:
        source = []
    else:
        source = str(value).split(",")
    return list(dict.fromkeys(str(item).strip() for item in source if str(item).strip()))


def _designation_rows():
    rows = []
    for item in designation_master_collection.find({"isActive": {"$ne": False}}):
        rows.append({
            "id": str(item["_id"]),
            "name": item.get("name") or "",
            "shortName": item.get("shortName") or "",
            "seniorityOrder": _positive_int(item.get("seniorityOrder")),
        })
    return sorted(rows, key=lambda item: (item["seniorityOrder"] or 10**9, item["name"].casefold()))


def _organization_unit_rows():
    units = list(organization_unit_collection.find(
        {"isActive": {"$ne": False}},
        {"name": 1, "unitType": 1, "parentId": 1},
    ))
    unit_by_id = {str(item["_id"]): item for item in units}
    rows = []
    for item in units:
        unit_type = str(item.get("unitType") or "").lower()
        if unit_type not in {"department", "vertical", "function"}:
            continue
        unit_id = str(item["_id"])
        ancestor_ids = []
        parent_id = str(item.get("parentId") or "")
        visited = {unit_id}
        while parent_id and parent_id in unit_by_id and parent_id not in visited:
            visited.add(parent_id)
            parent = unit_by_id[parent_id]
            if str(parent.get("unitType") or "").lower() in {"department", "vertical", "function"}:
                ancestor_ids.append(parent_id)
            parent_id = str(parent.get("parentId") or "")
        rows.append({
            "id": unit_id,
            "name": str(item.get("name") or "").strip(),
            "unitType": unit_type,
            "parentId": str(item.get("parentId") or ""),
            "ancestorIds": ancestor_ids,
        })
    type_order = {"department": 0, "vertical": 1, "function": 2}
    return sorted(rows, key=lambda item: (
        type_order.get(item["unitType"], 9),
        item["name"].casefold(),
    ))


def _canonical_unit_ids(values, organization_units):
    requested = set(_list(values))
    valid = [item for item in organization_units if item["id"] in requested]
    return [
        item["id"] for item in valid
        if not requested.intersection(item.get("ancestorIds") or [])
    ]


def _active_shift_employee_ids():
    employee_ids = set()
    for group in roster_group_collection.find({"isActive": True}, {"members": 1, "shiftInCharge": 1}):
        people = [group.get("shiftInCharge") or {}, *(group.get("members") or [])]
        for person in people:
            employee_id = str(
                person.get("employeeId") or person.get("userId") or ""
            ).strip()
            if employee_id:
                employee_ids.add(employee_id)
    return employee_ids


def _employee_rows(designations, organization_units):
    rank_by_id = {item["id"]: item["seniorityOrder"] for item in designations}
    rank_by_name = {_text_key(item["name"]): item["seniorityOrder"] for item in designations}
    units_by_type_and_name = {
        (item["unitType"], _text_key(item["name"])): item["id"]
        for item in organization_units
    }
    history_rank = {_text_key(name): index for index, name in enumerate(HISTORICAL_SEQUENCE)}
    shift_employee_ids = _active_shift_employee_ids()
    rows = []
    for item in employee_collection.find(
        {},
        {
            "userId": 1, "employeeId": 1, "name": 1, "designation": 1,
            "designationMasterId": 1, "seniorityOrder": 1, "departments": 1,
            "department": 1, "departmentIds": 1, "verticals": 1, "verticalIds": 1,
            "functionIds": 1,
        },
    ):
        employee_id = str(item.get("userId") or item.get("employeeId") or "").strip()
        if not employee_id:
            continue
        departments = _list(item.get("departments") or item.get("department"))
        designation_rank = (
            rank_by_id.get(str(item.get("designationMasterId") or ""))
            or rank_by_name.get(_text_key(item.get("designation")))
        )
        verticals = _list(item.get("verticals"))
        organization_unit_ids = list(dict.fromkeys([
            *_list(item.get("departmentIds")),
            *_list(item.get("verticalIds")),
            *_list(item.get("functionIds")),
            *[
                units_by_type_and_name.get(("department", _text_key(value)))
                for value in departments
            ],
            *[
                units_by_type_and_name.get(("vertical", _text_key(value)))
                for value in verticals
            ],
        ]))
        organization_unit_ids = [value for value in organization_unit_ids if value]
        rows.append({
            "id": employee_id,
            "name": str(item.get("name") or employee_id).strip(),
            "designation": item.get("designation") or "",
            "designationSeniority": designation_rank,
            "employeeSeniority": _positive_int(item.get("seniorityOrder")),
            "departments": departments,
            "verticals": verticals,
            "organizationUnitIds": organization_unit_ids,
            "isShiftGroupMember": employee_id in shift_employee_ids,
            "_historyRank": history_rank.get(_text_key(item.get("name")), 10**9),
        })
    rows.sort(key=lambda item: (
        item["_historyRank"],
        item["employeeSeniority"] or 10**9,
        item["name"].casefold(),
    ))
    for item in rows:
        item.pop("_historyRank", None)
    return rows


def _default_config(employees, designations, organization_units):
    chief_manager = next(
        (item for item in designations if _text_key(item["name"]) == "chiefmanager"),
        None,
    )
    cutoff_rank = (chief_manager or {}).get("seniorityOrder")
    departments = sorted({
        department for employee in employees for department in employee["departments"]
    })
    department_unit_ids = [
        item["id"] for item in organization_units if item["unitType"] == "department"
    ]
    historical_ids = []
    for approved_name in HISTORICAL_SEQUENCE:
        candidates = [
            employee for employee in employees
            if _text_key(employee.get("name")) == _text_key(approved_name)
            and not employee.get("isShiftGroupMember")
            and employee.get("organizationUnitIds")
            and (
                not cutoff_rank
                or (
                    employee.get("designationSeniority")
                    and employee["designationSeniority"] > cutoff_rank
                )
            )
        ]
        candidates.sort(key=lambda employee: (
            not bool(re.fullmatch(r"[A-Za-z0-9_-]+", employee["id"])),
            employee["id"],
        ))
        if candidates:
            historical_ids.append(candidates[0]["id"])
    return {
        "key": CONFIG_KEY,
        "sequenceVersion": CYCLE_SEQUENCE_VERSION,
        "departments": departments,
        "organizationUnitIds": department_unit_ids,
        "cutoffDesignationId": (chief_manager or {}).get("id") or "",
        "cutoffSeniorityOrder": cutoff_rank,
        "participantIds": historical_ids,
        "excludedIds": [],
        "nextEmployeeId": historical_ids[0] if historical_ids else "",
        # Ganesh Kumar served on 31 July 2026; his second working day starts the next roster.
        "daysAssignedInCurrentSlot": 1 if historical_ids else 0,
        "slotDays": 2,
        "skipHolidays": True,
    }


def _eligible_employee_ids(config, employees):
    organization_unit_ids = set(_list(config.get("organizationUnitIds")))
    cutoff_rank = _positive_int(config.get("cutoffSeniorityOrder"))
    return {
        employee["id"] for employee in employees
        if not employee.get("isShiftGroupMember")
        and (
            not organization_unit_ids
            or organization_unit_ids.intersection(employee.get("organizationUnitIds") or [])
        )
        and (
            not cutoff_rank
            or (
                employee.get("designationSeniority")
                and employee["designationSeniority"] > cutoff_rank
            )
        )
    }


def _config(employees, designations, organization_units):
    saved = morning_presentation_config_collection.find_one({"key": CONFIG_KEY})
    defaults = _default_config(employees, designations, organization_units)
    if not saved:
        return defaults
    result = {
        **defaults,
        **{key: saved.get(key, defaults.get(key)) for key in defaults},
        "participantIds": _list(saved.get("participantIds")),
        "excludedIds": _list(saved.get("excludedIds")),
    }
    if saved.get("sequenceVersion") != CYCLE_SEQUENCE_VERSION:
        approved_ids = [
            value for value in defaults["participantIds"]
            if value in _eligible_employee_ids(result, employees)
        ]
        result["sequenceVersion"] = CYCLE_SEQUENCE_VERSION
        result["participantIds"] = approved_ids
        result["excludedIds"] = []
        result["nextEmployeeId"] = approved_ids[0] if approved_ids else ""
        result["daysAssignedInCurrentSlot"] = 1 if approved_ids else 0
    if "organizationUnitIds" not in saved:
        saved_departments = set(_list(saved.get("departments")))
        result["organizationUnitIds"] = [
            item["id"] for item in organization_units
            if item["unitType"] == "department" and item["name"] in saved_departments
        ]
    result["organizationUnitIds"] = _canonical_unit_ids(
        result.get("organizationUnitIds"), organization_units
    )
    eligible_employee_ids = _eligible_employee_ids(result, employees)
    result["participantIds"] = [
        value for value in result["participantIds"] if value in eligible_employee_ids
    ]
    result["excludedIds"] = [
        value for value in result["excludedIds"] if value in result["participantIds"]
    ]
    return result


def _serialize_config(config):
    return {key: value for key, value in config.items() if key != "_id"}


def _parse_month(value):
    try:
        year, month = (int(part) for part in str(value).split("-", 1))
        return year, month
    except (TypeError, ValueError):
        raise HTTPException(400, "Month must use YYYY-MM format")


def _working_dates(month_value, skip_holidays=True):
    year, month = _parse_month(month_value)
    last_day = calendar.monthrange(year, month)[1]
    holiday_dates = set()
    if skip_holidays:
        start = f"{year:04d}-{month:02d}-01"
        end = f"{year:04d}-{month:02d}-{last_day:02d}"
        holiday_dates = {
            str(item.get("date") or "")
            for item in holiday_master_collection.find({
                "date": {"$gte": start, "$lte": end},
                "status": {"$ne": "Inactive"},
            }, {"date": 1})
        }
    return [
        date(year, month, day)
        for day in range(1, last_day + 1)
        if date(year, month, day).weekday() < 5
        and date(year, month, day).isoformat() not in holiday_dates
    ]


def _generate(month_value, config, employees):
    employee_by_id = {item["id"]: item for item in employees}
    eligible_employee_ids = _eligible_employee_ids(config, employees)
    excluded = set(_list(config.get("excludedIds")))
    participant_ids = [
        value for value in _list(config.get("participantIds"))
        if value in eligible_employee_ids
        and value not in excluded
    ]
    if not participant_ids:
        raise HTTPException(400, "Add at least one included employee to the presentation cycle")

    next_employee_id = str(config.get("nextEmployeeId") or "")
    current_index = participant_ids.index(next_employee_id) if next_employee_id in participant_ids else 0
    days_used = min(_positive_int(config.get("daysAssignedInCurrentSlot")) or 0, 1)
    slot_days = 2
    slot_number = 1
    entries = []

    for working_day in _working_dates(month_value, config.get("skipHolidays", True)):
        employee_id = participant_ids[current_index]
        employee = employee_by_id[employee_id]
        entries.append({
            "date": working_day.isoformat(),
            "day": working_day.strftime("%A"),
            "employeeId": employee_id,
            "employeeName": employee["name"],
            "designation": employee["designation"],
            "department": ", ".join(employee["departments"]),
            "slotId": f"{month_value}-{slot_number:02d}",
            "manual": False,
        })
        days_used += 1
        if days_used >= slot_days:
            days_used = 0
            current_index = (current_index + 1) % len(participant_ids)
            slot_number += 1

    return {
        "month": month_value,
        "entries": entries,
        "cycleStateAfter": {
            "nextEmployeeId": participant_ids[current_index],
            "daysAssignedInCurrentSlot": days_used,
        },
        "participantIds": participant_ids,
    }


def _serialize_roster(doc):
    if not doc:
        return None
    return {
        "id": str(doc["_id"]),
        "month": doc.get("month"),
        "status": doc.get("status") or "DRAFT",
        "entries": doc.get("entries") or [],
        "participantIds": doc.get("participantIds") or [],
        "cycleStateAfter": doc.get("cycleStateAfter") or {},
        "updatedAt": doc.get("updatedAt"),
        "publishedAt": doc.get("publishedAt"),
        "publicationMail": doc.get("publicationMail"),
        "reminderLog": doc.get("reminderLog") or [],
    }


def _employee_mail_map(employee_ids):
    result = {}
    for employee in employee_collection.find(
        {"$or": [
            {"userId": {"$in": list(employee_ids)}},
            {"employeeId": {"$in": list(employee_ids)}},
        ]},
        {"userId": 1, "employeeId": 1, "gmail": 1, "email": 1, "mailId": 1},
    ):
        employee_id = str(employee.get("userId") or employee.get("employeeId") or "").strip()
        address = str(
            employee.get("gmail") or employee.get("email") or employee.get("mailId") or ""
        ).strip()
        if employee_id and "@" in address:
            result[employee_id] = address
    return result


def _roster_period(entries):
    dates = sorted(str(item.get("date") or "") for item in entries if item.get("date"))
    if not dates:
        return "", ""
    return dates[0], dates[-1]


def _presentation_mail_html(entries, heading, intro):
    rows = []
    for entry in sorted(entries, key=lambda item: str(item.get("date") or "")):
        try:
            display_date = date.fromisoformat(str(entry.get("date"))).strftime("%A, %d %B %Y")
        except ValueError:
            display_date = str(entry.get("date") or "")
        rows.append(
            "<tr>"
            f"<td style='padding:8px;border:1px solid #C7DDF8'>{html.escape(str(entry.get('employeeName') or ''))}</td>"
            f"<td style='padding:8px;border:1px solid #C7DDF8'>{html.escape(display_date)}</td>"
            "</tr>"
        )
    return (
        "<div style='font-family:Arial,sans-serif;color:#0F172A'>"
        f"<h2 style='color:#0057B7'>{html.escape(heading)}</h2>"
        f"<p>{html.escape(intro)}</p>"
        "<table style='border-collapse:collapse;width:100%;max-width:760px'>"
        "<thead><tr style='background:#EAF2FF'>"
        "<th style='padding:8px;border:1px solid #C7DDF8;text-align:left'>Employee</th>"
        "<th style='padding:8px;border:1px solid #C7DDF8;text-align:left'>Presentation date</th>"
        "</tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table><p style='color:#64748B'>This is an automated notification from COMPASS.</p></div>"
    )


def _snapshot_attachment(snapshot_data_url, month_value):
    value = str(snapshot_data_url or "").strip()
    match = re.match(r"^data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)$", value)
    if not match:
        return None
    extension = "jpg" if match.group(1) == "jpeg" else "png"
    content = match.group(2)
    # Microsoft Graph's simple file attachment flow supports small attachments.
    if len(content) > 3_500_000:
        return None
    return {
        "name": f"Morning_Presentation_Roster_{month_value}.{extension}",
        "contentType": f"image/{match.group(1)}",
        "contentBytes": content,
    }


def _send_published_roster_mail(entries, month_value, snapshot_data_url=None):
    employee_ids = {
        str(item.get("employeeId") or "").strip()
        for item in entries if str(item.get("employeeId") or "").strip()
    }
    mail_by_employee = _employee_mail_map(employee_ids)
    recipients = sorted(set(mail_by_employee.values()))
    start, end = _roster_period(entries)
    heading = f"Morning Presentation Roster: {start} to {end}"
    settings = replacement_mail_settings()
    attachment = _snapshot_attachment(snapshot_data_url, month_value)
    result = send_email(
        recipients,
        heading,
        _presentation_mail_html(
            entries,
            heading,
            "The monthly Morning Presentation roster has been published. Please note your assigned date(s).",
        ),
        html=True,
        sender=settings.get("sender"),
        enabled=bool(settings.get("enabled")),
        attachments=[attachment] if attachment else [],
    )
    return {
        **result,
        "missingEmailCount": len(employee_ids - set(mail_by_employee)),
        "snapshotAttached": bool(attachment),
        "processedAt": datetime.utcnow(),
    }


def send_morning_presentation_reminders(target_date=None):
    """Send each published assignment's D-1 reminder once."""
    target = target_date or (
        datetime.now(ZoneInfo("Asia/Kolkata")).date() + timedelta(days=1)
    )
    target_iso = target.isoformat()
    settings = replacement_mail_settings()
    results = []
    for roster in morning_presentation_roster_collection.find({
        "status": "PUBLISHED",
        "entries.date": target_iso,
    }):
        already_sent = any(
            item.get("date") == target_iso and item.get("status") == "sent"
            for item in roster.get("reminderLog") or []
        )
        if already_sent:
            continue
        entries = [
            item for item in roster.get("entries") or []
            if str(item.get("date") or "") == target_iso
        ]
        employee_ids = {
            str(item.get("employeeId") or "").strip()
            for item in entries if str(item.get("employeeId") or "").strip()
        }
        mail_by_employee = _employee_mail_map(employee_ids)
        day_results = []
        for entry in entries:
            employee_id = str(entry.get("employeeId") or "").strip()
            recipient = mail_by_employee.get(employee_id)
            employee_name = str(entry.get("employeeName") or employee_id)
            subject = f"Reminder: Morning Presentation on {target.strftime('%d %B %Y')}"
            body = (
                f"Dear {html.escape(employee_name)},<br><br>"
                f"This is a reminder that your Morning Presentation is scheduled for "
                f"<strong>{target.strftime('%A, %d %B %Y')}</strong>.<br><br>"
                "Regards,<br>COMPASS"
            )
            mail_result = send_email(
                [recipient] if recipient else [],
                subject,
                body,
                html=True,
                sender=settings.get("sender"),
                enabled=bool(settings.get("enabled")),
            )
            day_results.append({"employeeId": employee_id, **mail_result})
        status = (
            "sent"
            if day_results and all(item.get("status") == "sent" for item in day_results)
            else "partial"
            if any(item.get("status") == "sent" for item in day_results)
            else (day_results[0].get("status") if day_results else "skipped")
        )
        log_entry = {
            "date": target_iso,
            "status": status,
            "results": day_results,
            "processedAt": datetime.utcnow(),
        }
        morning_presentation_roster_collection.update_one(
            {"_id": roster["_id"]},
            {"$push": {"reminderLog": log_entry}},
        )
        results.append({"rosterId": str(roster["_id"]), **log_entry})
    return {"date": target_iso, "rosters": results}


@router.get("/setup")
def get_setup(user=Depends(get_authenticated_user)):
    designations = _designation_rows()
    organization_units = _organization_unit_rows()
    employees = _employee_rows(designations, organization_units)
    config = _config(employees, designations, organization_units)
    department_options = sorted({
        department for employee in employees for department in employee["departments"]
    })
    employee_name_keys = {_text_key(employee["name"]) for employee in employees}
    return {
        "config": _serialize_config(config),
        "employees": employees,
        "designations": designations,
        "departmentOptions": department_options,
        "organizationUnitOptions": organization_units,
        "unmatchedHistoricalNames": [
            name for name in HISTORICAL_SEQUENCE
            if _text_key(name) not in employee_name_keys
        ],
    }


@router.put("/setup")
def save_setup(data: dict, user=Depends(get_authenticated_user)):
    require_page_write(user, "crew_presentation")
    designations = _designation_rows()
    organization_units = _organization_unit_rows()
    employees = _employee_rows(designations, organization_units)
    cutoff = next(
        (item for item in designations if item["id"] == str(data.get("cutoffDesignationId") or "")),
        None,
    )
    eligibility = {
        "organizationUnitIds": _canonical_unit_ids(
            data.get("organizationUnitIds"), organization_units
        ),
        "cutoffSeniorityOrder": (cutoff or {}).get("seniorityOrder"),
    }
    employee_ids = _eligible_employee_ids(eligibility, employees)
    participant_ids = [value for value in _list(data.get("participantIds")) if value in employee_ids]
    excluded_ids = [value for value in _list(data.get("excludedIds")) if value in participant_ids]
    current = _config(employees, designations, organization_units)
    unit_by_id = {item["id"]: item for item in organization_units}
    selected_departments = sorted({
        unit_by_id[value]["name"]
        for value in eligibility["organizationUnitIds"]
        if value in unit_by_id and unit_by_id[value]["unitType"] == "department"
    })
    document = {
        "key": CONFIG_KEY,
        "sequenceVersion": CYCLE_SEQUENCE_VERSION,
        "departments": selected_departments,
        "organizationUnitIds": eligibility["organizationUnitIds"],
        "cutoffDesignationId": (cutoff or {}).get("id") or "",
        "cutoffSeniorityOrder": (cutoff or {}).get("seniorityOrder"),
        "participantIds": participant_ids,
        "excludedIds": excluded_ids,
        "nextEmployeeId": (
            current.get("nextEmployeeId")
            if current.get("nextEmployeeId") in participant_ids
            else (participant_ids[0] if participant_ids else "")
        ),
        "daysAssignedInCurrentSlot": current.get("daysAssignedInCurrentSlot", 0),
        "slotDays": 2,
        "skipHolidays": data.get("skipHolidays", True) is not False,
        "updatedAt": datetime.utcnow(),
        "updatedBy": user.get("employeeId"),
    }
    morning_presentation_config_collection.update_one(
        {"key": CONFIG_KEY}, {"$set": document}, upsert=True
    )
    return {"message": "Presentation cycle saved", "config": _serialize_config(document)}


@router.post("/generate")
def generate_roster(data: dict, user=Depends(get_authenticated_user)):
    require_page_write(user, "crew_presentation")
    month_value = str(data.get("month") or "")
    _parse_month(month_value)
    designations = _designation_rows()
    organization_units = _organization_unit_rows()
    employees = _employee_rows(designations, organization_units)
    config = _config(employees, designations, organization_units)
    if data.get("participantIds") is not None:
        config["participantIds"] = _list(data.get("participantIds"))
    if data.get("excludedIds") is not None:
        config["excludedIds"] = _list(data.get("excludedIds"))
    if data.get("skipHolidays") is not None:
        config["skipHolidays"] = data.get("skipHolidays") is not False
    return _generate(month_value, config, employees)


@router.get("/{month_value}")
def get_roster(month_value: str, user=Depends(get_authenticated_user)):
    _parse_month(month_value)
    return {"roster": _serialize_roster(
        morning_presentation_roster_collection.find_one({"month": month_value})
    )}


@router.put("/{month_value}")
def save_roster(month_value: str, data: dict, user=Depends(get_authenticated_user)):
    require_page_write(user, "crew_presentation")
    _parse_month(month_value)
    entries = data.get("entries") or []
    if not entries:
        raise HTTPException(400, "Generate at least one roster assignment before saving")
    status = "PUBLISHED" if str(data.get("status") or "").upper() == "PUBLISHED" else "DRAFT"
    existing = morning_presentation_roster_collection.find_one({"month": month_value})
    now = datetime.utcnow()
    document = {
        "month": month_value,
        "status": status,
        "entries": entries,
        "participantIds": _list(data.get("participantIds")),
        "cycleStateAfter": data.get("cycleStateAfter") or {},
        "updatedAt": now,
        "updatedBy": user.get("employeeId"),
    }
    if status == "PUBLISHED":
        document["publishedAt"] = now
        document["publishedBy"] = user.get("employeeId")
    if existing:
        morning_presentation_roster_collection.update_one({"_id": existing["_id"]}, {"$set": document})
        roster_id = existing["_id"]
    else:
        document["createdAt"] = now
        roster_id = morning_presentation_roster_collection.insert_one(document).inserted_id

    if status == "PUBLISHED":
        cycle_state = document["cycleStateAfter"]
        morning_presentation_config_collection.update_one(
            {"key": CONFIG_KEY},
            {"$set": {
                "sequenceVersion": CYCLE_SEQUENCE_VERSION,
                "participantIds": document["participantIds"],
                "nextEmployeeId": cycle_state.get("nextEmployeeId") or "",
                "daysAssignedInCurrentSlot": min(
                    _positive_int(cycle_state.get("daysAssignedInCurrentSlot")) or 0, 1
                ),
                "updatedAt": now,
            }},
            upsert=True,
        )
        publication_mail = _send_published_roster_mail(
            entries,
            month_value,
            data.get("snapshotDataUrl"),
        )
        morning_presentation_roster_collection.update_one(
            {"_id": roster_id},
            {"$set": {"publicationMail": publication_mail}},
        )
    saved = morning_presentation_roster_collection.find_one({"_id": roster_id})
    return {
        "message": f"Roster {status.lower()} saved",
        "roster": _serialize_roster(saved),
        "mail": saved.get("publicationMail") if status == "PUBLISHED" else None,
    }
