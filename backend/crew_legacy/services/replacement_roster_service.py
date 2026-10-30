import logging
import re
from datetime import datetime, date, timedelta
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


def get_frontend_base_url() -> str:
    return _runtime_env_value("FRONTEND_URL") or "http://localhost:3001"


# =========================================================
# CONFIGURATION & POOL INITIALIZATION
# =========================================================

def init_default_pools() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Seeds the SIC and Shift Engineer pools ONLY from active employees marked as Replacement in the Employee database.
    Pool 1: SIC Pool (SIC, SIC & Shift Engineer)
    Pool 2: Shift Engineer Pool (Shift Engineers)
    """
    sic_pool = []
    shift_eng_pool = []
    seen_sic = set()
    seen_se = set()

    # USER REQUIREMENT: Pool should include only persons having marked in the Employee database (dutyType == 'Replacement')
    active_employees = list(employee_collection.find({"isActive": {"$ne": False}}))
    for emp in active_employees:
        eid = clean_id(emp.get("userId") or emp.get("employeeId"))
        if not eid:
            continue
        duty_type = str(emp.get("dutyType") or "").strip().lower()
        if duty_type != "replacement":
            continue

        raw_cat = emp.get("category")
        cat = " ".join(raw_cat).lower() if isinstance(raw_cat, list) else str(raw_cat or "").lower()
        designation = str(emp.get("designation") or "").lower()

        is_sic_eligible = "sic" in cat or "in-charge" in designation or bool(emp.get("isIC")) or bool(emp.get("isSIC"))
        if is_sic_eligible and eid not in seen_sic:
            seen_sic.add(eid)
            sic_pool.append({
                "employeeId": eid,
                "name": clean_id(emp.get("name") or eid),
                "designation": clean_id(emp.get("designation") or "SIC"),
                "category": "SIC & Shift Engineer" if "engineer" in cat else "SIC",
                "isActive": True,
            })
        else:
            if eid not in seen_se and eid not in seen_sic:
                seen_se.add(eid)
                shift_eng_pool.append({
                    "employeeId": eid,
                    "name": clean_id(emp.get("name") or eid),
                    "designation": clean_id(emp.get("designation") or "Shift Engineer"),
                    "category": "Shift Engineer",
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
                "testMode": False,  # False = Live All Future Duty, True = Test Basis
                "allocationDaysNotice": 5,  # D-5
                "longDurationThreshold": 3,  # Leaves with >= 3 consecutive days prompt Admin
                "sicPool": sic_pool,
                "shiftEngineerPool": shift_eng_pool,
                "nextSicIndex": 0,
                "nextShiftEngineerIndex": 0,
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
            if updates:
                replacement_roster_config_collection.update_one({"_id": CONFIG_ID}, {"$set": updates})
    elif marked_replacement_ids:
        # Filter existing pools to strictly retain only those marked in Employee database
        cleaned_sic = [x for x in (config.get("sicPool") or []) if clean_id(x.get("employeeId")) in marked_replacement_ids]
        cleaned_se = [x for x in (config.get("shiftEngineerPool") or []) if clean_id(x.get("employeeId")) in marked_replacement_ids]
        if len(cleaned_sic) != len(config.get("sicPool") or []) or len(cleaned_se) != len(config.get("shiftEngineerPool") or []):
            config["sicPool"] = cleaned_sic
            config["shiftEngineerPool"] = cleaned_se
            replacement_roster_config_collection.update_one(
                {"_id": CONFIG_ID},
                {"$set": {"sicPool": cleaned_sic, "shiftEngineerPool": cleaned_se, "updatedAt": datetime.utcnow()}}
            )
    return config


def save_replacement_roster_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Save replacement roster configuration (pools, test mode toggle, thresholds)."""
    update_data = {
        "updatedAt": datetime.utcnow(),
    }
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

def get_employee_duty_matrix(month: str = None) -> Dict[str, Any]:
    """
    Builds the matrix of Employee vs Number of duties (with dates & duty types)
    and rejection counters for all candidates in both pools.
    """
    config = get_replacement_roster_config()
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
            "isSIC": bool(record.get("isSIC")),
        })

    # Sort duties by date desc and attach aliases for frontend
    for entry in duty_matrix.values():
        entry["duties"].sort(key=lambda x: str(x.get("date") or ""), reverse=True)
        entry["employeeName"] = entry.get("name")
        entry["poolCategory"] = entry.get("pool")
        entry["totalDuties"] = entry.get("totalReplacementDuties", 0)
        entry["dutiesByType"] = entry.get("dutyTypeBreakdown", {})
        entry["dutyDates"] = [d["date"] for d in entry.get("duties", []) if d.get("date")]

    rows = list(duty_matrix.values())
    rows.sort(key=lambda x: (0 if x["pool"] == "SIC" else 1, x["seniorityOrder"], (x.get("name") or "").lower()))

    # Rejection audit logs
    recent_rejections = list(
        replacement_rejection_audit_collection.find().sort("timestamp", -1).limit(50)
    )
    for r in recent_rejections:
        r["_id"] = str(r["_id"])
        if isinstance(r.get("timestamp"), datetime):
            r["timestamp"] = r["timestamp"].isoformat()

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
        "testMode": config.get("testMode", False),
        "allocationDaysNotice": config.get("allocationDaysNotice", 5),
        "longDurationThreshold": long_duration_threshold,
        "matrix": rows,
        "recentRejections": recent_rejections,
        "rejections": recent_rejections,
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

