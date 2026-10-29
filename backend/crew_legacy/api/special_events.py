"""Department-scoped special-event announcements and separately enabled leave blocks."""
from datetime import date, datetime, timedelta
from typing import Optional
import re
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
    roster_group_collection,
)
from crew_legacy.api.leave_api import is_admin, validate_block_dates, blocked_period_staffing, export_blocked_period_staffing

router = APIRouter()


def is_shift_or_control_room_employee(eid: str, group_name: str, assigned_duty: str, emp_to_group: dict = None) -> bool:
    """
    Identifies whether an employee is a Shift / Control Room person vs General shift person.
    Shift/Control Room persons rotate through shift groups (Group-1, Group-2, Group-3, Group-4, etc.)
    or are rostered on shift duties (Morning, Evening, Night).
    General shift persons (groupName == 'General', assignedDuty == 'General') do not require replacement.
    """
    g_clean = str(group_name or "").strip()
    d_clean = str(assigned_duty or "").strip().upper()

    # Explicit General
    if g_clean.lower() == "general" or g_clean.lower().startswith("gen") or d_clean in ["GENERAL", "GEN", "G"]:
        return False

    # Shift groups: Group-1, Group-2, Group-3, Group-4, Group-5, Group-6, etc.
    if re.search(r"group[\s_-]*\d+", g_clean, re.I):
        return True

    from crew_legacy.api.replacement import SHIFT_DUTIES, normalized_duty
    if normalized_duty(d_clean) in SHIFT_DUTIES:
        return True

    if emp_to_group and eid:
        mapped_g = str(emp_to_group.get(str(eid).strip()) or "").strip()
        if re.search(r"group[\s_-]*\d+", mapped_g, re.I):
            return True

    return False


def department_ids(employee):
    from crew_legacy.api.admin_api import resolve_employee_organization
    resolved = resolve_employee_organization(employee.get("manualFunctionIds", employee.get("functionIds")), str(employee.get("userId") or employee.get("employeeId") or ""))
    return set(str(value) for value in resolved.get("departmentIds", []))


def resolve_employee_group_map(records=None):
    emp_to_group = {}
    try:
        for g in roster_group_collection.find({"isActive": {"$ne": False}}, {"groupName": 1, "members": 1, "shiftInCharge": 1}):
            gname = str(g.get("groupName") or "").strip()
            sic = g.get("shiftInCharge") or {}
            if isinstance(sic, dict) and sic.get("employeeId"):
                emp_to_group[str(sic["employeeId"]).strip()] = gname
            for m in (g.get("members") or []):
                if isinstance(m, dict) and m.get("employeeId"):
                    emp_to_group[str(m["employeeId"]).strip()] = gname
                elif isinstance(m, str):
                    emp_to_group[m.strip()] = gname
    except Exception:
        pass
    if records:
        for r in records:
            reid = str(r.get("employeeId") or "").strip()
            rg = str(r.get("groupName") or "").strip()
            if reid and rg and reid not in emp_to_group:
                emp_to_group[reid] = rg
    return emp_to_group


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
        rows.append({
            "id": str(item["_id"]),
            "title": item.get("title") or item.get("reason", "Special event"),
            "reason": item.get("reason", ""),
            "startDate": item["startDate"],
            "endDate": item["endDate"],
            "submissionDeadline": item.get("submissionDeadline", ""),
            "departmentIds": list(scope),
            "departmentNames": item.get("departmentNames", []),
            "leaveBlocked": item.get("leaveBlocked", True),
            "rosterCommitted": bool(item.get("rosterCommitted", False)),
            "rosterCommittedAt": item.get("rosterCommittedAt").strftime("%Y-%m-%d %H:%M") if item.get("rosterCommittedAt") else None,
            "rosterCommittedBy": item.get("rosterCommittedBy"),
            "canManage": access["canManage"] and (access["allowAll"] or bool(scope) and scope.issubset(managed)),
        })
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


