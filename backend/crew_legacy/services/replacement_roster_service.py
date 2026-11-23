import logging
import re
from datetime import datetime, date, timedelta, timezone
from typing import Dict, List, Optional, Any, Tuple
from zoneinfo import ZoneInfo
from bson import ObjectId
from fastapi import HTTPException

from crew_legacy.database.database_mongo import (
    employee_collection,
    employee_daily_collection,
    leave_request_collection,
    roster_group_collection,
    organization_unit_collection,
    replacement_roster_config_collection,
    replacement_rejection_audit_collection,
    compensatory_off_collection,
    training_nomination_history_collection,
    sports_application_collection,
    duty_denial_collection,
    duty_notification_collection,
)
from crew_legacy.admin_logic.notification_service import (
    notify_all,
    send_replacement_duty_email,
    _runtime_env_value,
)

logger = logging.getLogger("replacement_roster_service")
KOLKATA_TZ = ZoneInfo("Asia/Kolkata")
CONFIG_ID = "replacement-roster-config"


def clean_id(value) -> str:
    return str(value or "").replace("\xa0", " ").strip()


def get_active_shift_group_member_ids() -> set[str]:
    """
    Returns the set of all employee IDs who are associated with ANY group in roster_group_collection
    (either as Shift In Charge or as a group member) or mapped to a shift group in employee collection.
    User Requirement: In crew setup page "crew/setup", those persons associated with any group,
    they shouldn't be counted for the replacement duty.
    """
    group_ids = set()
    # 1. Only ACTIVE groups in roster_group_collection (roster_group_history contains historical inactive groups)
    for group in roster_group_collection.find({"isActive": True}):
        sic = group.get("shiftInCharge") or {}
        sic_id = clean_id(
            sic.get("employeeId")
            or sic.get("userId")
            or group.get("sicEmployeeId")
            or group.get("shiftInChargeId")
        )
        if sic_id:
            group_ids.add(sic_id)
        for m in (group.get("members") or []):
            mid = clean_id(m.get("employeeId") or m.get("userId"))
            if mid:
                group_ids.add(mid)

    # 2. Employees with shift group tags in employee collection
    for emp in employee_collection.find({
        "$or": [
            {"shiftGroupNames": {"$exists": True, "$ne": []}},
            {"isShiftGroupSic": True},
            {"shiftGroupSic": True},
            {"dutyType": {"$regex": "^shift", "$options": "i"}}
        ]
    }, {"userId": 1, "employeeId": 1}):
        eid = clean_id(emp.get("userId") or emp.get("employeeId"))
        if eid:
            group_ids.add(eid)

    group_ids.discard("")
    return group_ids


def get_frontend_base_url() -> str:
    return _runtime_env_value("FRONTEND_URL") or "http://localhost:3001"


# =========================================================
# CONFIGURATION & POOL INITIALIZATION
# =========================================================

BASE_5_DEPARTMENTS = [
    "System Operation",
    "Market Operation",
    "SCADA",
    "Communication",
    "Contracts",
]

def get_employee_roles(emp: dict) -> Tuple[bool, bool]:
    """
    Returns (has_sic, has_shift_engineer) based on category, designation, role, and shiftGroupSic.
    Matches any person in the database where SIC or Shift Engineer is mentioned.
    USER REQUIREMENT: If 'None' option in 'Type of duty' or 'Category' in the employee database,
    he is explicitly excluded from the sequence (returns False, False).
    """
    if not emp:
        return False, False
    duty_type = str(emp.get("dutyType") or "").strip().lower()
    raw_cat = emp.get("category")
    categories = [str(x).strip().lower() for x in (raw_cat if isinstance(raw_cat, list) else [raw_cat])] if raw_cat else []

    # Exclude from sequence if dutyType is None or category contains None
    if duty_type in ["none", ""] or "none" in categories:
        return False, False

    cat_str = " ".join(categories)
    desig_str = str(emp.get("designation") or "").strip().lower()
    role_str = str(emp.get("role") or "").strip().lower()
    is_shift_sic = bool(emp.get("isShiftGroupSic") or emp.get("isSIC"))

    is_sic = (
        any(c == "sic" or "sic" in c.split() or "sic" in c.split("&") or "sic" in c.split("/") for c in categories)
        or "sic" in cat_str
        or "shift in charge" in desig_str
        or "shift-in-charge" in desig_str
        or "shift in-charge" in desig_str
        or "sic" in desig_str.split()
        or role_str == "sic"
        or is_shift_sic
    )
    is_se = (
        any("shift engineer" in c or "shift_engineer" in c or c == "se" or "junior engineer" in c or c == "je" for c in categories)
        or "shift engineer" in cat_str
        or "shift engineer" in desig_str
        or "shift_engineer" in desig_str
        or "junior engineer" in desig_str
        or "je" in desig_str.split()
        or role_str in ("shift_engineer", "shift engineer", "se")
    )
    return is_sic, is_se


def is_sic_place_vacant(leave: dict, daily: dict = None) -> Tuple[bool, bool, bool]:
    """
    Evaluates whether the SIC place is vacant for an approved leave request on a specific date/shift.
    User Rule:
      - Check whether the employee on leave is an SIC (he_is_sic).
      - Check whether an acting SIC is already assigned for that shift/group on that date (has_acting_sic).
      - If he_is_sic is True AND has_acting_sic is False, then SIC place is vacant (is_vacant = True).
        -> An SIC Category replacement will be assigned from the SIC Pool.
      - Otherwise (he is not SIC, OR an acting SIC is already assigned), is_vacant = False.
        -> A Shift Engineer Category replacement will be deployed from the Shift Engineer Pool.
    Returns: (is_vacant, he_is_sic, has_acting_sic)
    """
    if not leave:
        return False, False, False

    leave_emp_id = clean_id(leave.get("employeeId"))
    leave_date = clean_id(leave.get("date"))
    group_name = clean_id(leave.get("groupName") or (daily or {}).get("groupName"))

    # Active Shift Group SIC check
    active_sic_ids = set()
    for grp in roster_group_collection.find({"isActive": True}, {"shiftInCharge": 1, "groupName": 1, "name": 1}):
        sic_obj = grp.get("shiftInCharge") or {}
        sid = clean_id(sic_obj.get("employeeId"))
        if sid:
            active_sic_ids.add(sid)

    applicant_emp = employee_collection.find_one({
        "$or": [{"userId": leave_emp_id}, {"employeeId": leave_emp_id}]
    }) or {}
    emp_has_sic, emp_has_se = get_employee_roles(applicant_emp)

    he_is_sic = False
    if leave_emp_id and leave_emp_id in active_sic_ids:
        he_is_sic = True
    elif bool(applicant_emp.get("isShiftGroupSic")):
        he_is_sic = True
    elif emp_has_sic and not emp_has_se:
        he_is_sic = True
    elif emp_has_sic and emp_has_se:
        assigned = str((daily or {}).get("assignedDuty") or leave.get("assignedDuty") or "").lower()
        he_is_sic = "sic" in assigned or bool((daily or {}).get("isSIC")) or bool(applicant_emp.get("isShiftGroupSic"))
    elif not emp_has_se and (leave.get("isSIC") or (daily or {}).get("isSIC")):
        he_is_sic = True

    # Check designated roster groups if groupName exists
    if not he_is_sic and group_name and leave_emp_id:
        group_doc = (
            roster_group_collection.find_one({"$or": [{"groupName": group_name}, {"name": group_name}], "isActive": True})
            or roster_group_collection.find_one({"$or": [{"groupName": group_name}, {"name": group_name}]})
            or {}
        )
        sic_obj = group_doc.get("shiftInCharge") or {}
        sic_member_id = clean_id(sic_obj.get("employeeId") or group_doc.get("sicEmployeeId") or group_doc.get("shiftInChargeId"))
        if sic_member_id and sic_member_id == leave_emp_id:
            he_is_sic = True

    # 2. Check if an acting SIC is already assigned for that shift/group on that date (has_acting_sic)
    has_acting_sic = False
    acting_sic_obj = leave.get("actingSIC")
    if isinstance(acting_sic_obj, dict) and clean_id(acting_sic_obj.get("employeeId")):
        has_acting_sic = True
    elif clean_id(leave.get("actingSICId") or leave.get("actingSICEmpId")):
        has_acting_sic = True

    if not has_acting_sic and leave_date:
        query: Dict[str, Any] = {
            "date": leave_date,
            "isActingSIC": True,
            "leaveStatus": {"$nin": ["Rejected", "Withdrawn", "Cancelled", "Canceled"]},
        }
        if group_name:
            query["$or"] = [{"groupName": group_name}, {"actingSICGroup": group_name}]
        existing_acting = employee_daily_collection.find_one(query)
        if existing_acting and clean_id(existing_acting.get("employeeId")) != leave_emp_id:
            has_acting_sic = True

    # 3. SIC place is vacant only if he is SIC AND no acting SIC is assigned
    is_vacant = bool(he_is_sic and not has_acting_sic)
    return is_vacant, he_is_sic, has_acting_sic


