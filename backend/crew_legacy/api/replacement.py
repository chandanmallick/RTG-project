from fastapi import APIRouter, HTTPException, Depends, Query
from bson import ObjectId
from crew_legacy.admin_logic.auth_utils import check_replacement_access, get_authenticated_user, get_current_user
from datetime import datetime, timedelta, timezone
from typing import Optional
from crew_legacy.admin_logic.notification_service import notify_all, send_replacement_duty_email
import re
import uuid

import pytz

IST = pytz.timezone("Asia/Kolkata")


from crew_legacy.database.database_mongo import (
    leave_request_collection,
    employee_daily_collection,
    employee_collection,
    compensatory_off_collection,
    duty_denial_collection,
    duty_notification_collection,
    duty_switch_collection,
    duty_exchange_request_collection,
    organization_shift_group_collection,
    organization_unit_collection,
    roster_group_collection,
)

router = APIRouter()

ACTIVE_LEAVE_STATUSES = {"Applied", "Forwarded by SIC", "Approved"}


def organization_units():
    units = list(organization_unit_collection.find({"isActive": {"$ne": False}}))
    return units, {str(item["_id"]): item for item in units}


def organization_lineage(unit_id: str, unit_map: dict):
    result = []
    current_id = str(unit_id or "")
    visited = set()
    while current_id and current_id in unit_map and current_id not in visited:
        visited.add(current_id)
        unit = unit_map[current_id]
        result.append(unit)
        current_id = str(unit.get("parentId") or "")
    return result


def group_organization_context(group_name: str):
    """Return the group's direct reporting unit and every authority above it."""
    mapping = organization_shift_group_collection.find_one({"groupName": group_name}) or {}
    unit_id = str(mapping.get("organizationUnitId") or "")
    _, unit_map = organization_units()
    lineage = organization_lineage(unit_id, unit_map)
    authority_ids = []
    authority_levels = []
    for unit in lineage:
        heads = normalized_categories(unit.get("headEmployeeIds"))
        authority_ids.extend(heads)
        authority_levels.append({
            "unitId": str(unit["_id"]),
            "unitName": unit.get("name"),
            "unitType": unit.get("unitType"),
            "headEmployeeIds": heads,
        })
    unique_authority_ids = list(dict.fromkeys(value for value in authority_ids if value))
    authority_names = {
        str(person.get("userId") or person.get("employeeId") or ""): person.get("name")
        for person in employee_collection.find(
            {"$or": [
                {"userId": {"$in": unique_authority_ids}},
                {"employeeId": {"$in": unique_authority_ids}},
            ]},
            {"userId": 1, "employeeId": 1, "name": 1},
        )
    } if unique_authority_ids else {}
    for level in authority_levels:
        level["headEmployeeNames"] = [
            authority_names.get(value, value) for value in level["headEmployeeIds"]
        ]
    department = next((item for item in lineage if item.get("unitType") == "department"), None)
    section = next((item for item in lineage if item.get("unitType") == "section"), None)
    vertical = next((item for item in lineage if item.get("unitType") == "vertical"), None)
    return {
        "groupName": group_name,
        "directUnitId": unit_id,
        "directUnitName": (lineage[0].get("name") if lineage else mapping.get("organizationUnitName")),
        "directUnitType": (lineage[0].get("unitType") if lineage else mapping.get("organizationUnitType")),
        "departmentId": str(department["_id"]) if department else "",
        "departmentName": department.get("name") if department else "",
        "sectionId": str(section["_id"]) if section else "",
        "sectionName": section.get("name") if section else "",
        "verticalId": str(vertical["_id"]) if vertical else "",
        "verticalName": vertical.get("name") if vertical else "",
        "authorityIds": unique_authority_ids,
        "authorityNames": [authority_names.get(value, value) for value in unique_authority_ids],
        "authorityLevels": authority_levels,
    }


def employee_current_organization(employee: dict):
    """Resolve current master assignment; never infer it from roster history."""
    employee_id = str(employee.get("userId") or employee.get("employeeId") or "")
    try:
        from crew_legacy.api.admin_api import resolve_employee_organization
        resolved = resolve_employee_organization(
            employee.get("manualFunctionIds", employee.get("functionIds")),
            employee_id,
        )
    except Exception:
        resolved = {}
    result = {
        "departmentIds": normalized_categories(resolved.get("departmentIds") or employee.get("departmentIds")),
        "departments": normalized_categories(resolved.get("departments") or employee.get("departments") or employee.get("department")),
        "sectionIds": normalized_categories(resolved.get("sectionIds") or employee.get("sectionIds")),
        "sections": normalized_categories(resolved.get("sections") or employee.get("sections")),
        "verticalIds": normalized_categories(resolved.get("verticalIds") or employee.get("verticalIds")),
        "verticals": normalized_categories(resolved.get("verticals") or employee.get("verticals") or employee.get("vertical")),
        "functionIds": normalized_categories(resolved.get("functionIds") or employee.get("functionIds")),
        "reportingOfficerIds": normalized_categories(
            resolved.get("reportingOfficerIds") or employee.get("reportingOfficerIds") or employee.get("reportingOfficerId")
        ),
        "intermediaryReportingId": resolved.get("intermediaryReportingId") or employee.get("intermediaryReportingId"),
        "hodId": resolved.get("hodId") or employee.get("hodId"),
    }
    authority_ids = list(dict.fromkeys(
        value for value in (
            result["reportingOfficerIds"]
            + [result.get("intermediaryReportingId"), result.get("hodId")]
        ) if value
    ))
    people = {
        str(person.get("userId") or person.get("employeeId") or ""): person.get("name")
        for person in employee_collection.find(
            {"$or": [{"userId": {"$in": authority_ids}}, {"employeeId": {"$in": authority_ids}}]},
            {"userId": 1, "employeeId": 1, "name": 1},
        )
    } if authority_ids else {}
    result["authorityIds"] = authority_ids
    result["authorityNames"] = [people.get(value, value) for value in authority_ids]
    return result


def historical_shift_roles():
    """Past roster membership proves shift experience, but never current reporting."""
    roles = {}
    for group in roster_group_collection.find({}, {"shiftInCharge": 1, "members": 1}):
        sic = group.get("shiftInCharge") or {}
        sic_id = str(sic.get("employeeId") or "").strip()
        if sic_id:
            roles.setdefault(sic_id, set()).add("sic")
        for member in group.get("members") or []:
            employee_id = str(member.get("employeeId") or "").strip()
            if employee_id:
                roles.setdefault(employee_id, set()).add("shift_engineer")
    return roles


def replacement_authority_ids(leave: dict):
    group_context = group_organization_context(leave.get("groupName"))
    values = list(group_context.get("authorityIds") or [])
    values.extend(controlling_officer_ids(str(leave.get("employeeId") or "")))
    values.extend(group_shift_in_charge_ids(leave.get("date"), leave.get("groupName")))
    return list(dict.fromkeys(str(value).strip() for value in values if str(value).strip()))


def has_replacement_authority(user: dict, leave: dict):
    actor_id = str(user.get("employeeId") or user.get("userId") or "").strip()
    if not actor_id:
        return False
    if actor_id == "50041" or str(user.get("role") or "").lower() == "admin":
        return True
    return actor_id in replacement_authority_ids(leave)


def require_replacement_authority(user: dict, leave: dict):
    if not has_replacement_authority(user, leave):
        raise HTTPException(
            403,
            "Replacement access is limited to the reporting officer, Shift-in-Charge, Section/Vertical head, Department head or administrator",
        )


def normalized_categories(value):
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value in [None, ""]:
        return []
    return [str(value).strip()]


def category_matches(category_value, keyword: str) -> bool:
    target = str(keyword or "").strip().lower()
    return any(target in item.lower() for item in normalized_categories(category_value))


def employee_id_sort_key(value):
    text = str(value or "").strip()
    return (0, int(text)) if text.isdigit() else (1, text.lower())


def date_difference_days(later_date: str, earlier_date: str):
    if not later_date or not earlier_date:
        return None
    try:
        return (datetime.strptime(later_date, "%Y-%m-%d") - datetime.strptime(earlier_date, "%Y-%m-%d")).days
    except (TypeError, ValueError):
        return None


def utc_naive(value):
    if not isinstance(value, datetime):
        return value
    if value.tzinfo is not None:
        return value.astimezone(pytz.UTC).replace(tzinfo=None)
    return value


def api_datetime(value):
    """Return stored UTC datetimes with an explicit zone for browser clients."""
    if not isinstance(value, datetime):
        return value
    aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return aware.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def api_decision_history(history):
    return [
        {**item, "actedAt": api_datetime(item.get("actedAt"))}
        for item in (history or [])
        if isinstance(item, dict)
    ]


def controlling_officer_ids(employee_id: str, duty_date: str = "", group_name: str = ""):
    employee = employee_collection.find_one(
        {"userId": employee_id},
        {"reportingOfficerIds": 1, "reportingOfficerId": 1, "functionIds": 1, "manualFunctionIds": 1},
    ) or {}
    try:
        from crew_legacy.api.admin_api import resolve_employee_organization
        resolved = resolve_employee_organization(
            employee.get("manualFunctionIds", employee.get("functionIds")),
            employee_id,
        )
        values = (
            resolved.get("reportingOfficerIds")
            or [resolved.get("intermediaryReportingId"), resolved.get("hodId")]
        )
    except Exception:
        values = normalized_categories(
            employee.get("reportingOfficerIds") or employee.get("reportingOfficerId")
        )
    values = [value for value in values if value]
    if duty_date and group_name:
        shift_controllers = employee_daily_collection.find({
            "date": duty_date,
            "$or": [
                {"groupName": group_name, "isSIC": True},
                {
                    "isActingSIC": True,
                    "$or": [{"groupName": group_name}, {"actingSICGroup": group_name}],
                },
            ],
        }, {"employeeId": 1})
        values.extend(
            record.get("employeeId") for record in shift_controllers
            if record.get("employeeId")
        )
    return [value for value in dict.fromkeys(values) if value and value != employee_id]


def employee_by_id(employee_id: str):
    employee_id = str(employee_id or "").strip()
    if not employee_id:
        return {}
    return employee_collection.find_one({
        "$or": [{"userId": employee_id}, {"employeeId": employee_id}],
    }) or {}


def employee_id_filter(employee_id: str):
    return {"$regex": rf"^\s*{re.escape(str(employee_id or '').strip())}\s*$"}


def has_duty_switch_authority(user: dict, duty_date: str):
    actor = str(user.get("employeeId") or user.get("userId") or "").strip()
    if str(user.get("role") or "").lower() == "admin" or actor == "50041":
        return True
    return bool(employee_daily_collection.find_one({
        "date": duty_date,
        "departmentIC.employeeId": employee_id_filter(actor),
    }))


def require_duty_switch_authority(user: dict, duty_date: str):
    actor = str(user.get("employeeId") or user.get("userId") or "").strip()
    if not has_duty_switch_authority(user, duty_date):
        raise HTTPException(403, "Only the Leave Approving Authority or an administrator can change duty")
    return actor


def group_shift_in_charge_ids(duty_date: str, group_name: str):
    if not duty_date or not group_name:
        return []
    records = employee_daily_collection.find(
        {
            "date": duty_date,
            "$or": [
                {"groupName": group_name, "isSIC": True},
                {
                    "isActingSIC": True,
                    "$or": [{"groupName": group_name}, {"actingSICGroup": group_name}],
                },
            ],
        },
        {"employeeId": 1},
    )
    return list(dict.fromkeys(
        str(item.get("employeeId") or "").strip()
        for item in records
        if str(item.get("employeeId") or "").strip()
    ))


def daily_department_ic_ids(*daily_records):
    return list(dict.fromkeys(
        str((record.get("departmentIC") or {}).get("employeeId") or "").strip()
        for record in daily_records
        if str((record.get("departmentIC") or {}).get("employeeId") or "").strip()
    ))


def exchange_request_summary(item: dict, actor_id: str = ""):
    stage = item.get("stage") or "other_employee"
    actor_id = str(actor_id or "").strip()
    can_act = False
    actor_role = ""
    if item.get("status") == "Pending":
        if stage == "other_employee" and actor_id == str((item.get("secondEmployee") or {}).get("employeeId") or ""):
            can_act, actor_role = True, "Exchange employee"
        elif stage == "sic":
            pending = [entry for entry in item.get("sicApprovals") or [] if entry.get("status") == "Pending"]
            if any(actor_id in normalized_categories(entry.get("employeeIds")) for entry in pending):
                can_act, actor_role = True, "Shift-in-Charge"
        elif stage == "dic":
            pending = [entry for entry in item.get("dicApprovals") or [] if entry.get("status") == "Pending"]
            if any(actor_id in normalized_categories(entry.get("employeeIds")) for entry in pending):
                can_act, actor_role = True, "Leave Approving Authority"
    return {
        "id": str(item.get("_id")),
        "requestId": item.get("requestId"),
        "date": item.get("date"),
        "firstEmployee": item.get("firstEmployee") or {},
        "secondEmployee": item.get("secondEmployee") or {},
        "reason": item.get("reason"),
        "status": item.get("status"),
        "stage": stage,
        "requestedBy": item.get("requestedBy"),
        "requestedAt": api_datetime(item.get("requestedAt")),
        "updatedAt": api_datetime(item.get("updatedAt")),
        "sicApprovals": item.get("sicApprovals") or [],
        "dicApprovals": item.get("dicApprovals") or [],
        "decisionHistory": api_decision_history(item.get("decisionHistory")),
        "canAct": can_act,
        "actorRole": actor_role,
    }


