from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi import File, UploadFile
from fastapi.responses import Response
from datetime import date, datetime, timedelta
from bson import ObjectId
from io import BytesIO
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

from crew_legacy.database.database_mongo import (
    leave_request_collection,
    leave_approval_delegation_collection,
    employee_daily_collection,
    employee_collection,
    DutyLeave_collection,
    system_settings_collection,
    compensatory_off_collection,
    deleted_leave_collection,
    page_access_collection,
    roster_group_collection,
    roster_master_collection,
    holiday_master_collection,
)

from crew_legacy.admin_logic.auth_utils import get_authenticated_user
from crew_legacy.admin_logic.notification_service import notify_all
from typing import Optional
import uuid
import re

router = APIRouter()

ACTIVE_LEAVE_STATUSES = ["Applied", "Forwarded by SIC", "Approved"]


def clean_id(value) -> str:
    return str(value or "").replace("\xa0", " ").strip()


def leave_date_summary(leaves: list[dict]) -> str:
    """Return a compact, truthful summary for one multi-date leave action."""
    dates = sorted({clean_id(leave.get("date")) for leave in leaves if clean_id(leave.get("date"))})
    if not dates:
        return "-"
    if len(dates) == 1:
        return dates[0]

    try:
        parsed = [datetime.strptime(value, "%Y-%m-%d") for value in dates]
        is_contiguous = all(
            current - previous == timedelta(days=1)
            for previous, current in zip(parsed, parsed[1:])
        )
    except ValueError:
        is_contiguous = False

    if is_contiguous:
        return f"{dates[0]} to {dates[-1]}"
    return ", ".join(dates)


def leave_type_summary(leaves: list[dict]) -> str:
    leave_types = list(dict.fromkeys(
        clean_id(leave.get("leaveType")) or ("Station Leave" if leave.get("stationLeave") else "")
        for leave in leaves
        if clean_id(leave.get("leaveType")) or leave.get("stationLeave")
    ))
    return ", ".join(leave_types) or "-"


def add_grouped_leave_notification(groups: dict, leave: dict, recipient_ids) -> None:
    """Collect daily leave rows into one notification per affected employee."""
    employee_id = clean_id(leave.get("employeeId"))
    key = employee_id or str(leave.get("_id"))
    bucket = groups.setdefault(key, {"leaves": [], "recipient_ids": set()})
    bucket["leaves"].append(leave)
    bucket["recipient_ids"].update(
        clean_id(value) for value in (recipient_ids or []) if clean_id(value)
    )


def is_admin(user: dict) -> bool:
    return str(user.get("role") or "").lower() == "admin" or clean_id(user.get("employeeId")) == "50041"


def can_view_all_leaves(user: dict) -> bool:
    """Global leave visibility is intentionally separate from page access."""
    # 50041 is the portal's configured leave-calendar administrator.  Other
    # people, including users with an "admin" title, retain organisation-only
    # visibility unless their account is explicitly made the configured admin.
    employee_id = clean_id(user.get("employeeId") or user.get("userId"))
    if employee_id == "50041":
        return True
    access = page_access_collection.find_one(
        {"userId": employee_id},
        {"pages.leave_calendar_all.view": 1},
    ) or {}
    return bool(((access.get("pages") or {}).get("leave_calendar_all") or {}).get("view"))


def employee_id_filter(employee_id: str) -> dict:
    return {"$regex": rf"^\s*{re.escape(clean_id(employee_id))}\s*$"}


def organization_leave_observer_ids(employee: dict) -> list[str]:
    """Reporting officers and HOD resolved from the Organization Master."""
    employee_id = clean_id(employee.get("userId") or employee.get("employeeId"))
    stored = employee.get("reportingOfficerIds") or employee.get("reportingOfficerId") or []
    values = []
    try:
        from crew_legacy.api.admin_api import resolve_employee_organization
        resolved = resolve_employee_organization(
            employee.get("manualFunctionIds", employee.get("functionIds")),
            employee_id,
        )
        values.extend(resolved.get("reportingOfficerIds") or [])
        values.extend([
            resolved.get("intermediaryReportingId"),
            resolved.get("hodId"),
        ])
    except Exception:
        pass
    values.extend(stored if isinstance(stored, list) else [stored])
    values.extend([employee.get("intermediaryReportingId"), employee.get("hodId")])
    return [
        value for value in dict.fromkeys(clean_id(item) for item in values)
        if value and value != employee_id
    ]


def direct_reporting_officer_ids(employee: dict) -> list[str]:
    """Resolve only the employee's direct reporting officer(s)."""
    employee_id = clean_id(employee.get("userId") or employee.get("employeeId"))
    values = []
    try:
        from crew_legacy.api.admin_api import resolve_employee_organization
        resolved = resolve_employee_organization(
            employee.get("manualFunctionIds", employee.get("functionIds")),
            employee_id,
        )
        values.extend(resolved.get("reportingOfficerIds") or [])
    except Exception:
        stored = employee.get("reportingOfficerIds") or employee.get("reportingOfficerId") or []
        values.extend(stored if isinstance(stored, list) else [stored])
    return [
        value for value in dict.fromkeys(clean_id(item) for item in values)
        if value and value != employee_id
    ]


def organization_leave_approval_chain(employee: dict) -> tuple[list[dict], int]:
    """Snapshot a non-shift employee's configured reporting hierarchy."""
    from crew_legacy.api.admin_api import resolve_employee_organization

    employee_id = clean_id(employee.get("userId") or employee.get("employeeId"))
    resolved = resolve_employee_organization(
        employee.get("manualFunctionIds", employee.get("functionIds")), employee_id
    )
    override = employee.get("leaveApprovalLevelsOverride")
    override_value = str(override or "")
    reporting_to_intermediary = override_value == "2_intermediary"
    configured_levels = 2 if reporting_to_intermediary else (
        int(override) if override_value in {"1", "2", "3"}
        else int(resolved.get("organizationLeaveApprovalLevels") or 2)
    )
    level_values = [("Reporting Officer / HOD", resolved.get("reportingOfficerIds") or [resolved.get("hodId")])] if configured_levels == 1 else [
        ("Reporting Officer", resolved.get("reportingOfficerIds") or []),
    ]
    if reporting_to_intermediary or configured_levels == 3:
        level_values.append(("Intermediary Reporting Officer", [resolved.get("intermediaryReportingId")]))
    if configured_levels > 1 and not reporting_to_intermediary:
        level_values.append(("HOD", [resolved.get("hodId")]))

    used = set()
    chain = []
    for level, raw_ids in level_values:
        approver_ids = [
            value for value in dict.fromkeys(clean_id(item) for item in raw_ids)
            if value and value != employee_id and value not in used
        ]
        if not approver_ids:
            continue
        used.update(approver_ids)
        people = {value: employee_by_id(value) for value in approver_ids}
        chain.append({
            "level": level,
            "employeeIds": approver_ids,
            "employeeId": approver_ids[0],
            "names": [people[value].get("name") or value for value in approver_ids],
            "name": people[approver_ids[0]].get("name") or approver_ids[0],
            "status": "Pending", "actedBy": None, "actedOn": None,
        })
    if len(chain) != configured_levels:
        missing = " → ".join(level for level, _values in level_values)
        raise HTTPException(
            409,
            f"The employee's {configured_levels}-level leave hierarchy is incomplete. Configure {missing} in Employee/Organization Master.",
        )
    return chain, configured_levels


def is_organization_leave(leave: dict) -> bool:
    return leave.get("approvalMode") == "Organization"


def current_organization_approval(leave: dict):
    chain = leave.get("approvalChain") or []
    index = int(leave.get("currentApprovalIndex") or 0)
    return (index, chain[index]) if 0 <= index < len(chain) else (index, None)


def step_approver_ids(step: dict) -> list[str]:
    return [
        value for value in dict.fromkeys(
            clean_id(item) for item in (step.get("employeeIds") or [step.get("employeeId")])
        ) if value
    ]


def active_leave_delegation(delegator_id: str, delegate_id: str, on_date: str = None) -> dict:
    """Return a currently effective, non-revoked delegation for this approval actor."""
    date_value = on_date or datetime.utcnow().strftime("%Y-%m-%d")
    return leave_approval_delegation_collection.find_one({
        "delegatorEmployeeId": clean_id(delegator_id),
        "delegateEmployeeId": clean_id(delegate_id),
        "status": "Active",
        "startDate": {"$lte": date_value},
        "endDate": {"$gte": date_value},
    }) or {}


def organization_step_actor(user: dict, step: dict) -> tuple[bool, str]:
    """Whether user is the configured approver or is formally delegated by one."""
    actor = clean_id(user.get("employeeId") or user.get("userId"))
    if is_admin(user):
        return True, ""
    for approver_id in step_approver_ids(step):
        if actor == approver_id:
            return True, ""
        if active_leave_delegation(approver_id, actor):
            return True, approver_id
    return False, ""


def delegation_actor_metadata(user: dict, step: dict) -> dict:
    allowed, delegator_id = organization_step_actor(user, step)
    if not allowed or not delegator_id:
        return {}
    person = employee_by_id(delegator_id)
    return {"delegatedBy": delegator_id, "delegatedByName": person.get("name") or delegator_id}


def migrate_pending_nonshift_leave_workflows() -> int:
    """Lazily convert legacy General-duty requests that were incorrectly waiting for SIC."""
    migrated = 0
    records = leave_request_collection.find({
        "finalStatus": "Applied",
        "$or": [{"approvalMode": {"$exists": False}}, {"approvalMode": None}],
    })
    for leave in records:
        if shift_group_for_date(leave.get("employeeId"), leave.get("date")):
            continue
        employee = employee_by_id(leave.get("employeeId"))
        if not employee:
            continue
        try:
            chain, configured_levels = organization_leave_approval_chain(employee)
        except HTTPException:
            continue
        result = leave_request_collection.update_one(
            {"_id": leave["_id"], "$or": [{"approvalMode": {"$exists": False}}, {"approvalMode": None}]},
            {"$set": {
                "approvalMode": "Organization", "approvalChain": chain,
                "configuredApprovalLevels": configured_levels, "currentApprovalIndex": 0,
                "organizationApprovalStatus": "Pending", "sicApprovalStatus": "Not Applicable",
                "updatedOn": datetime.utcnow(),
            }},
        )
        migrated += result.modified_count
    return migrated


def refresh_unacted_organization_leave_workflows() -> int:
    """Refresh untouched pending chains after an employee hierarchy change.

    Approval steps that have already been acted upon remain immutable audit
    snapshots. Only requests still at their first, entirely pending step are
    eligible to follow the employee's current configured approval route.
    """
    refreshed = 0
    records = leave_request_collection.find({
        "finalStatus": "Applied",
        "approvalMode": "Organization",
        "organizationApprovalStatus": "Pending",
        "$or": [
            {"currentApprovalIndex": 0},
            {"currentApprovalIndex": None},
            {"currentApprovalIndex": {"$exists": False}},
        ],
    })
    for leave in records:
        old_chain = leave.get("approvalChain") or []
        if any(step.get("status") != "Pending" or step.get("actedBy") or step.get("actedOn") for step in old_chain):
            continue
        employee = employee_by_id(leave.get("employeeId"))
        if not employee:
            continue
        try:
            new_chain, configured_levels = organization_leave_approval_chain(employee)
        except HTTPException:
            continue

        def signature(chain):
            return [
                (step.get("level"), tuple(step_approver_ids(step)))
                for step in chain
            ]

        if signature(old_chain) == signature(new_chain):
            continue
        result = leave_request_collection.update_one(
            {"_id": leave["_id"], "currentApprovalIndex": {"$in": [0, None]}},
            {"$set": {
                "approvalChain": new_chain,
                "configuredApprovalLevels": configured_levels,
                "currentApprovalIndex": 0,
                "organizationApprovalStatus": "Pending",
                "approvalHierarchyRefreshedOn": datetime.utcnow(),
                "updatedOn": datetime.utcnow(),
            }},
        )
        refreshed += result.modified_count
    return refreshed


def visible_leave_employee_ids(user: dict, employees: Optional[list[dict]] = None) -> set[str]:
    """Actor plus every recursively reporting subordinate from Organization Master."""
    active_employees = employees if employees is not None else list(
        employee_collection.find({"isActive": {"$ne": False}})
    )
    all_ids = {
        clean_id(employee.get("userId") or employee.get("employeeId"))
        for employee in active_employees
        if clean_id(employee.get("userId") or employee.get("employeeId"))
    }
    if can_view_all_leaves(user):
        return all_ids

    actor = clean_id(user.get("employeeId") or user.get("userId"))
    visible = {actor} if actor else set()
    changed = True
    while changed:
        changed = False
        for employee in active_employees:
            employee_id = clean_id(employee.get("userId") or employee.get("employeeId"))
            if not employee_id or employee_id in visible:
                continue
            if visible.intersection(direct_reporting_officer_ids(employee)):
                visible.add(employee_id)
                changed = True
    return visible


def employee_by_id(employee_id: str) -> dict:
    employee_id = clean_id(employee_id)
    if not employee_id:
        return {}
    return employee_collection.find_one({
        "$or": [
            {"userId": employee_id_filter(employee_id)},
            {"employeeId": employee_id_filter(employee_id)},
        ]
    }) or {}


def recipient_emails(employee_ids) -> list[str]:
    emails = []
    seen = set()
    for employee_id in employee_ids or []:
        employee = employee_by_id(employee_id)
        email = clean_id(employee.get("gmail") or employee.get("email") or employee.get("mailId"))
        key = email.lower()
        if email and "@" in email and key not in seen:
            seen.add(key)
            emails.append(email)
    return emails


def group_sic_ids(date_str: str, group_name: str) -> list[str]:
    records = employee_daily_collection.find({
        "date": date_str,
        "$or": [
            {"groupName": group_name, "isSIC": True},
            {
                "isActingSIC": True,
                "$or": [
                    {"groupName": group_name},
                    {"actingSICGroup": group_name},
                ],
            },
        ],
    }, {"employeeId": 1})
    return list(dict.fromkeys(
        clean_id(record.get("employeeId"))
        for record in records
        if clean_id(record.get("employeeId"))
    ))


def administrator_ids() -> list[str]:
    records = employee_collection.find({
        "$or": [
            {"userId": "50041"},
            {"employeeId": "50041"},
            {"role": {"$regex": "^admin$", "$options": "i"}},
            {"isAdmin": True},
        ]
    }, {"userId": 1, "employeeId": 1})
    values = [clean_id(item.get("userId") or item.get("employeeId")) for item in records]
    if "50041" not in values:
        values.append("50041")
    return [value for value in dict.fromkeys(values) if value]