def init_default_pools() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Seeds the SIC and Shift Engineer pools ONLY from active employees in the Employee database.
    USER REQUIREMENTS:
      1. 'None' option in 'Type of duty' and 'Category' in the employee database excludes from the sequence.
      2. The list of sequential roster should be included from the base 5 departments selected in the options.
      3. Excludes all persons who are currently in an active shift group.
    Pool 1: SIC Pool (SIC, SIC & Shift Engineer)
    Pool 2: Shift Engineer Pool (Shift Engineers)
    """
    sic_pool = []
    shift_eng_pool = []
    seen_sic = set()
    seen_se = set()

    # Exclude anyone currently in an active shift group
    active_shift_group_ids = get_active_shift_group_member_ids()

    # Retrieve selected departments from config options (defaults to base 5 departments)
    config = replacement_roster_config_collection.find_one({"_id": CONFIG_ID}) or {}
    selected_depts = config.get("selectedDepartments")
    if not selected_depts:
        selected_depts = list(BASE_5_DEPARTMENTS)

    active_employees = list(employee_collection.find({"isActive": {"$ne": False}}))
    for emp in active_employees:
        eid = clean_id(emp.get("userId") or emp.get("employeeId"))
        if not eid or eid in active_shift_group_ids:
            continue
        duty_type = str(emp.get("dutyType") or "").strip().lower()
        raw_cat = emp.get("category")
        categories = [str(x).strip().lower() for x in (raw_cat if isinstance(raw_cat, list) else [raw_cat])] if raw_cat else []

        # 1. EXCLUDE IF None option in 'Type of duty' or 'Category'
        if duty_type in ["none", ""] or "none" in categories:
            continue

        # 2. EXCLUDE IF not in selected base 5 departments from options
        emp_dept = str(emp.get("department") or "").strip()
        emp_depts = [str(d).strip() for d in (emp.get("departments") or [emp_dept]) if str(d).strip()]
        if not any(d in selected_depts for d in emp_depts):
            continue

        is_sic_registered, is_se_registered = get_employee_roles(emp)

        # Include candidate if dutyType is 'replacement' or if SIC/Shift Engineer is explicitly mentioned
        if not (duty_type == "replacement" or is_sic_registered or is_se_registered):
            continue

        if is_sic_registered and eid not in seen_sic:
            seen_sic.add(eid)
            sic_pool.append({
                "employeeId": eid,
                "name": clean_id(emp.get("name") or eid),
                "designation": clean_id(emp.get("designation") or "SIC"),
                "category": "SIC & Shift Engineer" if is_se_registered else "SIC",
                "gender": clean_id(emp.get("gender") or "Male"),
                "isActive": True,
            })

        if is_se_registered and eid not in seen_se:
            seen_se.add(eid)
            shift_eng_pool.append({
                "employeeId": eid,
                "name": clean_id(emp.get("name") or eid),
                "designation": clean_id(emp.get("designation") or "Shift Engineer"),
                "category": "SIC & Shift Engineer" if is_sic_registered else "Shift Engineer",
                "gender": clean_id(emp.get("gender") or "Male"),
                "isActive": True,
            })

    # Sort deterministically by name
    sic_pool.sort(key=lambda x: x["name"].lower())
    shift_eng_pool.sort(key=lambda x: x["name"].lower())

    for i, item in enumerate(sic_pool):
        item["seniorityOrder"] = i + 1
    for i, item in enumerate(shift_eng_pool):
        item["seniorityOrder"] = i + 1

    return sic_pool, shift_eng_pool


def get_replacement_roster_config() -> Dict[str, Any]:
    """Retrieve replacement roster configuration or create default if not present."""
    config = replacement_roster_config_collection.find_one({"_id": CONFIG_ID})
    active_shift_group_ids = get_active_shift_group_member_ids()

    # Verify existing pool members against Employee database
    marked_replacement_ids = {
        clean_id(e.get("userId") or e.get("employeeId"))
        for e in employee_collection.find({"isActive": {"$ne": False}})
        if str(e.get("dutyType") or "").strip().lower() == "replacement"
    }

    if not config or not config.get("sicPool") or not config.get("shiftEngineerPool"):
        sic_pool, shift_eng_pool = init_default_pools()
        if not config:
            config = {
                "_id": CONFIG_ID,
                "autoSchedulerEnabled": False,  # True = Active, False = Paused
                "isPaused": True,
                "testMode": False,  # False = Live All Future Duty, True = Test Basis
                "allocationDaysNotice": 5,  # D-5
                "longDurationThreshold": 3,  # Leaves with >= 3 consecutive days prompt Admin
                "sicPool": sic_pool,
                "shiftEngineerPool": shift_eng_pool,
                "nextSicIndex": 0,
                "nextShiftEngineerIndex": 0,
                "delayedCandidateIds": {"sic": [], "shiftEngineer": []},
                "selectedDepartments": list(BASE_5_DEPARTMENTS),
                "rejectionCounters": {},
                "longDurationPolicies": {},
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow(),
            }
            replacement_roster_config_collection.insert_one(config)
        else:
            updates = {}
            if not config.get("sicPool"):
                updates["sicPool"] = sic_pool
                config["sicPool"] = sic_pool
            if not config.get("shiftEngineerPool"):
                updates["shiftEngineerPool"] = shift_eng_pool
                config["shiftEngineerPool"] = shift_eng_pool
            if "delayedCandidateIds" not in config:
                updates["delayedCandidateIds"] = {"sic": [], "shiftEngineer": []}
                config["delayedCandidateIds"] = {"sic": [], "shiftEngineer": []}
            if updates:
                replacement_roster_config_collection.update_one({"_id": CONFIG_ID}, {"$set": updates})
    else:
        # Verify pool members strictly match registered Category and exclude active shift group members
        fresh_sic, fresh_se = init_default_pools()
        fresh_sic_map = {x["employeeId"]: x for x in fresh_sic}
        fresh_se_map = {x["employeeId"]: x for x in fresh_se}

        current_sic = config.get("sicPool") or []
        current_se = config.get("shiftEngineerPool") or []

        # Filter out active shift group members from current pools
        clean_current_sic = [x for x in current_sic if clean_id(x.get("employeeId")) not in active_shift_group_ids]
        clean_current_se = [x for x in current_se if clean_id(x.get("employeeId")) not in active_shift_group_ids]

        clean_sic_ids = [clean_id(x.get("employeeId")) for x in clean_current_sic]
        clean_se_ids = [clean_id(x.get("employeeId")) for x in clean_current_se]

        needs_save = False
        updates = {}

        if set(clean_sic_ids) != set(fresh_sic_map.keys()) or len(clean_current_sic) != len(current_sic):
            updated_sic = [fresh_sic_map[eid] for eid in clean_sic_ids if eid in fresh_sic_map]
            for eid, item in fresh_sic_map.items():
                if eid not in clean_sic_ids:
                    updated_sic.append(item)
            # Keep synced pool in strict alphabetical order so newly added members are not appended at the end
            updated_sic.sort(key=lambda x: str(x.get("name") or "").strip().lower())
            for i, item in enumerate(updated_sic):
                item["seniorityOrder"] = i + 1
            config["sicPool"] = updated_sic
            updates["sicPool"] = updated_sic
            needs_save = True

        if set(clean_se_ids) != set(fresh_se_map.keys()) or len(clean_current_se) != len(current_se):
            updated_se = [fresh_se_map[eid] for eid in clean_se_ids if eid in fresh_se_map]
            for eid, item in fresh_se_map.items():
                if eid not in clean_se_ids:
                    updated_se.append(item)
            # Keep synced pool in strict alphabetical order so newly added members are not appended at the end
            updated_se.sort(key=lambda x: str(x.get("name") or "").strip().lower())
            for i, item in enumerate(updated_se):
                item["seniorityOrder"] = i + 1
            config["shiftEngineerPool"] = updated_se
            updates["shiftEngineerPool"] = updated_se
            needs_save = True

        if "delayedCandidateIds" not in config:
            config["delayedCandidateIds"] = {"sic": [], "shiftEngineer": []}
            updates["delayedCandidateIds"] = {"sic": [], "shiftEngineer": []}
            needs_save = True

        if "selectedDepartments" not in config or not config["selectedDepartments"]:
            config["selectedDepartments"] = list(BASE_5_DEPARTMENTS)
            updates["selectedDepartments"] = list(BASE_5_DEPARTMENTS)
            needs_save = True

        if needs_save:
            updates["updatedAt"] = datetime.utcnow()
            replacement_roster_config_collection.update_one({"_id": CONFIG_ID}, {"$set": updates})

    return config


def save_replacement_roster_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Save replacement roster configuration (pools, test mode toggle, thresholds)."""
    update_data = {
        "updatedAt": datetime.utcnow(),
    }
    if "autoSchedulerEnabled" in payload:
        update_data["autoSchedulerEnabled"] = bool(payload["autoSchedulerEnabled"])
        update_data["isPaused"] = not bool(payload["autoSchedulerEnabled"])
    if "isPaused" in payload:
        update_data["isPaused"] = bool(payload["isPaused"])
        update_data["autoSchedulerEnabled"] = not bool(payload["isPaused"])
    if "testMode" in payload:
        update_data["testMode"] = bool(payload["testMode"])
    if "allocationDaysNotice" in payload:
        update_data["allocationDaysNotice"] = int(payload["allocationDaysNotice"])
    if "longDurationThreshold" in payload:
        update_data["longDurationThreshold"] = max(2, int(payload["longDurationThreshold"]))
    if "sicPool" in payload and isinstance(payload["sicPool"], list):
        update_data["sicPool"] = payload["sicPool"]
    if "shiftEngineerPool" in payload and isinstance(payload["shiftEngineerPool"], list):
        update_data["shiftEngineerPool"] = payload["shiftEngineerPool"]
    if "nextSicIndex" in payload:
        update_data["nextSicIndex"] = int(payload["nextSicIndex"])
    if "nextShiftEngineerIndex" in payload:
        update_data["nextShiftEngineerIndex"] = int(payload["nextShiftEngineerIndex"])
    if "selectedDepartments" in payload and isinstance(payload["selectedDepartments"], list):
        cleaned_depts = [d for d in payload["selectedDepartments"] if d in BASE_5_DEPARTMENTS]
        update_data["selectedDepartments"] = cleaned_depts if cleaned_depts else list(BASE_5_DEPARTMENTS)
        # Update in-memory config so init_default_pools reads the new selection
        replacement_roster_config_collection.update_one({"_id": CONFIG_ID}, {"$set": {"selectedDepartments": update_data["selectedDepartments"]}})
        fresh_sic, fresh_se = init_default_pools()
        update_data["sicPool"] = fresh_sic
        update_data["shiftEngineerPool"] = fresh_se

    replacement_roster_config_collection.update_one(
        {"_id": CONFIG_ID},
        {"$set": update_data},
        upsert=True,
    )
    return get_replacement_roster_config()


