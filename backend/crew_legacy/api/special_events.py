"""Department-scoped special-event announcements and separately enabled leave blocks."""
from datetime import date, datetime, timedelta
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from crew_legacy.admin_logic.auth_utils import get_authenticated_user
from crew_legacy.database.database_mongo import (
    system_settings_collection,
    employee_collection,
    organization_unit_collection,
    employee_daily_collection,
    leave_request_collection,
    duty_switch_collection,
)
from crew_legacy.api.leave_api import is_admin, validate_block_dates, blocked_period_staffing, export_blocked_period_staffing

router = APIRouter()


def department_ids(employee):
    from crew_legacy.api.admin_api import resolve_employee_organization
    resolved = resolve_employee_organization(employee.get("manualFunctionIds", employee.get("functionIds")), str(employee.get("userId") or employee.get("employeeId") or ""))
    return set(str(value) for value in resolved.get("departmentIds", []))


def event_access(user):
    actor = str(user.get("employeeId") or "").strip()
    units = list(organization_unit_collection.find({"unitType": "department", "isActive": {"$ne": False}}))
    departments = [{"id": str(unit["_id"]), "name": unit.get("name", "Department")} for unit in units if is_admin(user) or actor in [str(value).strip() for value in unit.get("headEmployeeIds", [])]]
    return {"canManage": is_admin(user) or bool(departments), "allowAll": is_admin(user), "departments": departments}


def require_scope(user, scope):
    access = event_access(user)
    if not access["canManage"] or (not scope and not access["allowAll"]):
        raise HTTPException(403, "Only administrators or the department HOD may manage this event")
    if not set(scope).issubset({item["id"] for item in access["departments"]}):
        raise HTTPException(403, "Event scope must stay within your departments")


def event_document(event_id):
    try:
        object_id = ObjectId(event_id)
    except Exception:
        raise HTTPException(400, "Invalid event ID")
    item = system_settings_collection.find_one({"_id": object_id, "type": "leave_block"})
    if not item:
        raise HTTPException(404, "Special event not found")
    return item


@router.get("/access")
def get_access(user=Depends(get_authenticated_user)):
    return event_access(user)


@router.get("")
def list_events(user=Depends(get_authenticated_user)):
    access = event_access(user)
    employee = employee_collection.find_one({"userId": str(user.get("employeeId") or "")}) or {}
    own = department_ids(employee) if employee else set()
    managed = {item["id"] for item in access["departments"]}
    rows = []
    for item in system_settings_collection.find({"type": "leave_block", "active": True}).sort("startDate", 1):
        scope = set(item.get("departmentIds") or [])
        if not access["allowAll"] and scope and not scope.intersection(own | managed):
            continue
        rows.append({"id": str(item["_id"]), "title": item.get("title") or item.get("reason", "Special event"), "reason": item.get("reason", ""), "startDate": item["startDate"], "endDate": item["endDate"], "submissionDeadline": item.get("submissionDeadline", ""), "departmentIds": list(scope), "departmentNames": item.get("departmentNames", []), "leaveBlocked": item.get("leaveBlocked", True), "canManage": access["canManage"] and (access["allowAll"] or bool(scope) and scope.issubset(managed))})
    return rows


@router.post("")
def mark_event(data: dict, user=Depends(get_authenticated_user)):
    start, end = data.get("startDate"), data.get("endDate")
    validate_block_dates(start, end)
    title = str(data.get("title") or "").strip()
    reason = str(data.get("reason") or "").strip()
    if not title or len(title) > 120 or len(reason) > 500:
        raise HTTPException(400, "Event name is required (maximum 120 characters); note maximum 500")
    deadline = str(data.get("submissionDeadline") or "")
    if deadline:
        validate_block_dates(deadline, deadline)
        if deadline > start:
            raise HTTPException(400, "Submission deadline must be on or before event start")
    raw_scope = data.get("departmentIds", [])
    if not isinstance(raw_scope, list) or any(not isinstance(value, str) for value in raw_scope):
        raise HTTPException(400, "departmentIds must be a list of department IDs")
    scope = list(dict.fromkeys(raw_scope))
    require_scope(user, scope)
    names = {item["id"]: item["name"] for item in event_access(user)["departments"]}
    result = system_settings_collection.insert_one({"type": "leave_block", "active": True, "leaveBlocked": False, "title": title, "reason": reason, "startDate": start, "endDate": end, "submissionDeadline": deadline, "departmentIds": scope, "departmentNames": [names[value] for value in scope], "createdBy": str(user.get("employeeId")), "createdOn": datetime.utcnow()})
    return {"id": str(result.inserted_id), "message": "Event announced; leave applications remain open"}