def daily_record(employee_id: str, date_str: str):
    return employee_daily_collection.find_one({
        "employeeId": employee_id_filter(employee_id),
        "date": date_str,
    })


def shift_group_for_date(employee_id: str, date_str: str) -> dict:
    """Find an employee's roster group for the requested day, including historical groups."""
    employee_id = clean_id(employee_id)
    published_rosters = roster_master_collection.find({
        "calendarPushed": True,
        "startDate": {"$lte": date_str},
        "endDate": {"$gte": date_str},
    }, {"groupDetails": 1}).sort("startDate", -1)
    for roster in published_rosters:
        for group in roster.get("groupDetails") or []:
            if group_contains_employee(group, employee_id):
                return group
    return roster_group_collection.find_one({
        "isActive": {"$ne": False},
        "$or": [
            {"shiftInCharge.employeeId": employee_id},
            {"members.employeeId": employee_id},
        ],
    }) or {}


def group_contains_employee(group: dict, employee_id: str) -> bool:
    """Match legacy group snapshots that may use employeeId, userId, or id."""
    employee_id = clean_id(employee_id)
    people = [group.get("shiftInCharge") or {}] + list(group.get("members") or [])
    return any(
        clean_id(person.get("employeeId") or person.get("userId") or person.get("id")) == employee_id
        for person in people
    )


def is_control_room_employee(employee_id: str) -> bool:
    """An active roster-group member is governed by the published shift roster."""
    employee_id = clean_id(employee_id)
    groups = roster_group_collection.find({"isActive": {"$ne": False}}, {"shiftInCharge": 1, "members": 1})
    return any(group_contains_employee(group, employee_id) for group in groups)


def published_roster_for_employee_date(employee_id: str, date_str: str) -> Optional[dict]:
    """Return a roster actually published to the active duty calendar.

    A published draft is intentionally a valid active roster: the duty-roster
    screen supports publishing a draft before it is saved as final. Leave
    eligibility must therefore follow ``calendarPushed`` rather than the
    document's final/draft label.
    """
    rosters = roster_master_collection.find(
        {
            "calendarPushed": True,
            "startDate": {"$lte": date_str},
            "endDate": {"$gte": date_str},
        },
        {"startDate": 1, "endDate": 1, "groupDetails": 1},
    )
    return next(
        (roster for roster in rosters if any(group_contains_employee(group, employee_id) for group in roster.get("groupDetails") or [])),
        None,
    )


def ensure_leave_roster_is_published(employee_id: str, date_str: str) -> None:
    """Prevent control-room leave beyond the currently published roster coverage."""
    if not is_control_room_employee(employee_id):
        return
    if published_roster_for_employee_date(employee_id, date_str):
        return
    raise HTTPException(
        400,
        f"Leave for shift/control-room employees can be applied only within a published roster period. No published roster covers {date_str}.",
    )


def general_duty_record(employee_id: str, date_str: str, *, persist: bool = False) -> Optional[dict]:
    """Build the default duty row only for employees outside a shift group on that date."""
    employee = employee_by_id(employee_id)
    if not employee or employee.get("isActive", True) is False:
        return None
    if shift_group_for_date(employee_id, date_str):
        return None

    holiday = holiday_master_collection.find_one({
        "date": date_str,
        "status": {"$not": {"$regex": "^(inactive|deleted)$", "$options": "i"}},
    })
    is_weekend = datetime.strptime(date_str, "%Y-%m-%d").weekday() >= 5
    assigned_duty = "Holiday" if holiday else ("OFF" if is_weekend else "General")
    record = {
        "employeeId": clean_id(employee.get("userId") or employee.get("employeeId") or employee_id),
        "name": employee.get("name"),
        "designation": employee.get("designation"),
        "date": date_str,
        "assignedDuty": assigned_duty,
        "groupName": "General",
        "isHoliday": "Y" if holiday else "N",
        "isWeekend": is_weekend,
        "holidayName": holiday.get("holidayName") if holiday else None,
        "isSIC": False,
        "flag": "Duty",
        "dataSource": "General",
        "isEditable": False,
    }
    if persist:
        employee_daily_collection.update_one(
            {"employeeId": employee_id_filter(employee_id), "date": date_str},
            {"$setOnInsert": record},
            upsert=True,
        )
        return daily_record(employee_id, date_str) or record
    return record


def map_duty_type(assigned_duty: str) -> str:
    duty = clean_id(assigned_duty).upper()
    if duty in {"M1", "M2", "MORNING"}:
        return "Morning"
    if duty in {"E1", "E2", "EVENING"}:
        return "Evening"
    if duty in {"N1", "N2", "NIGHT"}:
        return "Night"
    if duty in {"O1", "O2", "OFF"}:
        return "OFF"
    return clean_id(assigned_duty)


def sic_record_for(employee_id: str, date_str: str, group_name: str = None):
    query = {
        "employeeId": employee_id_filter(employee_id),
        "date": date_str,
        "isSIC": True,
    }
    if group_name:
        query["groupName"] = group_name
    return employee_daily_collection.find_one(query)


def leave_authority_ids(leave: dict) -> list[str]:
    """Current organization authority plus the roster's legacy DIC snapshot."""
    if is_organization_leave(leave):
        return list(dict.fromkeys(
            value for step in (leave.get("approvalChain") or []) for value in step_approver_ids(step)
        ))
    duty = daily_record(leave.get("employeeId"), leave.get("date")) or {}
    legacy_id = clean_id((duty.get("departmentIC") or {}).get("employeeId"))
    employee = employee_by_id(leave.get("employeeId"))
    organization_ids = direct_reporting_officer_ids(employee) if employee else []
    return [
        value for value in dict.fromkeys([*organization_ids, legacy_id])
        if value and value != clean_id(leave.get("employeeId"))
    ]


def leave_authority_id(leave: dict) -> str:
    return next(iter(leave_authority_ids(leave)), "")


def can_apply_for(user: dict, employee_id: str, date_str: str = None) -> bool:
    actor = clean_id(user.get("employeeId"))
    target = clean_id(employee_id)
    if is_admin(user) or actor == target:
        return True
    actor_duty = daily_record(actor, date_str or datetime.now().strftime("%Y-%m-%d"))
    target_duty = daily_record(target, date_str or datetime.now().strftime("%Y-%m-%d"))
    return bool(
        actor_duty
        and target_duty
        and actor_duty.get("isSIC")
        and actor_duty.get("groupName") == target_duty.get("groupName")
    )


def can_sic_act(user: dict, leave: dict) -> bool:
    if is_organization_leave(leave):
        index, step = current_organization_approval(leave)
        allowed, _delegator = organization_step_actor(user, step) if step else (False, "")
        return bool(index == 0 and allowed)
    return is_admin(user) or bool(sic_record_for(user.get("employeeId"), leave.get("date"), leave.get("groupName")))


def can_authority_act(user: dict, leave: dict) -> bool:
    if is_organization_leave(leave):
        index, step = current_organization_approval(leave)
        allowed, _delegator = organization_step_actor(user, step) if step else (False, "")
        return bool(index > 0 and allowed)
    return is_admin(user) or clean_id(user.get("employeeId")) in leave_authority_ids(leave)


def can_delete_leave_master(user: dict) -> bool:
    actor = clean_id(user.get("employeeId"))
    if actor == "50041":
        return True
    access = page_access_collection.find_one({"userId": actor}) or {}
    return bool(((access.get("pages") or {}).get("leave_master_delete") or {}).get("write"))


def cancellation_role(user: dict, leave: dict) -> Optional[str]:
    actor = clean_id(user.get("employeeId"))
    if actor == clean_id(leave.get("employeeId")):
        return "Employee"
    if actor in leave_authority_ids(leave):
        return "DIC"
    if sic_record_for(actor, leave.get("date"), leave.get("groupName")):
        return "SIC"
    if is_admin(user):
        return "Administrator"
    return None


def clear_leave_operational_effects(leave: dict):
    leave_id = str(leave.get("_id"))
    leave_date = leave.get("date")
    employee_id = clean_id(leave.get("employeeId"))
    group_name = leave.get("groupName")
    replacement = leave.get("replacement") or {}

    consumed_replacement_credit = compensatory_off_collection.find_one({
        "reference.type": "Replacement",
        "reference.leaveRequestId": leave_id,
        "status": {"$in": ["Reserved", "Used"]},
    })
    if consumed_replacement_credit:
        raise HTTPException(409, "Cancellation is blocked because the replacement C-OFF credit is already reserved or used")

    employee_daily_collection.update_one(
        {"employeeId": employee_id_filter(employee_id), "date": leave_date},
        {"$unset": {
            "leaveStatus": "", "leaveType": "", "leaveRequestId": "", "replacementAssigned": "",
            "stationLeave": "", "stationLeaveOnly": "",
        }},
    )

    replacement_id = clean_id(replacement.get("employeeId"))
    if replacement_id:
        employee_daily_collection.update_one(
            {"employeeId": employee_id_filter(replacement_id), "date": leave_date},
            {"$unset": {
                "replacementDuty": "", "replacementFor": "", "replacementMode": "", "halfDuty": "",
            }},
        )

    compensatory_off_collection.delete_many({
        "reference.type": "Replacement",
        "reference.leaveRequestId": leave_id,
        "$or": [{"status": "Available"}, {"status": {"$exists": False}}],
    })

    if leave.get("compOffId"):
        try:
            compensatory_off_collection.update_one(
                {"_id": ObjectId(leave["compOffId"])},
                {"$set": {"status": "Available"}, "$unset": {"linkedLeaveId": "", "usedDate": ""}},
            )
        except Exception:
            pass

    employee_daily_collection.update_many(
        {"date": leave_date, "groupName": group_name},
        {"$unset": {"sic": "", "isActingSIC": ""}},
    )
    original_sic = employee_daily_collection.find_one({
        "date": leave_date, "groupName": group_name, "isSIC": True,
    })
    if original_sic:
        employee_daily_collection.update_many(
            {"date": leave_date, "groupName": group_name},
            {"$set": {"sic": {
                "employeeId": original_sic.get("employeeId"),
                "name": original_sic.get("name"),
                "designation": original_sic.get("designation"),
                "type": "permanent",
            }}},
        )


def restore_comp_off(leave: dict):
    comp_off_id = leave.get("compOffId")
    if not comp_off_id:
        return
    try:
        object_id = ObjectId(comp_off_id)
    except Exception:
        return
    compensatory_off_collection.update_one(
        {"_id": object_id, "status": "Reserved"},
        {"$set": {"status": "Available"}, "$unset": {"linkedLeaveId": "", "usedDate": ""}},
    )


def mark_comp_off_used(leave: dict):
    comp_off_id = leave.get("compOffId")
    if not comp_off_id:
        return
    try:
        object_id = ObjectId(comp_off_id)
    except Exception:
        return
    compensatory_off_collection.update_one(
        {"_id": object_id, "status": "Reserved", "linkedLeaveId": str(leave["_id"])},
        {"$set": {"status": "Used", "usedDate": leave.get("date")}},
    )

def is_replacement_required(date, group_name):
    """
    Returns True if more than 1 person is on leave for same group/date
    """

    count = employee_daily_collection.count_documents({
        "date": date,
        "groupName": group_name,
        "leaveStatus": {
            "$in": ["Applied", "Forwarded by SIC", "Approved"]
        }
    })

    return count > 1


def calculate_expiry_check(expiry_date: str, leave_date: str) -> bool:
    """
    Returns True if comp-off is still valid for given leave date
    """

    try:
        expiry = datetime.strptime(expiry_date, "%Y-%m-%d")
        leave = datetime.strptime(leave_date, "%Y-%m-%d")
    except Exception:
        return False

    return expiry >= leave


def is_group_leave_rule_enabled():

    setting = system_settings_collection.find_one(
        {"settingName": "singleLeavePerGroupPerDay"}
    )

    if not setting:
        return False

    return setting.get("enabled", False)

def calculate_expiry(earned_date_str):
    from datetime import datetime

    earned = datetime.strptime(earned_date_str, "%Y-%m-%d")

    next_year = earned.year + 1

    return f"{next_year}-03-31"

###################################################
# Get my Role
###################################################

@router.get("/my-role")
def get_my_role(user=Depends(get_authenticated_user)):

    emp_id = user["employeeId"].strip()
    today = datetime.now().strftime("%Y-%m-%d")

    # Check if user is SIC
    sic_record = employee_daily_collection.find_one({
        "date": today,
        "employeeId": {"$regex": f"^{emp_id}\\s*$"},
        "isSIC": True
    })

    is_sic = sic_record is not None

    dept_ic_record = employee_daily_collection.find_one({
        "date": today,
        "departmentIC.employeeId": employee_id_filter(emp_id),
    })

    is_dept_ic = dept_ic_record is not None
    is_reporting_officer = any(
        emp_id in organization_leave_observer_ids(employee)
        for employee in employee_collection.find(
            {"isActive": {"$ne": False}, "userId": {"$ne": emp_id}},
            {"userId": 1, "employeeId": 1, "functionIds": 1, "manualFunctionIds": 1,
             "reportingOfficerIds": 1, "reportingOfficerId": 1, "intermediaryReportingId": 1, "hodId": 1},
        )
    )

    return {
        "employeeId": emp_id,
        "isSIC": is_sic,
        "isDeptIC": is_dept_ic,
        "isLeaveAuthority": is_dept_ic or is_reporting_officer,
        "isAdmin": is_admin(user),
        "isReportingOfficer": is_reporting_officer,
        "canViewAll": can_view_all_leaves(user),
        "groupName": sic_record.get("groupName") if sic_record else None,
    }


# =========================================================
# EMPLOYEE LIST
# =========================================================

@router.get("/employees")
def get_leave_employees(user=Depends(get_authenticated_user)):

    role = user.get("role")
    emp_id = user.get("employeeId")

    if is_admin(user):

        employees = list(employee_collection.find({"isActive": {"$ne": False}}, {"_id": 0}))

    else:

        emp = employee_collection.find_one(
            {"userId": emp_id, "isActive": {"$ne": False}},
            {"_id": 0}
        )

        if not emp:
            raise HTTPException(404, "Employee not found")

        today = datetime.now().strftime("%Y-%m-%d")
        actor_duty = daily_record(emp_id, today)
        if actor_duty and actor_duty.get("isSIC") and actor_duty.get("groupName"):
            daily_members = list(employee_daily_collection.find({
                "date": today,
                "groupName": actor_duty.get("groupName"),
            }, {"employeeId": 1}))
            member_ids = [clean_id(item.get("employeeId")) for item in daily_members]
            employees = list(employee_collection.find({"userId": {"$in": member_ids}, "isActive": {"$ne": False}}, {"_id": 0}))
        else:
            employees = [emp]

    for e in employees:
        e["employeeId"] = e.get("userId")

    return employees