def mail_address(employee):
    return str((employee or {}).get("gmail") or (employee or {}).get("email") or "").strip()


def display_shift_name(value):
    duty = str(value or "").strip()
    normalized = duty.lower().replace(" ", "")
    if normalized in {"m", "m1", "m2", "morning", "morningshift"}:
        return "Morning"
    if normalized in {"e", "e1", "e2", "evening", "eveningshift"}:
        return "Evening"
    if normalized in {"n", "n1", "n2", "night", "nightshift"}:
        return "Night"
    return duty or "Shift"


def replacement_mail_recipients(replacement_employee, leave, duty_date, group_name):
    """Employee, organization reporting officers, leave employee and group SIC."""
    replacement_id = str(replacement_employee.get("userId") or replacement_employee.get("employeeId") or "")
    leave_id = str(leave.get("employeeId") or "")
    reporting_ids = controlling_officer_ids(replacement_id)
    sic_ids = group_shift_in_charge_ids(duty_date, group_name)

    people = [replacement_employee, employee_by_id(leave_id)]
    people.extend(employee_by_id(value) for value in reporting_ids)
    people.extend(employee_by_id(value) for value in sic_ids)

    recipients = []
    seen = set()
    for person in people:
        email = mail_address(person)
        key = email.lower()
        if email and key not in seen:
            seen.add(key)
            recipients.append(email)
    return recipients, reporting_ids, sic_ids


def auto_accept_pending_duty_notifications():
    now = datetime.utcnow()
    result = duty_notification_collection.update_many(
        {
            "status": "Pending",
            "cutoffTime": {"$lte": now},
        },
        {
            "$set": {
                "status": "Accepted",
                "decision": "Auto accepted at 16:00 cutoff",
                "autoAccepted": True,
                "updatedAt": now,
            },
            "$push": {
                "decisionHistory": {
                    "action": "AutoAccepted",
                    "actedBy": "SYSTEM",
                    "actorRole": "System",
                    "actedAt": now,
                }
            },
        },
    )
    return result.modified_count


def release_replacement_assignment(leave, reason: str, acted_by: str, actor_role: str):
    replacement = leave.get("replacement") or {}
    replacement_id = replacement.get("employeeId")
    leave_date = leave.get("date")
    if not replacement_id or not leave_date:
        return

    consumed_credit = compensatory_off_collection.find_one({
        "employeeId": replacement_id,
        "reference.leaveRequestId": str(leave["_id"]),
        "status": {"$in": ["Reserved", "Used"]},
    })
    if consumed_credit:
        raise HTTPException(409, "Assignment cannot be changed because its C-OFF credit is reserved or used")

    compensatory_off_collection.delete_many({
        "employeeId": replacement_id,
        "reference.leaveRequestId": str(leave["_id"]),
        "status": "Available",
    })

    daily = employee_daily_collection.find_one({
        "employeeId": replacement_id,
        "date": leave_date,
    }) or {}
    original = daily.get("replacementOriginal") or {}
    created_by_replacement = bool(
        daily.get("replacementCreatedDaily")
        or (
            daily.get("replacementDuty")
            and not original
            and not daily.get("attachedRosterId")
            and not daily.get("isFinalRoster")
            and not daily.get("rosterVersion")
        )
    )
    if created_by_replacement:
        employee_daily_collection.delete_one({"_id": daily["_id"]})
    else:
        restore = {}
        unset = {
            "replacementDuty": "",
            "replacementMode": "",
            "halfDuty": "",
            "replacementFor": "",
            "replacementOriginal": "",
            "replacementCreatedDaily": "",
        }
        for field in ("assignedDuty", "groupName", "rosterId"):
            if field in original:
                restore[field] = original[field]
            elif field == "rosterId":
                unset[field] = ""
        update = {"$unset": unset}
        if restore:
            update["$set"] = restore
        employee_daily_collection.update_one({"_id": daily.get("_id")}, update)

    now = datetime.utcnow()
    audit = {
        **replacement,
        "releasedOn": now,
        "releaseReason": reason,
        "releasedBy": acted_by,
        "releasedByRole": actor_role,
    }
    leave_request_collection.update_one(
        {"_id": leave["_id"]},
        {
            "$set": {"replacement": None, "replacementAssigned": False},
            "$push": {"replacementAssignmentHistory": audit},
        },
    )
    employee_daily_collection.update_one(
        {"employeeId": leave.get("employeeId"), "date": leave_date},
        {"$set": {"replacementAssigned": False}},
    )


def calculate_expiry(earned_date_str):
    from datetime import datetime

    earned = datetime.strptime(earned_date_str, "%Y-%m-%d")

    next_year = earned.year + 1

    return f"{next_year}-03-31"


OFF_DUTIES = {"OFF", "O1", "O2"}
SHIFT_DUTIES = {"MORNING", "EVENING", "NIGHT", "M1", "M2", "E1", "E2", "N1", "N2"}


def normalized_duty(value):
    return str(value or "").strip().upper()


def award_off_day_comp_off(
    *,
    employee_id: str,
    duty_date: str,
    previous_duty,
    assigned_duty,
    group_name: str,
    switch_id: str,
    source: str,
    reference_type: str = "DutySwitch",
    reference_extra: Optional[dict] = None,
):
    """Create one compatible C-OFF credit when a shift member works a rostered OFF day."""
    if (
        normalized_duty(previous_duty) not in OFF_DUTIES
        or normalized_duty(assigned_duty) not in SHIFT_DUTIES
        or not str(group_name or "").strip()
    ):
        return None

    employee = employee_by_id(employee_id) or {}
    existing = compensatory_off_collection.find_one({
        "employeeId": employee_id_filter(employee_id),
        "earnedDate": duty_date,
        "status": {"$in": ["Available", "Reserved", "Used"]},
    })
    if existing:
        return str(existing["_id"])

    credit = {
        "employeeId": str(employee_id),
        "employeeName": employee.get("name"),
        "designation": employee.get("designation"),
        "earnedDate": duty_date,
        "expiryDate": calculate_expiry(duty_date),
        "status": "Available",
        "reason": "Duty assigned on rostered OFF day",
        "dutyType": str(employee.get("dutyType") or "Shift"),
        "reference": {
            "type": reference_type,
            "source": source,
            "previousDuty": previous_duty,
            "assignedDuty": assigned_duty,
            **({"dutySwitchId": switch_id} if switch_id else {}),
            **(reference_extra or {}),
        },
        "createdOn": datetime.utcnow(),
    }
    inserted = compensatory_off_collection.insert_one(credit)
    return str(inserted.inserted_id)


def ensure_duty_switch_comp_off_releasable(employee_id: str, duty_date: str):
    query = {
        "employeeId": employee_id_filter(employee_id),
        "earnedDate": duty_date,
        "reference.type": "DutySwitch",
    }
    consumed = compensatory_off_collection.find_one({
        **query,
        "status": {"$in": ["Reserved", "Used"]},
    })
    if consumed:
        raise HTTPException(
            409,
            "This duty cannot be moved because its C-OFF credit is already reserved or used",
        )


def clear_available_duty_switch_comp_off(employee_id: str, duty_date: str):
    """Remove a switch-created credit if its qualifying duty is moved away again."""
    ensure_duty_switch_comp_off_releasable(employee_id, duty_date)
    query = {
        "employeeId": employee_id_filter(employee_id),
        "earnedDate": duty_date,
        "reference.type": "DutySwitch",
    }
    return compensatory_off_collection.delete_many({
        **query,
        "status": "Available",
    }).deleted_count



# =========================================================
# GET LEAVES REQUIRING REPLACEMENT
# =========================================================
@router.get("/duty-switch/options")
def duty_switch_options(
    date: str = Query(...),
    user=Depends(get_authenticated_user),
):
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(400, "Date must use YYYY-MM-DD format") from exc

    records = list(employee_daily_collection.find(
        {"date": date},
        {
            "_id": 0,
            "employeeId": 1,
            "name": 1,
            "designation": 1,
            "groupName": 1,
            "assignedDuty": 1,
            "leaveStatus": 1,
            "replacementDuty": 1,
        },
    ).sort([("groupName", 1), ("name", 1)]))
    return [
        {
            **record,
            "employeeId": str(record.get("employeeId") or "").strip(),
            "onLeave": record.get("leaveStatus") in ACTIVE_LEAVE_STATUSES,
        }
        for record in records
        if str(record.get("employeeId") or "").strip()
    ]