@router.put("/{event_id}/blocking")
def block_event(event_id: str, data: dict, user=Depends(get_authenticated_user)):
    item = event_document(event_id)
    require_scope(user, item.get("departmentIds") or [])
    if not isinstance(data.get("blocked"), bool):
        raise HTTPException(400, "blocked must be true or false")
    system_settings_collection.update_one({"_id": item["_id"], "type": "leave_block"}, {"$set": {"leaveBlocked": data["blocked"]}, "$push": {"eventAudit": {"blocked": data["blocked"], "actor": str(user.get("employeeId")), "at": datetime.utcnow()}}})
    return {"message": "No leave application in this period" if data["blocked"] else "Leave applications reopened; event remains announced"}


@router.get("/{event_id}/staffing")
def staffing(event_id: str, additionalDepartment: str = Query(""), user=Depends(get_authenticated_user)):
    item = event_document(event_id)
    require_scope(user, item.get("departmentIds") or [])
    return blocked_period_staffing(item, additionalDepartment)


@router.get("/{event_id}/staffing.xlsx")
def staffing_excel(event_id: str, additionalDepartment: str = Query(""), user=Depends(get_authenticated_user)):
    item = event_document(event_id)
    require_scope(user, item.get("departmentIds") or [])
    return export_blocked_period_staffing(str(item["_id"]), additionalDepartment, user)


@router.post("/{event_id}/deploy")
def deploy_event_manpower(event_id: str, payload: dict, user=Depends(get_authenticated_user)):
    """Deploy additional manpower directly tagged to this special event."""
    item = event_document(event_id)
    require_scope(user, item.get("departmentIds") or [])
    from crew_legacy.api.replacement import deploy_additional_manpower
    reason = str(payload.get("reason") or f"Special event coverage: {item.get('title') or 'Special Event'}").strip()
    return deploy_additional_manpower({
        **payload,
        "eventId": str(item["_id"]),
        "reason": reason,
    }, user=user)


@router.get("/{event_id}/deployments")
def get_event_deployments(event_id: str, user=Depends(get_authenticated_user)):
    """Retrieve all additional manpower deployments recorded for this special event."""
    item = event_document(event_id)
    require_scope(user, item.get("departmentIds") or [])
    start_date = item["startDate"]
    end_date = item["endDate"]
    from crew_legacy.database.database_mongo import duty_switch_collection
    switches = list(duty_switch_collection.find({
        "$or": [
            {"eventId": str(item["_id"])},
            {"date": {"$gte": start_date, "$lte": end_date}, "direction": "additional"},
        ]
    }).sort("date", 1))
    return [{
        "id": str(s["_id"]),
        "date": s.get("date"),
        "employeeId": s.get("employeeId"),
        "employeeName": s.get("employeeName"),
        "designation": s.get("designation"),
        "assignedDuty": (s.get("updated") or {}).get("assignedDuty") or "Shift",
        "reason": s.get("reason"),
        "changedBy": s.get("changedBy"),
        "changedOn": s.get("changedOn").isoformat() if hasattr(s.get("changedOn"), "isoformat") else str(s.get("changedOn")),
        "compOffAwarded": bool(s.get("compOffAwarded")),
    } for s in switches]