# =========================================================
# TEMPORARY LEAVE-APPROVAL DELEGATION
# =========================================================

@router.get("/delegations")
def get_leave_delegations(user=Depends(get_authenticated_user)):
    actor = clean_id(user.get("employeeId") or user.get("userId"))
    records = list(leave_approval_delegation_collection.find({
        "$or": [{"delegatorEmployeeId": actor}, {"delegateEmployeeId": actor}]
    }).sort("createdOn", -1))
    result = []
    for record in records:
        delegator = employee_by_id(record.get("delegatorEmployeeId"))
        delegate = employee_by_id(record.get("delegateEmployeeId"))
        result.append({
            "id": str(record["_id"]), "delegatorEmployeeId": clean_id(record.get("delegatorEmployeeId")),
            "delegatorName": delegator.get("name") or record.get("delegatorEmployeeId"),
            "delegateEmployeeId": clean_id(record.get("delegateEmployeeId")),
            "delegateName": delegate.get("name") or record.get("delegateEmployeeId"),
            "startDate": record.get("startDate"), "endDate": record.get("endDate"),
            "reason": record.get("reason") or "", "status": record.get("status") or "Active",
        })
    return result


@router.get("/delegation-employees")
def get_leave_delegation_employees(user=Depends(get_authenticated_user)):
    """Active subordinates to whom this approver may temporarily delegate."""
    actor = clean_id(user.get("employeeId") or user.get("userId"))
    visible_ids = visible_leave_employee_ids(user)
    visible_ids.discard(actor)
    employees = list(employee_collection.find(
        {"isActive": {"$ne": False}, "$or": [
            {"userId": {"$in": sorted(visible_ids)}},
            {"employeeId": {"$in": sorted(visible_ids)}},
        ]},
        {"_id": 0, "userId": 1, "employeeId": 1, "name": 1, "designation": 1},
    ).sort("name", 1))
    return [{**employee, "employeeId": clean_id(employee.get("userId") or employee.get("employeeId"))} for employee in employees]


@router.post("/delegations")
def create_leave_delegation(data: dict, user=Depends(get_authenticated_user)):
    delegator_id = clean_id(user.get("employeeId") or user.get("userId"))
    delegate_id = clean_id(data.get("delegateEmployeeId"))
    start_date, end_date = clean_id(data.get("startDate")), clean_id(data.get("endDate"))
    if not delegate_id or delegate_id == delegator_id:
        raise HTTPException(400, "Choose another active employee as the delegated approver")
    try:
        datetime.strptime(start_date, "%Y-%m-%d")
        datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(400, "Delegation dates must use YYYY-MM-DD format") from exc
    if end_date < start_date:
        raise HTTPException(400, "Delegation end date cannot be before the start date")
    if not employee_by_id(delegate_id) or employee_by_id(delegate_id).get("isActive") is False:
        raise HTTPException(404, "Delegated employee is not active")
    overlap = leave_approval_delegation_collection.find_one({
        "delegatorEmployeeId": delegator_id, "status": "Active",
        "startDate": {"$lte": end_date}, "endDate": {"$gte": start_date},
    })
    if overlap:
        raise HTTPException(409, "An active leave-approval delegation already overlaps these dates. Revoke it first.")
    now = datetime.utcnow()
    item = {"delegatorEmployeeId": delegator_id, "delegateEmployeeId": delegate_id,
            "startDate": start_date, "endDate": end_date, "reason": clean_id(data.get("reason"))[:500],
            "status": "Active", "createdOn": now, "createdBy": delegator_id}
    result = leave_approval_delegation_collection.insert_one(item)
    return {"id": str(result.inserted_id), "message": "Leave-approval delegation saved"}


@router.put("/delegations/{delegation_id}/revoke")
def revoke_leave_delegation(delegation_id: str, user=Depends(get_authenticated_user)):
    actor = clean_id(user.get("employeeId") or user.get("userId"))
    try:
        record_id = ObjectId(delegation_id)
    except Exception as exc:
        raise HTTPException(400, "Invalid delegation") from exc
    result = leave_approval_delegation_collection.update_one(
        {"_id": record_id, "delegatorEmployeeId": actor, "status": "Active"},
        {"$set": {"status": "Revoked", "revokedOn": datetime.utcnow(), "revokedBy": actor}},
    )
    if not result.modified_count:
        raise HTTPException(404, "Active delegation not found")
    return {"message": "Leave-approval delegation revoked"}