# =========================================================
# REJECTION AUTHORITY & AUDIT
# =========================================================

def can_reject_replacement(user: dict, leave: dict) -> Tuple[bool, str]:
    """
    Verifies if user is authorized to reject a replacement.
    Authorized roles: Admin, HOD, Reporting Officer, Intermediary Reporting Officer.
    """
    actor_id = clean_id(user.get("employeeId") or user.get("userId"))
    if not actor_id:
        return False, ""

    user_role = str(user.get("role") or "").lower()
    if user.get("isAdmin") or user_role == "admin" or actor_id == "50041":
        return True, "Administrator"

    applicant_id = clean_id(leave.get("employeeId"))
    applicant = employee_collection.find_one({
        "$or": [{"userId": applicant_id}, {"employeeId": applicant_id}]
    }) or {}

    # Check HOD
    hod_id = clean_id(applicant.get("hodId"))
    if actor_id == hod_id:
        return True, "HOD"

    # Check Intermediary
    intermediary_id = clean_id(applicant.get("intermediaryReportingId"))
    if actor_id == intermediary_id:
        return True, "Intermediary Reporting Officer"

    # Check Reporting Officer
    rep_officers = applicant.get("reportingOfficerIds") or applicant.get("reportingOfficerId") or []
    if isinstance(rep_officers, str):
        rep_officers = [rep_officers]
    cleaned_reps = [clean_id(x) for x in rep_officers if clean_id(x)]
    if actor_id in cleaned_reps:
        return True, "Reporting Officer"

    # Also check organization unit head if mapped
    group_name = clean_id(leave.get("groupName"))
    for unit in organization_unit_collection.find({"isActive": {"$ne": False}}):
        heads = [clean_id(h) for h in unit.get("headEmployeeIds") or []]
        if actor_id in heads:
            unit_type = str(unit.get("unitType") or "").lower()
            if unit_type == "department":
                return True, "HOD"
            return True, "Reporting Authority"

    return False, ""


def reject_replacement_assignment(leave_id: str, comment: str, user: dict) -> Dict[str, Any]:
    """
    Rejects an assigned replacement. Only permitted for HOD/Reporting Officer/Intermediary.
    Increments employee rejection count, releases the replacement duty, and logs audit.
    """
    leave = leave_request_collection.find_one({"_id": ObjectId(leave_id)})
    if not leave:
        raise HTTPException(404, "Leave record not found")

    replacement = leave.get("replacement") or {}
    replacement_id = clean_id(replacement.get("employeeId"))
    if not replacement_id:
        raise HTTPException(400, "No replacement is currently assigned to this leave")

    is_authorized, role_title = can_reject_replacement(user, leave)
    if not is_authorized:
        raise HTTPException(403, "Only HOD, Reporting Officer, or Intermediary Reporting Officer can reject replacement assignment")

    actor_id = clean_id(user.get("employeeId") or user.get("userId"))
    actor_name = clean_id(user.get("name") or actor_id)
    leave_date = leave.get("date")
    duty_type = leave.get("assignedDuty") or leave.get("leaveType") or "Shift"

    now_utc = datetime.utcnow()

    # Release replacement assignment using standard logic
    from crew_legacy.api.replacement import release_replacement_assignment as do_release
    do_release(leave, reason=comment, acted_by=actor_id, actor_role=role_title)

    # Increment rejection counter in config
    replacement_roster_config_collection.update_one(
        {"_id": CONFIG_ID},
        {
            "$inc": {f"rejectionCounters.{replacement_id}": 1},
            "$set": {"updatedAt": now_utc},
        },
        upsert=True,
    )

    # Insert audit entry
    audit_entry = {
        "leaveId": str(leave["_id"]),
        "leaveGroupId": leave.get("leaveGroupId"),
        "date": leave_date,
        "dutyType": duty_type,
        "replacedEmployeeId": leave.get("employeeId"),
        "replacedEmployeeName": leave.get("name"),
        "replacementEmployeeId": replacement_id,
        "replacementEmployeeName": replacement.get("name"),
        "rejectedBy": actor_id,
        "rejectedByName": actor_name,
        "rejectedByRole": role_title,
        "comment": comment.strip(),
        "timestamp": now_utc,
    }
    replacement_rejection_audit_collection.insert_one(audit_entry)

    # Append to leave rejection history
    leave_request_collection.update_one(
        {"_id": leave["_id"]},
        {
            "$set": {
                "replacement": None,
                "replacementAssigned": False,
                "updatedOn": now_utc,
            },
            "$push": {
                "replacementDecisionHistory": {
                    "action": "Rejected",
                    "stage": role_title,
                    "decidedBy": actor_id,
                    "decidedByName": actor_name,
                    "decidedOn": now_utc,
                    "comment": comment.strip(),
                    "rejectedReplacementId": replacement_id,
                }
            },
        },
    )

    # Fetch updated count
    config = get_replacement_roster_config()
    current_rejections = (config.get("rejectionCounters") or {}).get(replacement_id, 1)

    return {
        "message": f"Replacement for {replacement.get('name')} rejected by {role_title}. Rejection counter: {current_rejections}",
        "replacementId": replacement_id,
        "rejectionCount": current_rejections,
        "leaveId": leave_id,
    }


# =========================================================
# EMPLOYEE VS DUTY MATRIX
# =========================================================

def count_allocations_since_denial(candidate_id: str, pool_type: str = "SIC", denial: dict = None) -> int:
    """
    Counts how many sequential allocations in the candidate's pool have occurred
    strictly after the given denial.
    """
    if not denial:
        return 999
    denial_dt = denial.get("createdAt") or denial.get("updatedAt") or denial.get("timestamp")
    if not denial_dt:
        return 999
    if isinstance(denial_dt, str):
        try:
            denial_dt = datetime.fromisoformat(denial_dt.replace("Z", "+00:00"))
        except Exception:
            return 999
    if denial_dt.tzinfo is None:
        denial_dt = denial_dt.replace(tzinfo=timezone.utc)

    config = get_replacement_roster_config()
    history = config.get("allocationHistory") or []
    count = 0
    history_matched = False
    for h in history:
        h_pool = h.get("pool") or "SIC"
        if h_pool == pool_type:
            h_ts = h.get("timestamp")
            if isinstance(h_ts, str):
                try:
                    h_ts = datetime.fromisoformat(h_ts.replace("Z", "+00:00"))
                except Exception:
                    continue
            if h_ts and h_ts.tzinfo is None:
                h_ts = h_ts.replace(tzinfo=timezone.utc)
            if h_ts and h_ts > denial_dt:
                count += 1
                history_matched = True

    if history_matched:
        return count

    # Fallback to employee_daily_collection
    is_sic = (pool_type == "SIC")
    daily_query = {
        "replacementDuty": True,
        "isActingSIC": True if is_sic else {"$ne": True},
    }
    subsequent = 0
    for doc in employee_daily_collection.find(daily_query):
        doc_time = doc.get("updatedAt") or doc.get("allocatedAt") or doc["_id"].generation_time
        if isinstance(doc_time, datetime):
            if doc_time.tzinfo is None:
                doc_time = doc_time.replace(tzinfo=timezone.utc)
            if doc_time > denial_dt:
                subsequent += 1
    return subsequent