@router.get("/matrix")
def get_special_roster_matrix(
    startDate: str = Query(None),
    endDate: str = Query(None),
    eventId: str = Query(None),
    department: str = Query(None),
    user=Depends(get_authenticated_user),
):
    """
    Returns an interactive calendar matrix of Duty Type vs Days for special rosters,
    including individual shift blocks, available/off pool, and leave status.
    """
    event_item = None
    if eventId and ObjectId.is_valid(eventId):
        event_item = event_document(eventId)
        require_scope(user, event_item.get("departmentIds") or [])
        start_date = str(startDate or event_item.get("startDate") or "").strip()
        end_date = str(endDate or event_item.get("endDate") or "").strip()
    else:
        start_date = str(startDate or "").strip()
        end_date = str(endDate or "").strip()

    if not start_date:
        start_date = datetime.utcnow().strftime("%Y-%m-%d")
    if not end_date:
        end_date = (datetime.strptime(start_date, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")

    dates = []
    curr = datetime.strptime(start_date, "%Y-%m-%d")
    thru = datetime.strptime(end_date, "%Y-%m-%d")
    while curr <= thru:
        dates.append(curr.strftime("%Y-%m-%d"))
        curr += timedelta(days=1)

    day_names = {d: datetime.strptime(d, "%Y-%m-%d").strftime("%a") for d in dates}

    from crew_legacy.api.replacement import ACTIVE_LEAVE_STATUSES, SHIFT_DUTIES, OFF_DUTIES, normalized_duty

    # Fetch daily duties
    daily_query = {"date": {"$gte": start_date, "$lte": end_date}}
    records = list(employee_daily_collection.find(daily_query))

    # Fetch leaves
    leave_query = {
        "date": {"$gte": start_date, "$lte": end_date},
        "finalStatus": {"$in": list(ACTIVE_LEAVE_STATUSES)},
    }
    leaves = list(leave_request_collection.find(leave_query))
    leave_by_emp_date = {(str(l.get("employeeId") or "").strip(), str(l.get("date") or "").strip()): l for l in leaves}

    # Department list
    dept_names = set()
    for unit in organization_unit_collection.find({"unitType": "department", "isActive": {"$ne": False}}):
        dname = str(unit.get("name") or "").strip()
        if dname:
            dept_names.add(dname)
    for emp in employee_collection.find({"isActive": {"$ne": False}}, {"departments": 1, "department": 1}):
        for value in (emp.get("departments") or [emp.get("department")]):
            dname = str(value or "").strip()
            if dname:
                dept_names.add(dname)
    departments = sorted(dept_names)

    # Initialize grid: Rows = shifts/duty types, Columns = dates
    grid = {
        d: {
            "Morning": [],
            "Evening": [],
            "Night": [],
            "General": [],
            "Off": [],
            "Leave": [],
        } for d in dates
    }

    replacement_requirements = []

    for l in leaves:
        ldate = str(l.get("date") or "").strip()
        if ldate in grid:
            eid = str(l.get("employeeId") or "").strip()
            assigned_duty = str(l.get("assignedDuty") or "Morning").strip()
            req_flag = bool(l.get("replacementRequired") or l.get("sicReplacementRequired") or l.get("dicReplacementRequired"))
            is_covered = bool(l.get("replacementAssigned") or l.get("replacement"))
            entry = {
                "employeeId": eid,
                "name": str(l.get("employeeName") or l.get("name") or eid),
                "designation": str(l.get("designation") or "Staff"),
                "department": str(l.get("department") or ""),
                "assignedDuty": assigned_duty,
                "leaveType": str(l.get("leaveType") or "Leave"),
                "leaveId": str(l.get("_id")),
                "onLeave": True,
                "replacementRequired": req_flag,
                "replacementAssigned": is_covered,
                "replacement": l.get("replacement"),
            }
            grid[ldate]["Leave"].append(entry)
            if req_flag:
                replacement_requirements.append({
                    "date": ldate,
                    "shift": assigned_duty if assigned_duty in SHIFT_DUTIES else "Morning",
                    "employeeId": eid,
                    "name": entry["name"],
                    "leaveId": entry["leaveId"],
                    "leaveType": entry["leaveType"],
                    "status": "Covered" if is_covered else "Uncovered",
                })

    for r in records:
        rdate = str(r.get("date") or "").strip()
        if rdate not in grid:
            continue
        eid = str(r.get("employeeId") or "").strip()
        on_leave = (eid, rdate) in leave_by_emp_date or r.get("leaveStatus") in ACTIVE_LEAVE_STATUSES
        if on_leave:
            continue

        assigned_duty = str(r.get("assignedDuty") or "General").strip()
        norm = normalized_duty(assigned_duty)
        entry = {
            "employeeId": eid,
            "name": str(r.get("name") or eid),
            "designation": str(r.get("designation") or "Staff"),
            "groupName": str(r.get("groupName") or ""),
            "assignedDuty": assigned_duty,
            "normalizedDuty": norm,
            "onLeave": False,
            "replacementDuty": bool(r.get("replacementDuty")),
            "additionalManpower": bool(r.get("additionalManpower")),
            "isSIC": bool(r.get("isSIC")),
            "isActingSIC": bool(r.get("isActingSIC")),
        }
        if norm in ["MORNING", "M1", "M2"]:
            grid[rdate]["Morning"].append(entry)
        elif norm in ["EVENING", "E1", "E2"]:
            grid[rdate]["Evening"].append(entry)
        elif norm in ["NIGHT", "N1", "N2"]:
            grid[rdate]["Night"].append(entry)
        elif norm in OFF_DUTIES or norm in ["OFF", "C-OFF", "REST", "W-OFF"]:
            grid[rdate]["Off"].append(entry)
        else:
            grid[rdate]["General"].append(entry)

    event_summary = None
    if event_item:
        event_summary = {
            "id": str(event_item["_id"]),
            "title": event_item.get("title"),
            "startDate": event_item.get("startDate"),
            "endDate": event_item.get("endDate"),
            "leaveBlocked": bool(event_item.get("leaveBlocked")),
            "departmentNames": event_item.get("departmentNames") or [],
        }

    return {
        "dates": dates,
        "dayNames": day_names,
        "shifts": ["Morning", "Evening", "Night", "General", "Off", "Leave"],
        "grid": grid,
        "replacementRequirements": replacement_requirements,
        "departments": departments,
        "event": event_summary,
    }


@router.post("/sequential-allocate")
def sequential_allocate_department_manpower(
    payload: dict,
    user=Depends(get_authenticated_user),
):
    """
    Roster for manpower from another department:
    Allocates manpower sequentially from the selected department to where replacement
    is required (as marked by SIC or DIC, or surge coverage slots).
    """
    source_dept = str(payload.get("sourceDepartment") or "").strip()
    if not source_dept:
        raise HTTPException(400, "Source department is required")

    start_date = str(payload.get("startDate") or "").strip()
    end_date = str(payload.get("endDate") or "").strip()
    event_id = str(payload.get("eventId") or "").strip()
    preview_only = bool(payload.get("previewOnly", False))
    target_shifts = payload.get("targetShifts") or ["Morning", "Evening", "Night"]
    max_duties_per_person = int(payload.get("maxDutiesPerPerson") or 2)

    if event_id and ObjectId.is_valid(event_id):
        item = event_document(event_id)
        require_scope(user, item.get("departmentIds") or [])
        if not start_date:
            start_date = item.get("startDate")
        if not end_date:
            end_date = item.get("endDate")

    if not start_date or not end_date:
        raise HTTPException(400, "startDate and endDate are required")

    from crew_legacy.api.replacement import (
        ACTIVE_LEAVE_STATUSES,
        SHIFT_DUTIES,
        assign_replacement,
        employee_id_filter,
    )

    # 1. Identify slots requiring replacement / coverage as marked by SIC/DIC
    leave_query = {
        "date": {"$gte": start_date, "$lte": end_date},
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
    leaves_to_replace = list(leave_request_collection.find(leave_query).sort("date", 1))

    # 2. Get active candidates from source department
    dept_candidates = list(employee_collection.find({
        "isActive": {"$ne": False},
        "$or": [
            {"department": source_dept},
            {"departments": source_dept},
        ],
    }).sort([("name", 1), ("employeeId", 1)]))

    if not dept_candidates:
        raise HTTPException(404, f"No active employees found in source department '{source_dept}'")

    # 3. Read stored sequential pointer for this department
    pointer_key = {"type": "department_sequential_pointer", "department": source_dept}
    pointer_doc = system_settings_collection.find_one(pointer_key) or {}
    start_pointer = int(pointer_doc.get("nextIndex", 0)) % len(dept_candidates)

    allocations = []
    unallocated_slots = []
    curr_idx = start_pointer
    duty_counts = {str(c.get("userId") or c.get("employeeId") or "").strip(): 0 for c in dept_candidates}

    actor_id = str(user.get("employeeId") or "").strip()

    for leave in leaves_to_replace:
        ldate = str(leave.get("date") or "").strip()
        assigned_duty = str(leave.get("assignedDuty") or "Morning").strip()
        if assigned_duty not in target_shifts and assigned_duty not in SHIFT_DUTIES:
            assigned_duty = target_shifts[0] if target_shifts else "Morning"

        leave_id = str(leave["_id"])
        applicant_id = str(leave.get("employeeId") or "").strip()
        applicant_name = str(leave.get("employeeName") or leave.get("name") or applicant_id)

        # Find next eligible candidate from dept_candidates (round-robin)
        assigned_candidate = None
        searched = 0
        total_candidates = len(dept_candidates)

        while searched < total_candidates:
            candidate = dept_candidates[curr_idx]
            cand_id = str(candidate.get("userId") or candidate.get("employeeId") or "").strip()
            cand_name = str(candidate.get("name") or cand_id)

            curr_idx = (curr_idx + 1) % total_candidates
            searched += 1

            if not cand_id or cand_id == applicant_id:
                continue

            if duty_counts[cand_id] >= max_duties_per_person:
                continue

            # Check if candidate is on leave on this date
            cand_leave = leave_request_collection.find_one({
                "employeeId": employee_id_filter(cand_id),
                "date": ldate,
                "finalStatus": {"$in": list(ACTIVE_LEAVE_STATUSES)},
            })
            if cand_leave:
                continue

            # Check if candidate is already scheduled on a shift on this date
            cand_daily = employee_daily_collection.find_one({
                "employeeId": employee_id_filter(cand_id),
                "date": ldate,
            })
            if cand_daily and cand_daily.get("assignedDuty") in SHIFT_DUTIES:
                continue

            # Candidate is eligible!
            assigned_candidate = candidate
            duty_counts[cand_id] += 1
            break

        if assigned_candidate:
            cand_id = str(assigned_candidate.get("userId") or assigned_candidate.get("employeeId") or "").strip()
            cand_name = str(assigned_candidate.get("name") or cand_id)
            cand_desig = str(assigned_candidate.get("designation") or "Staff")

            if not preview_only:
                try:
                    assign_replacement(
                        leave_id=leave_id,
                        payload={
                            "replacementEmployeeId": cand_id,
                            "mode": "double",
                            "halfDuty": False,
                            "reason": f"Sequential department allocation ({source_dept}) by {actor_id}",
                        },
                        user=user,
                    )
                except Exception as assign_err:
                    unallocated_slots.append({
                        "date": ldate,
                        "shift": assigned_duty,
                        "leaveId": leave_id,
                        "replacedEmployee": applicant_name,
                        "reason": f"Allocation failed: {str(assign_err)}",
                    })
                    continue

            allocations.append({
                "date": ldate,
                "shift": assigned_duty,
                "leaveId": leave_id,
                "replacedEmployee": applicant_name,
                "allocatedEmployeeId": cand_id,
                "allocatedEmployeeName": cand_name,
                "allocatedDesignation": cand_desig,
                "sourceDepartment": source_dept,
                "status": "Simulated" if preview_only else "Allocated",
            })
        else:
            unallocated_slots.append({
                "date": ldate,
                "shift": assigned_duty,
                "leaveId": leave_id,
                "replacedEmployee": applicant_name,
                "reason": f"Department candidate pool ({source_dept}) exhausted or on leave on {ldate}",
            })

    # Save updated pointer if not preview
    if not preview_only and dept_candidates:
        system_settings_collection.update_one(
            pointer_key,
            {"$set": {"nextIndex": curr_idx, "updatedAt": datetime.utcnow()}},
            upsert=True,
        )

    return {
        "success": True,
        "previewOnly": preview_only,
        "sourceDepartment": source_dept,
        "totalRequirements": len(leaves_to_replace),
        "allocatedCount": len(allocations),
        "unallocatedCount": len(unallocated_slots),
        "allocations": allocations,
        "unallocatedSlots": unallocated_slots,
    }


