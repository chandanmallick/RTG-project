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
)

router = APIRouter()

ACTIVE_LEAVE_STATUSES = {"Applied", "Forwarded by SIC", "Approved"}


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

    previous = {
        "assignedDuty": current.get("assignedDuty"),
        "groupName": current.get("groupName"),
        "replacementDuty": bool(current.get("replacementDuty")),
    }
    updated = {
        "assignedDuty": assigned_duty,
        "groupName": group_name or current.get("groupName"),
        "lastDutySwitch": {
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
    }
    inserted = duty_switch_collection.insert_one(audit)

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
    if not has_duty_switch_authority(user, duty_date) and actor != first_id:
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

    exchange_id = str(uuid.uuid4())
    changed_on = datetime.utcnow()
    first_previous = {"assignedDuty": first.get("assignedDuty"), "groupName": first.get("groupName")}
    second_previous = {"assignedDuty": second.get("assignedDuty"), "groupName": second.get("groupName")}
    first_updated = {"assignedDuty": second.get("assignedDuty"), "groupName": second.get("groupName")}
    second_updated = {"assignedDuty": first.get("assignedDuty"), "groupName": first.get("groupName")}
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
def pending_replacements(user=Depends(get_current_user)):

    check_replacement_access(user)

    leaves = list(
        leave_request_collection.find({
            "finalStatus": "Approved",
            "replacementRequired": True,
            "replacement": None
        })
    )

    result = []

    for l in leaves:

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

            # ðŸ”¥ NEW FIELDS
            "isFriday": is_friday,
            "nextDayHoliday": next_day_is_holiday
        })

    return result


@router.get("/assigned")
def assigned_replacements(user=Depends(get_current_user)):
    check_replacement_access(user)
    leaves = leave_request_collection.find({
        "finalStatus": "Approved",
        "replacement.employeeId": {"$exists": True, "$ne": None},
    }).sort([("date", 1), ("replacement.assignedOn", -1)])
    result = []
    for leave in leaves:
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
    user=Depends(get_current_user),
):

    check_replacement_access(user)

    leave = leave_request_collection.find_one({"_id": ObjectId(leave_id)})

    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

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
    candidates = list(employee_collection.find({
        "$or": [
            {"dutyType": "Replacement"},
            {"isIC": True}
        ]
    }))

    for c in candidates:

        candidate_id = c.get("userId")
        if not candidate_id:
            continue

        category = normalized_categories(c.get("category"))

        # ==========================================
        # ROLE FILTER (SIC / SHIFT ENGINEER)
        # ==========================================
        if effective_role_filter == "sic" and not category_matches(category, "sic"):
            continue
        if effective_role_filter == "shift_engineer" and not category_matches(category, "shift engineer"):
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
            "category": category,

            "replacementCount90Days": replacement_count,
            "denialCount90Days": denial_count,
            "denialCount": total_denial_count,
            "requiredDuty": required_duty,
            "lastMatchingDutyDate": last_matching_duty_date,
            "daysSinceMatchingDuty": days_since_matching_duty,
            "isSIC": is_sic,
            "source": "replacement",

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
            {"category": 1},
        ) or {}
        category = normalized_categories(employee_master.get("category"))
        if effective_role_filter == "sic" and not category_matches(category, "sic"):
            continue
        if effective_role_filter == "shift_engineer" and not category_matches(category, "shift engineer"):
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
    source_order = {"replacement": 0, "shift": 1, "otherShift": 2}

    def candidate_order(item):
        source = item.get("source")
        if source == "replacement":
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
    require_duty_switch_authority(user, leave.get("date"))

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

    if (
        existing_daily
        and str(existing_daily.get("assignedDuty") or "").strip()
        and str(existing_daily.get("assignedDuty") or "").strip() != str(assigned_duty or "").strip()
    ):
        switch_audit = {
            "date": leave_date,
            "employeeId": replacement_emp["userId"],
            "employeeName": replacement_emp.get("name"),
            "designation": replacement_emp.get("designation"),
            "previous": {
                "assignedDuty": existing_daily.get("assignedDuty"),
                "groupName": existing_daily.get("groupName"),
                "replacementDuty": bool(existing_daily.get("replacementDuty")),
            },
            "updated": {
                "assignedDuty": assigned_duty,
                "groupName": leave.get("groupName"),
            },
            "reason": str(payload.get("reason") or f"Assigned in place of {leave.get('name') or leave.get('employeeId')} on leave").strip(),
            "changedBy": str(user.get("employeeId") or user.get("userId") or "ADMIN"),
            "changedOn": datetime.utcnow(),
            "source": "Leave replacement duty switch",
            "leaveId": str(leave["_id"]),
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
            "reference.type": {"$in": ["Roster", "Replacement"]}
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
def assign_sic(leave_id: str, payload: dict):

    sic_id = payload.get("sicEmployeeId")

    leave = leave_request_collection.find_one({
        "_id": ObjectId(leave_id)
    })

    if not leave:
        raise HTTPException(404, "Leave not found")

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

    if sic_daily.get("leaveStatus") == "Approved":
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
                "isActingSIC": ""
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
            "leaveStatus": {"$ne": "Approved"}
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
                "isActingSIC": True
            }
        }
    )

    return {"message": "Temporary SIC assigned successfully"}


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

    leave_date = leave.get("date")
    group_name = leave.get("groupName")

    shift_people = list(employee_daily_collection.find({
        "date": leave_date,
        "groupName": group_name,

        # âœ… only active shift
        # "assignedDuty": {"$in": ["Morning", "Evening", "Night"]},

        # â— exclude leave person
        "employeeId": {"$ne": leave.get("employeeId")},

        # âœ… include normal + replacement
        # "leaveStatus": {"$ne": "Approved"}
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

    leaves = list(leave_request_collection.find({
        "finalStatus": "Approved",
        "replacement.employeeId": {"$exists": True}
    }))

    result = []

    for l in leaves:

        duty = employee_daily_collection.find_one({
            "employeeId": l["employeeId"],
            "date": l.get("date")
        })

        # â— only if SIC required
        if not duty or not duty.get("isSIC"):
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
            "leaveType": l.get("leaveType")
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