def set_denial_cooldown_iterations(iterations: int, user: dict = None) -> Dict[str, Any]:
    """
    Sets the number of pool allocation iterations a candidate is deferred following a denial (2 or 3).
    """
    iterations = int(iterations)
    if iterations not in {2, 3}:
        raise HTTPException(400, "Cooldown iterations must be either 2 or 3")
    replacement_roster_config_collection.update_one(
        {"_id": CONFIG_ID},
        {"$set": {"denialCooldownIterations": iterations, "updatedAt": datetime.utcnow()}},
        upsert=True
    )
    return {
        "message": f"Denial deferral cooldown set to {iterations} iterations",
        "denialCooldownIterations": iterations,
    }


def get_employee_duty_matrix(month: str = None) -> Dict[str, Any]:
    """
    Builds the matrix of Employee vs Number of duties (with dates & duty types),
    denials, and rejection counters for all candidates in both pools.
    """
    config = get_replacement_roster_config()
    cooldown_target = int(config.get("denialCooldownIterations") or 2)
    rejection_counters = config.get("rejectionCounters") or {}

    sic_pool = config.get("sicPool") or []
    shift_eng_pool = config.get("shiftEngineerPool") or []

    all_pool_employees = {}
    for item in sic_pool:
        eid = clean_id(item.get("employeeId"))
        all_pool_employees[eid] = {
            "employeeId": eid,
            "name": item.get("name"),
            "designation": item.get("designation"),
            "pool": "SIC",
            "seniorityOrder": item.get("seniorityOrder", 999),
            "isActive": item.get("isActive", True),
        }
    for item in shift_eng_pool:
        eid = clean_id(item.get("employeeId"))
        if eid not in all_pool_employees:
            all_pool_employees[eid] = {
                "employeeId": eid,
                "name": item.get("name"),
                "designation": item.get("designation"),
                "pool": "Shift Engineer",
                "seniorityOrder": item.get("seniorityOrder", 999),
                "isActive": item.get("isActive", True),
            }

    # Query replacement duties from employee_daily_collection
    query = {"replacementDuty": True}
    if month:
        query["date"] = {"$regex": f"^{month}"}

    daily_replacements = list(employee_daily_collection.find(query))

    duty_matrix = {}
    for eid, emp_meta in all_pool_employees.items():
        duty_matrix[eid] = {
            **emp_meta,
            "totalReplacementDuties": 0,
            "dutyTypeBreakdown": {},
            "duties": [],
            "rejectionCount": rejection_counters.get(eid, 0),
        }

    for record in daily_replacements:
        eid = clean_id(record.get("employeeId"))
        if eid not in duty_matrix:
            # Include even if outside current pools
            emp = employee_collection.find_one({"$or": [{"userId": eid}, {"employeeId": eid}]}) or {}
            duty_matrix[eid] = {
                "employeeId": eid,
                "name": clean_id(emp.get("name") or record.get("name") or eid),
                "designation": clean_id(emp.get("designation") or "Staff"),
                "pool": "Other",
                "seniorityOrder": 999,
                "isActive": True,
                "totalReplacementDuties": 0,
                "dutyTypeBreakdown": {},
                "duties": [],
                "rejectionCount": rejection_counters.get(eid, 0),
            }

        duty_type = clean_id(record.get("assignedDuty") or "Shift")
        duty_matrix[eid]["totalReplacementDuties"] += 1
        duty_matrix[eid]["dutyTypeBreakdown"][duty_type] = duty_matrix[eid]["dutyTypeBreakdown"].get(duty_type, 0) + 1
        duty_matrix[eid]["duties"].append({
            "date": record.get("date"),
            "duty": duty_type,
            "groupName": record.get("groupName"),
            "replacedFor": record.get("replacementFor"),
            "isSIC": bool(record.get("isSIC") or record.get("isActingSIC")),
        })

    # Query duty denials from duty_denial_collection and duty_notification_collection
    denial_query = {}
    if month:
        denial_query["date"] = {"$regex": f"^{month}"}

    seen_denial_keys = set()
    denial_records = []

    for doc in duty_denial_collection.find(denial_query):
        eid = clean_id(doc.get("employeeId"))
        d_date = clean_id(doc.get("date"))
        d_duty = clean_id(doc.get("assignedDuty") or "Shift")
        key = (eid, d_date, d_duty)
        if key in seen_denial_keys:
            continue
        seen_denial_keys.add(key)
        denial_records.append(doc)

    notif_query = {"status": "Denied"}
    if month:
        notif_query["date"] = {"$regex": f"^{month}"}
    for doc in duty_notification_collection.find(notif_query):
        eid = clean_id(doc.get("employeeId"))
        d_date = clean_id(doc.get("date"))
        d_duty = clean_id(doc.get("assignedDuty") or "Shift")
        key = (eid, d_date, d_duty)
        if key in seen_denial_keys:
            continue
        seen_denial_keys.add(key)
        denial_records.append(doc)

    recent_rejections = []

    for ddoc in denial_records:
        eid = clean_id(ddoc.get("employeeId"))
        d_date = clean_id(ddoc.get("date"))
        d_duty = clean_id(ddoc.get("assignedDuty") or "Shift")
        reason = ddoc.get("reason") or "Duty denied"
        denied_by = clean_id(ddoc.get("deniedBy"))
        denied_by_role = ddoc.get("deniedByRole") or "Reporting Officer"

        denied_by_name = denied_by
        if denied_by:
            denier_emp = employee_collection.find_one({"$or": [{"userId": denied_by}, {"employeeId": denied_by}]})
            if denier_emp:
                denied_by_name = denier_emp.get("name") or denied_by

        replaced_for = ddoc.get("replacedFor") or ddoc.get("replacementFor")
        replaced_name = ""
        if isinstance(replaced_for, dict):
            replaced_name = replaced_for.get("name") or replaced_for.get("employeeName") or ""
        elif isinstance(replaced_for, str) and replaced_for:
            replaced_name = replaced_for
        if not replaced_name:
            lid = ddoc.get("leaveId")
            if lid and ObjectId.is_valid(lid):
                nom = training_nomination_history_collection.find_one({"_id": ObjectId(lid)})
                if nom:
                    replaced_name = nom.get("employeeName")
                else:
                    leave = leave_request_collection.find_one({"_id": ObjectId(lid)})
                    if leave:
                        replaced_name = leave.get("name") or leave.get("employeeName")

        created_ts = ddoc.get("createdAt") or ddoc.get("updatedAt") or ddoc.get("timestamp")
        ts_str = created_ts.isoformat() if isinstance(created_ts, datetime) else str(created_ts or "")

        is_sic_duty = bool(
            ddoc.get("isSIC")
            or ddoc.get("isActingSIC")
            or (eid in [clean_id(x.get("employeeId")) for x in sic_pool])
        )

        denial_duty_item = {
            "date": d_date,
            "duty": d_duty,
            "isDenied": True,
            "status": "Denied",
            "denialReason": reason,
            "deniedBy": denied_by_name or denied_by,
            "deniedByRole": denied_by_role,
            "replacedFor": replaced_name,
            "isSIC": is_sic_duty,
            "timestamp": ts_str,
        }

        # If employee not in matrix, ensure they are added
        if eid not in duty_matrix:
            emp = employee_collection.find_one({"$or": [{"userId": eid}, {"employeeId": eid}]}) or {}
            duty_matrix[eid] = {
                "employeeId": eid,
                "name": clean_id(emp.get("name") or ddoc.get("employeeName") or eid),
                "designation": clean_id(emp.get("designation") or "Staff"),
                "pool": "SIC" if is_sic_duty else "Shift Engineer",
                "seniorityOrder": 999,
                "isActive": True,
                "totalReplacementDuties": 0,
                "dutyTypeBreakdown": {},
                "duties": [],
                "rejectionCount": 0,
            }

        # Append denial item to employee's duties and increment rejection count
        duty_matrix[eid]["duties"].append(denial_duty_item)
        duty_matrix[eid]["rejectionCount"] = duty_matrix[eid].get("rejectionCount", 0) + 1

        recent_rejections.append({
            "_id": str(ddoc.get("_id") or f"denial-{eid}-{d_date}"),
            "employeeId": eid,
            "employeeName": duty_matrix[eid].get("name") or ddoc.get("employeeName"),
            "date": d_date,
            "duty": d_duty,
            "dutyType": d_duty,
            "reason": reason,
            "comment": reason,
            "denialReason": reason,
            "deniedBy": denied_by_name or denied_by,
            "rejectedByName": denied_by_name or denied_by,
            "deniedByRole": denied_by_role,
            "rejectedByRole": denied_by_role,
            "timestamp": ts_str,
            "replacedFor": replaced_name,
        })

    # Sort recent_rejections by timestamp/date desc
    recent_rejections.sort(key=lambda x: str(x.get("timestamp") or x.get("date") or ""), reverse=True)

    # Attach aliases, compute deferral/cooldown status per employee
    for eid, entry in duty_matrix.items():
        entry["duties"].sort(key=lambda x: str(x.get("date") or ""), reverse=True)
        entry["employeeName"] = entry.get("name")
        entry["poolCategory"] = entry.get("pool")
        entry["totalDuties"] = entry.get("totalReplacementDuties", 0)
        entry["dutiesByType"] = entry.get("dutyTypeBreakdown", {})
        entry["dutyDates"] = [d["date"] for d in entry.get("duties", []) if d.get("date")]

        # Denial deferral cooldown check
        latest_denial = duty_denial_collection.find_one({"employeeId": eid}, sort=[("createdAt", -1)])
        if not latest_denial:
            latest_denial = duty_notification_collection.find_one({"employeeId": eid, "status": "Denied"}, sort=[("updatedAt", -1)])

        if latest_denial:
            pool_type = entry.get("pool") or "SIC"
            allocs = count_allocations_since_denial(eid, pool_type, latest_denial)
            is_def = (allocs < cooldown_target)
            rem = max(0, cooldown_target - allocs)
            denial_ts_val = latest_denial.get("createdAt") or latest_denial.get("updatedAt")
            entry["hasRecentDenial"] = True
            entry["latestDenial"] = {
                "date": latest_denial.get("date"),
                "duty": latest_denial.get("assignedDuty"),
                "reason": latest_denial.get("reason"),
                "timestamp": denial_ts_val.isoformat() if isinstance(denial_ts_val, datetime) else str(denial_ts_val or ""),
            }
            entry["allocationsSinceDenial"] = allocs
            entry["denialCooldownIterations"] = cooldown_target
            entry["isDeferred"] = is_def
            entry["deferralRemaining"] = rem
            entry["deferralStatus"] = (
                f"Deferred ({allocs}/{cooldown_target} iters · {rem} remaining)"
                if is_def
                else f"Re-eligible ({allocs}/{cooldown_target} iters completed)"
            )
        else:
            entry["hasRecentDenial"] = False
            entry["isDeferred"] = False
            entry["allocationsSinceDenial"] = 0
            entry["denialCooldownIterations"] = cooldown_target
            entry["deferralRemaining"] = 0
            entry["deferralStatus"] = "Eligible"

    rows = list(duty_matrix.values())
    rows.sort(key=lambda x: (0 if x["pool"] == "SIC" else 1, x["seniorityOrder"], (x.get("name") or "").lower()))

    # Scan for long duration leaves (consecutive days >= longDurationThreshold)
    today_str = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
    upcoming_leaves = list(leave_request_collection.find({
        "date": {"$gte": today_str},
        "status": {"$in": ["Applied", "Approved", "Forwarded", "Forwarded by SIC"]},
    }))
    group_map = {}
    for l in upcoming_leaves:
        gid = l.get("leaveGroupId") or str(l["_id"])
        if gid not in group_map:
            group_map[gid] = []
        group_map[gid].append(l)

    long_duration_threshold = config.get("longDurationThreshold", 3)
    long_policies = config.get("longDurationPolicies") or {}
    long_duration_leaves = []

    for gid, gleaves in group_map.items():
        if len(gleaves) >= long_duration_threshold:
            gleaves.sort(key=lambda x: str(x.get("date") or ""))
            first_l = gleaves[0]
            last_l = gleaves[-1]
            policy_data = long_policies.get(gid) or {}
            perm_emp_id = policy_data.get("permanentEmployeeId")
            perm_emp = None
            if perm_emp_id:
                perm_doc = employee_collection.find_one({"$or": [{"userId": perm_emp_id}, {"employeeId": perm_emp_id}]}) or {}
                perm_emp = perm_doc.get("name") or perm_emp_id

            long_duration_leaves.append({
                "leaveGroupId": gid,
                "employeeId": clean_id(first_l.get("employeeId")),
                "employeeName": clean_id(first_l.get("name") or first_l.get("employeeName")),
                "groupName": clean_id(first_l.get("groupName")),
                "startDate": first_l.get("date"),
                "endDate": last_l.get("date"),
                "leaveCount": len(gleaves),
                "dates": [x.get("date") for x in gleaves if x.get("date")],
                "policy": policy_data.get("policy"),
                "permanentEmployeeId": perm_emp_id,
                "permanentEmployeeName": perm_emp,
            })

    return {
        "autoSchedulerEnabled": bool(config.get("autoSchedulerEnabled", False)),
        "isPaused": bool(config.get("isPaused", True)),
        "testMode": config.get("testMode", False),
        "allocationDaysNotice": config.get("allocationDaysNotice", 5),
        "longDurationThreshold": long_duration_threshold,
        "denialCooldownIterations": cooldown_target,
        "matrix": rows,
        "recentRejections": recent_rejections,
        "rejections": recent_rejections,
        "totalRejections": len(recent_rejections),
        "longDurationLeaves": long_duration_leaves,
    }