def is_candidate_available_on_date(candidate_id: str, target_date: str) -> Tuple[bool, str]:
    """Verifies candidate is not on leave or already scheduled for duty on target date."""
    daily = employee_daily_collection.find_one({
        "employeeId": candidate_id,
        "date": target_date,
    }) or {}

    leave_status = clean_id(daily.get("leaveStatus"))
    if leave_status and leave_status not in {"Rejected", "Withdrawn", "Cancelled", "Canceled"}:
        return False, f"On leave ({leave_status})"

    assigned = clean_id(daily.get("assignedDuty"))
    # In shift operations, candidates on OFF / General duty are preferred for replacement
    if daily.get("replacementDuty"):
        return False, "Already assigned replacement on this date"

    if assigned and assigned not in {"OFF", "O1", "O2", "General", "H", "Holiday", ""}:
        return False, f"Already assigned active shift ({assigned})"

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

        # Determine target pool: SIC duty vs Shift Engineer duty
        duty_doc = employee_daily_collection.find_one({
            "employeeId": applicant_id,
            "date": leave_date,
        }) or {}
        is_sic_duty = bool(duty_doc.get("isSIC") or leave.get("isSIC"))
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

        if not chosen_candidate:
            # Sequential round-robin search
            start_idx = next_sic_idx if is_sic_duty else next_se_idx
            pool_len = len(pool)
            found_idx = None

            for offset in range(pool_len):
                cand_idx = (start_idx + offset) % pool_len
                cand = pool[cand_idx]
                cid = cand["employeeId"]

                if cid == applicant_id:
                    continue

                available, avail_reason = is_candidate_available_on_date(cid, leave_date)
                if available:
                    chosen_candidate = cand
                    found_idx = cand_idx
                    break

            if found_idx is not None:
                if is_sic_duty:
                    next_sic_idx = (found_idx + 1) % pool_len
                else:
                    next_se_idx = (found_idx + 1) % pool_len

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
            employee_daily_collection.update_one(
                {"employeeId": cid, "date": leave_date},
                {
                    "$set": {
                        "replacementDuty": True,
                        "assignedDuty": target_duty,
                        "isSIC": is_sic_duty,
                        "replacementFor": {
                            "employeeId": applicant_id,
                            "name": leave.get("name"),
                            "leaveId": leave_id,
                        },
                    }
                },
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

    # Update state pointer in config
    if not is_test_mode:
        replacement_roster_config_collection.update_one(
            {"_id": CONFIG_ID},
            {
                "$set": {
                    "nextSicIndex": next_sic_idx,
                    "nextShiftEngineerIndex": next_se_idx,
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
    is_sic_duty = bool(leave.get("isSIC")) if leave else False
    if not is_sic_duty:
        daily_app = employee_daily_collection.find_one({"employeeId": applicant_id or denied_emp_id, "date": duty_date}) or {}
        is_sic_duty = bool(daily_app.get("isSIC"))

    sic_pool = [x for x in (config.get("sicPool") or []) if x.get("isActive", True)]
    shift_eng_pool = [x for x in (config.get("shiftEngineerPool") or []) if x.get("isActive", True)]
    pool = sic_pool if is_sic_duty else shift_eng_pool
    pool_name = "SIC Pool" if is_sic_duty else "Shift Engineer Pool"

    if not pool:
        raise HTTPException(400, f"Cannot allocate: {pool_name} is empty or has no active members")

    next_idx = config.get("nextSicIndex", 0) if is_sic_duty else config.get("nextShiftEngineerIndex", 0)
    pool_len = len(pool)

    chosen_candidate = None
    found_idx = None

    for offset in range(pool_len):
        cand_idx = (next_idx + offset) % pool_len
        cand = pool[cand_idx]
        cid = clean_id(cand.get("employeeId"))

        if cid == denied_emp_id or cid == applicant_id:
            continue

        available, _ = is_candidate_available_on_date(cid, duty_date)
        if available:
            chosen_candidate = cand
            found_idx = cand_idx
            break

    if not chosen_candidate or found_idx is None:
        raise HTTPException(400, f"No available candidates in {pool_name} for {duty_date}")

    cid = chosen_candidate["employeeId"]
    cname = chosen_candidate["name"]

    # Advance state pointer
    if is_sic_duty:
        replacement_roster_config_collection.update_one(
            {"_id": CONFIG_ID},
            {"$set": {"nextSicIndex": (found_idx + 1) % pool_len, "updatedAt": datetime.utcnow()}}
        )
    else:
        replacement_roster_config_collection.update_one(
            {"_id": CONFIG_ID},
            {"$set": {"nextShiftEngineerIndex": (found_idx + 1) % pool_len, "updatedAt": datetime.utcnow()}}
        )

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