@router.get("/approval-calendar")
def get_organization_approval_calendar(
    startDate: str = Query(...),
    endDate: str = Query(...),
    employeeId: Optional[str] = Query(None),
    user=Depends(get_authenticated_user),
):
    try:
        start = datetime.strptime(startDate, "%Y-%m-%d")
        end = datetime.strptime(endDate, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(400, "Calendar dates must use YYYY-MM-DD format") from exc
    if end < start or (end - start).days > 92:
        raise HTTPException(400, "Select a calendar range of 93 days or less")

    active_employees = list(employee_collection.find({"isActive": {"$ne": False}}))
    visible_ids = visible_leave_employee_ids(user, active_employees)
    employees = [
        employee for employee in active_employees
        if clean_id(employee.get("userId") or employee.get("employeeId")) in visible_ids
    ]
    if employeeId:
        target_employee_id = clean_id(employeeId)
        employees = [
            employee for employee in employees
            if clean_id(employee.get("userId") or employee.get("employeeId")) == target_employee_id
        ]

    employee_ids = [clean_id(item.get("userId") or item.get("employeeId")) for item in employees]
    daily = list(employee_daily_collection.find({
        "employeeId": {"$in": employee_ids},
        "date": {"$gte": startDate, "$lte": endDate},
    })) if employee_ids else []
    duty_map = {(clean_id(item.get("employeeId")), item.get("date")): item for item in daily}
    # Leave requests are the workflow source of truth. employee_daily is a
    # roster projection and may be rebuilt when a roster is republished, so it
    # must never be the only source used to render leave in this calendar.
    leave_map = {}
    if employee_ids:
        active_requests = leave_request_collection.find({
            "employeeId": {"$in": employee_ids},
            "date": {"$gte": startDate, "$lte": endDate},
            "finalStatus": {"$nin": ["Cancelled", "Canceled", "Rejected", "Withdrawn"]},
        }).sort([("updatedOn", 1), ("createdOn", 1)])
        for leave in active_requests:
            leave_map[(clean_id(leave.get("employeeId")), leave.get("date"))] = leave
    permanent_shift_groups = {}
    for group in roster_group_collection.find(
        {"isActive": {"$ne": False}},
        {"groupName": 1, "shiftInCharge": 1, "members": 1},
    ):
        group_name = clean_id(group.get("groupName"))
        if not group_name:
            continue
        for person in [group.get("shiftInCharge") or {}, *(group.get("members") or [])]:
            member_id = clean_id(
                person.get("employeeId") or person.get("userId") or person.get("id")
            )
            if member_id:
                permanent_shift_groups[member_id] = group_name
    dates = []
    cursor = start
    while cursor <= end:
        dates.append(cursor.strftime("%Y-%m-%d"))
        cursor += timedelta(days=1)
    holiday_map = {
        item.get("date"): item.get("holidayName") or "Holiday"
        for item in holiday_master_collection.find({
            "date": {"$gte": startDate, "$lte": endDate},
            "status": {"$not": {"$regex": "^(inactive|deleted)$", "$options": "i"}},
        }, {"date": 1, "holidayName": 1})
        if item.get("date")
    }

    groups = {}
    for employee in employees:
        target_id = clean_id(employee.get("userId") or employee.get("employeeId"))
        department_values = employee.get("departments") or employee.get("department") or []
        if not isinstance(department_values, list):
            department_values = [department_values]
        departments = [clean_id(value) for value in department_values if clean_id(value)] or ["Unmapped department"]
        employee_records = [duty_map.get((target_id, date), {}) for date in dates]
        # Daily replacement assignments carry the covered shift's groupName,
        # but they do not make the replacement employee a permanent member of
        # that group. Group calendar rows only by Organization Master or the
        # active roster-group master; keep replacement duty in the date cell.
        group_name = permanent_shift_groups.get(target_id) or f"General · {departments[0]}"
        duties = {}
        for date in dates:
            record = duty_map.get((target_id, date), {})
            if not record:
                record = general_duty_record(target_id, date) or {}
            leave = leave_map.get((target_id, date)) or {}
            holiday_name = holiday_map.get(date) or record.get("holidayName")
            duties[date] = {
                "shift": record.get("assignedDuty") or "General",
                "isHoliday": bool(holiday_name or str(record.get("isHoliday") or "").upper() == "Y"),
                "holidayName": holiday_name,
                "leaveType": leave.get("leaveType") or record.get("leaveType"),
                "leaveStatus": leave.get("finalStatus") or record.get("leaveStatus"),
                "leaveRequestId": str(leave["_id"]) if leave.get("_id") else record.get("leaveRequestId"),
                "trainingName": record.get("trainingName"),
                "replacementEmployee": leave.get("replacement") or record.get("replacementEmployee"),
                "replacementRequired": bool(
                    leave.get("replacementRequired")
                    or leave.get("sicReplacementRequired")
                    or leave.get("dicReplacementRequired")
                    or record.get("replacementRequired")
                    or (record.get("trainingFinal") or {}).get("replacementRequired")
                ),
            }
        group = groups.setdefault(group_name, {"departments": set(), "employees": []})
        group["departments"].update(departments)
        group["employees"].append({
            "employeeId": target_id,
            "name": employee.get("name") or target_id,
            "designation": employee.get("designation"),
            "IsSIC": any(bool(record.get("isSIC")) for record in employee_records),
            "employeeType": "Shift" if target_id in permanent_shift_groups else "Non-shift",
            "departments": departments,
            "duties": duties,
        })
    return [
        {
            "groupName": name,
            "departments": sorted(group["departments"]),
            "employees": sorted(
                group["employees"],
                key=lambda item: (not item.get("IsSIC"), clean_id(item.get("name")).lower()),
            ),
        }
        for name, group in sorted(groups.items())
    ]


# =========================================================
# LEAVE TYPES
# =========================================================

@router.get("/leave-types")
def get_leave_types(user=Depends(get_authenticated_user)):

    data = DutyLeave_collection.find({
        "dutyLeaveType_cat": "leaveType",
        "status": "Active"
    })

    result = []

    for d in data:
        # ðŸ”¥ TRY ALL POSSIBLE FIELD NAMES
        name = (
            d.get("value")
        )

        if not name:
            continue  # skip bad records
        if "".join(str(name).split()).upper() == "STATIONLEAVE":
            continue

        result.append({
            "label": name,
            "value": name
        })

    return result


# =========================================================
# CHECK DUTY BEFORE APPLY
# =========================================================

@router.get("/duty")
def get_employee_duty(employeeId: str, date: str, user=Depends(get_authenticated_user)):

    if not can_apply_for(user, employeeId, date):
        raise HTTPException(403, "You cannot view this employee's duty")

    record = employee_daily_collection.find_one({
        "employeeId": employeeId,
        "date": date
    })

    if not record:
        raise HTTPException(404, "Duty not found")

    return {
        "assignedDuty": record.get("assignedDuty"),
        "groupName": record.get("groupName"),
        "isHoliday": record.get("isHoliday"),
        "isSIC": record.get("isSIC", False)
    }


# =========================================================
# APPLY LEAVE
# =========================================================

def apply_leave(data: dict, user=Depends(get_authenticated_user)):

    leave_group_id = str(uuid.uuid4())

    role = user["role"]
    logged_employee = user["employeeId"].strip()

    employee_id_request = data.get("employeeId")

    # =========================
    # ROLE HANDLING
    # =========================
    if role == "user":
        employee_id = logged_employee

    elif role == "admin":

        if not employee_id_request:
            raise HTTPException(400, "employeeId required for admin")

        employee_id = employee_id_request.strip()

    else:
        raise HTTPException(403, "Invalid role")

    emp = employee_collection.find_one({"userId": employee_id})

    if not emp:
        raise HTTPException(404, "Employee not found")

    is_sic = emp.get("isSIC", False)

    leave_type = data.get("leaveType")
    reason = data.get("reason")

    leave_date = data.get("date")
    start_date = data.get("startDate")
    end_date = data.get("endDate")

    
    if leave_date and (start_date or end_date):
        raise HTTPException(400, "Provide either date OR range, not both")

    comp_off_id = data.get("compOffId")  # ðŸ”¥ NEW

    if not leave_type:
        raise HTTPException(400, "Leave type required")

    # =========================
    # DATE HANDLING
    # =========================
    dates = []



    # ðŸ”¥ NEW SUPPORT (PUT THIS FIRST)
    if data.get("dates"):
        dates = data.get("dates")

    elif leave_date:
        dates = [leave_date]

    elif start_date and end_date:

        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")

        current = start

        while current <= end:
            dates.append(current.strftime("%Y-%m-%d"))
            current += timedelta(days=1)

    else:
        raise HTTPException(400, "Provide date OR startDate/endDate")

    inserted_ids = []
    errors = []
    success = []

    for date_str in dates:
        try:
            # validation + insert
            success.append(date_str)
        except Exception as e:
            errors.append({"date": date_str, "error": str(e)})

    # =========================
    # LOOP EACH DATE
    # =========================
    for date_str in dates:

        duty = employee_daily_collection.find_one({
            "employeeId": employee_id,
            "date": date_str
        })

        if not duty:
            raise HTTPException(404, f"Duty not found for {date_str}")

        group_name = duty["groupName"]

        # =========================
        # DUPLICATE CHECK
        # =========================
        duplicate = leave_request_collection.find_one({
            "employeeId": employee_id,
            "date": date_str
        })

        if duplicate:
            raise HTTPException(400, f"Leave already applied for {date_str}")

        # =========================
        # GROUP RULE
        # =========================
        if is_group_leave_rule_enabled():

            existing_leave = leave_request_collection.find_one({
                "groupName": group_name,
                "date": date_str,
                "employeeId": {"$ne": employee_id},
                "finalStatus": {
                    "$in": ["Applied", "Forwarded by SIC", "Approved"]
                }
            })

        if existing_leave:
            raise HTTPException(
                400,
                f"Another member from group already has leave on {date_str}"
            )

        # =========================
        # ðŸ”¥ COMP-OFF VALIDATION
        # =========================
        if leave_type == "C-OFF":

            if not comp_off_id:
                raise HTTPException(400, "Comp-off selection required")

            comp = compensatory_off_collection.find_one({
                "_id": ObjectId(comp_off_id),
                "employeeId": employee_id
            })

            if not comp:
                raise HTTPException(404, "Invalid comp-off")

            if comp.get("status") != "Available":
                raise HTTPException(400, "Comp-off already used")

            if not calculate_expiry_check(comp.get("expiryDate"), date_str):
                raise HTTPException(400, "Comp-off expired")

        # =========================
        # INSERT LEAVE
        # =========================
        leave_id = leave_request_collection.insert_one({

            "employeeId": employee_id,
            "name": duty["name"],
            "designation": duty["designation"],
            "groupName": group_name,
            "isSIC": is_sic,
            "date": date_str,
            "leaveType": leave_type,
            "reason": reason,
            "leaveGroupId": leave_group_id,

            "sicApprovalStatus": "Pending",
            "deptApprovalStatus": "Pending",
            "finalStatus": "Applied",

            "replacementRequired": False,
            "sicReplacementRequired": False,
            "dicReplacementRequired": None,
            "replacementDecisionHistory": [],
            "replacement": None,

            "compOffId": comp_off_id if leave_type == "C-OFF" else None,

            "createdOn": datetime.utcnow()
        }).inserted_id

        inserted_ids.append(str(leave_id))

        # =========================
        # UPDATE DAILY
        # =========================
        employee_daily_collection.update_one(
            {
                "employeeId": employee_id,
                "date": date_str
            },
            {
                "$set": {
                    "leaveRequestId": str(leave_id),
                    "leaveType": leave_type,
                    "leaveStatus": "Applied"
                }
            }
        )

        # =========================
        # ðŸ”¥ MARK COMP-OFF USED
        # =========================
        if leave_type == "C-OFF":

            compensatory_off_collection.update_one(
                {"_id": ObjectId(comp_off_id)},
                {
                    "$set": {
                        "status": "Reserved",
                        "linkedLeaveId": str(leave_id),
                        "usedDate": date_str,
                        "linkedLeaveId": str(leave_id)
                    }
                }
            )

    # ðŸ”¥ SEND SINGLE MAIL AFTER LOOP

    # get SIC
    sic_record = employee_daily_collection.find_one({
        "date": dates[0],
        "groupName": group_name,
        "isSIC": True
    })

    sic_emp = employee_collection.find_one({
        "userId": sic_record["employeeId"]
    }) if sic_record else None

    sic_email = sic_emp.get("gmail") if sic_emp else None

    notify_all(
        email_list=[sic_email] if sic_email else [],
        employee_ids=[sic_record["employeeId"]] if sic_record else [],
        subject="Leave Application (Multiple Days)",
        message=f"""
        {emp.get("name")} applied leave

        From: {dates[0]}
        To: {dates[-1]}
        Total Days: {len(dates)}

        Group: {group_name}
        """,

        ref_id=leave_group_id,
        action="VIEW_LEAVE",
        type="LEAVE",
        template_key="leave_applied",
        template_values={
            "employee_name": emp.get("name"),
            "employee_id": employee_id,
            "leave_count": len(dates),
            "leave_dates": dates[0] if len(dates) == 1 else f"{dates[0]} to {dates[-1]}",
            "group_name": group_name,
        },
    )
    return {
        "message": "Leave applied successfully",
        "leaveRecords": inserted_ids
    }


@router.post("/apply")
def apply_leave_v2(data: dict, user=Depends(get_authenticated_user)):
    """Create date-level leave rows after validating the authenticated employee scope."""
    employee_id = clean_id(data.get("employeeId") or user.get("employeeId"))
    if not employee_id:
        raise HTTPException(400, "Employee is required")

    employee = employee_collection.find_one({"userId": employee_id})
    if not employee:
        raise HTTPException(404, "Employee not found")

    applications = data.get("applications") or []
    if not applications:
        dates = data.get("dates") or ([data.get("date")] if data.get("date") else [])
        if not dates and data.get("startDate") and data.get("endDate"):
            start = datetime.strptime(data["startDate"], "%Y-%m-%d")
            end = datetime.strptime(data["endDate"], "%Y-%m-%d")
            if end < start:
                raise HTTPException(400, "End date cannot be before start date")
            while start <= end:
                dates.append(start.strftime("%Y-%m-%d"))
                start += timedelta(days=1)
        applications = [{
            "date": date_str,
            "leaveType": data.get("leaveType"),
            "compOffId": data.get("compOffId"),
            "stationLeave": data.get("stationLeave"),
        } for date_str in dates]

    if not applications:
        raise HTTPException(400, "Select at least one leave date")

    reason = str(data.get("reason") or "").strip()
    if not reason:
        raise HTTPException(400, "Reason is required")

    seen_dates = set()
    seen_comp_off = set()
    prepared = []
    group_rule = is_group_leave_rule_enabled()

    for item in applications:
        date_str = str(item.get("date") or "").strip()
        leave_type = str(item.get("leaveType") or "").strip()
        comp_off_id = str(item.get("compOffId") or "").strip() or None
        station_leave = item.get("stationLeave") is True or str(item.get("stationLeave") or "").strip().lower() in {"1", "true", "yes", "y"}
        try:
            parsed_date = datetime.strptime(date_str, "%Y-%m-%d")
        except Exception as exc:
            raise HTTPException(400, f"Invalid leave date: {date_str}") from exc
        if not is_admin(user) and parsed_date.date() < datetime.now().date():
            raise HTTPException(400, "Back-dated leave can be applied only by an administrator")
        if date_str in seen_dates:
            raise HTTPException(400, f"Duplicate leave date: {date_str}")
        seen_dates.add(date_str)
        if not can_apply_for(user, employee_id, date_str):
            raise HTTPException(403, f"You cannot apply leave for this employee on {date_str}")

        ensure_leave_roster_is_published(employee_id, date_str)

        duty = daily_record(employee_id, date_str) or general_duty_record(employee_id, date_str, persist=True)
        if not duty:
            raise HTTPException(404, f"Duty not found for {date_str}")
        group_name = duty.get("groupName")
        is_shift_employee = bool(
            shift_group_for_date(employee_id, date_str)
            or (clean_id(group_name) and clean_id(group_name).lower() != "general")
        )
        duty_name = map_duty_type(duty.get("assignedDuty"))
        is_holiday = bool(str(duty.get("isHoliday") or "").upper() == "Y" or duty.get("holidayName"))
        is_weekend = parsed_date.weekday() >= 5
        station_leave_only = bool(
            (is_shift_employee and duty_name == "OFF")
            or (not is_shift_employee and (is_holiday or is_weekend or duty_name in {"OFF", "Holiday"}))
        )
        if station_leave_only:
            if not station_leave:
                raise HTTPException(400, f"Tick Station Leave for the non-working day {date_str}")
            if leave_type:
                raise HTTPException(400, f"No leave type is permitted on OFF/holiday/weekend {date_str}; use Station Leave only")
            if comp_off_id:
                raise HTTPException(400, f"C-OFF cannot be used with Station Leave on {date_str}")
        elif not leave_type:
            raise HTTPException(400, f"Leave type is required for working day {date_str}")

        duplicate = leave_request_collection.find_one({
            "employeeId": employee_id,
            "date": date_str,
            "finalStatus": {"$nin": ["Rejected", "Withdrawn"]},
        })
        if duplicate:
            raise HTTPException(400, f"Leave already applied for {date_str}")

        if group_rule and group_name != "General" and not station_leave_only:
            existing_leave = leave_request_collection.find_one({
                "groupName": group_name,
                "date": date_str,
                "employeeId": {"$ne": employee_id},
                "finalStatus": {"$in": ACTIVE_LEAVE_STATUSES},
            })
            if existing_leave:
                raise HTTPException(400, f"Another member from the group already has leave on {date_str}")

        if leave_type.upper() == "C-OFF":
            if not comp_off_id:
                raise HTTPException(400, f"C-OFF selection is required for {date_str}")
            if comp_off_id in seen_comp_off:
                raise HTTPException(400, "Each C-OFF credit can be used for only one date")
            seen_comp_off.add(comp_off_id)
            try:
                comp_object_id = ObjectId(comp_off_id)
            except Exception as exc:
                raise HTTPException(400, "Invalid C-OFF selection") from exc
            comp = compensatory_off_collection.find_one({
                "_id": comp_object_id,
                "employeeId": employee_id_filter(employee_id),
            })
            if not comp or (comp.get("status") or "Available") != "Available":
                raise HTTPException(400, f"Selected C-OFF is not available for {date_str}")
            earned_date = comp.get("earnedDate") or comp.get("date")
            expiry_date = comp.get("expiryDate") or (calculate_expiry(earned_date) if earned_date else None)
            if not expiry_date or not calculate_expiry_check(expiry_date, date_str):
                raise HTTPException(400, f"Selected C-OFF is expired for {date_str}")

        prepared.append({
            "date": date_str,
            "leaveType": leave_type or "Station Leave",
            "stationLeave": station_leave,
            "stationLeaveOnly": station_leave_only,
            "compOffId": comp_off_id,
            "duty": duty,
            "groupName": group_name,
            "isShiftEmployee": is_shift_employee,
        })

    leave_group_id = str(uuid.uuid4())
    inserted_ids = []
    notified_sics = set()
    notified_reporting_officers = set()
    organization_chain_template = None
    organization_level_count = None
    if any(not item["isShiftEmployee"] for item in prepared):
        organization_chain_template, organization_level_count = organization_leave_approval_chain(employee)
    for item in prepared:
        duty = item["duty"]
        approval_chain = []
        configured_approval_levels = None
        if not item["isShiftEmployee"]:
            approval_chain = [
                {**step, "employeeIds": list(step.get("employeeIds") or []), "names": list(step.get("names") or [])}
                for step in (organization_chain_template or [])
            ]
            configured_approval_levels = organization_level_count
        document = {
            "employeeId": employee_id,
            "name": duty.get("name") or employee.get("name"),
            "designation": duty.get("designation") or employee.get("designation"),
            "groupName": item["groupName"],
            "isSIC": bool(duty.get("isSIC")),
            "date": item["date"],
            "leaveType": item["leaveType"],
            "stationLeave": item["stationLeave"],
            "stationLeaveOnly": item["stationLeaveOnly"],
            "reason": reason,
            "leaveGroupId": leave_group_id,
            "sicApprovalStatus": "Pending",
            "deptApprovalStatus": "Pending",
            "finalStatus": "Applied",
            "approvalMode": "Shift" if item["isShiftEmployee"] else "Organization",
            "approvalChain": approval_chain,
            "configuredApprovalLevels": configured_approval_levels,
            "currentApprovalIndex": 0,
            "organizationApprovalStatus": "Pending" if approval_chain else None,
            "replacementRequired": False,
            "sicReplacementRequired": False,
            "dicReplacementRequired": None,
            "replacementDecisionHistory": [],
            "replacement": None,
            "compOffId": item["compOffId"] if item["leaveType"].upper() == "C-OFF" else None,
            "createdBy": clean_id(user.get("employeeId")),
            "createdOn": datetime.utcnow(),
        }
        leave_id = leave_request_collection.insert_one(document).inserted_id
        inserted_ids.append(str(leave_id))
        employee_daily_collection.update_one(
            {"employeeId": employee_id_filter(employee_id), "date": item["date"]},
            {"$set": {
                "leaveRequestId": str(leave_id), "leaveType": item["leaveType"], "leaveStatus": "Applied",
                "stationLeave": item["stationLeave"], "stationLeaveOnly": item["stationLeaveOnly"],
            }},
        )
        if item["compOffId"]:
            reservation = compensatory_off_collection.update_one(
                {
                    "_id": ObjectId(item["compOffId"]),
                    "$or": [{"status": "Available"}, {"status": {"$exists": False}}],
                },
                {"$set": {"status": "Reserved", "linkedLeaveId": str(leave_id), "usedDate": item["date"]}},
            )
            if reservation.modified_count != 1:
                leave_request_collection.delete_one({"_id": leave_id})
                employee_daily_collection.update_one(
                    {"employeeId": employee_id_filter(employee_id), "date": item["date"]},
                    {"$unset": {
                        "leaveRequestId": "", "leaveType": "", "leaveStatus": "",
                        "stationLeave": "", "stationLeaveOnly": "",
                    }},
                )
                raise HTTPException(409, f"The selected C-OFF credit was just used for another request on {item['date']}")

        group_supervisors = employee_daily_collection.find({
            "date": item["date"],
            "$or": [
                {"groupName": item["groupName"], "isSIC": True},
                {
                    "isActingSIC": True,
                    "$or": [
                        {"groupName": item["groupName"]},
                        {"actingSICGroup": item["groupName"]},
                    ],
                },
            ],
        }, {"employeeId": 1})
        notified_sics.update(
            clean_id(record.get("employeeId"))
            for record in group_supervisors
            if clean_id(record.get("employeeId"))
        )
        if approval_chain:
            notified_reporting_officers.update(step_approver_ids(approval_chain[0]))

    # Application-stage notification is intentionally limited to the SIC(s)
    # responsible for the affected shift group.
    notified_sics.discard(employee_id)
    if notified_sics:
        groups = ", ".join(sorted({item["groupName"] for item in prepared if item.get("groupName")})) or "Not mapped"
        date_text = leave_date_summary(prepared)
        notify_all(
            email_list=recipient_emails(sorted(notified_sics)),
            employee_ids=sorted(notified_sics),
            subject="Leave application for SIC review",
            message=(
                f"{employee.get('name')} ({employee_id}) applied for "
                f"{len(inserted_ids)} leave day(s): {date_text}. Group: {groups}."
            ),
            ref_id=leave_group_id,
            action="VIEW_LEAVE",
            type="LEAVE",
            template_key="leave_applied",
            template_values={
                "employee_name": employee.get("name"),
                "employee_id": employee_id,
                "leave_count": len(inserted_ids),
                "leave_dates": date_text,
                "group_name": groups,
            },
        )

    notified_reporting_officers.discard(employee_id)
    if notified_reporting_officers:
        date_text = leave_date_summary(prepared)
        notify_all(
            email_list=recipient_emails(sorted(notified_reporting_officers)),
            employee_ids=sorted(notified_reporting_officers),
            subject="Leave application for Reporting Officer approval",
            message=f"{employee.get('name')} ({employee_id}) applied for {len(inserted_ids)} leave day(s): {date_text}.",
            ref_id=leave_group_id, action="VIEW_LEAVE", type="LEAVE",
            template_key="leave_reporting_applied",
            template_values={
                "employee_name": employee.get("name"), "employee_id": employee_id,
                "leave_count": len(inserted_ids), "leave_dates": date_text,
                "group_name": "Organization hierarchy",
            },
        )

    route_label = "Shift-in-Charge" if notified_sics else "Reporting Officer"
    return {"message": f"Leave application submitted to the {route_label}", "leaveRecords": inserted_ids}

# =========================================================
# GET ALL LEAVES
# =========================================================

@router.get("/all")
def get_all_leave(fromDate: str = Query(...), toDate: str = Query(...), user=Depends(get_authenticated_user)):

    if not is_admin(user):
        raise HTTPException(403, "Administrator access required")

    records = list(leave_request_collection.find({

        "date": {
            "$gte": fromDate,
            "$lte": toDate
        }

    }).sort("createdOn", -1))

    result = []

    for r in records:
        result.append({
            "id": str(r["_id"]),
            "name": r.get("name"),
            "date": r.get("date"),
            "leaveType": r.get("leaveType"),
            "stationLeave": bool(r.get("stationLeave")),
            "stationLeaveOnly": bool(r.get("stationLeaveOnly")),
            "finalStatus": r.get("finalStatus")
        })

    return result


# =========================================================
# SIC FORWARD
# =========================================================

@router.put("/sic-forward-bulk")
def sic_forward_bulk(data: dict, user=Depends(get_authenticated_user)):

    leaves = data.get("leaves", [])
    updated_count = 0
    notification_groups = {}

    for item in leaves:

        leave_id = item.get("id")
        leave = leave_request_collection.find_one({"_id": ObjectId(leave_id)})

        if not leave:
            continue

        if is_organization_leave(leave):
            if not can_sic_act(user, leave):
                raise HTTPException(403, "This leave is awaiting its configured Reporting Officer")
            index, step = current_organization_approval(leave)
            if leave.get("finalStatus") != "Applied" or not step or step.get("status") != "Pending":
                raise HTTPException(409, f"Leave for {leave.get('date')} is no longer pending Reporting Officer review")
            now = datetime.utcnow()
            next_index = index + 1
            chain = leave.get("approvalChain") or []
            leave_request_collection.update_one(
                {"_id": leave["_id"]},
                {"$set": {
                    f"approvalChain.{index}.status": "Approved",
                    f"approvalChain.{index}.actedBy": clean_id(user.get("employeeId")),
                    f"approvalChain.{index}.actedOn": now,
                    f"approvalChain.{index}.delegation": delegation_actor_metadata(user, step),
                    "currentApprovalIndex": next_index,
                    "organizationApprovalStatus": "In Progress",
                    "sicApprovalStatus": "Not Applicable",
                    "updatedOn": now,
                }},
            )
            employee_daily_collection.update_one(
                {"employeeId": leave["employeeId"], "date": leave["date"]},
                {"$set": {"leaveStatus": "Forwarded by Reporting Officer"}},
            )
            next_step = chain[next_index] if next_index < len(chain) else None
            recipient_ids = step_approver_ids(next_step) if next_step else []
            if recipient_ids:
                add_grouped_leave_notification(notification_groups, leave, recipient_ids)
            updated_count += 1
            continue

        if not can_sic_act(user, leave):
            raise HTTPException(403, f"You are not the Shift-in-Charge for {leave.get('groupName')} on {leave.get('date')}")

        if leave.get("finalStatus") != "Applied" or leave.get("sicApprovalStatus") != "Pending":
            raise HTTPException(409, f"Leave for {leave.get('date')} is no longer pending SIC review")

        sic_replacement_required = bool(item.get("replacementRequired", False))
        decision = {
            "stage": "SIC",
            "required": sic_replacement_required,
            "decidedBy": clean_id(user.get("employeeId")),
            "decidedOn": datetime.utcnow(),
        }

        leave_request_collection.update_one(
            {"_id": leave["_id"]},
            {
                "$set": {
                    "sicApprovalStatus": "Forwarded",
                    "sicReplacementRequired": sic_replacement_required,
                    # Only the final DIC decision may put a leave into Replacement Management.
                    "replacementRequired": False,
                    "updatedOn": datetime.utcnow()
                },
                "$push": {"replacementDecisionHistory": decision},
            }
        )

        employee_daily_collection.update_one(
            {
                "employeeId": leave["employeeId"],
                "date": leave["date"]
            },
            {
                "$set": {"leaveStatus": "Forwarded by SIC"}
            }
        )

        # After SIC approval, notify all current authorities resolved from the
        # shift-group/Organization Master as well as the legacy roster DIC.
        authority_ids = leave_authority_ids(leave)
        forward_recipient_ids = [clean_id(leave.get("employeeId"))]
        forward_recipient_ids.extend(authority_ids)
        for authority_id in authority_ids:
            authority_employee = employee_by_id(authority_id)
            if authority_employee:
                forward_recipient_ids.extend(direct_reporting_officer_ids(authority_employee))
        forward_recipient_ids = [
            value for value in dict.fromkeys(forward_recipient_ids) if value
        ]

        add_grouped_leave_notification(notification_groups, leave, forward_recipient_ids)

        updated_count += 1

    for group in notification_groups.values():
        grouped_leaves = group["leaves"]
        first_leave = grouped_leaves[0]
        recipient_ids = sorted(group["recipient_ids"])
        date_text = leave_date_summary(grouped_leaves)
        leave_type_text = leave_type_summary(grouped_leaves)
        organization_route = is_organization_leave(first_leave)
        notify_all(
            email_list=recipient_emails(recipient_ids),
            employee_ids=recipient_ids,
            subject="Leave approved by Reporting Officer" if organization_route else "Leave Approved and Forwarded by SIC",
            message=(
                ("Leave approved by Reporting Officer and forwarded to the next organization approver\n\n" if organization_route else "Leave approved by SIC and forwarded for final approval\n\n") +
                f"Name: {first_leave.get('name')}\n"
                f"Employee ID: {first_leave.get('employeeId')}\n"
                f"Dates: {date_text}\n"
                f"Total Days: {len(grouped_leaves)}\n"
                f"Type: {leave_type_text}"
            ),
            ref_id=first_leave.get("leaveGroupId") or str(first_leave["_id"]),
            action="VIEW_LEAVE",
            type="LEAVE",
            template_key="leave_reporting_forwarded" if organization_route else "leave_sic_forwarded",
            template_values={
                "employee_name": first_leave.get("name"),
                "employee_id": first_leave.get("employeeId"),
                "leave_date": date_text,
                "leave_dates": date_text,
                "leave_count": len(grouped_leaves),
                "leave_type": leave_type_text,
            },
        )

    return {"message": f"{updated_count} leave(s) forwarded"}



@router.put("/sic-reject-bulk")
def sic_reject_bulk(data: dict, user=Depends(get_authenticated_user)):

    leave_ids = data.get("leaveIds", [])
    comment = clean_id(data.get("comment"))[:1000]

    if not leave_ids:
        raise HTTPException(400, "No leave selected")

    emp_id = user["employeeId"].strip()

    updated = 0

    for lid in leave_ids:

        leave = leave_request_collection.find_one({"_id": ObjectId(lid)})

        if not leave:
            continue

        if is_organization_leave(leave):
            if not can_sic_act(user, leave):
                raise HTTPException(403, "This leave is awaiting its configured Reporting Officer")
            index, step = current_organization_approval(leave)
            if leave.get("finalStatus") != "Applied" or not step or step.get("status") != "Pending":
                raise HTTPException(409, f"Leave for {leave.get('date')} is no longer pending Reporting Officer review")
            rejected_on = datetime.utcnow()
            actor = clean_id(user.get("employeeId"))
            rejection = {"stage": step.get("level") or "Reporting Officer", "comment": comment, "rejectedBy": actor, "rejectedByRole": step.get("level") or "Reporting Officer", "rejectedOn": rejected_on}
            leave_request_collection.update_one(
                {"_id": leave["_id"]},
                {"$set": {
                    f"approvalChain.{index}.status": "Rejected", f"approvalChain.{index}.actedBy": actor,
                    f"approvalChain.{index}.actedOn": rejected_on, "organizationApprovalStatus": "Rejected",
                    f"approvalChain.{index}.delegation": delegation_actor_metadata(user, step),
                    "finalStatus": "Rejected", "rejectionComment": comment, "rejectedBy": actor,
                    "rejectedByRole": rejection["rejectedByRole"], "rejectedOn": rejected_on, "updatedOn": rejected_on,
                }, "$push": {"rejectionHistory": rejection}},
            )
            employee_daily_collection.update_one(
                {"employeeId": leave["employeeId"], "date": leave["date"]}, {"$set": {"leaveStatus": "Rejected"}},
            )
            restore_comp_off(leave)
            notify_all(
                email_list=recipient_emails([leave["employeeId"]]), employee_ids=[leave["employeeId"]],
                subject="Leave rejected by Reporting Officer",
                message=f"Your leave for {leave.get('date')} has been rejected by the Reporting Officer.\nComment: {comment or 'No comment provided'}",
                ref_id=str(leave["_id"]), action="VIEW_LEAVE", type="LEAVE", template_key="leave_reporting_rejected",
                template_values={"employee_name": leave.get("name"), "employee_id": leave.get("employeeId"), "leave_date": leave.get("date"), "leave_type": leave.get("leaveType"), "comment": comment or "No comment provided"},
            )
            updated += 1
            continue

        if not can_sic_act(user, leave):
            raise HTTPException(403, f"You are not the Shift-in-Charge for {leave.get('groupName')} on {leave.get('date')}")

        if leave.get("finalStatus") != "Applied" or leave.get("sicApprovalStatus") != "Pending":
            raise HTTPException(409, f"Leave for {leave.get('date')} is no longer pending SIC review")

        # Validate SIC
        duty = employee_daily_collection.find_one({
            "employeeId": {"$regex": f"^{emp_id}\\s*$"},
            "date": leave["date"]
        })

        if not is_admin(user) and (not duty or not duty.get("isSIC")):
            continue

        # Skip already rejected
        if leave.get("finalStatus") == "Rejected":
            continue

        # ðŸ”¥ UPDATE
        rejected_on = datetime.utcnow()
        rejection = {
            "stage": "SIC",
            "comment": comment,
            "rejectedBy": clean_id(user.get("employeeId")),
            "rejectedByRole": "Administrator" if is_admin(user) else "SIC",
            "rejectedOn": rejected_on,
        }
        leave_request_collection.update_one(
            {"_id": leave["_id"]},
            {
                "$set": {
                    "sicApprovalStatus": "Rejected",
                    "finalStatus": "Rejected",
                    "rejectionComment": comment,
                    "rejectedBy": rejection["rejectedBy"],
                    "rejectedByRole": rejection["rejectedByRole"],
                    "rejectedOn": rejected_on,
                    "updatedOn": rejected_on,
                },
                "$push": {"rejectionHistory": rejection},
            }
        )

        employee_daily_collection.update_one(
            {
                "employeeId": leave["employeeId"],
                "date": leave["date"]
            },
            {
                "$set": {"leaveStatus": "Rejected"}
            }
        )

        restore_comp_off(leave)

        # ðŸ”¥ EMPLOYEE EMAIL
        emp = employee_collection.find_one({
            "userId": leave["employeeId"]
        })

        emp_email = emp.get("gmail") if emp else None

        # ðŸ”¥ NOTIFY (same pattern)
        notify_all(
            email_list=[emp_email] if emp_email else [],
            employee_ids=[leave["employeeId"]],
            subject="Leave Rejected by SIC",
            message=f"""
            Your leave has been rejected by SIC

            Date: {leave.get('date')}
            Type: {leave.get('leaveType')}
            Comment: {comment or 'No comment provided'}
            """,
            ref_id=str(leave["_id"]),
            action="VIEW_LEAVE",
            type="LEAVE",
            template_key="leave_sic_rejected",
            template_values={
                "employee_name": leave.get("name"),
                "employee_id": leave.get("employeeId"),
                "leave_date": leave.get("date"),
                "leave_type": leave.get("leaveType"),
                "comment": comment or "No comment provided",
            },
        )

        updated += 1

    return {"message": f"{updated} leave(s) rejected by SIC"}

# =========================================================
# APPROVE LEAVE
# =========================================================

@router.put("/approve-bulk")
def approve_leave_bulk(data: dict, user=Depends(get_authenticated_user)):

    decision_items = data.get("leaves") or [
        {"id": leave_id} for leave_id in data.get("leaveIds", [])
    ]
    if not decision_items:
        raise HTTPException(400, "No leave selected")

    updated_count = 0
    advanced_count = 0
    notification_groups = {}

    for item in decision_items:

        lid = item.get("id")

        leave = leave_request_collection.find_one({"_id": ObjectId(lid)})

        if not leave:
            continue

        if is_organization_leave(leave):
            if not can_authority_act(user, leave):
                raise HTTPException(403, "This leave is awaiting another configured organization approver")
            index, step = current_organization_approval(leave)
            chain = leave.get("approvalChain") or []
            if leave.get("finalStatus") != "Applied" or not step or step.get("status") != "Pending":
                raise HTTPException(409, f"Leave for {leave.get('date')} is no longer pending this approval")
            now = datetime.utcnow()
            next_index = index + 1
            if next_index < len(chain):
                leave_request_collection.update_one(
                    {"_id": leave["_id"]},
                    {"$set": {
                        f"approvalChain.{index}.status": "Approved", f"approvalChain.{index}.actedBy": clean_id(user.get("employeeId")),
                        f"approvalChain.{index}.actedOn": now, "currentApprovalIndex": next_index,
                        f"approvalChain.{index}.delegation": delegation_actor_metadata(user, step),
                        "organizationApprovalStatus": "In Progress", "updatedOn": now,
                    }},
                )
                employee_daily_collection.update_one(
                    {"employeeId": leave["employeeId"], "date": leave["date"]},
                    {"$set": {"leaveStatus": f"Forwarded to {chain[next_index].get('level') or 'next approver'}"}},
                )
                next_ids = step_approver_ids(chain[next_index])
                notify_all(
                    email_list=recipient_emails(next_ids), employee_ids=next_ids,
                    subject=f"Leave awaiting {chain[next_index].get('level') or 'organization'} approval",
                    message=f"{leave.get('name')} ({leave.get('employeeId')}) leave for {leave.get('date')} awaits your approval.",
                    ref_id=leave.get("leaveGroupId") or str(leave["_id"]), action="VIEW_LEAVE", type="LEAVE",
                    template_key="leave_reporting_forwarded",
                    template_values={"employee_name": leave.get("name"), "employee_id": leave.get("employeeId"), "leave_date": leave.get("date"), "leave_dates": leave.get("date"), "leave_count": 1, "leave_type": leave.get("leaveType")},
                )
                advanced_count += 1
                continue

            # Last configured organization level reaches the existing finalization block.
            item["replacementRequired"] = False

        if not can_authority_act(user, leave):
            raise HTTPException(403, "Only the configured Leave Approving Authority can make the final decision")

        if not is_organization_leave(leave) and leave.get("sicApprovalStatus") != "Forwarded":
            raise HTTPException(400, f"Leave for {leave.get('date')} has not been forwarded by the SIC")

        if leave.get("finalStatus") != "Applied" or leave.get("deptApprovalStatus") != "Pending":
            raise HTTPException(409, f"Leave for {leave.get('date')} already has a final decision")

        if leave.get("deptApprovalStatus") == "Approved":
            continue

        dic_replacement_required = bool(
            item.get(
                "replacementRequired",
                leave.get("sicReplacementRequired", leave.get("replacementRequired", False)),
            )
        )
        organization_route = is_organization_leave(leave)
        current_index, current_step = current_organization_approval(leave) if organization_route else (None, None)
        decision = {
            "stage": current_step.get("level") if current_step else "DIC",
            "required": dic_replacement_required,
            "sicRequired": bool(leave.get("sicReplacementRequired", leave.get("replacementRequired", False))),
            "changedFromSIC": dic_replacement_required != bool(leave.get("sicReplacementRequired", leave.get("replacementRequired", False))),
            "decidedBy": clean_id(user.get("employeeId")),
            "decidedOn": datetime.utcnow(),
        }

        # ðŸ”¥ APPROVE
        final_set = {
            "deptApprovalStatus": "Approved", "finalStatus": "Approved",
            "dicReplacementRequired": dic_replacement_required, "replacementRequired": dic_replacement_required,
            "updatedOn": datetime.utcnow(),
        }
        if organization_route:
            final_set.update({
                f"approvalChain.{current_index}.status": "Approved",
                f"approvalChain.{current_index}.actedBy": clean_id(user.get("employeeId")),
                f"approvalChain.{current_index}.actedOn": datetime.utcnow(),
                f"approvalChain.{current_index}.delegation": delegation_actor_metadata(user, current_step),
                "currentApprovalIndex": len(leave.get("approvalChain") or []),
                "organizationApprovalStatus": "Approved",
            })
        leave_request_collection.update_one(
            {"_id": leave["_id"]},
            {
                "$set": final_set,
                "$push": {"replacementDecisionHistory": decision},
            }
        )

        employee_daily_collection.update_one(
            {
                "employeeId": leave["employeeId"],
                "date": leave["date"]
            },
            {
                "$set": {
                    "leaveStatus": "Approved",
                    "replacementRequired": dic_replacement_required,
                }
            }
        )

        mark_comp_off_used(leave)

        # After DIC final approval: notify the employee, group SIC/acting SIC,
        # the DIC's direct reporting officer(s), and administrator(s).
        authority_ids = leave_authority_ids(leave)
        final_recipient_ids = [clean_id(leave.get("employeeId"))]
        final_recipient_ids.extend(group_sic_ids(leave.get("date"), leave.get("groupName")))
        for authority_id in authority_ids:
            authority_employee = employee_by_id(authority_id)
            if authority_employee:
                final_recipient_ids.extend(direct_reporting_officer_ids(authority_employee))
        final_recipient_ids.extend(administrator_ids())
        final_recipient_ids = [
            value for value in dict.fromkeys(final_recipient_ids) if value
        ]

        add_grouped_leave_notification(notification_groups, leave, final_recipient_ids)

        updated_count += 1

    if updated_count == 0 and advanced_count == 0:
        raise HTTPException(400, "No valid leaves approved")

    for group in notification_groups.values():
        grouped_leaves = group["leaves"]
        first_leave = grouped_leaves[0]
        recipient_ids = sorted(group["recipient_ids"])
        date_text = leave_date_summary(grouped_leaves)
        leave_type_text = leave_type_summary(grouped_leaves)
        organization_route = is_organization_leave(first_leave)
        notify_all(
            email_list=recipient_emails(recipient_ids),
            employee_ids=recipient_ids,
            subject="Leave finally approved by Reporting Hierarchy" if organization_route else "Leave Finally Approved by DIC",
            message=(
                ("Leave has received final approval from the configured reporting hierarchy\n\n" if organization_route else "Leave has received final approval from the DIC\n\n") +
                f"Name: {first_leave.get('name')}\n"
                f"Employee ID: {first_leave.get('employeeId')}\n"
                f"Dates: {date_text}\n"
                f"Total Days: {len(grouped_leaves)}\n"
                f"Type: {leave_type_text}"
            ),
            ref_id=first_leave.get("leaveGroupId") or str(first_leave["_id"]),
            action="VIEW_LEAVE",
            type="LEAVE",
            template_key="leave_hierarchy_approved" if organization_route else "leave_dic_approved",
            template_values={
                "employee_name": first_leave.get("name"),
                "employee_id": first_leave.get("employeeId"),
                "leave_date": date_text,
                "leave_dates": date_text,
                "leave_count": len(grouped_leaves),
                "leave_type": leave_type_text,
            },
        )

    return {"message": f"{updated_count} leave(s) finally approved; {advanced_count} forwarded to the next approver"}



@router.put("/reject-bulk")
def reject_bulk(data: dict, user=Depends(get_authenticated_user)):

    leave_ids = data.get("leaveIds", [])
    comment = clean_id(data.get("comment"))[:1000]

    if not leave_ids:
        raise HTTPException(400, "No leave selected")

    updated = 0

    for lid in leave_ids:

        leave = leave_request_collection.find_one({"_id": ObjectId(lid)})

        if not leave:
            continue

        if not can_authority_act(user, leave):
            raise HTTPException(403, "Only the configured Leave Approving Authority can make the final decision")

        if not is_organization_leave(leave) and leave.get("sicApprovalStatus") != "Forwarded":
            raise HTTPException(400, f"Leave for {leave.get('date')} has not been forwarded by the SIC")

        if leave.get("finalStatus") != "Applied" or leave.get("deptApprovalStatus") != "Pending":
            raise HTTPException(409, f"Leave for {leave.get('date')} already has a final decision")

        if leave.get("finalStatus") == "Rejected":
            continue

        # ðŸ”¥ UPDATE DB
        rejected_on = datetime.utcnow()
        organization_route = is_organization_leave(leave)
        approval_index, approval_step = current_organization_approval(leave) if organization_route else (None, None)
        rejection = {
            "stage": approval_step.get("level") if approval_step else "DIC",
            "comment": comment,
            "rejectedBy": clean_id(user.get("employeeId")),
            "rejectedByRole": "Administrator" if is_admin(user) else (approval_step.get("level") if approval_step else "DIC"),
            "rejectedOn": rejected_on,
        }
        rejection_set = {
            "deptApprovalStatus": "Rejected", "finalStatus": "Rejected", "rejectionComment": comment,
            "rejectedBy": rejection["rejectedBy"], "rejectedByRole": rejection["rejectedByRole"],
            "rejectedOn": rejected_on, "updatedOn": rejected_on,
        }
        if organization_route:
            rejection_set.update({
                f"approvalChain.{approval_index}.status": "Rejected",
                f"approvalChain.{approval_index}.actedBy": clean_id(user.get("employeeId")),
                f"approvalChain.{approval_index}.actedOn": rejected_on,
                f"approvalChain.{approval_index}.delegation": delegation_actor_metadata(user, approval_step),
                "organizationApprovalStatus": "Rejected",
            })
        leave_request_collection.update_one(
            {"_id": leave["_id"]},
            {
                "$set": rejection_set,
                "$push": {"rejectionHistory": rejection},
            }
        )

        employee_daily_collection.update_one(
            {
                "employeeId": leave["employeeId"],
                "date": leave["date"]
            },
            {
                "$set": {"leaveStatus": "Rejected"}
            }
        )

        restore_comp_off(leave)

        # ðŸ”¥ GET EMP EMAIL
        emp = employee_collection.find_one({
            "userId": leave["employeeId"]
        })

        emp_email = emp.get("gmail") if emp else None

        # ðŸ”¥ NOTIFY
        notify_all(
            email_list=[emp_email] if emp_email else [],
            employee_ids=[leave["employeeId"]],
            subject="Leave Rejected by Reporting Hierarchy" if organization_route else "Leave Rejected",
            message=f"""
            Your leave has been rejected

            Date: {leave.get('date')}
            Type: {leave.get('leaveType')}
            Comment: {comment or 'No comment provided'}
            """,
            ref_id=str(leave["_id"]),
            action="VIEW_LEAVE",
            type="LEAVE",
            template_key="leave_hierarchy_rejected" if organization_route else "leave_dic_rejected",
            template_values={
                "employee_name": leave.get("name"),
                "employee_id": leave.get("employeeId"),
                "leave_date": leave.get("date"),
                "leave_type": leave.get("leaveType"),
                "comment": comment or "No comment provided",
            },
        )

        updated += 1

    return {"message": f"{updated} leave(s) rejected"}


#######################################
# Get all list
#######################################

@router.get("/list")
def get_leave_list(
    completedFrom: Optional[str] = Query(None),
    completedTo: Optional[str] = Query(None),
    focusLeaveId: Optional[str] = Query(None),
    focusEmployeeId: Optional[str] = Query(None),
    focusDate: Optional[str] = Query(None),
    user=Depends(get_authenticated_user),
):
    migrate_pending_nonshift_leave_workflows()
    refresh_unacted_organization_leave_workflows()
    actor = clean_id(user.get("employeeId"))
    visible_employee_ids = visible_leave_employee_ids(user)
    delete_allowed = can_delete_leave_master(user)
    completed_statuses = ["Approved", "Rejected", "Withdrawn", "Cancelled"]
    completed_from = completedFrom or (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
    try:
        datetime.strptime(completed_from, "%Y-%m-%d")
        if completedTo:
            datetime.strptime(completedTo, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(400, "Completed Leave dates must use YYYY-MM-DD format") from exc
    if completedTo and completedTo < completed_from:
        raise HTTPException(400, "Completed Leave end date cannot be before the start date")
    completed_date_filter = {"$gte": completed_from}
    if completedTo:
        completed_date_filter["$lte"] = completedTo
    status_query = {
        "$or": [
            {"finalStatus": {"$nin": completed_statuses}},
            {
                "finalStatus": {"$in": completed_statuses},
                **({"date": completed_date_filter} if completed_date_filter else {}),
            },
        ]
    }
    focus_record = None
    if focusLeaveId:
        try:
            focus_record = leave_request_collection.find_one({"_id": ObjectId(focusLeaveId)})
        except Exception:
            focus_record = None

    # Calendar popups request only the clicked continuous application. Newer
    # applications share leaveGroupId across leave and Station Leave dates.
    # Legacy records fall back to the employee so the client can derive the
    # adjacent stretch without loading every employee's workflow.
    focus_filter = None
    if focus_record and clean_id(focus_record.get("leaveGroupId")):
        focus_filter = {"leaveGroupId": focus_record.get("leaveGroupId")}
    else:
        target_employee_id = clean_id(
            (focus_record or {}).get("employeeId") or focusEmployeeId
        )
        if target_employee_id:
            focus_filter = {"employeeId": employee_id_filter(target_employee_id)}

    query = focus_filter or status_query
    records = list(leave_request_collection.find(query).sort([("date", -1), ("createdOn", -1)]).limit(2000))

    result = []

    for r in records:

        owner = clean_id(r.get("employeeId")) == actor
        sic_allowed = can_sic_act(user, r)
        authority_allowed = can_authority_act(user, r)
        employee = employee_by_id(r.get("employeeId"))
        department_values = employee.get("departments") or employee.get("department") or []
        if not isinstance(department_values, list):
            department_values = [department_values]
        departments = [clean_id(value) for value in department_values if clean_id(value)]
        organization_observer = clean_id(r.get("employeeId")) in visible_employee_ids and not owner
        if not (can_view_all_leaves(user) or delete_allowed or owner or sic_allowed or authority_allowed or organization_observer):
            continue

        others = list(employee_daily_collection.find({
            "date": r.get("date"),
            "groupName": r.get("groupName"),
            "leaveStatus": {
                "$in": ["Applied", "Forwarded by SIC", "Forwarded by Reporting Officer", "Forwarded to Intermediary Reporting Officer", "Forwarded to HOD", "Approved"]
            },
            "employeeId": {"$ne": r.get("employeeId")}
        }))
        duty = daily_record(r.get("employeeId"), r.get("date")) or {}
        assigned_duty = clean_id(duty.get("assignedDuty"))
        replacement = r.get("replacement") or employee_daily_collection.find_one({
            "date": r.get("date"),
            "replacementDuty": True,
            "replacementFor.employeeId": employee_id_filter(r.get("employeeId")),
        }) or {}
        organization_route = is_organization_leave(r)
        approval_index, approval_step = current_organization_approval(r) if organization_route else (None, None)
        first_approver_ids = (
            step_approver_ids((r.get("approvalChain") or [{}])[0])
            if organization_route and (r.get("approvalChain") or [])
            else group_sic_ids(r.get("date"), r.get("groupName"))
        )
        final_approver_ids = (
            [
                value
                for step in (r.get("approvalChain") or [])[1:]
                for value in step_approver_ids(step)
            ]
            if organization_route
            else leave_authority_ids(r)
        )
        first_approver_names = [
            employee_by_id(value).get("name") or value
            for value in dict.fromkeys(first_approver_ids)
            if value
        ]
        final_approver_names = [
            employee_by_id(value).get("name") or value
            for value in dict.fromkeys(final_approver_ids)
            if value
        ]

        result.append({
            "id": str(r["_id"]),
            "leaveGroupId": r.get("leaveGroupId"),
            "employeeId": clean_id(r.get("employeeId")),
            "name": r.get("name"),
            "departments": departments,
            "groupName": r.get("groupName"),
            "isSIC": r.get("isSIC"),
            "date": r.get("date"),
            "leaveType": r.get("leaveType"),
            "stationLeave": bool(r.get("stationLeave")),
            "stationLeaveOnly": bool(r.get("stationLeaveOnly")),
            "assignedDuty": assigned_duty,
            "dutyType": map_duty_type(assigned_duty),
            "sicApprovalStatus": r.get("sicApprovalStatus"),
            "deptApprovalStatus": r.get("deptApprovalStatus"),
            "approvalMode": r.get("approvalMode") or "Shift",
            "approvalChain": r.get("approvalChain") or [],
            "configuredApprovalLevels": r.get("configuredApprovalLevels"),
            "organizationApprovalStatus": r.get("organizationApprovalStatus"),
            "currentApprovalIndex": approval_index,
            "currentApproverLevel": approval_step.get("level") if approval_step else None,
            "currentApproverNames": approval_step.get("names") if approval_step else [],
            "firstApproverNames": first_approver_names,
            "finalApproverNames": final_approver_names,
            "approvalProgress": f"{sum(1 for step in (r.get('approvalChain') or []) if step.get('status') == 'Approved')}/{len(r.get('approvalChain') or [])}" if organization_route else None,
            "finalStatus": r.get("finalStatus"),
            "replacementRequired": r.get("replacementRequired", False),
            "replacementAssigned": bool(replacement),
            "replacementEmployee": ({"employeeId": clean_id(replacement.get("employeeId")), "name": replacement.get("name")} if replacement else None),
            "sicReplacementRequired": r.get("sicReplacementRequired", r.get("replacementRequired", False)),
            "dicReplacementRequired": r.get("dicReplacementRequired"),
            "replacementDecisionHistory": r.get("replacementDecisionHistory", []),
            "rejectionHistory": r.get("rejectionHistory", []),
            "rejectionComment": r.get("rejectionComment"),
            "rejectedBy": r.get("rejectedBy"),
            "rejectedByRole": r.get("rejectedByRole"),
            "rejectedOn": r.get("rejectedOn"),
            "reason": r.get("reason"),
            "compOffId": r.get("compOffId"),
            "createdOn": r.get("createdOn"),
            "cancelledBy": r.get("cancelledBy"),
            "cancelledByRole": r.get("cancelledByRole"),
            "cancelledOn": r.get("cancelledOn"),
            "isOwner": owner,
            "isOrganizationObserver": organization_observer,
            "canCancel": bool(cancellation_role(user, r)) and r.get("finalStatus") in ["Applied", "Approved"],
            "canDeleteMaster": delete_allowed,
            "canSICAct": sic_allowed and r.get("finalStatus") == "Applied" and (organization_route or r.get("sicApprovalStatus") == "Pending"),
            "canFinalAct": authority_allowed and r.get("finalStatus") == "Applied" and r.get("deptApprovalStatus") == "Pending" and (organization_route or r.get("sicApprovalStatus") == "Forwarded"),
            # ðŸ”¥ NEW FIELD
            "othersOnLeave": [
                {
                    "employeeId": o.get("employeeId"),
                    "name": o.get("name")
                }
                for o in others
            ]
        })

    return result

########################################
#Get duty details
########################################

@router.get("/duty-detailed")
def get_duty_detailed(
    employeeId: str,
    startDate: str,
    endDate: str,
    user=Depends(get_authenticated_user),
):

    employeeId = employeeId.strip()

    start = datetime.strptime(startDate, "%Y-%m-%d")
    end = datetime.strptime(endDate, "%Y-%m-%d")
    if end < start:
        raise HTTPException(400, "End date cannot be before start date")
    if (end - start).days > 92:
        raise HTTPException(400, "Select a range of 93 days or less")
    if not is_admin(user) and start.date() < datetime.now().date():
        raise HTTPException(400, "Back-dated leave can be applied only by an administrator")

    result = []

    current = start

    while current <= end:

        date_str = current.strftime("%Y-%m-%d")

        if not can_apply_for(user, employeeId, date_str):
            raise HTTPException(403, f"You cannot view this employee's duty on {date_str}")

        # Do not generate a General-duty fallback for control-room staff outside
        # a final roster that has been published to the calendar.
        if is_control_room_employee(employeeId) and not published_roster_for_employee_date(employeeId, date_str):
            current += timedelta(days=1)
            continue

        rec = daily_record(employeeId, date_str) or general_duty_record(employeeId, date_str)

        if rec:

            others = list(employee_daily_collection.find({
                "date": date_str,
                "groupName": rec.get("groupName"),
                "leaveStatus": {
                    "$in": ["Applied", "Forwarded by SIC", "Approved"]
                },
                "employeeId": {"$ne": employeeId}
            }))

            shift_group = shift_group_for_date(employeeId, date_str)
            group_name = clean_id(rec.get("groupName"))
            is_shift_employee = bool(
                shift_group or (group_name and group_name.lower() != "general")
            )
            mapped_duty = map_duty_type(rec.get("assignedDuty"))
            station_leave_only_allowed = bool(
                (is_shift_employee and mapped_duty == "OFF")
                or (not is_shift_employee and (
                    current.weekday() >= 5
                    or str(rec.get("isHoliday") or "").upper() == "Y"
                    or mapped_duty in {"OFF", "Holiday"}
                ))
            )

            result.append({
                "date": date_str,
                "assignedDuty": rec.get("assignedDuty"),
                "groupName": rec.get("groupName"),
                "isHoliday": bool(
                    str(rec.get("isHoliday") or "").upper() == "Y"
                    or rec.get("holidayName")
                ),
                "isWeekend": current.weekday() >= 5,
                "isShiftEmployee": is_shift_employee,
                "stationLeaveOnlyAllowed": station_leave_only_allowed,
                "holidayName": rec.get("holidayName"),
                "dataSource": rec.get("dataSource"),
                "othersOnLeave": [
                    {
                        "employeeId": o["employeeId"],
                        "name": o.get("name"),
                        "leaveType": o.get("leaveType"),
                        "leaveStatus": o.get("leaveStatus")
                    }
                    for o in others
                ]
            })

        current += timedelta(days=1)

    return result

################# C-OFF History 

def comp_off_display_status(record: dict) -> str:
    status = record.get("status") or "Available"
    expiry_date = clean_id(record.get("expiryDate"))
    if status == "Available" and expiry_date and expiry_date < datetime.now().date().isoformat():
        return "Expired"
    return status

@router.get("/comp-off/manual")
def manual_comp_off_history(
    scope: str = Query("manual", pattern="^(manual|all)$"),
    user=Depends(get_authenticated_user),
):
    """Return administrator C-OFF history, optionally including every source."""
    if not is_admin(user):
        raise HTTPException(403, "Only an administrator can manage manual C-OFF credits")

    query = {"reference.type": "ManualAdmin"} if scope == "manual" else {}
    limit = 200 if scope == "manual" else 10000
    records = list(compensatory_off_collection.find(query).sort([("earnedDate", -1), ("createdOn", -1)]).limit(limit))
    group_by_employee = manual_comp_off_shift_members() if scope == "all" else {}
    employee_ids = list({clean_id(record.get("employeeId")) for record in records if clean_id(record.get("employeeId"))})
    employee_details = {
        clean_id(employee.get("userId") or employee.get("employeeId")): employee
        for employee in employee_collection.find(
            {"$or": [{"userId": {"$in": employee_ids}}, {"employeeId": {"$in": employee_ids}}]},
            {"userId": 1, "employeeId": 1, "name": 1, "designation": 1},
        )
    }
    return [{
        "id": str(record["_id"]),
        "employeeId": clean_id(record.get("employeeId")),
        "employeeName": record.get("employeeName") or employee_details.get(clean_id(record.get("employeeId")), {}).get("name") or clean_id(record.get("employeeId")),
        "designation": record.get("designation") or employee_details.get(clean_id(record.get("employeeId")), {}).get("designation"),
        "groupName": (record.get("reference") or {}).get("groupName") or group_by_employee.get(clean_id(record.get("employeeId"))),
        "earnedDate": record.get("earnedDate") or record.get("date"),
        "expiryDate": record.get("expiryDate"),
        "status": comp_off_display_status(record),
        "usedDate": record.get("usedDate"),
        "reason": record.get("reason"),
        "createdByName": record.get("createdByName"),
        "source": (record.get("reference") or {}).get("type") or ("Roster" if record.get("rosterId") else "System"),
        "createdOn": record.get("createdOn"),
    } for record in records]


@router.post("/comp-off/manual")
def add_manual_comp_off(data: dict, user=Depends(get_authenticated_user)):
    """Backfill C-OFF for shift-group staff when an old roster was unavailable."""
    if not is_admin(user):
        raise HTTPException(403, "Only an administrator can add manual C-OFF credits")

    employee_ids = list(dict.fromkeys(
        clean_id(value) for value in (data.get("employeeIds") or []) if clean_id(value)
    ))
    earned_date = clean_id(data.get("earnedDate"))
    reason = clean_id(data.get("reason"))
    if not employee_ids:
        raise HTTPException(400, "Select at least one shift-group employee")
    if len(employee_ids) > 100:
        raise HTTPException(400, "A maximum of 100 employees can be credited at one time")
    try:
        parsed_date = datetime.strptime(earned_date, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(400, "Earned date must use YYYY-MM-DD format") from exc
    if parsed_date.date() >= datetime.now().date():
        raise HTTPException(400, "Manual C-OFF can be credited only for a past date")
    if len(reason) < 3:
        raise HTTPException(400, "Enter the holiday or manual credit reason")

    shift_members = {}
    for group in roster_group_collection.find(
        {"isActive": {"$ne": False}},
        {"groupName": 1, "shiftInCharge": 1, "members": 1},
    ):
        for person in [group.get("shiftInCharge") or {}, *(group.get("members") or [])]:
            member_id = clean_id(person.get("employeeId") or person.get("userId") or person.get("id"))
            if member_id:
                shift_members[member_id] = clean_id(group.get("groupName")) or "Shift group"

    invalid_ids = [employee_id for employee_id in employee_ids if employee_id not in shift_members]
    if invalid_ids:
        raise HTTPException(400, f"Not active shift-group employee(s): {', '.join(invalid_ids)}")

    actor_id = clean_id(user.get("employeeId") or user.get("userId"))
    actor = employee_by_id(actor_id)
    created = []
    skipped = []
    now = datetime.utcnow()
    for employee_id in employee_ids:
        existing = compensatory_off_collection.find_one({
            "employeeId": employee_id_filter(employee_id),
            "$or": [{"earnedDate": earned_date}, {"date": earned_date}],
        })
        if existing:
            skipped.append({
                "employeeId": employee_id,
                "reason": f"Credit already exists with status {existing.get('status') or 'Available'}",
            })
            continue

        employee = employee_by_id(employee_id)
        credit = {
            "employeeId": employee_id,
            "employeeName": employee.get("name") or employee_id,
            "designation": employee.get("designation"),
            "earnedDate": earned_date,
            "expiryDate": calculate_expiry(earned_date),
            "status": "Available",
            "reason": reason,
            "dutyType": "Shift",
            "reference": {
                "type": "ManualAdmin",
                "source": "Roster Setup",
                "groupName": shift_members[employee_id],
                "reason": reason,
            },
            "createdBy": actor_id,
            "createdByName": actor.get("name") or user.get("name") or actor_id,
            "createdOn": now,
        }
        inserted = compensatory_off_collection.insert_one(credit)
        created.append({
            "id": str(inserted.inserted_id),
            "employeeId": employee_id,
            "employeeName": credit["employeeName"],
            "groupName": shift_members[employee_id],
            "earnedDate": earned_date,
            "expiryDate": credit["expiryDate"],
        })

    return {
        "message": f"{len(created)} C-OFF credit(s) added; {len(skipped)} duplicate(s) skipped",
        "created": created,
        "skipped": skipped,
    }


def manual_comp_off_shift_members() -> dict[str, str]:
    """Return active shift employee IDs mapped to their current group."""
    members = {}
    for group in roster_group_collection.find(
        {"isActive": {"$ne": False}},
        {"groupName": 1, "shiftInCharge": 1, "members": 1},
    ):
        for person in [group.get("shiftInCharge") or {}, *(group.get("members") or [])]:
            employee_id = clean_id(person.get("employeeId") or person.get("userId") or person.get("id"))
            if employee_id:
                members[employee_id] = clean_id(group.get("groupName")) or "Shift group"
    return members


def resolve_manual_employee_id(raw_value, shift_members: dict[str, str]) -> str:
    """Resolve numeric Excel IDs without losing stored leading zeroes."""
    supplied = str(int(raw_value)) if isinstance(raw_value, float) and raw_value.is_integer() else clean_id(raw_value)
    if supplied in shift_members:
        return supplied
    normalized = supplied.lstrip("0") or "0"
    matches = [value for value in shift_members if (value.lstrip("0") or "0") == normalized]
    return matches[0] if len(matches) == 1 else supplied


def parse_manual_credit_date(value) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = clean_id(value)
    for pattern in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(text, pattern).date().isoformat()
        except ValueError:
            continue
    raise ValueError("use YYYY-MM-DD or DD-MM-YYYY")


@router.get("/comp-off/manual/template")
def download_manual_comp_off_template(user=Depends(get_authenticated_user)):
    """Download the administrator template for importing old C-OFF credits."""
    if not is_admin(user):
        raise HTTPException(403, "Only an administrator can manage manual C-OFF credits")

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Past C-OFF"
    sheet.append(["Employee No", "Earned Date", "Reason / Holiday"])
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="B45309")
        cell.alignment = Alignment(horizontal="center")
    sheet.column_dimensions["A"].width = 18
    sheet.column_dimensions["B"].width = 18
    sheet.column_dimensions["C"].width = 55
    for row_number in range(2, 1002):
        sheet.cell(row_number, 1).number_format = "@"
        sheet.cell(row_number, 2).number_format = "yyyy-mm-dd"
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = "A1:C1"

    instructions = workbook.create_sheet("Instructions")
    instructions.append(["Past C-OFF bulk upload instructions"])
    instructions["A1"].font = Font(bold=True, size=14, color="B45309")
    for line in (
        "Enter one employee and one earned date per row in the Past C-OFF sheet.",
        "Only dates before today are accepted.",
        "Employee must belong to an active shift group.",
        "Employee No is formatted as text so leading zeroes are preserved.",
        "Existing credits for the same employee and date are skipped.",
    ):
        instructions.append([line])
    instructions.column_dimensions["A"].width = 95

    output = BytesIO()
    workbook.save(output)
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Past_C-OFF_Import_Template.xlsx"'},
    )


@router.post("/comp-off/manual/import")
def import_manual_comp_off_excel(file: UploadFile = File(...), user=Depends(get_authenticated_user)):
    """Import old C-OFF credits and report every rejected or skipped row."""
    if not is_admin(user):
        raise HTTPException(403, "Only an administrator can add manual C-OFF credits")
    filename = clean_id(file.filename)
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in {"xlsx", "xlsm"}:
        raise HTTPException(400, "Upload an .xlsx or .xlsm file")
    contents = file.file.read(5 * 1024 * 1024 + 1)
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(413, "Uploaded file is too large (maximum 5 MB)")
    try:
        workbook = load_workbook(BytesIO(contents), data_only=True, read_only=True)
    except Exception as exc:
        raise HTTPException(400, "The uploaded Excel workbook could not be read") from exc

    sheet = workbook["Past C-OFF"] if "Past C-OFF" in workbook.sheetnames else workbook.active
    rows = sheet.iter_rows(values_only=True)
    try:
        raw_headers = next(rows)
    except StopIteration as exc:
        raise HTTPException(400, "The uploaded sheet is empty") from exc
    normalize_header = lambda value: re.sub(r"[^a-z0-9]", "", clean_id(value).lower())
    header_indexes = {normalize_header(value): index for index, value in enumerate(raw_headers) if clean_id(value)}
    employee_column = next((header_indexes[key] for key in ("employeeno", "employeeid", "userid") if key in header_indexes), None)
    date_column = next((header_indexes[key] for key in ("earneddate", "date", "holidaydate") if key in header_indexes), None)
    reason_column = next((header_indexes[key] for key in ("reasonholiday", "reason", "holiday", "remarks") if key in header_indexes), None)
    if employee_column is None or date_column is None:
        raise HTTPException(400, "Required columns are Employee No and Earned Date")

    shift_members = manual_comp_off_shift_members()
    actor_id = clean_id(user.get("employeeId") or user.get("userId"))
    actor = employee_by_id(actor_id)
    created, skipped, errors, seen = [], [], [], set()
    now = datetime.utcnow()
    row_count = 0
    for row_number, row in enumerate(rows, start=2):
        if not any(value is not None and clean_id(value) for value in row):
            continue
        row_count += 1
        if row_count > 1000:
            errors.append({"row": row_number, "reason": "Maximum 1000 data rows per upload"})
            break
        raw_employee = row[employee_column] if employee_column < len(row) else None
        raw_date = row[date_column] if date_column < len(row) else None
        raw_reason = row[reason_column] if reason_column is not None and reason_column < len(row) else None
        employee_id = resolve_manual_employee_id(raw_employee, shift_members)
        reason = clean_id(raw_reason)
        if not employee_id:
            errors.append({"row": row_number, "reason": "Employee No is required"})
            continue
        try:
            earned_date = parse_manual_credit_date(raw_date)
        except ValueError as exc:
            errors.append({"row": row_number, "employeeId": employee_id, "reason": f"Invalid Earned Date; {exc}"})
            continue
        if datetime.strptime(earned_date, "%Y-%m-%d").date() >= datetime.now().date():
            errors.append({"row": row_number, "employeeId": employee_id, "reason": "Earned Date must be before today"})
            continue
        if employee_id not in shift_members:
            errors.append({"row": row_number, "employeeId": employee_id, "reason": "Not an active shift-group employee"})
            continue
        if len(reason) < 3:
            errors.append({"row": row_number, "employeeId": employee_id, "reason": "Reason / Holiday is required"})
            continue
        key = (employee_id, earned_date)
        if key in seen:
            skipped.append({"row": row_number, "employeeId": employee_id, "earnedDate": earned_date, "reason": "Duplicate row in upload"})
            continue
        seen.add(key)
        existing = compensatory_off_collection.find_one({"employeeId": employee_id_filter(employee_id), "$or": [{"earnedDate": earned_date}, {"date": earned_date}]})
        if existing:
            skipped.append({"row": row_number, "employeeId": employee_id, "earnedDate": earned_date, "reason": f"Credit already exists with status {existing.get('status') or 'Available'}"})
            continue
        employee = employee_by_id(employee_id)
        credit = {
            "employeeId": employee_id,
            "employeeName": employee.get("name") or employee_id,
            "designation": employee.get("designation"),
            "earnedDate": earned_date,
            "expiryDate": calculate_expiry(earned_date),
            "status": "Available",
            "reason": reason,
            "dutyType": "Shift",
            "reference": {"type": "ManualAdmin", "source": "Admin Excel import", "groupName": shift_members[employee_id], "reason": reason},
            "createdBy": actor_id,
            "createdByName": actor.get("name") or user.get("name") or actor_id,
            "createdOn": now,
        }
        inserted = compensatory_off_collection.insert_one(credit)
        created.append({"row": row_number, "id": str(inserted.inserted_id), "employeeId": employee_id, "employeeName": credit["employeeName"], "earnedDate": earned_date})

    return {
        "message": f"{len(created)} C-OFF credit(s) added; {len(skipped)} skipped; {len(errors)} error(s)",
        "totalRows": row_count,
        "created": created,
        "skipped": skipped,
        "errors": errors,
    }

@router.get("/comp-off/history")
def comp_off_history(
    employeeId: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    user=Depends(get_authenticated_user),
):

    query = {}

    target_id = clean_id(employeeId or user.get("employeeId"))
    if not is_admin(user) and target_id != clean_id(user.get("employeeId")):
        raise HTTPException(403, "You cannot view this employee's C-OFF history")
    if target_id:
        query["employeeId"] = employee_id_filter(target_id)

    if status:
        query["status"] = status  # Available / Used

    records = compensatory_off_collection.find(query).sort("earnedDate", -1)

    result = []

    for r in records:

        result.append({
            "id": str(r["_id"]),
            "employeeId": r.get("employeeId"),
            "earnedDate": r.get("earnedDate") or r.get("date"),
            "expiryDate": r.get("expiryDate") or (calculate_expiry(r.get("earnedDate") or r.get("date")) if (r.get("earnedDate") or r.get("date")) else None),
            "status": r.get("status") or "Available",
            "usedDate": r.get("usedDate"),
            "source": r.get("reference", {}).get("type"),
            "linkedLeaveId": r.get("linkedLeaveId")
        })

    return result

###############################################
################## Delete the leave trace #######################
##############################################################
@router.put("/cancel/{leave_id}")
def cancel_leave(leave_id: str, user=Depends(get_authenticated_user)):
    try:
        object_id = ObjectId(leave_id)
    except Exception as exc:
        raise HTTPException(400, "Invalid leave ID") from exc

    leave = leave_request_collection.find_one({"_id": object_id})
    if not leave:
        raise HTTPException(404, "Leave not found")

    actor_role = cancellation_role(user, leave)
    if not actor_role:
        raise HTTPException(403, "Only the employee, assigned SIC, or Leave Approving Authority can cancel this leave")
    if leave.get("finalStatus") not in {"Applied", "Approved"}:
        raise HTTPException(409, "Only an active or approved leave can be cancelled")

    clear_leave_operational_effects(leave)
    cancelled_on = datetime.utcnow()
    cancellation = {
        "cancelledBy": clean_id(user.get("employeeId")),
        "cancelledByRole": actor_role,
        "cancelledOn": cancelled_on,
        "previousFinalStatus": leave.get("finalStatus"),
    }
    leave_request_collection.update_one(
        {"_id": object_id},
        {
            "$set": {
                "finalStatus": "Cancelled",
                "replacementRequired": False,
                "cancelledBy": cancellation["cancelledBy"],
                "cancelledByRole": actor_role,
                "cancelledOn": cancelled_on,
                "updatedOn": cancelled_on,
            },
            "$push": {"cancellationHistory": cancellation},
        },
    )
    return {"message": f"Leave cancelled by {actor_role}"}


@router.delete("/master/{leave_id}")
def delete_leave_master_record(leave_id: str, user=Depends(get_authenticated_user)):
    if not can_delete_leave_master(user):
        raise HTTPException(403, "Leave Master Permanent Delete permission is required")
    try:
        object_id = ObjectId(leave_id)
    except Exception as exc:
        raise HTTPException(400, "Invalid leave ID") from exc

    leave = leave_request_collection.find_one({"_id": object_id})
    if not leave:
        raise HTTPException(404, "Leave not found")

    clear_leave_operational_effects(leave)
    archive_doc = {
        **leave,
        "sourceLeaveId": str(leave["_id"]),
        "deletedOn": datetime.utcnow(),
        "deletedBy": clean_id(user.get("employeeId")),
        "action": "MASTER_DELETE",
    }
    archive_doc.pop("_id", None)
    deleted_leave_collection.insert_one(archive_doc)
    leave_request_collection.delete_one({"_id": object_id})
    return {"message": "Leave permanently deleted from the master record"}


@router.delete("/super-revert/{leave_id}")
def super_revert_leave(leave_id: str, user=Depends(get_authenticated_user)):

    if not is_admin(user):
        raise HTTPException(403, "Administrator access required")

    leave = leave_request_collection.find_one({
        "_id": ObjectId(leave_id)
    })

    if not leave:
        raise HTTPException(404, "Leave not found")

    leave_date = leave.get("date")
    emp_id = leave.get("employeeId")
    group_name = leave.get("groupName")

    # =========================================
    # 1ï¸âƒ£ ARCHIVE (HIDDEN LOG)
    # =========================================
    archive_doc = {
        **leave,
        "deletedOn": datetime.utcnow(),
        "deletedBy": user.get("employeeId"),
        "action": "SUPER_REVERT"
    }

    deleted_leave_collection.insert_one(archive_doc)

    # =========================================
    # 2ï¸âƒ£ RESTORE LEAVE EMPLOYEE
    # =========================================
    employee_daily_collection.update_one(
        {
            "employeeId": emp_id,
            "date": leave_date
        },
        {
            "$unset": {
                "leaveStatus": "",
                "leaveType": "",
                "leaveRequestId": "",
                "stationLeave": "",
                "stationLeaveOnly": "",
                "replacementAssigned": ""
            }
        }
    )

    # =========================================
    # 3ï¸âƒ£ REMOVE REPLACEMENT
    # =========================================
    replacement = leave.get("replacement")

    if replacement:
        replacement_id = replacement.get("employeeId")

        employee_daily_collection.update_one(
            {
                "employeeId": replacement_id,
                "date": leave_date
            },
            {
                "$unset": {
                    "replacementDuty": "",
                    "replacementFor": "",
                    "replacementMode": "",
                    "halfDuty": ""
                }
            }
        )

    # =========================================
    # 4ï¸âƒ£ REMOVE TEMP SIC
    # =========================================
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

    # =========================================
    # 5ï¸âƒ£ RESTORE PERMANENT SIC
    # =========================================
    original_sic = employee_daily_collection.find_one({
        "date": leave_date,
        "groupName": group_name,
        "isSIC": True
    })

    if original_sic:
        employee_daily_collection.update_many(
            {
                "date": leave_date,
                "groupName": group_name
            },
            {
                "$set": {
                    "sic": {
                        "employeeId": original_sic["employeeId"],
                        "name": original_sic["name"],
                        "designation": original_sic["designation"],
                        "type": "permanent"
                    }
                }
            }
        )

    # ðŸ”¥ RESTORE COMP-OFF
    if leave.get("compOffId"):

        compensatory_off_collection.update_one(
            {"_id": ObjectId(leave["compOffId"])},
            {
                "$set": {"status": "Available"},
                "$unset": {
                    "linkedLeaveId": "",
                    "usedDate": ""
                }
            }
        )


    # =========================================
    # 7ï¸âƒ£ HARD DELETE LEAVE
    # =========================================
    leave_request_collection.delete_one({
        "_id": ObjectId(leave_id)
    })

    return {"message": "Super revert completed successfully"}

###################### Fetch C OFF Data ##################

@router.get("/comp-off/available")
def get_available_comp_off(employeeId: Optional[str] = Query(None), user=Depends(get_authenticated_user)):

    emp_id = clean_id(employeeId or user["employeeId"])
    today = datetime.now().strftime("%Y-%m-%d")
    if not can_apply_for(user, emp_id, today):
        raise HTTPException(403, "You cannot view this employee's C-OFF credits")

    records = compensatory_off_collection.find({
        "employeeId": employee_id_filter(emp_id),
        "$or": [{"status": "Available"}, {"status": {"$exists": False}}],
    }).sort("earnedDate", 1)

    result = []

    for r in records:
        earned_date = r.get("earnedDate") or r.get("date")
        expiry_date = r.get("expiryDate") or (calculate_expiry(earned_date) if earned_date else None)
        result.append({
            "id": str(r["_id"]),
            "earnedDate": earned_date,
            "expiryDate": expiry_date,
            "reason": r.get("reason") or r.get("type") or "Roster / replacement duty",
        })

    return result


@router.put("/withdraw/{leave_id}")
def withdraw_leave(leave_id: str, user=Depends(get_authenticated_user)):

    leave = leave_request_collection.find_one({
        "_id": ObjectId(leave_id)
    })

    if not leave:
        raise HTTPException(404, "Leave not found")

    emp_id = user["employeeId"].strip()

    # ðŸ”’ Only owner can withdraw
    if leave["employeeId"] != emp_id:
        raise HTTPException(403, "Not allowed")

    # Withdrawal is available only while the request is still waiting for SIC review.
    first_stage_pending = (
        current_organization_approval(leave)[0] == 0
        and (current_organization_approval(leave)[1] or {}).get("status") == "Pending"
    ) if is_organization_leave(leave) else leave.get("sicApprovalStatus") == "Pending"
    if leave.get("finalStatus") != "Applied" or not first_stage_pending:
        raise HTTPException(400, "Leave cannot be withdrawn after the first approver has acted")

    # âœ… UPDATE LEAVE
    leave_request_collection.update_one(
        {"_id": ObjectId(leave_id)},
        {
            "$set": {
                "finalStatus": "Withdrawn",
                "updatedOn": datetime.utcnow()
            }
        }
    )

    # âœ… UPDATE DAILY
    employee_daily_collection.update_one(
        {
            "employeeId": leave["employeeId"],
            "date": leave["date"]
        },
        {
            "$unset": {
                "leaveStatus": "",
                "leaveType": "",
                "leaveRequestId": "",
                "stationLeave": "",
                "stationLeaveOnly": ""
            }
        }
    )

    restore_comp_off(leave)

    return {"message": "Leave withdrawn successfully"}