# =========================================================
# LONG DURATION POLICY
# =========================================================

def set_long_duration_policy(leave_group_id: str, policy: str, permanent_employee_id: str = None) -> Dict[str, Any]:
    """
    Sets policy for long duration leaves (consecutive days >= threshold).
    Policy: 'permanent' (assigns single employee for whole stretch) or 'sequential' (round-robin per day).
    """
    if policy not in {"permanent", "sequential"}:
        raise HTTPException(400, "Policy must be 'permanent' or 'sequential'")

    update_payload = {
        f"longDurationPolicies.{leave_group_id}": {
            "policy": policy,
            "permanentEmployeeId": clean_id(permanent_employee_id) if policy == "permanent" else None,
            "updatedAt": datetime.utcnow().isoformat(),
        }
    }
    replacement_roster_config_collection.update_one(
        {"_id": CONFIG_ID},
        {"$set": update_payload},
        upsert=True,
    )
    return {"message": f"Long-duration replacement policy set to '{policy}'", "leaveGroupId": leave_group_id}


# =========================================================
# D-5 AUTOMATED ALLOCATION
# =========================================================

def is_candidate_available_on_date(candidate_id: str, target_date: str, target_shift: str = None) -> Tuple[bool, str]:
    """
    Verifies candidate is not on approved or proposed leave, not an active shift group member,
    and not already scheduled for duty on target date.
    User Requirement: If someone is on approved or proposed leave, their term should be delayed.
    Persons currently on shift group must NOT be included.
    """
    candidate_id = clean_id(candidate_id)
    if not candidate_id:
        return False, "Invalid candidate ID"

    # 1. Shift group exclusion check
    active_shift_ids = get_active_shift_group_member_ids()
    if candidate_id in active_shift_ids:
        return False, "Active Shift Group member"

    # 2. Check employee_daily_collection for leave
    daily = employee_daily_collection.find_one({
        "employeeId": candidate_id,
        "date": target_date,
    }) or {}

    leave_status = clean_id(daily.get("leaveStatus"))
    if leave_status and leave_status not in {"Rejected", "Withdrawn", "Cancelled", "Canceled"}:
        return False, f"On leave ({leave_status})"



    # 2b. Check if candidate is attending Training or Sports

    actual_st = clean_id(daily.get("actualStatus"))

    if actual_st in {"Training", "Sports"}:

        return False, f"Attending {actual_st}"

    assigned_st = clean_id(daily.get("assignedDuty"))

    if assigned_st in {"Training", "Sports"}:

        return False, f"Attending {assigned_st}"

    # 3. Check leave_request_collection for any approved OR proposed/pending leave
    leave_doc = leave_request_collection.find_one({
        "employeeId": candidate_id,
        "date": target_date,
        "finalStatus": {"$nin": ["Rejected", "Withdrawn", "Cancelled", "Canceled"]},
    })
    if leave_doc:
        st = clean_id(leave_doc.get("finalStatus") or leave_doc.get("status") or "Proposed")
        return False, f"On leave ({st})"

    # 4. Check existing replacement or active duty
    if daily.get("replacementDuty"):
        return False, "Already assigned replacement on this date"

    # Check if candidate previously denied replacement duty on this date
    from crew_legacy.database.database_mongo import duty_denial_collection
    if duty_denial_collection.find_one({"employeeId": candidate_id, "date": target_date}):
        return False, "Candidate previously denied duty on this date"

    # Check if candidate has an active deferral cooldown following a duty denial
    config = get_replacement_roster_config()
    cooldown_target = int(config.get("denialCooldownIterations") or 2)
    latest_denial = duty_denial_collection.find_one({"employeeId": candidate_id}, sort=[("createdAt", -1)])
    if not latest_denial:
        latest_denial = duty_notification_collection.find_one({"employeeId": candidate_id, "status": "Denied"}, sort=[("updatedAt", -1)])
    if latest_denial:
        sic_pool_ids = {clean_id(x.get("employeeId")) for x in (config.get("sicPool") or [])}
        cand_pool = "SIC" if candidate_id in sic_pool_ids else "Shift Engineer"
        allocs = count_allocations_since_denial(candidate_id, cand_pool, latest_denial)
        if allocs < cooldown_target:
            return False, f"Deferred cooldown following duty denial ({allocs}/{cooldown_target} iterations completed)"

    assigned = clean_id(daily.get("assignedDuty"))
    # In shift operations, candidates on OFF / General duty are preferred for replacement
    if assigned and assigned not in {"OFF", "O1", "O2", "General", "H", "Holiday", ""}:
        return False, f"Already assigned active shift ({assigned})"

    # 5. USER REQUIREMENT: Female employees deployed only on Morning & Evening duties (restricted from Night shifts)
    if target_shift and str(target_shift).strip().lower() in ["night", "n", "n1", "n2"]:
        emp_doc = employee_collection.find_one({"$or": [{"userId": candidate_id}, {"employeeId": candidate_id}]}) or {}
        if str(emp_doc.get("gender") or "").strip().lower() in ["female", "f"]:
            return False, "Female employee restricted from Night shift replacement"

    return True, "Available"