@router.put("/{event_id}/commit-roster")
@router.post("/{event_id}/commit-roster")
def commit_special_duty_roster(event_id: str, data: dict = None, user=Depends(get_authenticated_user)):
    """
    Accept or commit special duty roster for the event.
    """
    item = event_document(event_id)
    require_scope(user, item.get("departmentIds") or [])
    payload = data or {}
    commit = bool(payload.get("commit", True))
    notes = str(payload.get("notes") or "").strip()
    actor_id = str(user.get("employeeId") or "")

    now = datetime.utcnow()
    update_doc = {
        "rosterCommitted": commit,
        "rosterCommittedAt": now if commit else None,
        "rosterCommittedBy": actor_id if commit else None,
    }

    audit_entry = {
        "action": "commit_special_duty_roster" if commit else "reopen_special_duty_roster",
        "actor": actor_id,
        "at": now,
        "notes": notes,
    }

    system_settings_collection.update_one(
        {"_id": item["_id"], "type": "leave_block"},
        {
            "$set": update_doc,
            "$push": {"eventAudit": audit_entry},
        },
    )

    event_title = item.get("title") or "Special Event"
    status_msg = "committed and accepted successfully" if commit else "reopened for draft edits"
    return {
        "success": True,
        "rosterCommitted": commit,
        "message": f"Special duty roster for '{event_title}' {status_msg}.",
    }


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
    daily_by_emp_date = {(str(r.get("employeeId") or "").strip(), str(r.get("date") or "").strip()): r for r in records}

    # Map groups to their active shift on each date from records of active members
    group_shift_on_date = {}
    for r in records:
        rdate = str(r.get("date") or "").strip()
        rg = str(r.get("groupName") or "").strip()
        rd = str(r.get("assignedDuty") or "").strip()
        if rg and rd and normalized_duty(rd) in SHIFT_DUTIES:
            if (rg, rdate) not in group_shift_on_date:
                group_shift_on_date[(rg, rdate)] = rd

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

    # Resolve employee groups from roster_group_collection & daily records
    emp_to_group = resolve_employee_group_map(records)

    for l in leaves:
        ldate = str(l.get("date") or "").strip()
        if ldate in grid:
            eid = str(l.get("employeeId") or "").strip()
            d_rec = daily_by_emp_date.get((eid, ldate)) or {}

            # Resolve group name
            emp_group = (
                str(l.get("groupName") or "").strip()
                or str(d_rec.get("groupName") or "").strip()
                or emp_to_group.get(eid, "")
            )
            if not emp_group or emp_group.lower() == "none":
                emp_group = "General"

            # Resolve assigned duty
            raw_duty = str(d_rec.get("assignedDuty") or l.get("assignedDuty") or "").strip()
            if not raw_duty or raw_duty.lower() == "none":
                raw_duty = group_shift_on_date.get((emp_group, ldate)) or ("Morning" if re.search(r"group[\s_-]*\d+", emp_group, re.I) else "General")

            is_shift_person = is_shift_or_control_room_employee(eid, emp_group, raw_duty, emp_to_group)

            norm_duty = normalized_duty(raw_duty)
            if norm_duty in ["EVENING", "E1", "E2"]:
                shift_bucket = "Evening"
            elif norm_duty in ["NIGHT", "N1", "N2"]:
                shift_bucket = "Night"
            elif is_shift_person:
                shift_bucket = "Morning"
            else:
                shift_bucket = "General"

            is_covered = bool(l.get("replacementAssigned") or l.get("replacement"))

            # Only Shift/Control Room person need replacement. Remove cover for general shift persons.
            req_flag = is_shift_person

            entry = {
                "employeeId": eid,
                "name": str(l.get("employeeName") or l.get("name") or eid),
                "designation": str(l.get("designation") or d_rec.get("designation") or "Staff"),
                "department": str(l.get("department") or d_rec.get("department") or ""),
                "groupName": emp_group,
                "assignedDuty": shift_bucket,
                "leaveType": str(l.get("leaveType") or "Leave"),
                "leaveId": str(l.get("_id")),
                "onLeave": True,
                "isShiftPerson": is_shift_person,
                "replacementRequired": req_flag,
                "replacementAssigned": is_covered,
                "replacement": l.get("replacement"),
            }
            grid[ldate]["Leave"].append(entry)
            if req_flag:
                replacement_requirements.append({
                    "date": ldate,
                    "shift": shift_bucket,
                    "assignedDuty": shift_bucket,
                    "employeeId": eid,
                    "name": entry["name"],
                    "groupName": emp_group,
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
            "groupName": str(r.get("groupName") or "").strip() or emp_to_group.get(eid, ""),
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
            "rosterCommitted": bool(event_item.get("rosterCommitted", False)),
            "rosterCommittedAt": event_item.get("rosterCommittedAt").strftime("%Y-%m-%d %H:%M") if event_item.get("rosterCommittedAt") else None,
            "rosterCommittedBy": event_item.get("rosterCommittedBy"),
            "departmentNames": event_item.get("departmentNames") or [],
        }

    from crew_legacy.services.replacement_roster_service import get_replacement_roster_config
    cfg = get_replacement_roster_config()
    sic_pool = [x for x in (cfg.get("sicPool") or []) if x.get("isActive", True)]
    se_pool = [x for x in (cfg.get("shiftEngineerPool") or []) if x.get("isActive", True)]
    sequential_pools = [
        {"id": "all_pools", "name": f"All Created Sequential Pools ({len(sic_pool) + len(se_pool)} members)", "count": len(sic_pool) + len(se_pool)},
        {"id": "sic", "name": f"SIC Pool ({len(sic_pool)} members)", "count": len(sic_pool)},
        {"id": "shift_engineer", "name": f"Shift Engineer Pool ({len(se_pool)} members)", "count": len(se_pool)},
        {"id": "departments", "name": "Department Manpower Pools", "count": 0},
    ]

    return {
        "dates": dates,
        "dayNames": day_names,
        "shifts": ["Morning", "Evening", "Night", "General", "Off", "Leave"],
        "grid": grid,
        "replacementRequirements": replacement_requirements,
        "departments": departments,
        "sequentialPools": sequential_pools,
        "event": event_summary,
    }


@router.post("/sequential-allocate")
def sequential_allocate_department_manpower(
    payload: dict,
    user=Depends(get_authenticated_user),
):
    """
    Roster from created sequential roster pool or multi-department selection:
    Allocates manpower sequentially to fill duties requiring replacement (marked by SIC/DIC)
    or surge coverage slots.
    """
    source_pool = str(payload.get("sourcePool") or "all_pools").strip()
    raw_depts = payload.get("sourceDepartments") or payload.get("sourceDepartment") or []
    if isinstance(raw_depts, str):
        source_depts = [d.strip() for d in raw_depts.split(",") if d.strip()]
    elif isinstance(raw_depts, list):
        source_depts = [str(d).strip() for d in raw_depts if str(d).strip()]
    else:
        source_depts = []

    start_date = str(payload.get("startDate") or "").strip()
    end_date = str(payload.get("endDate") or "").strip()
    event_id = str(payload.get("eventId") or "").strip()
    preview_only = bool(payload.get("previewOnly", False))
    target_shifts = payload.get("targetShifts") or ["Morning", "Evening", "Night"]
    max_duties_per_person = int(payload.get("maxDutiesPerPerson") or 2)
    allocation_type = str(payload.get("allocationType") or "both").strip() # "leave", "surge", "both"
    surge_per_shift = max(1, int(payload.get("surgePerShift") or 1))

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
        deploy_additional_manpower,
        employee_id_filter,
    )
    from crew_legacy.services.replacement_roster_service import get_replacement_roster_config

    # Gather candidate pool
    candidates = []
    cfg = get_replacement_roster_config()
    sic_pool = [x for x in (cfg.get("sicPool") or []) if x.get("isActive", True)]
    se_pool = [x for x in (cfg.get("shiftEngineerPool") or []) if x.get("isActive", True)]

    if source_pool == "sic":
        candidates = sic_pool
    elif source_pool == "shift_engineer":
        candidates = se_pool
    elif source_pool == "all_pools":
        candidates = sic_pool + se_pool
    else:
        # source_pool == "departments" or general
        query = {"isActive": {"$ne": False}}
        if source_depts:
            query["$or"] = [
                {"department": {"$in": source_depts}},
                {"departments": {"$in": source_depts}},
            ]
        candidates = list(employee_collection.find(query).sort([("name", 1), ("employeeId", 1)]))

    # If source_depts is provided and source_pool was sic/shift_engineer/all_pools, filter candidates by department
    if source_depts and source_pool in ["sic", "shift_engineer", "all_pools"]:
        cand_ids = [str(c.get("userId") or c.get("employeeId") or "").strip() for c in candidates if str(c.get("userId") or c.get("employeeId") or "").strip()]
        emp_docs = {
            str(e.get("userId") or e.get("employeeId") or "").strip(): e
            for e in employee_collection.find({"$or": [{"userId": {"$in": cand_ids}}, {"employeeId": {"$in": cand_ids}}]})
        }
        filtered = []
        for c in candidates:
            cid = str(c.get("userId") or c.get("employeeId") or "").strip()
            emp = emp_docs.get(cid) or {}
            emp_depts = [str(d).strip() for d in (emp.get("departments") or [emp.get("department")]) if str(d).strip()]
            if not emp_depts:
                emp_depts = [str(d).strip() for d in (c.get("departments") or [c.get("department")]) if str(d).strip()]
            if any(d in source_depts for d in emp_depts):
                filtered.append(c)
        if filtered:
            candidates = filtered

    if not candidates:
        source_label = f"pool '{source_pool}'" if source_pool != "departments" else f"departments {source_depts}"
        raise HTTPException(404, f"No active candidates found in selected {source_label}.")

    # Deduplicate candidates while preserving order
    seen_ids = set()
    unique_candidates = []
    for c in candidates:
        cid = str(c.get("userId") or c.get("employeeId") or "").strip()
        if cid and cid not in seen_ids:
            seen_ids.add(cid)
            unique_candidates.append(c)
    candidates = unique_candidates

    # Read stored sequential pointer
    pointer_key = {
        "type": "sequential_roster_pointer",
        "sourcePool": source_pool,
        "departments": sorted(source_depts),
    }
    pointer_doc = system_settings_collection.find_one(pointer_key) or {}
    start_pointer = int(pointer_doc.get("nextIndex", 0)) % len(candidates)

    # 1. Gather slots requiring allocation
    slots_to_fill = []
    if allocation_type in ["leave", "both"]:
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
        leaves = list(leave_request_collection.find(leave_query).sort("date", 1))
        emp_to_group = resolve_employee_group_map()
        for leave in leaves:
            eid = str(leave.get("employeeId") or "").strip()
            # Only shift / Control Room persons need replacement. Exclude general shift!
            if not is_shift_or_control_room_employee(eid, leave.get("groupName"), leave.get("assignedDuty"), emp_to_group):
                continue

            # Determine actual shift:
            s = str(leave.get("assignedDuty") or "").strip()
            if s not in SHIFT_DUTIES:
                daily = employee_daily_collection.find_one({"employeeId": eid, "date": str(leave.get("date"))})
                if daily and str(daily.get("assignedDuty") or "").strip() in SHIFT_DUTIES:
                    s = str(daily.get("assignedDuty")).strip()
                else:
                    s = target_shifts[0] if target_shifts else "Morning"
            if target_shifts and s not in target_shifts:
                continue

            slots_to_fill.append({
                "type": "leave_replacement",
                "date": str(leave.get("date")),
                "shift": s,
                "leave": leave,
                "applicantId": eid,
                "applicantName": str(leave.get("employeeName") or leave.get("name") or leave.get("employeeId")),
            })

    # B) Surge coverage if requested or if no leaves found
    if allocation_type == "surge" or (allocation_type == "both" and not slots_to_fill):
        dates = []
        curr = datetime.strptime(start_date, "%Y-%m-%d")
        thru = datetime.strptime(end_date, "%Y-%m-%d")
        while curr <= thru:
            dates.append(curr.strftime("%Y-%m-%d"))
            curr += timedelta(days=1)

        for d in dates:
            for s in target_shifts:
                for _ in range(surge_per_shift):
                    slots_to_fill.append({
                        "type": "surge_coverage",
                        "date": d,
                        "shift": s,
                        "leave": None,
                        "applicantId": None,
                        "applicantName": None,
                    })

    allocations = []
    unallocated_slots = []
    curr_idx = start_pointer
    duty_counts = {str(c.get("userId") or c.get("employeeId") or "").strip(): 0 for c in candidates}
    actor_id = str(user.get("employeeId") or "").strip()
    emp_to_group = resolve_employee_group_map()

    for slot in slots_to_fill:
        sdate = slot["date"]
        sshift = slot["shift"]
        slot_type = slot["type"]
        applicant_id = slot["applicantId"]

        assigned_candidate = None
        searched = 0
        total_candidates = len(candidates)

        while searched < total_candidates:
            candidate = candidates[curr_idx]
            cand_id = str(candidate.get("userId") or candidate.get("employeeId") or "").strip()
            cand_name = str(candidate.get("name") or cand_id)

            curr_idx = (curr_idx + 1) % total_candidates
            searched += 1

            if not cand_id or (applicant_id and cand_id == applicant_id):
                continue

            if duty_counts[cand_id] >= max_duties_per_person:
                continue

            # Check if candidate is on leave on this date
            cand_leave = leave_request_collection.find_one({
                "employeeId": employee_id_filter(cand_id),
                "date": sdate,
                "finalStatus": {"$in": list(ACTIVE_LEAVE_STATUSES)},
            })
            if cand_leave:
                continue

            # Check if candidate is already scheduled on a shift on this date
            cand_daily = employee_daily_collection.find_one({
                "employeeId": employee_id_filter(cand_id),
                "date": sdate,
            })
            if cand_daily and cand_daily.get("assignedDuty") in SHIFT_DUTIES:
                continue

            # Candidate match found!
            assigned_candidate = candidate
            duty_counts[cand_id] += 1
            break

        if assigned_candidate:
            cand_id = str(assigned_candidate.get("userId") or assigned_candidate.get("employeeId") or "").strip()
            cand_name = str(assigned_candidate.get("name") or cand_id)
            cand_desig = str(assigned_candidate.get("designation") or "Staff")

            if not preview_only:
                try:
                    if slot_type == "leave_replacement" and slot["leave"]:
                        assign_replacement(
                            leave_id=str(slot["leave"]["_id"]),
                            payload={
                                "replacementEmployeeId": cand_id,
                                "mode": "double",
                                "halfDuty": False,
                                "assignedDuty": sshift,
                                "autoApprove": True,
                                "reason": f"Sequential roster allocation ({source_pool}) by {actor_id}",
                            },
                            user=user,
                        )
                    else:
                        deploy_additional_manpower(
                            payload={
                                "date": sdate,
                                "employeeId": cand_id,
                                "assignedDuty": sshift,
                                "reason": f"Sequential surge roster ({source_pool}) by {actor_id}",
                                "eventId": event_id,
                                "mode": "double",
                            },
                            user=user,
                        )
                except Exception as assign_err:
                    unallocated_slots.append({
                        "date": sdate,
                        "shift": sshift,
                        "slotType": slot_type,
                        "reason": f"Assignment error: {str(assign_err)}",
                    })
                    continue

            allocations.append({
                "date": sdate,
                "shift": sshift,
                "slotType": "Leave Replacement" if slot_type == "leave_replacement" else "Surge Coverage",
                "replacedEmployee": slot["applicantName"] or "Surge Slot",
                "allocatedEmployeeId": cand_id,
                "allocatedEmployeeName": cand_name,
                "allocatedDesignation": cand_desig,
                "allocatedGroupName": str(assigned_candidate.get("groupName") or "").strip() or emp_to_group.get(cand_id, ""),
                "sourcePool": source_pool,
                "status": "Simulated" if preview_only else "Allocated",
            })
        else:
            unallocated_slots.append({
                "date": sdate,
                "shift": sshift,
                "slotType": slot_type,
                "reason": f"Candidate pool exhausted or unavailable on {sdate}",
            })

    if not preview_only and candidates:
        system_settings_collection.update_one(
            pointer_key,
            {"$set": {"nextIndex": curr_idx, "updatedAt": datetime.utcnow()}},
            upsert=True,
        )

    return {
        "success": True,
        "previewOnly": preview_only,
        "sourcePool": source_pool,
        "sourceDepartments": source_depts,
        "totalRequirements": len(slots_to_fill),
        "allocatedCount": len(allocations),
        "unallocatedCount": len(unallocated_slots),
        "allocations": allocations,
        "unallocatedSlots": unallocated_slots,
    }