@router.put("/duty-switch")
def switch_employee_duty(
    payload: dict,
    user=Depends(get_authenticated_user),
):
    duty_date = str(payload.get("date") or "").strip()
    employee_id = str(payload.get("employeeId") or "").strip()
    assigned_duty = str(payload.get("assignedDuty") or "").strip()
    group_name = str(payload.get("groupName") or "").strip()
    reason = str(payload.get("reason") or "").strip()

    try:
        datetime.strptime(duty_date, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(400, "Date must use YYYY-MM-DD format") from exc
    actor = require_duty_switch_authority(user, duty_date)
    if not employee_id or not assigned_duty or not reason:
        raise HTTPException(400, "Employee, new duty and reason are required")

    current = employee_daily_collection.find_one({
        "employeeId": employee_id_filter(employee_id),
        "date": duty_date,
    })
    if not current:
        raise HTTPException(404, "Employee duty record not found for the selected date")
    if current.get("leaveStatus") in ACTIVE_LEAVE_STATUSES:
        raise HTTPException(409, "An employee on leave cannot be directly reassigned; assign a replacement against the leave")
    removes_shift_duty = (
        normalized_duty(current.get("assignedDuty")) in SHIFT_DUTIES
        and normalized_duty(assigned_duty) in OFF_DUTIES
    )
    if removes_shift_duty:
        ensure_duty_switch_comp_off_releasable(employee_id, duty_date)

    previous = {
        "assignedDuty": current.get("assignedDuty"),
        "groupName": current.get("groupName"),
        "replacementDuty": bool(current.get("replacementDuty")),
    }
    switch_id = str(uuid.uuid4())
    updated = {
        "assignedDuty": assigned_duty,
        "groupName": group_name or current.get("groupName"),
        "lastDutySwitch": {
            "switchId": switch_id,
            "changedBy": actor,
            "changedOn": datetime.utcnow(),
            "reason": reason,
            "previous": previous,
        },
    }
    result = employee_daily_collection.update_one(
        {"_id": current["_id"]},
        {"$set": updated},
    )
    if result.modified_count != 1:
        raise HTTPException(409, "Duty was not changed")
    if removes_shift_duty:
        clear_available_duty_switch_comp_off(employee_id, duty_date)

    employee = employee_by_id(employee_id)
    audit = {
        "date": duty_date,
        "employeeId": employee_id,
        "employeeName": current.get("name") or employee.get("name"),
        "designation": current.get("designation") or employee.get("designation"),
        "previous": previous,
        "updated": {
            "assignedDuty": updated["assignedDuty"],
            "groupName": updated["groupName"],
        },
        "reason": reason,
        "changedBy": actor,
        "changedOn": datetime.utcnow(),
        "source": "Manual duty switch",
        "switchId": switch_id,
    }
    inserted = duty_switch_collection.insert_one(audit)
    comp_off_id = award_off_day_comp_off(
        employee_id=employee_id,
        duty_date=duty_date,
        previous_duty=previous.get("assignedDuty"),
        assigned_duty=assigned_duty,
        group_name=updated["groupName"],
        switch_id=switch_id,
        source=audit["source"],
    )
    if comp_off_id:
        duty_switch_collection.update_one(
            {"_id": inserted.inserted_id},
            {"$set": {"compOffAwarded": True, "compOffId": comp_off_id}},
        )
        employee_daily_collection.update_one(
            {"_id": current["_id"]},
            {"$set": {"lastDutySwitch.compOffAwarded": True, "lastDutySwitch.compOffId": comp_off_id}},
        )

    notify_all(
        employee_ids=[employee_id],
        subject="Duty assignment changed",
        message=(
            f"Your duty on {duty_date} was changed from "
            f"{previous.get('assignedDuty') or '-'} to {assigned_duty}. Reason: {reason}"
        ),
        ref_id=str(inserted.inserted_id),
        action="VIEW_CALENDAR",
        type="DUTY",
    )
    return {
        "message": "Duty changed successfully",
        "auditId": str(inserted.inserted_id),
        "previous": previous,
        "updated": audit["updated"],
        "compOffAwarded": bool(comp_off_id),
        "compOffId": comp_off_id,
    }


@router.put("/duty-switch/exchange")
def exchange_employee_duties(
    payload: dict,
    user=Depends(get_authenticated_user),
):
    duty_date = str(payload.get("date") or "").strip()
    first_id = str(payload.get("firstEmployeeId") or "").strip()
    second_id = str(payload.get("secondEmployeeId") or "").strip()
    reason = str(payload.get("reason") or "").strip()
    actor = str(user.get("employeeId") or user.get("userId") or "").strip()

    try:
        datetime.strptime(duty_date, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(400, "Date must use YYYY-MM-DD format") from exc
    if not first_id or not second_id or first_id == second_id or not reason:
        raise HTTPException(400, "Two different employees and the exchange reason are required")
    manager_authorized = has_duty_switch_authority(user, duty_date)
    if not manager_authorized and actor != first_id:
        raise HTTPException(403, "Employees may exchange only their own duty")

    first = employee_daily_collection.find_one({
        "employeeId": employee_id_filter(first_id),
        "date": duty_date,
    })
    second = employee_daily_collection.find_one({
        "employeeId": employee_id_filter(second_id),
        "date": duty_date,
    })
    if not first or not second:
        raise HTTPException(404, "Both employees must have a duty record on the selected date")
    if first.get("leaveStatus") in ACTIVE_LEAVE_STATUSES or second.get("leaveStatus") in ACTIVE_LEAVE_STATUSES:
        raise HTTPException(409, "Duty cannot be exchanged with an employee who is on leave")

    # An employee request is never applied immediately. The other employee,
    # the SIC of every affected group, and the mapped DIC(s) must approve it.
    # DIC/admin initiated operational changes retain the existing immediate path.
    if not manager_authorized:
        existing = duty_exchange_request_collection.find_one({
            "date": duty_date,
            "status": "Pending",
            "$or": [
                {"firstEmployee.employeeId": {"$in": [first_id, second_id]}},
                {"secondEmployee.employeeId": {"$in": [first_id, second_id]}},
            ],
        })
        if existing:
            raise HTTPException(409, "A pending duty-exchange request already exists for one of these employees on this date")

        affected_groups = list(dict.fromkeys(
            str(value or "").strip()
            for value in (first.get("groupName"), second.get("groupName"))
            if str(value or "").strip()
        ))
        sic_approvals = []
        for group_name in affected_groups:
            sic_ids = group_shift_in_charge_ids(duty_date, group_name)
            if not sic_ids:
                raise HTTPException(409, f"Shift-in-Charge is not mapped for {group_name} on {duty_date}")
            sic_approvals.append({
                "groupName": group_name,
                "employeeIds": sic_ids,
                "status": "Pending",
            })
        dic_ids = daily_department_ic_ids(first, second)
        if not dic_ids:
            raise HTTPException(409, "Leave Approving Authority is not mapped for the selected employees")
        dic_approvals = [{
            "scope": "Final approval",
            "employeeIds": dic_ids,
            "status": "Pending",
        }]
        request_id = str(uuid.uuid4())
        now = datetime.utcnow()
        request = {
            "requestId": request_id,
            "date": duty_date,
            "firstEmployee": {
                "employeeId": first_id,
                "name": first.get("name") or (employee_by_id(first_id) or {}).get("name"),
                "assignedDuty": first.get("assignedDuty"),
                "groupName": first.get("groupName"),
            },
            "secondEmployee": {
                "employeeId": second_id,
                "name": second.get("name") or (employee_by_id(second_id) or {}).get("name"),
                "assignedDuty": second.get("assignedDuty"),
                "groupName": second.get("groupName"),
            },
            "reason": reason,
            "status": "Pending",
            "stage": "other_employee",
            "requestedBy": actor,
            "requestedAt": now,
            "updatedAt": now,
            "sicApprovals": sic_approvals,
            "dicApprovals": dic_approvals,
            "decisionHistory": [{
                "action": "Requested",
                "actedBy": actor,
                "actorRole": "Requesting employee",
                "actedAt": now,
            }],
        }
        inserted = duty_exchange_request_collection.insert_one(request)
        employee_daily_collection.update_many(
            {"_id": {"$in": [first["_id"], second["_id"]]}},
            {"$set": {"exchangeRequestId": request_id, "exchangeStatus": "Pending"}},
        )
        notify_all(
            employee_ids=[second_id],
            subject="Duty exchange approval required",
            message=(
                f"{request['firstEmployee']['name'] or first_id} requested a duty exchange with you "
                f"on {duty_date}. Review and approve or reject the request."
            ),
            ref_id=str(inserted.inserted_id),
            action="VIEW_CALENDAR",
            type="DUTY",
        )
        return {
            "message": "Duty exchange request submitted for approval",
            "requestId": request_id,
            "pendingApproval": True,
            "stage": "other_employee",
        }

    exchange_id = str(uuid.uuid4())
    changed_on = datetime.utcnow()
    first_previous = {"assignedDuty": first.get("assignedDuty"), "groupName": first.get("groupName")}
    second_previous = {"assignedDuty": second.get("assignedDuty"), "groupName": second.get("groupName")}
    first_updated = {"assignedDuty": second.get("assignedDuty"), "groupName": second.get("groupName")}
    second_updated = {"assignedDuty": first.get("assignedDuty"), "groupName": first.get("groupName")}
    duties_losing_credit = [
        employee_id
        for employee_id, previous, updated_record in (
            (first_id, first_previous, first_updated),
            (second_id, second_previous, second_updated),
        )
        if (
            normalized_duty(previous.get("assignedDuty")) in SHIFT_DUTIES
            and normalized_duty(updated_record.get("assignedDuty")) in OFF_DUTIES
        )
    ]
    for employee_id in duties_losing_credit:
        ensure_duty_switch_comp_off_releasable(employee_id, duty_date)
    common_switch = {
        "exchangeId": exchange_id,
        "changedBy": actor,
        "changedOn": changed_on,
        "reason": reason,
        "source": "Manpower exchange",
    }

    first_result = employee_daily_collection.update_one(
        {"_id": first["_id"]},
        {"$set": {**first_updated, "lastDutySwitch": {**common_switch, "previous": first_previous}}},
    )
    second_result = employee_daily_collection.update_one(
        {"_id": second["_id"]},
        {"$set": {**second_updated, "lastDutySwitch": {**common_switch, "previous": second_previous}}},
    )
    if first_result.matched_count != 1 or second_result.matched_count != 1:
        employee_daily_collection.update_one({"_id": first["_id"]}, {"$set": first_previous})
        employee_daily_collection.update_one({"_id": second["_id"]}, {"$set": second_previous})
        raise HTTPException(409, "The duty exchange could not be completed")
    for employee_id in duties_losing_credit:
        clear_available_duty_switch_comp_off(employee_id, duty_date)

    audit_records = [
        {
            **common_switch,
            "date": duty_date,
            "employeeId": first_id,
            "employeeName": first.get("name"),
            "designation": first.get("designation"),
            "otherEmployeeId": second_id,
            "otherEmployeeName": second.get("name"),
            "previous": first_previous,
            "updated": first_updated,
        },
        {
            **common_switch,
            "date": duty_date,
            "employeeId": second_id,
            "employeeName": second.get("name"),
            "designation": second.get("designation"),
            "otherEmployeeId": first_id,
            "otherEmployeeName": first.get("name"),
            "previous": second_previous,
            "updated": second_updated,
        },
    ]
    duty_switch_collection.insert_many(audit_records)
    comp_off_ids = {}
    for employee_id, previous, updated_record in (
        (first_id, first_previous, first_updated),
        (second_id, second_previous, second_updated),
    ):
        comp_off_id = award_off_day_comp_off(
            employee_id=employee_id,
            duty_date=duty_date,
            previous_duty=previous.get("assignedDuty"),
            assigned_duty=updated_record.get("assignedDuty"),
            group_name=updated_record.get("groupName"),
            switch_id=exchange_id,
            source=common_switch["source"],
        )
        if comp_off_id:
            comp_off_ids[employee_id] = comp_off_id
            duty_switch_collection.update_many(
                {"exchangeId": exchange_id, "employeeId": employee_id},
                {"$set": {"compOffAwarded": True, "compOffId": comp_off_id}},
            )
    notify_all(
        employee_ids=[first_id, second_id],
        subject="Shift manpower exchanged",
        message=(
            f"Duties for {first.get('name') or first_id} and {second.get('name') or second_id} "
            f"on {duty_date} were exchanged. Reason: {reason}"
        ),
        ref_id=exchange_id,
        action="VIEW_CALENDAR",
        type="DUTY",
    )
    return {
        "message": "Manpower exchanged successfully",
        "exchangeId": exchange_id,
        "first": {"employeeId": first_id, **first_updated},
        "second": {"employeeId": second_id, **second_updated},
        "compOffAwarded": comp_off_ids,
    }


@router.get("/duty-switch/exchange-requests")
def list_duty_exchange_requests(
    status: str = Query("Pending"),
    user=Depends(get_authenticated_user),
):
    actor_id = str(user.get("employeeId") or user.get("userId") or "").strip()
    query = {} if status.lower() == "all" else {"status": status}
    if str(user.get("role") or "").lower() != "admin" and actor_id != "50041":
        query["$or"] = [
            {"firstEmployee.employeeId": actor_id},
            {"secondEmployee.employeeId": actor_id},
            {"sicApprovals.employeeIds": actor_id},
            {"dicApprovals.employeeIds": actor_id},
        ]
    rows = duty_exchange_request_collection.find(query).sort([("requestedAt", -1)]).limit(250)
    return [exchange_request_summary(item, actor_id) for item in rows]


@router.put("/duty-switch/exchange-requests/{request_id}/decision")
def decide_duty_exchange_request(
    request_id: str,
    payload: dict,
    user=Depends(get_authenticated_user),
):
    try:
        object_id = ObjectId(request_id)
    except Exception as exc:
        raise HTTPException(400, "Invalid duty-exchange request") from exc
    decision = str(payload.get("decision") or "").strip().lower()
    comment = str(payload.get("comment") or "").strip()
    if decision not in {"approve", "reject"}:
        raise HTTPException(400, "Decision must be approve or reject")
    if decision == "reject" and not comment:
        raise HTTPException(400, "A rejection comment is required")

    request = duty_exchange_request_collection.find_one({"_id": object_id})
    if not request:
        raise HTTPException(404, "Duty-exchange request not found")
    if request.get("status") != "Pending":
        raise HTTPException(409, f"This request is already {request.get('status') or 'closed'}")
    stale_reason = ""
    for key_name in ("firstEmployee", "secondEmployee"):
        snapshot = request.get(key_name) or {}
        current = employee_daily_collection.find_one({
            "employeeId": employee_id_filter(snapshot.get("employeeId")),
            "date": request.get("date"),
        })
        if not current:
            stale_reason = "A duty record no longer exists"
            break
        if current.get("leaveStatus") in ACTIVE_LEAVE_STATUSES:
            stale_reason = f"{current.get('name') or snapshot.get('employeeId')} is now on leave"
            break
        if (
            current.get("assignedDuty") != snapshot.get("assignedDuty")
            or current.get("groupName") != snapshot.get("groupName")
        ):
            stale_reason = f"The duty of {current.get('name') or snapshot.get('employeeId')} has changed since this request"
            break
    if stale_reason:
        cancelled_at = datetime.utcnow()
        duty_exchange_request_collection.update_one(
            {"_id": object_id, "status": "Pending"},
            {
                "$set": {
                    "status": "Cancelled", "stage": "complete",
                    "updatedAt": cancelled_at, "cancellationReason": stale_reason,
                },
                "$push": {"decisionHistory": {
                    "action": "Cancelled", "actedBy": "SYSTEM", "actorRole": "System",
                    "actedAt": cancelled_at, "reason": stale_reason,
                }},
            },
        )
        employee_daily_collection.update_many(
            {"exchangeRequestId": request.get("requestId")},
            {"$unset": {"exchangeRequestId": "", "exchangeStatus": ""}},
        )
        raise HTTPException(409, f"Duty-exchange request cancelled: {stale_reason}")
    actor_id = str(user.get("employeeId") or user.get("userId") or "").strip()
    stage = request.get("stage") or "other_employee"
    summary = exchange_request_summary(request, actor_id)
    if not summary["canAct"]:
        raise HTTPException(403, "This approval is not pending with the logged-in employee")

    now = datetime.utcnow()
    history_entry = {
        "action": "Approved" if decision == "approve" else "Rejected",
        "actedBy": actor_id,
        "actorRole": summary["actorRole"],
        "actedAt": now,
        "reason": comment or None,
    }
    participant_ids = [value for value in dict.fromkeys([
        str((request.get("firstEmployee") or {}).get("employeeId") or ""),
        str((request.get("secondEmployee") or {}).get("employeeId") or ""),
    ]) if value]

    if decision == "reject":
        duty_exchange_request_collection.update_one(
            {"_id": object_id, "status": "Pending"},
            {"$set": {
                "status": "Rejected", "stage": "complete", "updatedAt": now,
                "rejectionComment": comment,
            }, "$push": {"decisionHistory": history_entry}},
        )
        employee_daily_collection.update_many(
            {"exchangeRequestId": request.get("requestId")},
            {"$unset": {"exchangeRequestId": "", "exchangeStatus": ""}},
        )
        notify_all(
            employee_ids=participant_ids,
            subject="Duty exchange request rejected",
            message=f"Duty exchange for {request.get('date')} was rejected by {summary['actorRole']}. Comment: {comment}",
            ref_id=request_id,
            action="VIEW_CALENDAR",
            type="DUTY",
        )
        return {"message": "Duty exchange request rejected", "status": "Rejected"}

    if stage == "other_employee":
        next_stage = "sic"
        duty_exchange_request_collection.update_one(
            {"_id": object_id, "status": "Pending", "stage": stage},
            {"$set": {
                "otherEmployeeApproval": {
                    "status": "Approved", "actedBy": actor_id, "actedAt": now,
                },
                "stage": next_stage, "updatedAt": now,
            }, "$push": {"decisionHistory": history_entry}},
        )
        sic_ids = list(dict.fromkeys(
            employee_id
            for entry in request.get("sicApprovals") or []
            for employee_id in normalized_categories(entry.get("employeeIds"))
        ))
        notify_all(
            employee_ids=sic_ids,
            subject="Duty exchange requires SIC approval",
            message=f"Employee duty exchange on {request.get('date')} is accepted by both employees and awaits SIC approval.",
            ref_id=request_id,
            action="VIEW_CALENDAR",
            type="DUTY",
        )
        return {"message": "Employee approval recorded; sent to both Shift-in-Charges", "status": "Pending", "stage": next_stage}

    if stage == "sic":
        approvals = request.get("sicApprovals") or []
        actor_matched = False
        for entry in approvals:
            if entry.get("status") == "Pending" and actor_id in normalized_categories(entry.get("employeeIds")):
                entry.update({"status": "Approved", "actedBy": actor_id, "actedAt": now})
                actor_matched = True
        if not actor_matched:
            raise HTTPException(403, "No pending SIC approval is assigned to the logged-in employee")
        all_sic_approved = all(entry.get("status") == "Approved" for entry in approvals)
        next_stage = "dic" if all_sic_approved else "sic"
        duty_exchange_request_collection.update_one(
            {"_id": object_id, "status": "Pending", "stage": stage},
            {"$set": {"sicApprovals": approvals, "stage": next_stage, "updatedAt": now},
             "$push": {"decisionHistory": history_entry}},
        )
        if all_sic_approved:
            dic_ids = list(dict.fromkeys(
                employee_id
                for entry in request.get("dicApprovals") or []
                for employee_id in normalized_categories(entry.get("employeeIds"))
            ))
            notify_all(
                employee_ids=dic_ids,
                subject="Duty exchange requires final approval",
                message=f"Both SIC approvals are complete for the duty exchange on {request.get('date')}. Final DIC approval is required.",
                ref_id=request_id,
                action="VIEW_CALENDAR",
                type="DUTY",
            )
        return {
            "message": "SIC approval recorded" + ("; sent for final DIC approval" if all_sic_approved else "; awaiting the other SIC"),
            "status": "Pending", "stage": next_stage,
        }

    # Final DIC approval claims the request before applying the exchange so a
    # repeated click cannot swap the two duties a second time.
    claimed = duty_exchange_request_collection.update_one(
        {"_id": object_id, "status": "Pending", "stage": "dic"},
        {"$set": {"status": "Applying", "updatedAt": now}, "$push": {"decisionHistory": history_entry}},
    )
    if claimed.modified_count != 1:
        raise HTTPException(409, "The duty-exchange request is already being processed")
    try:
        exchange_result = exchange_employee_duties(
            {
                "date": request.get("date"),
                "firstEmployeeId": (request.get("firstEmployee") or {}).get("employeeId"),
                "secondEmployeeId": (request.get("secondEmployee") or {}).get("employeeId"),
                "reason": f"Approved employee exchange: {request.get('reason')}",
            },
            user,
        )
    except Exception:
        duty_exchange_request_collection.update_one(
            {"_id": object_id, "status": "Applying"},
            {"$set": {"status": "Pending", "updatedAt": datetime.utcnow()}},
        )
        raise
    completed_at = datetime.utcnow()
    duty_exchange_request_collection.update_one(
        {"_id": object_id, "status": "Applying"},
        {"$set": {
            "status": "Approved", "stage": "complete", "updatedAt": completed_at,
            "completedAt": completed_at, "exchangeId": exchange_result.get("exchangeId"),
            "finalApprovedBy": actor_id,
        }},
    )
    employee_daily_collection.update_many(
        {"exchangeRequestId": request.get("requestId")},
        {"$unset": {"exchangeRequestId": "", "exchangeStatus": ""}},
    )
    notify_all(
        employee_ids=participant_ids,
        subject="Duty exchange finally approved",
        message=f"The duty exchange on {request.get('date')} has been approved and applied.",
        ref_id=request_id,
        action="VIEW_CALENDAR",
        type="DUTY",
    )
    return {"message": "Duty exchange finally approved and applied", "status": "Approved", **exchange_result}


@router.put("/duty-switch/cross-date")
def move_employee_duty_to_another_date(
    payload: dict,
    user=Depends(get_authenticated_user),
):
    employee_id = str(payload.get("employeeId") or "").strip()
    source_date = str(payload.get("sourceDate") or "").strip()
    destination_date = str(payload.get("destinationDate") or "").strip()
    requested_destination_duty = str(payload.get("destinationDuty") or "").strip()
    leave_id = str(payload.get("leaveId") or "").strip()
    reason = str(payload.get("reason") or "").strip()

    for value, label in ((source_date, "Source date"), (destination_date, "Destination date")):
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(400, f"{label} must use YYYY-MM-DD format") from exc
    if not employee_id or not reason:
        raise HTTPException(400, "Employee and reason are required")
    actor = require_duty_switch_authority(user, source_date)
    if destination_date != source_date:
        require_duty_switch_authority(user, destination_date)
    linked_leave = None
    linked_leave_duty = None
    if leave_id:
        try:
            linked_leave = leave_request_collection.find_one({"_id": ObjectId(leave_id)})
        except Exception as exc:
            raise HTTPException(400, "Invalid leave selection") from exc
        if not linked_leave:
            raise HTTPException(404, "Selected leave record was not found")
        if linked_leave.get("date") != destination_date:
            raise HTTPException(409, "The selected leave must be on the destination date")
        if (
            linked_leave.get("finalStatus") != "Approved"
            or not linked_leave.get("replacementRequired")
            or linked_leave.get("replacement")
        ):
            raise HTTPException(409, "The selected leave is no longer pending replacement")
        if str(linked_leave.get("employeeId") or "") == employee_id:
            raise HTTPException(409, "An employee cannot replace their own leave")
        require_replacement_authority(user, linked_leave)
        linked_leave_daily = employee_daily_collection.find_one({
            "employeeId": employee_id_filter(linked_leave.get("employeeId")),
            "date": destination_date,
        }) or {}
        linked_leave_duty = linked_leave_daily.get("assignedDuty") or linked_leave.get("assignedDuty")
    source_record = employee_daily_collection.find_one({
        "employeeId": employee_id_filter(employee_id),
        "date": source_date,
    })
    destination_record = employee_daily_collection.find_one({
        "employeeId": employee_id_filter(employee_id),
        "date": destination_date,
    })
    if not source_record or not destination_record:
        raise HTTPException(404, "The employee must have duty records on both selected dates")
    if (
        source_record.get("leaveStatus") in ACTIVE_LEAVE_STATUSES
        or destination_record.get("leaveStatus") in ACTIVE_LEAVE_STATUSES
    ):
        raise HTTPException(409, "A duty cannot be moved to or from a date on which the employee is on leave")

    source_duty = source_record.get("assignedDuty")
    destination_duty = destination_record.get("assignedDuty")
    source_duty_normalized = normalized_duty(source_duty)
    destination_duty_normalized = normalized_duty(destination_duty)
    if source_duty_normalized not in SHIFT_DUTIES | OFF_DUTIES:
        raise HTTPException(409, "The source date must contain a shift duty or rostered OFF")
    if source_duty_normalized in OFF_DUTIES and destination_duty_normalized not in OFF_DUTIES:
        raise HTTPException(
            409,
            "An OFF source date can be used only when the destination date is also OFF",
        )
    moved_duty = linked_leave_duty or requested_destination_duty or source_duty
    if normalized_duty(moved_duty) not in SHIFT_DUTIES:
        raise HTTPException(400, "Destination shift must be Morning, Evening or Night duty")

    # A same-date operation is a single reassignment, not a swap. This is
    # useful when an authority needs to change or add one duty without moving
    # a second assignment in the opposite direction.
    if source_date == destination_date:
        if linked_leave:
            replacement_result = assign_replacement(
                leave_id,
                {
                    "replacementEmployeeId": employee_id,
                    "mode": "normal",
                    "halfDuty": False,
                    "reason": reason,
                },
                user=user,
            )
            refreshed_leave = leave_request_collection.find_one({"_id": linked_leave["_id"]}) or linked_leave
            replacement = refreshed_leave.get("replacement") or {}
            refreshed_daily = employee_daily_collection.find_one({
                "employeeId": employee_id_filter(employee_id),
                "date": source_date,
            }) or {}
            updated = {
                "assignedDuty": refreshed_daily.get("assignedDuty") or linked_leave_duty,
                "groupName": refreshed_daily.get("groupName") or linked_leave.get("groupName"),
                "replacementDuty": True,
            }
            previous = {
                "assignedDuty": source_duty,
                "groupName": source_record.get("groupName"),
                "replacementDuty": bool(source_record.get("replacementDuty")),
            }
            return {
                "message": "Single leave-replacement duty assigned successfully",
                "singleAssignment": True,
                "source": {"date": source_date, "previous": previous, "updated": updated},
                "destination": {"date": destination_date, "previous": previous, "updated": updated},
                "compOffAwarded": bool(replacement.get("compOffAwarded")),
                "compOffId": replacement.get("compOffId"),
                "linkedLeave": {
                    "id": leave_id,
                    "employeeId": linked_leave.get("employeeId"),
                    "name": linked_leave.get("name"),
                    "assignedDuty": linked_leave.get("assignedDuty"),
                    "groupName": linked_leave.get("groupName"),
                },
                "replacementResult": replacement_result,
            }

        switch_id = str(uuid.uuid4())
        changed_on = datetime.utcnow()
        updated_group = (
            linked_leave.get("groupName")
            if linked_leave
            else source_record.get("groupName")
        )
        previous = {
            "assignedDuty": source_duty,
            "groupName": source_record.get("groupName"),
            "replacementDuty": bool(source_record.get("replacementDuty")),
        }
        updated = {
            "assignedDuty": moved_duty,
            "groupName": updated_group,
            "replacementDuty": bool(source_record.get("replacementDuty")),
        }
        common_switch = {
            "switchId": switch_id,
            "changedBy": actor,
            "changedOn": changed_on,
            "reason": reason,
            "source": "Single-date duty assignment",
            "sourceDate": source_date,
            "destinationDate": destination_date,
            "leaveId": leave_id or None,
        }
        result = employee_daily_collection.update_one(
            {"_id": source_record["_id"], "assignedDuty": source_duty},
            {"$set": {
                "assignedDuty": moved_duty,
                "groupName": updated_group,
                "lastDutySwitch": {
                    **common_switch,
                    "previous": previous,
                    "direction": "single",
                },
            }},
        )
        if result.modified_count != 1:
            raise HTTPException(409, "The duty changed before this assignment could be saved")

        employee = employee_by_id(employee_id) or {}
        audit = {
            **common_switch,
            "date": source_date,
            "direction": "single",
            "employeeId": employee_id,
            "employeeName": source_record.get("name") or employee.get("name"),
            "designation": source_record.get("designation") or employee.get("designation"),
            "previous": previous,
            "updated": updated,
        }
        duty_switch_collection.insert_one(audit)
        comp_off_id = award_off_day_comp_off(
            employee_id=employee_id,
            duty_date=source_date,
            previous_duty=source_duty,
            assigned_duty=moved_duty,
            group_name=updated_group,
            switch_id=switch_id,
            source=common_switch["source"],
        )
        if comp_off_id:
            duty_switch_collection.update_many(
                {"switchId": switch_id, "direction": "single"},
                {"$set": {"compOffAwarded": True, "compOffId": comp_off_id}},
            )
            employee_daily_collection.update_one(
                {"_id": source_record["_id"]},
                {"$set": {"lastDutySwitch.compOffAwarded": True, "lastDutySwitch.compOffId": comp_off_id}},
            )

        replacement_result = None
        if linked_leave:
            replacement_result = assign_replacement(
                leave_id,
                {
                    "replacementEmployeeId": employee_id,
                    "mode": "normal",
                    "halfDuty": False,
                    "reason": reason,
                },
                user=user,
            )
        notify_all(
            employee_ids=[employee_id],
            subject="Duty assignment changed",
            message=(
                f"Your duty on {source_date} was changed from {source_duty or '-'} "
                f"to {moved_duty or '-'}."
                + (
                    f" You were linked as replacement for {linked_leave.get('name') or linked_leave.get('employeeId')}."
                    if linked_leave else ""
                )
                + f" Reason: {reason}"
            ),
            ref_id=switch_id,
            action="VIEW_CALENDAR",
            type="DUTY",
        )
        return {
            "message": "Single duty assigned successfully",
            "switchId": switch_id,
            "singleAssignment": True,
            "source": {"date": source_date, "previous": previous, "updated": updated},
            "destination": {"date": destination_date, "previous": previous, "updated": updated},
            "compOffAwarded": bool(comp_off_id),
            "compOffId": comp_off_id,
            "linkedLeave": {
                "id": leave_id,
                "employeeId": linked_leave.get("employeeId"),
                "name": linked_leave.get("name"),
                "assignedDuty": linked_leave.get("assignedDuty"),
                "groupName": linked_leave.get("groupName"),
            } if linked_leave else None,
            "replacementResult": replacement_result,
        }

    transfer_from_working_day = source_duty_normalized in SHIFT_DUTIES
    additional_off_day_duty = (
        source_duty_normalized in OFF_DUTIES
        and destination_duty_normalized in OFF_DUTIES
    )
    source_becomes_off = transfer_from_working_day and destination_duty_normalized in OFF_DUTIES
    if source_becomes_off:
        ensure_duty_switch_comp_off_releasable(employee_id, source_date)

    switch_id = str(uuid.uuid4())
    changed_on = datetime.utcnow()
    source_previous = {
        "assignedDuty": source_duty,
        "groupName": source_record.get("groupName"),
        "replacementDuty": bool(source_record.get("replacementDuty")),
    }
    destination_previous = {
        "assignedDuty": destination_duty,
        "groupName": destination_record.get("groupName"),
        "replacementDuty": bool(destination_record.get("replacementDuty")),
    }
    source_updated = {
        "assignedDuty": destination_duty,
        "groupName": source_record.get("groupName"),
    }
    destination_updated = {
        "assignedDuty": moved_duty,
        "groupName": (
            linked_leave.get("groupName")
            if linked_leave
            else destination_record.get("groupName") or source_record.get("groupName")
        ),
    }
    common_switch = {
        "switchId": switch_id,
        "changedBy": actor,
        "changedOn": changed_on,
        "reason": reason,
        "source": "Cross-date duty transfer",
        "sourceDate": source_date,
        "destinationDate": destination_date,
        "leaveId": leave_id or None,
    }

    source_result = employee_daily_collection.update_one(
        {"_id": source_record["_id"], "assignedDuty": source_duty},
        {"$set": {
            **source_updated,
            "lastDutySwitch": {**common_switch, "previous": source_previous, "direction": "source"},
        }},
    )
    if source_result.modified_count != 1:
        raise HTTPException(409, "The source duty changed before this transfer could be saved")
    destination_result = employee_daily_collection.update_one(
        {"_id": destination_record["_id"], "assignedDuty": destination_duty},
        {"$set": {
            **destination_updated,
            "lastDutySwitch": {**common_switch, "previous": destination_previous, "direction": "destination"},
        }},
    )
    if destination_result.modified_count != 1:
        employee_daily_collection.update_one(
            {"_id": source_record["_id"]},
            {"$set": {
                "assignedDuty": source_previous["assignedDuty"],
                "groupName": source_previous["groupName"],
            }},
        )
        raise HTTPException(409, "The destination duty changed before this transfer could be saved")
    if source_becomes_off:
        clear_available_duty_switch_comp_off(employee_id, source_date)

    employee = employee_by_id(employee_id) or {}
    audit_records = [
        {
            **common_switch,
            "date": source_date,
            "direction": "source",
            "employeeId": employee_id,
            "employeeName": source_record.get("name") or employee.get("name"),
            "designation": source_record.get("designation") or employee.get("designation"),
            "previous": source_previous,
            "updated": source_updated,
        },
        {
            **common_switch,
            "date": destination_date,
            "direction": "destination",
            "employeeId": employee_id,
            "employeeName": destination_record.get("name") or employee.get("name"),
            "designation": destination_record.get("designation") or employee.get("designation"),
            "previous": destination_previous,
            "updated": destination_updated,
        },
    ]
    duty_switch_collection.insert_many(audit_records)
    comp_off_id = (
        award_off_day_comp_off(
            employee_id=employee_id,
            duty_date=destination_date,
            previous_duty=destination_duty,
            assigned_duty=moved_duty,
            group_name=destination_updated["groupName"],
            switch_id=switch_id,
            source=common_switch["source"],
        )
        if additional_off_day_duty
        else None
    )
    if comp_off_id:
        duty_switch_collection.update_many(
            {"switchId": switch_id, "direction": "destination"},
            {"$set": {"compOffAwarded": True, "compOffId": comp_off_id}},
        )
        employee_daily_collection.update_one(
            {"_id": destination_record["_id"]},
            {"$set": {"lastDutySwitch.compOffAwarded": True, "lastDutySwitch.compOffId": comp_off_id}},
        )

    replacement_result = None
    if linked_leave:
        replacement_result = assign_replacement(
            leave_id,
            {
                "replacementEmployeeId": employee_id,
                "mode": "normal",
                "halfDuty": False,
                "reason": reason,
            },
            user=user,
        )

    notify_all(
        employee_ids=[employee_id],
        subject="Duty moved to another date",
        message=(
            f"Your {source_duty or '-'} duty was moved from {source_date} to "
            f"{moved_duty or '-'} duty on {destination_date}. "
            f"The {destination_duty or 'OFF'} assignment was moved to {source_date}."
            + (
                f" You were linked as replacement for {linked_leave.get('name') or linked_leave.get('employeeId')}."
                if linked_leave else ""
            )
            + f" Reason: {reason}"
        ),
        ref_id=switch_id,
        action="VIEW_CALENDAR",
        type="DUTY",
    )
    return {
        "message": "Duty moved between dates successfully",
        "switchId": switch_id,
        "source": {"date": source_date, "previous": source_previous, "updated": source_updated},
        "destination": {
            "date": destination_date,
            "previous": destination_previous,
            "updated": destination_updated,
        },
        "compOffAwarded": bool(comp_off_id),
        "compOffId": comp_off_id,
        "compOffReason": (
            "Additional duty assigned where both source and destination were OFF"
            if comp_off_id
            else "Not eligible because an existing working duty was shifted"
            if transfer_from_working_day and destination_duty_normalized in OFF_DUTIES
            else None
        ),
        "linkedLeave": {
            "id": leave_id,
            "employeeId": linked_leave.get("employeeId"),
            "name": linked_leave.get("name"),
            "assignedDuty": linked_leave.get("assignedDuty"),
            "groupName": linked_leave.get("groupName"),
        } if linked_leave else None,
        "replacementResult": replacement_result,
    }


@router.get("/duty-switch/history")
def duty_switch_history(
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    user=Depends(get_authenticated_user),
):
    authority_date = endDate or startDate or datetime.now().strftime("%Y-%m-%d")
    require_duty_switch_authority(user, authority_date)
    query = {}
    if startDate or endDate:
        query["date"] = {}
        if startDate:
            query["date"]["$gte"] = startDate
        if endDate:
            query["date"]["$lte"] = endDate
    records = list(duty_switch_collection.find(query).sort([("changedOn", -1)]).limit(200))

    # Older replacement allocations were recorded as duty notifications but
    # were not always copied to the duty-switch audit. Surface those existing
    # assignments in the same history without mutating historical records.
    notification_query = {"leaveId": {"$exists": True}, "assignedDuty": {"$exists": True}}
    if startDate or endDate:
        notification_query["date"] = {}
        if startDate:
            notification_query["date"]["$gte"] = startDate
        if endDate:
            notification_query["date"]["$lte"] = endDate
    notifications = list(
        duty_notification_collection.find(notification_query).sort([("createdAt", -1)]).limit(200)
    )
    existing_replacement_keys = {
        (str(record.get("leaveId") or ""), str(record.get("employeeId") or ""))
        for record in records
        if "replacement" in str(record.get("source") or "").lower()
    }
    notification_leave_ids = [
        ObjectId(item.get("leaveId"))
        for item in notifications
        if ObjectId.is_valid(str(item.get("leaveId") or ""))
    ]
    notification_leaves = {
        str(item["_id"]): item
        for item in leave_request_collection.find(
            {"_id": {"$in": notification_leave_ids}},
            {"name": 1, "employeeId": 1, "groupName": 1},
        )
    }
    for item in notifications:
        key = (str(item.get("leaveId") or ""), str(item.get("employeeId") or ""))
        if key in existing_replacement_keys:
            continue
        leave = notification_leaves.get(key[0], {})
        records.append({
            "_id": f"replacement-notification-{item['_id']}",
            "date": item.get("date"),
            "employeeId": item.get("employeeId"),
            "employeeName": item.get("employeeName"),
            "previous": {},
            "updated": {
                "assignedDuty": item.get("assignedDuty"),
                "groupName": item.get("groupName") or leave.get("groupName"),
                "replacementDuty": True,
            },
            "reason": f"Assigned in place of {leave.get('name') or leave.get('employeeId') or 'employee on leave'}",
            "changedBy": item.get("assignedBy") or "-",
            "changedOn": item.get("createdAt"),
            "source": "Leave replacement assignment",
            "leaveId": key[0],
            "replacedEmployeeId": leave.get("employeeId"),
            "replacedEmployeeName": leave.get("name"),
        })
        existing_replacement_keys.add(key)

    records.sort(key=lambda item: item.get("changedOn") or datetime.min, reverse=True)
    records = records[:200]
    actor_ids = list({
        str(record.get("changedBy") or "").strip()
        for record in records
        if str(record.get("changedBy") or "").strip()
    })
    actor_names = {
        str(item.get("userId") or item.get("employeeId") or ""): item.get("name")
        for item in employee_collection.find(
            {"$or": [{"userId": {"$in": actor_ids}}, {"employeeId": {"$in": actor_ids}}]},
            {"userId": 1, "employeeId": 1, "name": 1},
        )
    }
    for record in records:
        record["_id"] = str(record["_id"])
        record["changedOn"] = api_datetime(record.get("changedOn"))
        record["changedByName"] = actor_names.get(str(record.get("changedBy") or ""), record.get("changedBy"))
    return records


@router.get("/pending")
def pending_replacements(user=Depends(get_authenticated_user)):

    leaves = list(
        leave_request_collection.find({
            "finalStatus": "Approved",
            "replacementRequired": True,
            "replacement": None
        })
    )

    result = []

    for l in leaves:
        if not has_replacement_authority(user, l):
            continue

        leave_date = l.get("date")

        # =============================
        # GET DAILY RECORD
        # =============================
        duty = employee_daily_collection.find_one({
            "employeeId": l["employeeId"],
            "date": leave_date
        })

        is_sic_flag = duty.get("isSIC", False) if duty else False

        # =============================
        # DATE LOGIC (FIXED POSITION)
        # =============================
        dt = datetime.strptime(leave_date, "%Y-%m-%d")
        weekday = dt.strftime("%A")

        next_day = (dt + timedelta(days=1)).strftime("%Y-%m-%d")

        next_day_record = employee_daily_collection.find_one({
            "employeeId": l["employeeId"],
            "date": next_day
        })

        next_day_is_holiday = (
            next_day_record and next_day_record.get("isHoliday") == "Y"
        )

        is_friday = weekday == "Friday"

        # =============================
        # RESPONSE
        # =============================
        result.append({
            "id": str(l["_id"]),
            "employeeId": l["employeeId"],
            "name": l["name"],
            "groupName": l.get("groupName"),
            "leaveType": l.get("leaveType"),
            "date": leave_date,
            "assignedDuty": (duty or {}).get("assignedDuty") or l.get("assignedDuty"),
            "isSIC": is_sic_flag,
            "organization": group_organization_context(l.get("groupName")),
            "authorityIds": replacement_authority_ids(l),

            # ðŸ”¥ NEW FIELDS
            "isFriday": is_friday,
            "nextDayHoliday": next_day_is_holiday
        })

    return result


@router.get("/assigned")
def assigned_replacements(user=Depends(get_authenticated_user)):
    leaves = leave_request_collection.find({
        "finalStatus": "Approved",
        "replacement.employeeId": {"$exists": True, "$ne": None},
    }).sort([("date", 1), ("replacement.assignedOn", -1)])
    result = []
    for leave in leaves:
        if not has_replacement_authority(user, leave):
            continue
        replacement = leave.get("replacement") or {}
        notification = duty_notification_collection.find_one(
            {
                "leaveId": str(leave["_id"]),
                "employeeId": replacement.get("employeeId"),
                "status": {"$ne": "Superseded"},
            },
            sort=[("createdAt", -1)],
        ) or {}
        leave_daily = employee_daily_collection.find_one({
            "employeeId": leave.get("employeeId"),
            "date": leave.get("date"),
        }) or {}
        result.append({
            "id": str(leave["_id"]),
            "employeeId": leave.get("employeeId"),
            "name": leave.get("name"),
            "groupName": leave.get("groupName"),
            "leaveType": leave.get("leaveType"),
            "date": leave.get("date"),
            "assignedDuty": leave_daily.get("assignedDuty") or leave.get("assignedDuty"),
            "organization": group_organization_context(leave.get("groupName")),
            "replacement": {
                "employeeId": replacement.get("employeeId"),
                "name": replacement.get("name"),
                "mode": replacement.get("mode"),
                "assignedOn": replacement.get("assignedOn"),
            },
            "notificationStatus": notification.get("status") or "Not recorded",
            "notificationDecision": notification.get("decision"),
            "notificationReason": notification.get("reason"),
            "notificationAutoAccepted": bool(notification.get("autoAccepted")),
            "notificationCutoffTime": api_datetime(notification.get("cutoffTime")),
            "mailDelivery": notification.get("mailDelivery") or {},
            "decisionHistory": api_decision_history(notification.get("decisionHistory")),
            "canChange": notification.get("status") not in {"Denied", "Superseded"},
        })
    return result


@router.get("/assignment-audit")
def replacement_assignment_audit(
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    employeeId: Optional[str] = Query(None),
    user=Depends(get_current_user),
):
    check_replacement_access(user)
    auto_accept_pending_duty_notifications()
    query = {"leaveId": {"$exists": True}, "assignedDuty": {"$exists": True}}
    if startDate or endDate:
        query["date"] = {}
        if startDate:
            query["date"]["$gte"] = startDate
        if endDate:
            query["date"]["$lte"] = endDate
    if employeeId:
        query["employeeId"] = str(employeeId).strip()

    notifications = list(duty_notification_collection.find(query).sort([("createdAt", -1)]).limit(500))
    employee_ids = set()
    for item in notifications:
        employee_ids.add(str(item.get("employeeId") or ""))
        employee_ids.update(str(value) for value in normalized_categories(item.get("controllerIds")))
        for decision in item.get("decisionHistory") or []:
            acted_by = str(decision.get("actedBy") or "")
            if acted_by and acted_by != "SYSTEM":
                employee_ids.add(acted_by)
    employee_ids.discard("")
    people = {
        str(person.get("userId") or person.get("employeeId")): person.get("name")
        for person in employee_collection.find(
            {"$or": [{"userId": {"$in": list(employee_ids)}}, {"employeeId": {"$in": list(employee_ids)}}]},
            {"userId": 1, "employeeId": 1, "name": 1},
        )
    }

    leave_ids = [ObjectId(item["leaveId"]) for item in notifications if ObjectId.is_valid(str(item.get("leaveId") or ""))]
    leaves = {
        str(item["_id"]): item
        for item in leave_request_collection.find({"_id": {"$in": leave_ids}}, {"name": 1, "employeeId": 1, "groupName": 1, "leaveType": 1})
    }
    result = []
    for item in notifications:
        leave = leaves.get(str(item.get("leaveId") or ""), {})
        controller_ids = normalized_categories(item.get("controllerIds"))
        decisions = []
        for decision in item.get("decisionHistory") or []:
            acted_by = str(decision.get("actedBy") or "")
            decisions.append({
                **decision,
                "actedByName": "System" if acted_by == "SYSTEM" else people.get(acted_by, acted_by),
                "actedAt": api_datetime(decision.get("actedAt")),
            })
        result.append({
            "id": str(item["_id"]),
            "leaveId": item.get("leaveId"),
            "date": item.get("date"),
            "groupName": item.get("groupName") or leave.get("groupName"),
            "assignedDuty": item.get("assignedDuty"),
            "assignmentMode": item.get("assignmentMode"),
            "employeeId": item.get("employeeId"),
            "employeeName": item.get("employeeName") or people.get(str(item.get("employeeId") or "")),
            "replacedEmployeeId": leave.get("employeeId"),
            "replacedEmployeeName": leave.get("name"),
            "leaveType": leave.get("leaveType"),
            "status": item.get("status") or "Pending",
            "decision": item.get("decision"),
            "reason": item.get("reason"),
            "autoAccepted": bool(item.get("autoAccepted")),
            "controllerIds": controller_ids,
            "controllerNames": [people.get(str(value), str(value)) for value in controller_ids],
            "cutoffTime": api_datetime(item.get("cutoffTime")),
            "createdAt": api_datetime(item.get("createdAt")),
            "updatedAt": api_datetime(item.get("updatedAt")),
            "mailDelivery": {
                **(item.get("mailDelivery") or {}),
                "attemptedAt": api_datetime((item.get("mailDelivery") or {}).get("attemptedAt")),
            },
            "decisionHistory": decisions,
        })
    return result


# =========================================================
# GET REPLACEMENT CANDIDATES
# =========================================================

from datetime import datetime, timedelta

# =========================================================
# GET REPLACEMENT CANDIDATES (ADVANCED LOGIC)
# =========================================================

@router.get("/candidates/{leave_id}")
def replacement_candidates(
    leave_id: str,
    roleFilter: str = Query("auto"),
    user=Depends(get_authenticated_user),
):

    leave = leave_request_collection.find_one({"_id": ObjectId(leave_id)})

    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    require_replacement_authority(user, leave)

    leave_date = leave.get("date")
    is_sic = leave.get("isSIC", False)
    leave_daily = employee_daily_collection.find_one({
        "employeeId": leave.get("employeeId"),
        "date": leave_date,
    }) or {}
    is_sic = bool(leave_daily.get("isSIC", is_sic))
    required_duty = leave_daily.get("assignedDuty") or leave.get("assignedDuty") or ""
    next_date = (
        datetime.strptime(leave_date, "%Y-%m-%d") + timedelta(days=1)
    ).strftime("%Y-%m-%d")

    # ðŸ”¥ DATE RANGE (LAST 90 DAYS)
    today = datetime.utcnow()
    last_90_days_date = today - timedelta(days=90)
    last_90_days_str = last_90_days_date.strftime("%Y-%m-%d")

    result = []
    effective_role_filter = (roleFilter or "auto").strip().lower()
    if effective_role_filter == "auto":
        effective_role_filter = "sic" if is_sic else "shift_engineer"

    # ==========================================
    # GET CANDIDATES
    # ==========================================
    group_context = group_organization_context(leave.get("groupName"))
    past_shift_roles = historical_shift_roles()
    candidates = list(employee_collection.find({"isActive": {"$ne": False}}))

    for c in candidates:

        candidate_id = c.get("userId")
        if not candidate_id or candidate_id == leave.get("employeeId"):
            continue

        category = normalized_categories(c.get("category"))
        current_organization = employee_current_organization(c)
        same_department = bool(
            group_context.get("departmentId")
            and group_context["departmentId"] in current_organization["departmentIds"]
        ) or bool(
            group_context.get("departmentName")
            and group_context["departmentName"] in current_organization["departments"]
        )
        historical_roles = past_shift_roles.get(str(candidate_id), set())
        organization_eligible = bool(same_department and historical_roles)
        configured_replacement = (
            str(c.get("dutyType") or "").strip().lower() == "replacement"
            or bool(c.get("isIC"))
        )
        if not configured_replacement and not organization_eligible:
            continue

        # ==========================================
        # ROLE FILTER (SIC / SHIFT ENGINEER)
        # ==========================================
        is_sic_candidate = (
            category_matches(category, "sic")
            or bool(c.get("isIC"))
            or "sic" in historical_roles
        )
        is_shift_engineer_candidate = (
            category_matches(category, "shift engineer")
            or "shift_engineer" in historical_roles
        )
        if effective_role_filter == "sic" and not is_sic_candidate:
            continue
        if effective_role_filter == "shift_engineer" and not is_shift_engineer_candidate:
            continue

        # ==========================================
        # SKIP IF ON LEAVE
        # ==========================================
        duty = employee_daily_collection.find_one({
            "employeeId": candidate_id,
            "date": leave_date
        })

        if duty and duty.get("leaveStatus") == "Approved":
            continue

        # ==========================================
        # REPLACEMENT COUNT (LAST 90 DAYS)
        # ==========================================
        replacement_count = employee_daily_collection.count_documents({
            "employeeId": candidate_id,
            "replacementDuty": True,
            "date": {"$gte": last_90_days_str}
        })

        # ==========================================
        # DENIAL COUNT (LAST 90 DAYS)
        # ==========================================
        denial_count = duty_denial_collection.count_documents({
            "employeeId": candidate_id,
            "createdAt": {"$gte": last_90_days_date}
        })
        total_denial_count = duty_denial_collection.count_documents({
            "employeeId": candidate_id,
        })

        # Use the last occurrence of the duty being replaced as the transparent
        # fairness basis for replacement-tagged employees.
        last_matching_duty = employee_daily_collection.find_one({
            "employeeId": candidate_id,
            "assignedDuty": required_duty,
            "date": {"$lt": leave_date},
        }, sort=[("date", -1)])
        last_matching_duty_date = (
            last_matching_duty.get("date") if last_matching_duty else ""
        )
        days_since_matching_duty = date_difference_days(
            leave_date, last_matching_duty_date
        )

        # ==========================================
        # APPEND RESULT
        # ==========================================
        result.append({
            "employeeId": candidate_id,
            "name": c.get("name"),
            "designation": c.get("designation"),
            "category": category or (
                ["Former SIC"] if "sic" in historical_roles
                else ["Former Shift Engineer"] if "shift_engineer" in historical_roles
                else []
            ),

            "replacementCount90Days": replacement_count,
            "denialCount90Days": denial_count,
            "denialCount": total_denial_count,
            "requiredDuty": required_duty,
            "lastMatchingDutyDate": last_matching_duty_date,
            "daysSinceMatchingDuty": days_since_matching_duty,
            "isSIC": is_sic,
            "source": "replacement" if configured_replacement else "organization",
            "organization": current_organization,
            "eligibility": (
                "Replacement tagged"
                if configured_replacement
                else f"Past shift member; currently in {group_context.get('departmentName') or 'mapped department'}"
            ),
            "authorityIds": current_organization.get("authorityIds", []),
            "authorityNames": current_organization.get("authorityNames", []),

            "groupName": leave.get("groupName")
        })

    # ==========================================
    # SHIFT STAFF (LOW PRIORITY)
    # ==========================================
    shift_people = list(employee_daily_collection.find({
        "date": leave_date,
        "assignedDuty": {"$in": ["Morning", "Evening", "Night"]},
        "leaveStatus": {"$ne": "Approved"}
    }).sort([("groupName", 1), ("employeeId", 1)]))

    existing_ids = {r["employeeId"] for r in result}

    for s in shift_people:

        candidate_id = s.get("employeeId")

        if not candidate_id or candidate_id in existing_ids:
            continue

        if candidate_id == leave.get("employeeId"):
            continue

        employee_master = employee_collection.find_one(
            {"userId": candidate_id},
            {"category": 1, "isIC": 1},
        ) or {}
        category = normalized_categories(employee_master.get("category"))
        historical_roles = past_shift_roles.get(str(candidate_id), set())
        if effective_role_filter == "sic" and not (
            category_matches(category, "sic")
            or bool(employee_master.get("isIC"))
            or "sic" in historical_roles
        ):
            continue
        if effective_role_filter == "shift_engineer" and not (
            category_matches(category, "shift engineer")
            or "shift_engineer" in historical_roles
        ):
            continue

        next_day_record = employee_daily_collection.find_one({
            "employeeId": candidate_id,
            "date": next_date,
        }) or {}
        assigned_duty = s.get("assignedDuty") or "-"
        source = "shift" if assigned_duty == required_duty else "otherShift"

        result.append({
            "employeeId": candidate_id,
            "name": s.get("name"),
            "designation": s.get("designation"),
            "category": category or ["Shift Staff"],
            "assignedDuty": assigned_duty,
            "nextDayDuty": next_day_record.get("assignedDuty") or "-",
            "requiredDuty": required_duty,
            "isSIC": False,
            "source": source,

            "groupName": s.get("groupName")
        })

    # ==========================================
    # FINAL SERIAL ORDER
    # ==========================================
    source_order = {"replacement": 0, "organization": 1, "shift": 2, "otherShift": 3}

    def candidate_order(item):
        source = item.get("source")
        if source in {"replacement", "organization"}:
            days = item.get("daysSinceMatchingDuty")
            return (
                source_order[source],
                0 if days is None else 1,
                -(days if days is not None else 0),
                employee_id_sort_key(item.get("employeeId")),
            )
        return (
            source_order.get(source, 9),
            employee_id_sort_key(item.get("employeeId")),
        )

    result.sort(key=candidate_order)
    for index, item in enumerate(result, start=1):
        item["serialNo"] = index

    return result

# =========================================================
# ASSIGN REPLACEMENT
# =========================================================

@router.put("/assign/{leave_id}")
def assign_replacement(leave_id: str, payload: dict, user=Depends(get_authenticated_user)):

    replacement_id = payload.get("replacementEmployeeId")
    mode = payload.get("mode", "normal")
    half_duty = payload.get("halfDuty", False)   # âœ… FIXED

    leave = leave_request_collection.find_one({
        "_id": ObjectId(leave_id)
    })

    if not leave:
        raise HTTPException(404, "Leave not found")
    require_replacement_authority(user, leave)

    existing_replacement = leave.get("replacement") or {}
    if existing_replacement.get("employeeId"):
        release_replacement_assignment(
            leave,
            "Assignment changed by replacement manager",
            str(user.get("employeeId") or user.get("userId") or "ADMIN"),
            "Replacement Manager",
        )
        duty_notification_collection.update_many(
            {
                "leaveId": str(leave["_id"]),
                "status": {"$in": ["Pending", "Accepted"]},
            },
            {
                "$set": {
                    "status": "Superseded",
                    "decision": "Assignment changed by replacement manager",
                    "updatedAt": datetime.utcnow(),
                }
            },
        )
        leave = leave_request_collection.find_one({"_id": ObjectId(leave_id)})

    # =============================
    # GET REPLACEMENT EMPLOYEE
    # =============================
    replacement_emp = employee_collection.find_one({
        "userId": replacement_id
    })

    if not replacement_emp:
        daily_emp = employee_daily_collection.find_one({
            "employeeId": replacement_id,
            "date": leave["date"]
        })

        if not daily_emp:
            raise HTTPException(404, "Employee not found")

        replacement_emp = {
            "userId": daily_emp["employeeId"],
            "name": daily_emp["name"],
            "designation": daily_emp["designation"]
        }

    leave_date = leave["date"]

    # =============================
    # UPDATE LEAVE
    # =============================
    leave_request_collection.update_one(
        {"_id": ObjectId(leave_id)},
        {
            "$set": {
                "replacement": {
                    "employeeId": replacement_emp["userId"],
                    "name": replacement_emp["name"],
                    "assignedOn": datetime.utcnow(),
                    "mode": mode
                }
            }
        }
    )

    # =============================
    # REPLACEMENT DAILY ENTRY
    # =============================
    existing_daily = employee_daily_collection.find_one({
        "employeeId": replacement_emp["userId"],
        "date": leave_date
    })

    update_data = {
        "replacementDuty": True,
        "replacementMode": mode,
        "halfDuty": half_duty,   # âœ… STORE

        "replacementFor": {
            "employeeId": leave["employeeId"],
            "name": leave["name"]
        },

        "groupName": leave.get("groupName"),
        "name": replacement_emp.get("name"),
        "designation": replacement_emp.get("designation"),
        "replacementCreatedDaily": existing_daily is None,
        "replacementOriginal": {
            field: existing_daily.get(field)
            for field in ("assignedDuty", "groupName", "rosterId")
            if existing_daily and field in existing_daily
        },
    }

    leave_daily = employee_daily_collection.find_one({
        "employeeId": leave["employeeId"],
        "date": leave_date
    })

    roster_id = leave_daily.get("rosterId") if leave_daily else None

    assigned_duty = leave_daily.get("assignedDuty") if leave_daily else None

    update_data["assignedDuty"] = assigned_duty
    if roster_id:
        update_data["rosterId"] = roster_id

    # Every replacement allocation is an operational duty change, even when
    # the employee was already rostered on the same shift. Keep it in the
    # unified duty-change audit so replacement and acting-SIC actions are both
    # visible in Recent duty changes.
    switch_audit = {
        "date": leave_date,
        "employeeId": replacement_emp["userId"],
        "employeeName": replacement_emp.get("name"),
        "designation": replacement_emp.get("designation"),
        "previous": {
            "assignedDuty": (existing_daily or {}).get("assignedDuty"),
            "groupName": (existing_daily or {}).get("groupName"),
            "replacementDuty": bool((existing_daily or {}).get("replacementDuty")),
        },
        "updated": {
            "assignedDuty": assigned_duty,
            "groupName": leave.get("groupName"),
            "replacementDuty": True,
        },
        "reason": str(payload.get("reason") or f"Assigned in place of {leave.get('name') or leave.get('employeeId')} on leave").strip(),
        "changedBy": str(user.get("employeeId") or user.get("userId") or "ADMIN"),
        "changedOn": datetime.utcnow(),
        "source": "Leave replacement assignment",
        "leaveId": str(leave["_id"]),
        "replacedEmployeeId": str(leave.get("employeeId") or ""),
        "replacedEmployeeName": leave.get("name"),
    }
    inserted_switch = duty_switch_collection.insert_one(switch_audit)
    update_data["lastDutySwitch"] = {
        "auditId": str(inserted_switch.inserted_id),
        "changedBy": switch_audit["changedBy"],
        "changedOn": switch_audit["changedOn"],
        "reason": switch_audit["reason"],
        "previous": switch_audit["previous"],
    }

    employee_daily_collection.update_one(
        {
            "employeeId": replacement_emp["userId"],
            "date": leave_date,
        },
        {
            "$set": update_data
        },
        upsert=True
    )

    # =============================================
    # FETCH DATA (AFTER UPDATE)
    # =============================================

    daily_record = employee_daily_collection.find_one({
        "employeeId": replacement_emp["userId"],
        "date": leave_date
    })

    assigned_duty = daily_record.get("assignedDuty") if daily_record else None

    if not assigned_duty:
        assigned_duty = leave.get("assignedDuty")   # âœ… FIX

    direct_off_day_comp_off_id = award_off_day_comp_off(
        employee_id=replacement_emp["userId"],
        duty_date=leave_date,
        previous_duty=(existing_daily or {}).get("assignedDuty"),
        assigned_duty=assigned_duty,
        group_name=leave.get("groupName"),
        switch_id=str(leave["_id"]),
        source="Direct leave replacement",
        reference_type="Replacement",
        reference_extra={"leaveRequestId": str(leave["_id"])},
    )
    if direct_off_day_comp_off_id:
        leave_request_collection.update_one(
            {"_id": leave["_id"]},
            {"$set": {
                "replacement.compOffAwarded": True,
                "replacement.compOffId": direct_off_day_comp_off_id,
            }},
        )

    is_holiday = daily_record.get("isHoliday") == "Y" if daily_record else False

    emp_master = employee_collection.find_one({
        "userId": replacement_emp["userId"]
    })

    duty_type = (emp_master.get("dutyType") if emp_master else "Regular").lower()

    dt = datetime.strptime(leave_date, "%Y-%m-%d")
    weekday = dt.strftime("%A")

    # âœ… NOW READ FROM DB
    half_duty = daily_record.get("halfDuty", False) if daily_record else False

    eligible = False
    reason = None

    # =============================================
    # RULE SET
    # =============================================

    if duty_type == "replacement":

        if mode == "double":
            eligible = True
            reason = "Double Duty"

        elif is_holiday:
            eligible = True
            reason = "Holiday Duty"

        elif weekday == "Friday" and assigned_duty == "Night":
            eligible = True
            reason = "Friday Night Shift"

        elif weekday in ["Saturday", "Sunday"] and assigned_duty in ["Morning", "Evening", "Night"]:
            eligible = True
            reason = "Weekend Duty"

    else:

        if mode == "double":
            eligible = True
            reason = "Double Duty"

        elif weekday == "Friday" and assigned_duty == "Night":

            next_day = (dt + timedelta(days=1)).strftime("%Y-%m-%d")

            next_day_record = employee_daily_collection.find_one({
                "employeeId": replacement_emp["userId"],
                "date": next_day
            })

            next_day_is_holiday = next_day_record and next_day_record.get("isHoliday") == "Y"

            if next_day_is_holiday and half_duty:
                eligible = True
                reason = "Friday Night + Holiday Half Duty"

    # =============================================
    # INSERT COMP-OFF
    # =============================================

    if eligible:

        existing = compensatory_off_collection.find_one({
            "employeeId": replacement_emp["userId"],
            "earnedDate": leave_date,
            "status": {"$in": ["Available", "Reserved", "Used"]},
        })

        if not existing:

            expiry = calculate_expiry(leave_date)

            compensatory_off_collection.insert_one({
                "employeeId": replacement_emp["userId"],
                "employeeName": replacement_emp.get("name"),
                "designation": replacement_emp.get("designation"),

                "earnedDate": leave_date,
                "expiryDate": expiry,
                "status": "Available",

                "reason": reason,
                "dutyType": duty_type,

                "reference": {
                    "type": "Replacement",
                    "leaveRequestId": str(leave["_id"])
                },

                "createdOn": datetime.utcnow()
            })

    # =============================
    # UPDATE LEAVE PERSON DAILY
    # =============================
    employee_daily_collection.update_one(
        {
            "employeeId": leave["employeeId"],
            "date": leave_date
        },
        {
            "$set": {
                "leaveStatus": "Approved",
                "replacementAssigned": True
            }
        }
    )

    # =============================
    # CREATE DUTY NOTIFICATION
    # =============================

    leave_date_obj = datetime.strptime(leave_date, "%Y-%m-%d")

    cutoff_local = IST.localize(
        leave_date_obj - timedelta(days=2)
    ).replace(hour=16, minute=0, second=0)
    cutoff = cutoff_local.astimezone(pytz.UTC).replace(tzinfo=None)
    now_utc = datetime.utcnow()
    auto_accepted = now_utc >= cutoff
    controller_ids = controlling_officer_ids(
        replacement_emp["userId"],
        leave_date,
        leave.get("groupName") or "",
    )

    notification_result = duty_notification_collection.insert_one({
        "employeeId": replacement_emp["userId"],
        "employeeName": replacement_emp.get("name"),
        "assignedBy": str(user.get("employeeId") or user.get("userId") or "ADMIN"),
        "controllerIds": controller_ids,
        "leaveId": str(leave["_id"]),
        "date": leave_date,
        "groupName": leave.get("groupName"),
        "assignedDuty": assigned_duty,
        "assignmentMode": mode,

        "status": "Accepted" if auto_accepted else "Pending",
        "decision": "Auto accepted at 16:00 cutoff" if auto_accepted else None,
        "autoAccepted": auto_accepted,
        "reason": None,

        "cutoffTime": cutoff,

        "createdAt": now_utc,
        "updatedAt": now_utc if auto_accepted else None,
        "decisionHistory": [{
            "action": "AutoAccepted",
            "actedBy": "SYSTEM",
            "actorRole": "System",
            "actedAt": now_utc,
        }] if auto_accepted else [],
    })

    # Email the replacement employee, their organization reporting officer(s),
    # the employee on leave, and the SIC/acting SIC of the affected group.
    email_list, reporting_officer_ids, sic_ids = replacement_mail_recipients(
        replacement_emp,
        leave,
        leave_date,
        leave.get("groupName") or "",
    )
    leave_employee = employee_by_id(leave.get("employeeId"))
    try:
        display_date = datetime.strptime(leave_date, "%Y-%m-%d").strftime("%d-%m-%Y")
    except (TypeError, ValueError):
        display_date = leave_date
    replacement_designation = replacement_emp.get("designation") or ""
    replacement_person = (
        f"{replacement_emp.get('name') or replacement_emp.get('userId')} "
        f"({replacement_designation or 'Designation not available'}, Employee ID {replacement_emp.get('userId')})"
    )
    mail_result = send_replacement_duty_email(
        email_list,
        {
            "replacement_person": replacement_person,
            "replacement_name": replacement_emp.get("name"),
            "replacement_designation": replacement_designation,
            "replacement_employee_id": replacement_emp.get("userId"),
            "shift_name": display_shift_name(assigned_duty),
            "date": display_date,
            "date_iso": leave_date,
            "leave_person": leave.get("name") or leave_employee.get("name") or leave.get("employeeId"),
            "leave_name": leave.get("name") or leave_employee.get("name"),
            "leave_designation": leave_employee.get("designation"),
            "leave_employee_id": leave.get("employeeId"),
            "group_name": leave.get("groupName"),
        },
    )
    duty_notification_collection.update_one(
        {"_id": notification_result.inserted_id},
        {
            "$set": {
                "mailDelivery": {
                    **mail_result,
                    "attemptedAt": datetime.utcnow(),
                    "reportingOfficerIds": reporting_officer_ids,
                    "shiftInChargeIds": sic_ids,
                }
            }
        },
    )

    # =============================
    # FINAL RETURN
    # =============================
    return {"message": "Replacement processed successfully"}


@router.delete("/assign/{leave_id}")
def delete_replacement_assignment(
    leave_id: str,
    payload: Optional[dict] = None,
    user=Depends(get_authenticated_user),
):
    try:
        object_id = ObjectId(leave_id)
    except Exception as exc:
        raise HTTPException(400, "Invalid leave identifier") from exc
    leave = leave_request_collection.find_one({"_id": object_id})
    if not leave:
        raise HTTPException(404, "Leave not found")
    require_replacement_authority(user, leave)
    replacement = leave.get("replacement") or {}
    replacement_id = str(replacement.get("employeeId") or "").strip()
    if not replacement_id:
        raise HTTPException(409, "No replacement assignment exists for this leave")
    reason = str((payload or {}).get("reason") or "Replacement assignment deleted").strip()
    actor_id = str(user.get("employeeId") or user.get("userId") or "ADMIN").strip()
    actor_role = "Administrator" if str(user.get("role") or "").lower() == "admin" else "Replacement authority"
    replacement_daily = employee_daily_collection.find_one({
        "employeeId": employee_id_filter(replacement_id),
        "date": leave.get("date"),
    }) or {}

    release_replacement_assignment(leave, reason, actor_id, actor_role)
    now = datetime.utcnow()
    duty_notification_collection.update_many(
        {"leaveId": str(leave["_id"]), "status": {"$nin": ["Superseded", "Cancelled"]}},
        {
            "$set": {
                "status": "Cancelled", "decision": reason, "updatedAt": now,
            },
            "$push": {"decisionHistory": {
                "action": "AssignmentDeleted", "actedBy": actor_id,
                "actorRole": actor_role, "actedAt": now, "reason": reason,
            }},
        },
    )
    inserted = duty_switch_collection.insert_one({
        "date": leave.get("date"),
        "employeeId": replacement_id,
        "employeeName": replacement.get("name") or replacement_daily.get("name"),
        "previous": {
            "assignedDuty": replacement_daily.get("assignedDuty"),
            "groupName": replacement_daily.get("groupName"),
            "replacementDuty": True,
        },
        "updated": {"replacementDuty": False},
        "reason": reason,
        "changedBy": actor_id,
        "changedOn": now,
        "source": "Replacement assignment deleted",
        "leaveId": str(leave["_id"]),
        "replacedEmployeeId": str(leave.get("employeeId") or ""),
        "replacedEmployeeName": leave.get("name"),
    })
    notify_all(
        employee_ids=[replacement_id, str(leave.get("employeeId") or "")],
        subject="Replacement assignment cancelled",
        message=(
            f"The replacement assignment for {leave.get('date')} was cancelled by "
            f"{actor_role}. Reason: {reason}"
        ),
        ref_id=str(inserted.inserted_id),
        action="VIEW_CALENDAR",
        type="DUTY",
    )
    return {"message": "Replacement assignment deleted and original duty restored"}

# =========================================================
# REPLACEMENT HISTORY
# =========================================================

@router.get("/history")
def replacement_history(
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    employeeId: Optional[str] = Query(None)
):

    query = {
        "replacement.employeeId": {"$exists": True}
    }

    if startDate or endDate:

        date_filter = {}

        if startDate:
            date_filter["$gte"] = startDate

        if endDate:
            date_filter["$lte"] = endDate

        query["date"] = date_filter

    if employeeId:
        query["replacement.employeeId"] = employeeId

    leaves = leave_request_collection.find(query)

    results = []

    for leave in leaves:

        replacement_emp_id = leave.get("replacement", {}).get("employeeId")

        replacement_emp = employee_collection.find_one(
            {"userId": replacement_emp_id}
        )

        results.append({

            "date": leave.get("date"),
            "employeeName": replacement_emp.get("name") if replacement_emp else "",
            "replacedEmployee": leave.get("name"),
            "groupName": leave.get("groupName"),
            "leaveType": leave.get("leaveType")

        })

    return results


# =========================================================
# ASSIGN SIC
# =========================================================

@router.put("/assign-sic/{leave_id}")
def assign_sic(
    leave_id: str,
    payload: dict,
    user=Depends(get_authenticated_user),
):

    sic_id = payload.get("sicEmployeeId")

    leave = leave_request_collection.find_one({
        "_id": ObjectId(leave_id)
    })

    if not leave:
        raise HTTPException(404, "Leave not found")
    require_replacement_authority(user, leave)

    leave_date = leave.get("date")
    group_name = leave.get("groupName")

    # =============================
    # VALIDATION
    # =============================

    sic_daily = employee_daily_collection.find_one({
        "employeeId": sic_id,
        "date": leave_date
    })

    if not sic_daily:
        raise HTTPException(400, "SIC must be from same day")

    if sic_daily.get("groupName") != group_name:
        raise HTTPException(400, "SIC must be from same group")

    # if sic_daily.get("assignedDuty") not in ["Morning", "Evening", "Night"]:
    #     raise HTTPException(400, "SIC must be on active shift")

    if sic_daily.get("leaveStatus") in ACTIVE_LEAVE_STATUSES:
        raise HTTPException(400, "Cannot assign SIC from leave")

    # =============================
    # GET EMPLOYEE MASTER
    # =============================

    sic_emp = employee_collection.find_one({
        "userId": sic_id
    })

    if not sic_emp:
        raise HTTPException(404, "Employee not found")

    # =============================
    # 1ï¸âƒ£ REMOVE OLD SIC
    # =============================

    employee_daily_collection.update_many(
        {
            "date": leave_date,
            "groupName": group_name
        },
        {
            "$unset": {
                "sic": "",
                "isActingSIC": "",
                "actingSICGroup": "",
                "actingSICFor": "",
                "actingSICAssignedBy": "",
                "actingSICAssignedOn": "",
            }
        }
    )

    # =============================
    # 2ï¸âƒ£ APPLY SIC TO SHIFT STAFF ONLY
    # =============================

    employee_daily_collection.update_many(
        {
            "date": leave_date,
            "groupName": group_name,
            # "assignedDuty": {"$in": ["Morning", "Evening", "Night"]},
            "leaveStatus": {"$nin": list(ACTIVE_LEAVE_STATUSES)}
        },
        {
            "$set": {
                "sic": {
                    "employeeId": sic_emp["userId"],
                    "name": sic_emp["name"],
                    "designation": sic_emp["designation"],
                    "type": "temporary"
                }
            }
        }
    )

    # =============================
    # 3ï¸âƒ£ MARK ACTING SIC
    # =============================

    employee_daily_collection.update_one(
        {
            "employeeId": sic_emp["userId"],
            "date": leave_date
        },
        {
            "$set": {
                "isActingSIC": True,
                "actingSICGroup": group_name,
                "actingSICFor": {
                    "employeeId": leave.get("employeeId"),
                    "name": leave.get("name"),
                    "leaveId": str(leave["_id"]),
                },
                "actingSICAssignedBy": str(user.get("employeeId") or user.get("userId") or ""),
                "actingSICAssignedOn": datetime.utcnow(),
            }
        }
    )

    acting_sic = {
        "employeeId": sic_emp["userId"],
        "name": sic_emp.get("name"),
        "designation": sic_emp.get("designation"),
        "groupName": group_name,
        "date": leave_date,
        "assignedBy": str(user.get("employeeId") or user.get("userId") or ""),
        "assignedOn": datetime.utcnow(),
        "source": str(payload.get("source") or "Direct acting-SIC assignment"),
    }
    leave_request_collection.update_one(
        {"_id": leave["_id"]},
        {
            "$set": {"actingSIC": acting_sic},
            "$push": {"actingSICHistory": acting_sic},
        },
    )

    duty_switch_collection.insert_one({
        "date": leave_date,
        "employeeId": sic_emp["userId"],
        "employeeName": sic_emp.get("name"),
        "designation": sic_emp.get("designation"),
        "previous": {
            "assignedDuty": sic_daily.get("assignedDuty"),
            "groupName": sic_daily.get("groupName"),
            "isActingSIC": bool(sic_daily.get("isActingSIC")),
        },
        "updated": {
            "assignedDuty": sic_daily.get("assignedDuty"),
            "groupName": group_name,
            "isActingSIC": True,
        },
        "reason": f"Acting SIC assigned for {leave.get('name') or leave.get('employeeId')} on leave",
        "changedBy": acting_sic["assignedBy"],
        "changedOn": acting_sic["assignedOn"],
        "source": acting_sic["source"],
        "leaveId": str(leave["_id"]),
    })

    return {"message": "Temporary SIC assigned successfully", "actingSIC": acting_sic}


# =========================================================
# GET SIC CANDIDATES
# =========================================================

@router.get("/sic-candidates/{leave_id}")
def get_sic_candidates(leave_id: str, user=Depends(get_current_user)):

    check_replacement_access(user)

    leave = leave_request_collection.find_one({
        "_id": ObjectId(leave_id)
    })

    if not leave:
        raise HTTPException(404, "Leave not found")
    require_replacement_authority(user, leave)

    leave_date = leave.get("date")
    group_name = leave.get("groupName")

    shift_people = list(employee_daily_collection.find({
        "date": leave_date,
        "groupName": group_name,

        # âœ… only active shift
        # "assignedDuty": {"$in": ["Morning", "Evening", "Night"]},

        # â— exclude leave person
        "employeeId": {"$ne": leave.get("employeeId")},

        # include normal + replacement, but never a person on active leave
        "leaveStatus": {"$nin": list(ACTIVE_LEAVE_STATUSES)}
    }))

    result = []

    for s in shift_people:
        result.append({
            "employeeId": s.get("employeeId"),
            "name": s.get("name"),
            "designation": s.get("designation"),
            "assignedDuty": s.get("assignedDuty"),
            "isReplacement": s.get("replacementDuty", False)
        })

    return result


# =========================================================
# PENDING SIC LIST
# =========================================================

@router.get("/pending-sic")
def pending_sic(user=Depends(get_current_user)):

    check_replacement_access(user)

    # SIC coverage is operational only for current/upcoming duties. Keeping
    # yesterday allows a delayed decision to be completed without loading the
    # full historical leave archive into this queue.
    coverage_from = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    leaves = list(leave_request_collection.find({
        "finalStatus": "Approved",
        "date": {"$gte": coverage_from},
    }))

    result = []

    for l in leaves:

        if not has_replacement_authority(user, l):
            continue

        duty = employee_daily_collection.find_one({
            "employeeId": l["employeeId"],
            "date": l.get("date")
        })

        # â— only if SIC required
        leave_employee_id = str(l.get("employeeId") or "")
        is_sic_leave = bool(
            (duty or {}).get("isSIC")
            or l.get("isSIC")
            or leave_employee_id in group_shift_in_charge_ids(l.get("date"), l.get("groupName"))
        )
        if not is_sic_leave:
            continue

        # â— skip if already assigned
        existing_sic = employee_daily_collection.find_one({
            "date": l["date"],
            "groupName": l["groupName"],
            "isActingSIC": True
        })

        if existing_sic:
            continue

        result.append({
            "id": str(l["_id"]),
            "employeeId": l["employeeId"],
            "name": l["name"],
            "groupName": l.get("groupName"),
            "date": l.get("date"),
            "leaveType": l.get("leaveType"),
            "assignedDuty": (duty or {}).get("assignedDuty") or l.get("assignedDuty"),
            "isSIC": True,
            "replacementRequired": bool(l.get("replacementRequired")),
            "replacementAssigned": bool((l.get("replacement") or {}).get("employeeId")),
            "replacement": l.get("replacement"),
        })

    return result


@router.get("/notifications")
def get_notifications(user=Depends(get_current_user)):

    user_id = user.get("userId")
    auto_accept_pending_duty_notifications()
    now = datetime.utcnow()

    data = list(duty_notification_collection.find({
        "$or": [
            {"employeeId": user_id},
            {"controllerIds": user_id},
        ],
        "leaveId": {"$exists": True},
        "assignedDuty": {"$exists": True},
        "status": {"$ne": "Superseded"},
    }).sort([("createdAt", -1)]))

    result = []

    for n in data:

        cutoff = utc_naive(n.get("cutoffTime"))

        n["_id"] = str(n["_id"])
        n["cutoffTime"] = api_datetime(n.get("cutoffTime"))
        n["createdAt"] = api_datetime(n.get("createdAt"))
        n["updatedAt"] = api_datetime(n.get("updatedAt"))
        n["decisionHistory"] = api_decision_history(n.get("decisionHistory"))
        is_assignee = n.get("employeeId") == user_id
        is_controller = user_id in normalized_categories(n.get("controllerIds"))
        before_cutoff = bool(cutoff and now <= cutoff)
        n["notificationKind"] = "replacement"
        n["unread"] = user_id not in normalized_categories(n.get("readBy"))
        n["viewerRole"] = "Employee" if is_assignee else "Controlling Officer"
        n["canAccept"] = bool(is_assignee and n.get("status") == "Pending" and before_cutoff)
        n["canDeny"] = bool(
            (is_assignee or is_controller)
            and n.get("status") in {"Pending", "Accepted"}
            and before_cutoff
        )

        result.append(n)

    return result


@router.put("/notifications/accept/{id}")
def accept_duty(id: str, user=Depends(get_current_user)):
    if not ObjectId.is_valid(id):
        raise HTTPException(400, "Invalid duty notification")
    notif = duty_notification_collection.find_one({"_id": ObjectId(id)})
    if not notif:
        raise HTTPException(404, "Duty notification not found")
    user_id = str(user.get("userId") or user.get("employeeId") or "")
    if notif.get("employeeId") != user_id:
        raise HTTPException(403, "Only the assigned employee can accept this duty")
    if notif.get("status") != "Pending":
        raise HTTPException(409, f"Duty is already {notif.get('status')}")
    now = datetime.utcnow()
    cutoff = utc_naive(notif.get("cutoffTime"))
    if cutoff and now > cutoff:
        auto_accept_pending_duty_notifications()
        return {"message": "Duty auto accepted at the 16:00 cutoff"}

    duty_notification_collection.update_one(
        {"_id": notif["_id"]},
        {
            "$set": {
                "status": "Accepted",
                "decision": "Accepted by employee",
                "acceptedBy": user_id,
                "updatedAt": now,
            },
            "$push": {
                "decisionHistory": {
                    "action": "Accepted",
                    "actedBy": user_id,
                    "actorRole": "Employee",
                    "actedAt": now,
                }
            },
            "$addToSet": {"readBy": user_id},
        },
    )

    return {"message": "Accepted"}



@router.put("/notifications/deny/{id}")
def deny_duty(id: str, payload: dict, user=Depends(get_current_user)):

    if not ObjectId.is_valid(id):
        raise HTTPException(400, "Invalid duty notification")
    notif = duty_notification_collection.find_one({
        "_id": ObjectId(id)
    })

    if not notif:
        raise HTTPException(404, "Notification not found")

    user_id = str(user.get("userId") or user.get("employeeId") or "")
    is_assignee = notif.get("employeeId") == user_id
    is_controller = user_id in normalized_categories(notif.get("controllerIds"))
    if not is_assignee and not is_controller:
        raise HTTPException(403, "Only the assigned employee or controlling officer can deny this duty")
    if notif.get("status") not in {"Pending", "Accepted"}:
        raise HTTPException(409, f"Duty is already {notif.get('status')}")

    now = datetime.utcnow()
    cutoff = utc_naive(notif.get("cutoffTime"))
    if cutoff and now > cutoff:
        auto_accept_pending_duty_notifications()
        raise HTTPException(400, "Denial time expired after the 16:00 cutoff")

    reason = str(payload.get("reason") or "").strip()
    if not reason:
        raise HTTPException(400, "Denial reason is required")
    actor_role = "Employee" if is_assignee else "Controlling Officer"
    leave = None
    if ObjectId.is_valid(str(notif.get("leaveId") or "")):
        leave = leave_request_collection.find_one({"_id": ObjectId(notif["leaveId"])})
    if leave:
        replacement = leave.get("replacement") or {}
        consumed_credit = compensatory_off_collection.find_one({
            "employeeId": replacement.get("employeeId"),
            "reference.leaveRequestId": str(leave["_id"]),
            "status": {"$in": ["Reserved", "Used"]},
        })
        if consumed_credit:
            raise HTTPException(409, "Duty cannot be denied because its C-OFF credit is reserved or used")

    duty_notification_collection.update_one(
        {"_id": notif["_id"]},
        {
            "$set": {
                "status": "Denied",
                "decision": f"Denied by {actor_role}",
                "reason": reason,
                "deniedBy": user_id,
                "deniedByRole": actor_role,
                "updatedAt": now,
            },
            "$push": {
                "decisionHistory": {
                    "action": "Denied",
                    "actedBy": user_id,
                    "actorRole": actor_role,
                    "reason": reason,
                    "actedAt": now,
                }
            },
            "$addToSet": {"readBy": user_id},
        },
    )

    duty_denial_collection.insert_one({
        "employeeId": notif.get("employeeId"),
        "employeeName": notif.get("employeeName"),
        "date": notif.get("date"),
        "assignedDuty": notif.get("assignedDuty"),
        "leaveId": notif.get("leaveId"),
        "notificationId": str(notif["_id"]),
        "deniedBy": user_id,
        "deniedByRole": actor_role,
        "reason": reason,
        "createdAt": now,
    })
    if leave:
        release_replacement_assignment(
            leave,
            reason,
            user_id,
            actor_role,
        )

    return {"message": "Denied"}