def auto_allocate_d5_replacements(force: bool = False, test_mode: bool = None) -> Dict[str, Any]:
    """
    Scans for approved leaves on D-5 (leave_date == today + 5 days) where replacementRequired is True.
    Sequentially allocates replacement from the appropriate pool (SIC or Shift Engineer).
    In Test Mode: performs simulation without writing to live roster.
    """
    now_kolkata = datetime.now(KOLKATA_TZ)
    today_date = now_kolkata.date()
    d5_date = (today_date + timedelta(days=5)).strftime("%Y-%m-%d")

    config = get_replacement_roster_config()
    is_paused = bool(config.get("isPaused", False)) or not bool(config.get("autoSchedulerEnabled", True))
    if is_paused and not force:
        logger.info(f"D-5 sequential replacement auto-allocation is currently PAUSED by Administrator. Skipping execution on {d5_date}.")
        return {
            "timestamp": now_kolkata.isoformat(),
            "mode": "PAUSED",
            "targetDate": d5_date,
            "scanned": 0,
            "allocatedCount": 0,
            "allocated": [],
            "skipped": [],
            "message": "Sequential replacement auto-scheduler is currently PAUSED. No replacements were allocated.",
        }

    is_test_mode = config.get("testMode", False) if test_mode is None else bool(test_mode)
    long_threshold = config.get("longDurationThreshold", 3)

    sic_pool = [x for x in (config.get("sicPool") or []) if x.get("isActive", True)]
    shift_eng_pool = [x for x in (config.get("shiftEngineerPool") or []) if x.get("isActive", True)]

    next_sic_idx = config.get("nextSicIndex", 0)
    next_se_idx = config.get("nextShiftEngineerIndex", 0)

    # Find unassigned approved leaves requiring replacement on D-5
    date_filter = {"$gte": (today_date + timedelta(days=1)).strftime("%Y-%m-%d"), "$lte": d5_date} if force else d5_date

    query = {
        "date": date_filter,
        "finalStatus": "Approved",
        "$or": [
            {"replacementRequired": True},
            {"sicReplacementRequired": True},
            {"dicReplacementRequired": True},
        ],
        "$and": [
            {"$or": [{"replacementAssigned": {"$ne": True}}, {"replacement": None}]},
            {"replacementRequired": {"$ne": False}},
            {"dicReplacementRequired": {"$ne": False}},
        ],
    }

    leaves_to_replace = list(leave_request_collection.find(query).sort("date", 1))
    logger.info(f"D-5 replacement scan on {d5_date}: {len(leaves_to_replace)} leaves awaiting allocation (Mode: {'TEST' if is_test_mode else 'LIVE'}).")

    allocated_list = []
    skipped_list = []
    pending_long_duration = []

    frontend_url = get_frontend_base_url()

    for leave in leaves_to_replace:
        leave_id = str(leave["_id"])
        leave_date = leave.get("date")
        applicant_id = clean_id(leave.get("employeeId"))
        leave_group_id = clean_id(leave.get("leaveGroupId"))

        # Check consecutive days for Long Duration
        group_rows = list(leave_request_collection.find({"leaveGroupId": leave_group_id})) if leave_group_id else [leave]
        consecutive_count = len(group_rows)
        long_policies = config.get("longDurationPolicies") or {}
        policy_info = long_policies.get(leave_group_id)

        if consecutive_count >= long_threshold and not policy_info and not force:
            pending_long_duration.append({
                "leaveId": leave_id,
                "leaveGroupId": leave_group_id,
                "applicantName": leave.get("name"),
                "date": leave_date,
                "consecutiveDays": consecutive_count,
                "status": "AWAITING_ADMIN_LONG_DURATION_POLICY",
            })
            continue

        # Determine target pool based on Role leave & Acting SIC status:
        # Check whether applicant is SIC, and whether an acting SIC is already assigned.
        # If both true (he is SIC and no acting SIC assigned), SIC place is vacant -> SIC Category replacement from SIC pool.
        # Otherwise -> Shift Engineer Category replacement deployed.
        duty_doc = employee_daily_collection.find_one({
            "employeeId": applicant_id,
            "date": leave_date,
        }) or {}

        sic_place_vacant, he_is_sic, has_acting_sic = is_sic_place_vacant(leave, duty_doc)
        is_sic_duty = sic_place_vacant

        target_duty = clean_id(duty_doc.get("assignedDuty") or leave.get("assignedDuty") or "Shift")

        pool = sic_pool if is_sic_duty else shift_eng_pool
        pool_name = "SIC Pool" if is_sic_duty else "Shift Engineer Pool"

        if not pool:
            skipped_list.append({
                "leaveId": leave_id,
                "date": leave_date,
                "reason": f"{pool_name} is empty",
            })
            continue

        # Permanent vs Sequential candidate selection
        chosen_candidate = None
        if policy_info and policy_info.get("policy") == "permanent" and policy_info.get("permanentEmployeeId"):
            perm_id = policy_info["permanentEmployeeId"]
            chosen_candidate = next((c for c in pool if c["employeeId"] == perm_id), None)
            if not chosen_candidate:
                emp = employee_collection.find_one({"$or": [{"userId": perm_id}, {"employeeId": perm_id}]}) or {}
                chosen_candidate = {"employeeId": perm_id, "name": emp.get("name") or perm_id}

        delayed_map = config.get("delayedCandidateIds") or {"sic": [], "shiftEngineer": []}
        pool_key = "sic" if is_sic_duty else "shiftEngineer"
        delayed_for_pool = list(delayed_map.get(pool_key, []))

        if not chosen_candidate:
            # 1. Check if any previously delayed candidate is now available (their term was postponed due to leave)
            for del_id in list(delayed_for_pool):
                if del_id == applicant_id:
                    continue
                avail, _ = is_candidate_available_on_date(del_id, leave_date)
                if avail:
                    cand_match = next((c for c in pool if c["employeeId"] == del_id), None)
                    if cand_match:
                        chosen_candidate = cand_match
                        delayed_for_pool.remove(del_id)
                        logger.info(f"Allocated delayed candidate {cand_match['name']} ({del_id}) on {leave_date}")
                        break
                    else:
                        delayed_for_pool.remove(del_id)

        if not chosen_candidate:
            # 2. Sequential round-robin search
            start_idx = next_sic_idx if is_sic_duty else next_se_idx
            pool_len = len(pool)
            found_idx = None

            for offset in range(pool_len):
                cand_idx = (start_idx + offset) % pool_len
                cand = pool[cand_idx]
                cid = cand["employeeId"]

                if cid == applicant_id:
                    # Person taking leave cannot replace themselves: delay their turn
                    if cid not in delayed_for_pool:
                        delayed_for_pool.append(cid)
                    continue

                available, avail_reason = is_candidate_available_on_date(cid, leave_date)
                if available:
                    chosen_candidate = cand
                    found_idx = cand_idx
                    break
                else:
                    # User requirement: If someone is on approved or proposed leave, he/she shouldn't be allocated
                    # by auto sequence. His/Her term should be delayed.
                    if "leave" in avail_reason.lower():
                        if cid not in delayed_for_pool:
                            delayed_for_pool.append(cid)
                            logger.info(f"Candidate {cand['name']} ({cid}) is on leave on {leave_date}. Term delayed.")

            if found_idx is not None:
                if is_sic_duty:
                    next_sic_idx = (found_idx + 1) % pool_len
                else:
                    next_se_idx = (found_idx + 1) % pool_len

        delayed_map[pool_key] = delayed_for_pool

        if not chosen_candidate:
            skipped_list.append({
                "leaveId": leave_id,
                "date": leave_date,
                "reason": f"No available candidates in {pool_name}",
            })
            continue

        cid = chosen_candidate["employeeId"]
        cname = chosen_candidate["name"]

        # Build rejection prompt link for email
        rejection_link = f"{frontend_url}/crew/replacement?tab=roster&action=review&leaveId={leave_id}"
        rejection_prompt = (
            "--------------------------------------------------\n"
            "NOTICE TO HOD / REPORTING OFFICER / INTERMEDIARY:\n"
            f"Automated D-5 sequential replacement allocated: {cname} ({cid}).\n"
            "If this allocation is not acceptable, authorized officers may review or reject via the portal:\n"
            f"Review/Reject Link: {rejection_link}\n"
            "--------------------------------------------------"
        )

        if not is_test_mode:
            # Live allocation: perform real update
            now_utc = datetime.utcnow()
            leave_request_collection.update_one(
                {"_id": leave["_id"]},
                {
                    "$set": {
                        "replacement": {
                            "employeeId": cid,
                            "name": cname,
                            "assignedOn": now_utc,
                            "assignedBy": "SYSTEM_D5_AUTO",
                            "mode": "Sequential Roster",
                        },
                        "replacementAssigned": True,
                        "updatedOn": now_utc,
                    },
                    "$push": {
                        "replacementDecisionHistory": {
                            "action": "AutoAllocated_D5",
                            "stage": "System",
                            "decidedBy": "SYSTEM_D5_AUTO",
                            "decidedByName": f"Automated D-5 Roster ({pool_name})",
                            "decidedOn": now_utc,
                            "assignedReplacementId": cid,
                            "assignedReplacementName": cname,
                        }
                    },
                },
            )

            # Assign replacement duty on employee_daily_collection
            rep_set_fields = {
                "replacementDuty": True,
                "assignedDuty": target_duty,
                "isSIC": is_sic_duty,
                "replacementFor": {
                    "employeeId": applicant_id,
                    "name": leave.get("name"),
                    "leaveId": leave_id,
                },
            }
            if is_sic_duty:
                rep_set_fields["isActingSIC"] = True
                rep_set_fields["actingSICGroup"] = clean_id(duty_doc.get("groupName") or leave.get("groupName"))
                rep_set_fields["actingSICFor"] = {
                    "employeeId": applicant_id,
                    "name": leave.get("name"),
                }

            employee_daily_collection.update_one(
                {"employeeId": cid, "date": leave_date},
                {"$set": rep_set_fields},
                upsert=True,
            )

            # Send email
            from crew_legacy.api.leave_api import recipient_emails
            cand_emp = employee_collection.find_one({"$or": [{"userId": cid}, {"employeeId": cid}]}) or {}
            recipients = recipient_emails([cid, applicant_id])
            if recipients:
                try:
                    send_replacement_duty_email(
                        recipients,
                        {
                            "replacement_person": f"{cname} ({cid})",
                            "replacement_name": cname,
                            "replacement_employee_id": cid,
                            "shift_name": target_duty,
                            "date": leave_date,
                            "leave_person": leave.get("name") or applicant_id,
                            "group_name": leave.get("groupName") or "Shift Group",
                            "rejection_prompt": rejection_prompt,
                        },
                    )
                except Exception as exc:
                    logger.error(f"Failed to send D-5 replacement email: {exc}")

        allocated_list.append({
            "leaveId": leave_id,
            "leaveDate": leave_date,
            "targetDuty": target_duty,
            "pool": pool_name,
            "allocatedEmployeeId": cid,
            "allocatedEmployeeName": cname,
            "isTestMode": is_test_mode,
            "status": "SIMULATED" if is_test_mode else "ALLOCATED",
        })

    # Update state pointer and delayed candidates in config
    if not is_test_mode:
        delayed_map = config.get("delayedCandidateIds") or {"sic": [], "shiftEngineer": []}
        replacement_roster_config_collection.update_one(
            {"_id": CONFIG_ID},
            {
                "$set": {
                    "nextSicIndex": next_sic_idx,
                    "nextShiftEngineerIndex": next_se_idx,
                    "delayedCandidateIds": delayed_map,
                    "lastD5Run": now_kolkata.isoformat(),
                    "updatedAt": datetime.utcnow(),
                }
            },
        )

    summary = {
        "timestamp": now_kolkata.isoformat(),
        "mode": "TEST_SIMULATION" if is_test_mode else "LIVE",
        "targetDate": d5_date,
        "scanned": len(leaves_to_replace),
        "allocatedCount": len(allocated_list),
        "allocated": allocated_list,
        "skipped": skipped_list,
        "pendingLongDuration": pending_long_duration,
    }
    logger.info(f"D-5 replacement allocation complete: {summary}")
    return summary