@router.get("/candidates")
def get_special_roster_candidates(
    date: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    user=Depends(get_authenticated_user),
):
    """
    Returns all active personnel across the organization, optionally filtered by department.
    Each candidate includes designation, department, group, and dutyStatus for the given date.
    Also returns the complete list of available departments for filtering in UI.
    """
    from crew_legacy.api.replacement import ACTIVE_LEAVE_STATUSES, SHIFT_DUTIES

    emp_to_group = resolve_employee_group_map()

    # Query all active employees
    emp_query = {"isActive": {"$ne": False}}
    if department and department.strip():
        dept_str = department.strip()
        emp_query["$or"] = [
            {"department": dept_str},
            {"departments": dept_str},
        ]

    all_employees = list(employee_collection.find(emp_query).sort([("name", 1), ("employeeId", 1)]))

    # All available departments
    dept_units = list(organization_unit_collection.find({"unitType": "department", "isActive": {"$ne": False}}, {"name": 1}))
    all_depts = sorted({str(u.get("name")).strip() for u in dept_units if str(u.get("name") or "").strip()})
    if not all_depts:
        all_depts = sorted({str(e.get("department") or "").strip() for e in all_employees if str(e.get("department") or "").strip()})

    # If date is provided, batch query leave and daily duty
    leave_map = {}
    daily_map = {}
    if date:
        leaves = leave_request_collection.find({
            "date": date,
            "finalStatus": {"$in": list(ACTIVE_LEAVE_STATUSES)},
        })
        for l in leaves:
            lid = str(l.get("employeeId") or "").strip()
            if lid:
                leave_map[lid] = l.get("leaveType") or "Leave"

        dailies = employee_daily_collection.find({"date": date})
        for d in dailies:
            did = str(d.get("employeeId") or "").strip()
            if did:
                daily_map[did] = d.get("assignedDuty")

    candidates = []
    for emp in all_employees:
        eid = str(emp.get("userId") or emp.get("employeeId") or "").strip()
        if not eid:
            continue
        ename = str(emp.get("name") or eid)
        edesig = str(emp.get("designation") or "Staff")
        edept = emp.get("department") or (emp.get("departments")[0] if emp.get("departments") else "")
        egroup = str(emp.get("groupName") or "").strip() or emp_to_group.get(eid, "")

        duty_status = "Available / Off Duty"
        if date:
            if eid in leave_map:
                duty_status = f"On Leave ({leave_map[eid]})"
            elif eid in daily_map:
                ad = daily_map[eid]
                duty_status = f"Rostered: {ad}" if ad else "Rostered"

        candidates.append({
            "employeeId": eid,
            "userId": eid,
            "name": ename,
            "designation": edesig,
            "department": edept,
            "groupName": egroup,
            "dutyStatus": duty_status,
            "isShiftPerson": is_shift_or_control_room_employee(eid, egroup, daily_map.get(eid, ""), emp_to_group),
        })

    return {
        "departments": all_depts,
        "candidates": candidates,
        "total": len(candidates),
    }