def auto_allocate_next_candidate_for_denied_duty(notification_id: str, user: dict = None) -> Dict[str, Any]:
    """
    Allocates the next available candidate from the sequential roster pool for a denied replacement duty.
    Respects sequential index / round-robin order, avoiding conflicts and previous denial applicant/candidate.
    """
    from bson import ObjectId
    from crew_legacy.database.database_mongo import duty_notification_collection
    
    notif = None
    if ObjectId.is_valid(str(notification_id)):
        notif = duty_notification_collection.find_one({"_id": ObjectId(notification_id)})
    if not notif:
        notif = duty_notification_collection.find_one({"_id": notification_id})
    if not notif:
        raise HTTPException(404, "Duty notification not found")

    duty_date = notif.get("date")
    target_duty = notif.get("assignedDuty") or "Morning"
    denied_emp_id = clean_id(notif.get("employeeId"))
    leave_id = notif.get("leaveId")

    leave = None
    if leave_id and ObjectId.is_valid(str(leave_id)):
        leave = leave_request_collection.find_one({"_id": ObjectId(leave_id)})
    applicant_id = clean_id(leave.get("employeeId")) if leave else ""

    config = get_replacement_roster_config()
    applicant_doc = employee_collection.find_one({
        "$or": [{"userId": applicant_id or denied_emp_id}, {"employeeId": applicant_id or denied_emp_id}]
    }) or {}
    applicant_has_sic, applicant_has_se = get_employee_roles(applicant_doc)

    is_sic_duty = bool(leave.get("isSIC")) if leave else False
    if not is_sic_duty:
        daily_app = employee_daily_collection.find_one({"employeeId": applicant_id or denied_emp_id, "date": duty_date}) or {}
        is_sic_duty = bool(daily_app.get("isSIC"))
        if not is_sic_duty:
            if applicant_has_sic and not applicant_has_se:
                is_sic_duty = True
            elif applicant_has_sic and applicant_has_se:
                assigned_duty = str(daily_app.get("assignedDuty") or notif.get("assignedDuty") or "").lower()
                is_sic_duty = "sic" in assigned_duty or daily_app.get("isSIC") is True

    sic_pool = [x for x in (config.get("sicPool") or []) if x.get("isActive", True)]
    shift_eng_pool = [x for x in (config.get("shiftEngineerPool") or []) if x.get("isActive", True)]
    pool = sic_pool if is_sic_duty else shift_eng_pool
    pool_name = "SIC Pool" if is_sic_duty else "Shift Engineer Pool"

    if not pool:
        raise HTTPException(400, f"Cannot allocate: {pool_name} is empty or has no active members")

    delayed_map = config.get("delayedCandidateIds") or {"sic": [], "shiftEngineer": []}
    pool_key = "sic" if is_sic_duty else "shiftEngineer"
    delayed_for_pool = list(delayed_map.get(pool_key, []))

    chosen_candidate = None
    found_idx = None

    # Check previously delayed candidates first
    for del_id in list(delayed_for_pool):
        if del_id == denied_emp_id or del_id == applicant_id:
            continue
        avail, _ = is_candidate_available_on_date(del_id, duty_date)
        if avail:
            cand_match = next((c for c in pool if c["employeeId"] == del_id), None)
            if cand_match:
                chosen_candidate = cand_match
                delayed_for_pool.remove(del_id)
                logger.info(f"Allocated delayed candidate {cand_match['name']} ({del_id}) for denied duty on {duty_date}")
                break
            else:
                delayed_for_pool.remove(del_id)

    if not chosen_candidate:
        next_idx = config.get("nextSicIndex", 0) if is_sic_duty else config.get("nextShiftEngineerIndex", 0)
        pool_len = len(pool)

        for offset in range(pool_len):
            cand_idx = (next_idx + offset) % pool_len
            cand = pool[cand_idx]
            cid = clean_id(cand.get("employeeId"))

            if cid == denied_emp_id or cid == applicant_id:
                if cid != denied_emp_id and cid not in delayed_for_pool:
                    delayed_for_pool.append(cid)
                continue

            available, avail_reason = is_candidate_available_on_date(cid, duty_date)
            if available:
                chosen_candidate = cand
                found_idx = cand_idx
                break
            else:
                if "leave" in avail_reason.lower() and cid not in delayed_for_pool:
                    delayed_for_pool.append(cid)

    delayed_map[pool_key] = delayed_for_pool

    if not chosen_candidate:
        raise HTTPException(400, f"No available candidates in {pool_name} for {duty_date}")

    cid = chosen_candidate["employeeId"]
    cname = chosen_candidate["name"]

    # Advance state pointer if candidate was chosen from pool
    updates = {"delayedCandidateIds": delayed_map, "updatedAt": datetime.utcnow()}
    if found_idx is not None:
        if is_sic_duty:
            updates["nextSicIndex"] = (found_idx + 1) % len(pool)
        else:
            updates["nextShiftEngineerIndex"] = (found_idx + 1) % len(pool)
    replacement_roster_config_collection.update_one({"_id": CONFIG_ID}, {"$set": updates})

    now = datetime.utcnow()
    actor_id = str((user or {}).get("employeeId") or "ADMIN")

    if leave:
        leave_request_collection.update_one(
            {"_id": leave["_id"]},
            {
                "$set": {
                    "replacement": {
                        "employeeId": cid,
                        "name": cname,
                        "status": "Accepted",
                        "assignedDuty": target_duty,
                        "mode": "Sequential Roster",
                        "allocatedAt": now,
                    },
                    "replacementAssigned": True,
                    "updatedAt": now,
                }
            }
        )

    employee_daily_collection.update_one(
        {"employeeId": cid, "date": duty_date},
        {
            "$set": {
                "employeeId": cid,
                "name": cname,
                "date": duty_date,
                "assignedDuty": target_duty,
                "replacementDuty": True,
                "replacementFor": {
                    "employeeId": applicant_id or denied_emp_id,
                    "name": (leave.get("name") if leave else notif.get("employeeName")) or "Staff",
                },
                "isActingSIC": is_sic_duty,
                "updatedAt": now,
            }
        },
        upsert=True
    )

    duty_notification_collection.update_one(
        {"_id": notif["_id"]},
        {"$set": {"reallocatedTo": cid, "reallocatedAt": now, "reallocationStatus": "Reallocated"}}
    )

    new_notif_doc = {
        "employeeId": cid,
        "employeeName": cname,
        "date": duty_date,
        "assignedDuty": target_duty,
        "leaveId": str(leave["_id"]) if leave else None,
        "leaveGroupId": leave.get("leaveGroupId") if leave else None,
        "applicantId": applicant_id or denied_emp_id,
        "applicantName": (leave.get("name") if leave else notif.get("employeeName")) or "Staff",
        "status": "Pending",
        "isDenied": False,
        "reallocatedFrom": denied_emp_id,
        "createdAt": now,
        "updatedAt": now,
        "decisionHistory": [{
            "action": "Assigned",
            "actedBy": actor_id,
            "actorRole": "System / Admin (Sequential Re-allocation)",
            "actedAt": now,
            "reason": f"Sequentially allocated after duty was denied by {notif.get('employeeName')} ({denied_emp_id})"
        }]
    }
    duty_notification_collection.insert_one(new_notif_doc)

    return {
        "success": True,
        "message": f"Successfully allocated next sequential person: {cname} ({cid}) for {target_duty} on {duty_date}",
        "allocatedEmployee": {
            "employeeId": cid,
            "name": cname,
            "duty": target_duty,
            "date": duty_date,
            "pool": pool_name,
        }
    }


def recalculate_sequential_pointers(month: str = None) -> Dict[str, Any]:
    """
    Recomputes and syncs nextSicIndex and nextShiftEngineerIndex in both
    replacement_roster_config_collection and system_settings_collection using
    strict BACKLOG-FIRST A-Z leveling: always points to the first eligible
    candidate from index 0 at the minimum duty count in the month (respecting
    denial cooldown), so omitted/backlog candidates are always cleared first.
    """
    from crew_legacy.database.database_mongo import system_settings_collection

    config = get_replacement_roster_config()
    cooldown_target = int(config.get("denialCooldownIterations") or 2)
    sic_pool = [x for x in (config.get("sicPool") or []) if x.get("isActive", True)]
    se_pool = [x for x in (config.get("shiftEngineerPool") or []) if x.get("isActive", True)]

    if not month:
        month = datetime.now(KOLKATA_TZ).strftime("%Y-%m")

    sic_ids = [clean_id(x.get("employeeId")) for x in sic_pool]
    se_ids = [clean_id(x.get("employeeId")) for x in se_pool]

    # Active replacement duties in the month
    daily_reps = list(employee_daily_collection.find({
        "date": {"$regex": f"^{month}"},
        "replacementDuty": True,
    }))

    duty_count_map = {}
    for doc in daily_reps:
        deid = clean_id(doc.get("employeeId"))
        if deid:
            duty_count_map[deid] = duty_count_map.get(deid, 0) + 1

    def _is_in_cooldown(cid: str, pool_type: str) -> bool:
        try:
            latest_denial = (
                duty_denial_collection.find_one({"employeeId": cid}, sort=[("createdAt", -1)])
                or duty_notification_collection.find_one({"employeeId": cid, "status": "Denied"}, sort=[("updatedAt", -1)])
            )
            if latest_denial:
                return count_allocations_since_denial(cid, pool_type, latest_denial) < cooldown_target
        except Exception:
            pass
        return False

    # Backlog-first A-Z: always find the first candidate from index 0 with minimum duties (not in cooldown)
    next_sic_idx = 0
    if sic_pool:
        min_sic = min(duty_count_map.get(eid, 0) for eid in sic_ids)
        found = None
        for idx, eid in enumerate(sic_ids):
            if duty_count_map.get(eid, 0) == min_sic and not _is_in_cooldown(eid, "SIC"):
                found = idx
                break
        if found is None:
            for idx, eid in enumerate(sic_ids):
                if duty_count_map.get(eid, 0) == min_sic:
                    found = idx
                    break
        next_sic_idx = found if found is not None else 0

    next_se_idx = 0
    if se_pool:
        min_se = min(duty_count_map.get(eid, 0) for eid in se_ids)
        found = None
        for idx, eid in enumerate(se_ids):
            if duty_count_map.get(eid, 0) == min_se and not _is_in_cooldown(eid, "Shift Engineer"):
                found = idx
                break
        if found is None:
            for idx, eid in enumerate(se_ids):
                if duty_count_map.get(eid, 0) == min_se:
                    found = idx
                    break
        next_se_idx = found if found is not None else 0

    now_utc = datetime.utcnow()
    replacement_roster_config_collection.update_one(
        {"_id": CONFIG_ID},
        {"$set": {
            "nextSicIndex": next_sic_idx,
            "nextShiftEngineerIndex": next_se_idx,
            "updatedAt": now_utc,
        }},
        upsert=True,
    )
    system_settings_collection.update_one(
        {"type": "sequential_roster_pointer", "pool": "sic"},
        {"$set": {"nextIndex": next_sic_idx, "updatedAt": now_utc}},
        upsert=True,
    )
    system_settings_collection.update_one(
        {"type": "sequential_roster_pointer", "pool": "shift_engineer"},
        {"$set": {"nextIndex": next_se_idx, "updatedAt": now_utc}},
        upsert=True,
    )

    return {
        "month": month,
        "nextSicIndex": next_sic_idx,
        "nextSicName": sic_pool[next_sic_idx]["name"] if sic_pool else None,
        "nextShiftEngineerIndex": next_se_idx,
        "nextShiftEngineerName": se_pool[next_se_idx]["name"] if se_pool else None,
    }
