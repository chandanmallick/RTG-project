from datetime import datetime, timedelta
from pathlib import Path
from bson import ObjectId

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from crew_legacy.admin_logic.auth_utils import get_current_user, hash_password, validate_password_policy, verify_password
from crew_legacy.database.database_mongo import (
    compensatory_off_collection,
    employee_collection,
    employee_daily_collection,
    leave_request_collection,
    roster_master_collection,
    training_nomination_history_collection,
    organization_unit_collection,
    organization_shift_group_collection,
    roster_group_collection,
    system_settings_collection,
)
from crew_legacy.security_utils import ensure_upload_allowed

router = APIRouter()

UPLOAD_FOLDER = Path(__file__).resolve().parents[2] / "uploads" / "profile"
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

PROFILE_EDIT_SETTING_ID = "profile_edit_fields"
PROFILE_EDIT_FIELDS = (
    "name", "nameHindi", "designation", "designationHindi",
    "phone", "gmail", "profilePhoto", "password",
)


def _employee_id_query(employee_id: str) -> dict:
    value = str(employee_id or "").strip()
    return {"$or": [{"userId": value}, {"employeeId": value}]}


def _profile_edit_settings() -> dict:
    saved = system_settings_collection.find_one({"_id": PROFILE_EDIT_SETTING_ID}) or {}
    enabled = saved.get("enabledFields")
    if not isinstance(enabled, list):
        enabled = list(PROFILE_EDIT_FIELDS)
    return {
        "enabledFields": [field for field in PROFILE_EDIT_FIELDS if field in enabled],
        "availableFields": list(PROFILE_EDIT_FIELDS),
    }


def _current_shift_group(employee_id: str) -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    return roster_group_collection.find_one({
        "startDate": {"$lte": today},
        "endDate": {"$gte": today},
        "$or": [
            {"shiftInCharge.employeeId": employee_id},
            {"members.employeeId": employee_id},
        ],
    }, sort=[("startDate", -1)]) or {}


def _group_organization_context(group_name: str) -> dict:
    mapping = organization_shift_group_collection.find_one({"groupName": group_name}) or {}
    unit_id = str(mapping.get("organizationUnitId") or "")
    units = list(organization_unit_collection.find({"isActive": {"$ne": False}}))
    unit_map = {str(unit["_id"]): unit for unit in units}
    lineage = []
    visited = set()
    while unit_id and unit_id in unit_map and unit_id not in visited:
        visited.add(unit_id)
        unit = unit_map[unit_id]
        lineage.append(unit)
        unit_id = str(unit.get("parentId") or "")
    authority_ids = []
    authority_levels = []
    for unit in lineage:
        heads = unit.get("headEmployeeIds") or []
        if not isinstance(heads, list):
            heads = [heads]
        authority_ids.extend(str(value).strip() for value in heads if str(value).strip())
        authority_levels.append({"unitType": unit.get("unitType"), "headEmployeeIds": [str(value).strip() for value in heads if str(value).strip()]})
    find_type = lambda unit_type: next((unit for unit in lineage if unit.get("unitType") == unit_type), None)
    direct = lineage[0] if lineage else {}
    vertical, section, department = find_type("vertical"), find_type("section"), find_type("department")
    return {
        "directUnitId": str(direct.get("_id") or ""),
        "directUnitName": direct.get("name") or mapping.get("organizationUnitName"),
        "authorityIds": list(dict.fromkeys(authority_ids)),
        "authorityLevels": authority_levels,
        "verticalId": str(vertical.get("_id")) if vertical else "",
        "verticalName": vertical.get("name") if vertical else "",
        "sectionId": str(section.get("_id")) if section else "",
        "sectionName": section.get("name") if section else "",
        "departmentId": str(department.get("_id")) if department else "",
        "departmentName": department.get("name") if department else "",
    }


def _current_organization(employee: dict, employee_id: str) -> dict:
    """Resolve current master data, including a shift group's organization attachment."""
    try:
        from crew_legacy.api.admin_api import resolve_employee_organization
        resolved = resolve_employee_organization(
            employee.get("manualFunctionIds", employee.get("functionIds")), employee_id,
        )
    except Exception:
        resolved = {}

    group = _current_shift_group(employee_id)
    group_name = str(group.get("groupName") or "").strip()
    if not group_name:
        return {**resolved, "groupName": None, "groupSic": None, "groupAuthorityIds": []}

    group_context = _group_organization_context(group_name)

    sic = group.get("shiftInCharge") or {}
    group_authorities = [str(value).strip() for value in (group_context.get("authorityIds") or []) if str(value).strip()]
    direct_unit_heads = next((level.get("headEmployeeIds") or [] for level in (group_context.get("authorityLevels") or []) if level.get("headEmployeeIds")), [])
    department_heads = next((level.get("headEmployeeIds") or [] for level in (group_context.get("authorityLevels") or []) if level.get("unitType") == "department" and level.get("headEmployeeIds")), [])
    group_sic_id = str(sic.get("employeeId") or "").strip()
    reporting_ids = list(dict.fromkeys(
        ([group_sic_id] if group_sic_id and group_sic_id != employee_id else direct_unit_heads)
        + list(resolved.get("reportingOfficerIds") or [])
    ))
    return {
        **resolved,
        "verticalIds": resolved.get("verticalIds") or ([group_context.get("verticalId")] if group_context.get("verticalId") else []),
        "verticals": resolved.get("verticals") or ([group_context.get("verticalName")] if group_context.get("verticalName") else []),
        "sectionIds": resolved.get("sectionIds") or ([group_context.get("sectionId")] if group_context.get("sectionId") else []),
        "sections": resolved.get("sections") or ([group_context.get("sectionName")] if group_context.get("sectionName") else []),
        "departmentIds": resolved.get("departmentIds") or ([group_context.get("departmentId")] if group_context.get("departmentId") else []),
        "departments": resolved.get("departments") or ([group_context.get("departmentName")] if group_context.get("departmentName") else []),
        "department": resolved.get("department") or group_context.get("departmentName"),
        "reportingOfficerIds": reporting_ids,
        "intermediaryReportingId": resolved.get("intermediaryReportingId") or ((direct_unit_heads or [None])[0] if group_sic_id and group_sic_id != employee_id else None),
        "hodId": resolved.get("hodId") or ((department_heads or [None])[0]),
        "groupName": group_name,
        "groupSic": sic or None,
        "groupAuthorityIds": group_authorities,
    }


def _profile_photo_url(employee: dict, employee_id: str) -> str:
    stored = str(employee.get("profilePhoto") or "").strip()
    if stored.startswith("/api/crew/profile/photo/"):
        return stored

    filename = str(employee.get("profilePhotoFilename") or "").strip()
    if not filename and stored:
        filename = Path(stored.split("?", 1)[0]).name

    if not filename:
        return ""

    candidate = UPLOAD_FOLDER / filename
    if candidate.exists():
        version = int(candidate.stat().st_mtime)
    else:
        updated = employee.get("profilePhotoUpdatedOn")
        version = int(updated.timestamp()) if isinstance(updated, datetime) else int(datetime.utcnow().timestamp())

    return f"/api/crew/profile/photo/{employee_id}?v={version}"


def _latest_profile_file(employee_id: str) -> Path | None:
    latest = None
    for candidate in sorted(UPLOAD_FOLDER.glob(f"{employee_id}.*")):
        latest = candidate
    return latest


def _report_date(value) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    return str(value or "")[:10]


def _report_actor_can_view_all(user: dict) -> bool:
    return str(user.get("role") or "").lower() == "admin" or str(user.get("employeeId") or "") == "50041"


def _inclusive_days(start_value, end_value=None, window_start: str | None = None, window_end: str | None = None) -> int:
    """Inclusive calendar days, optionally limited to the selected report period."""
    try:
        start = datetime.strptime(_report_date(start_value), "%Y-%m-%d").date()
        end = datetime.strptime(_report_date(end_value or start_value), "%Y-%m-%d").date()
    except ValueError:
        return 0
    if window_start:
        start = max(start, datetime.strptime(window_start, "%Y-%m-%d").date())
    if window_end:
        end = min(end, datetime.strptime(window_end, "%Y-%m-%d").date())
    return max(0, (end - start).days + 1)


# ----------------------------------------
# Profile field editing configuration
# (must be registered before /{employeeId})
# ----------------------------------------
@router.get("/edit-settings")
def get_profile_edit_settings(user=Depends(get_current_user)):
    settings = _profile_edit_settings()
    settings["isAdmin"] = str(user.get("role") or "").lower() == "admin" or str(user.get("employeeId") or "") == "50041"
    return settings


@router.put("/edit-settings")
def update_profile_edit_settings(data: dict, user=Depends(get_current_user)):
    if str(user.get("role") or "").lower() != "admin" and str(user.get("employeeId") or "") != "50041":
        raise HTTPException(status_code=403, detail="Administrator access required")
    enabled = data.get("enabledFields") or []
    enabled = [field for field in PROFILE_EDIT_FIELDS if field in enabled]
    system_settings_collection.update_one(
        {"_id": PROFILE_EDIT_SETTING_ID},
        {"$set": {"enabledFields": enabled, "updatedOn": datetime.utcnow(), "updatedBy": str(user.get("employeeId") or "")}},
        upsert=True,
    )
    return _profile_edit_settings()


# ---------------------------------
# Crew activity report and profile tiles
# ---------------------------------
@router.get("/activity-report")
def activity_report(
    employeeId: str | None = Query(default=None),
    employeeIds: str | None = Query(default=None),
    startDate: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    user=Depends(get_current_user),
):
    """Single audit/report feed for leave, training, C-OFF and replacement duties."""
    actor_id = str(user.get("employeeId") or "").strip()
    can_view_all = _report_actor_can_view_all(user)
    requested_ids = [value.strip() for value in str(employeeIds or employeeId or actor_id).split(",") if value.strip()]
    target_all = any(value.lower() == "all" for value in requested_ids)
    target_ids = [] if target_all else list(dict.fromkeys(requested_ids))
    target_id = target_ids[0] if len(target_ids) == 1 else ""
    if not target_ids and not target_all:
        raise HTTPException(400, detail="Employee ID is required")
    if (target_all or any(value != actor_id for value in target_ids)) and not can_view_all:
        raise HTTPException(403, detail="You can view only your own crew activity report")

    date_filter = {}
    if startDate:
        date_filter["$gte"] = startDate
    if endDate:
        date_filter["$lte"] = endDate

    def within(value) -> bool:
        value = _report_date(value)
        return bool(value) and (not startDate or value >= startDate) and (not endDate or value <= endDate)

    rows = []
    leave_query = ({"employeeId": target_ids[0]} if len(target_ids) == 1 else {"employeeId": {"$in": target_ids}}) if target_ids else {}
    if date_filter:
        leave_query["date"] = date_filter
    leaves = list(leave_request_collection.find(leave_query).sort("date", -1).limit(2000))
    leave_context = {}
    leave_dates = list({str(item.get("date") or "") for item in leaves if item.get("date")})
    leave_employee_ids = list({str(item.get("employeeId") or "") for item in leaves if item.get("employeeId")})
    if leave_dates and leave_employee_ids:
        for item in employee_daily_collection.find(
            {"employeeId": {"$in": leave_employee_ids}, "date": {"$in": leave_dates}},
            {"employeeId": 1, "date": 1, "isHoliday": 1, "holidayName": 1},
        ):
            leave_context[(str(item.get("employeeId") or ""), item.get("date"))] = item
    for item in leaves:
        leave_date = item.get("date")
        context = leave_context.get((str(item.get("employeeId") or ""), leave_date), {})
        try:
            is_weekend = datetime.strptime(str(leave_date), "%Y-%m-%d").weekday() >= 5
        except ValueError:
            is_weekend = False
        is_holiday = str(context.get("isHoliday") or "").upper() == "Y"
        day_label = f"Holiday · {context.get('holidayName') or 'Holiday'}" if is_holiday else "Weekend" if is_weekend else "Working day"
        rows.append({
            "id": str(item.get("_id")), "kind": "Leave", "date": item.get("date"),
            "employeeId": item.get("employeeId"), "employeeName": item.get("name"),
            "title": item.get("leaveType") or "Leave", "status": item.get("finalStatus") or "Applied",
            "detail": item.get("reason") or "", "groupName": item.get("groupName") or "",
            "appliedOn": item.get("appliedOn") or item.get("createdOn"), "dayLabel": day_label,
            "isWeekend": is_weekend, "isHoliday": is_holiday,
        })

    training_query = ({"employeeId": target_ids[0]} if len(target_ids) == 1 else {"employeeId": {"$in": target_ids}}) if target_ids else {}
    trainings = list(training_nomination_history_collection.find(training_query).sort("startDate", -1).limit(2000))
    filtered_trainings = [item for item in trainings if within(item.get("startDate")) or within(item.get("endDate"))]
    for item in filtered_trainings:
        rows.append({
            "id": str(item.get("_id")), "kind": "Training", "date": item.get("startDate"),
            "endDate": item.get("endDate"), "employeeId": item.get("employeeId"),
            "employeeName": item.get("employeeName") or item.get("name"),
            "title": item.get("trainingName") or "Training", "status": item.get("status") or "Pending",
            "detail": item.get("location") or item.get("trainingLocation") or "", "groupName": item.get("groupName") or "",
        })

    coff_query = ({"employeeId": target_ids[0]} if len(target_ids) == 1 else {"employeeId": {"$in": target_ids}}) if target_ids else {}
    coff_records = list(compensatory_off_collection.find(coff_query).sort("earnedDate", -1).limit(2000))
    filtered_coff_records = []
    for item in coff_records:
        earned_date = item.get("earnedDate") or item.get("date")
        if not within(earned_date):
            continue
        filtered_coff_records.append(item)
        rows.append({
            "id": str(item.get("_id")), "kind": "C-OFF", "date": earned_date,
            "employeeId": item.get("employeeId"), "employeeName": "", "title": "Compensatory off",
            "status": item.get("status") or "Available", "detail": item.get("reason") or item.get("reference", {}).get("type") or "",
            "expiryDate": item.get("expiryDate"), "usedDate": item.get("usedDate"),
        })

    replacement_query = ({"replacement.employeeId": target_ids[0]} if len(target_ids) == 1 else {"replacement.employeeId": {"$in": target_ids}}) if target_ids else {"replacement.employeeId": {"$exists": True, "$ne": None}}
    if date_filter:
        replacement_query["date"] = date_filter
    replacements = list(leave_request_collection.find(replacement_query).sort("date", -1).limit(2000))
    for item in replacements:
        replacement = item.get("replacement") or {}
        rows.append({
            "id": str(item.get("_id")), "kind": "Replacement duty", "date": item.get("date"),
            "employeeId": replacement.get("employeeId"), "employeeName": replacement.get("name"),
            "title": item.get("assignedDuty") or item.get("dutyType") or "Replacement duty",
            "status": replacement.get("status") or item.get("finalStatus") or "Assigned",
            "detail": f"In place of {item.get('name') or item.get('employeeId') or 'employee'}", "groupName": item.get("groupName") or "",
        })

    rows.sort(key=lambda item: (_report_date(item.get("date")), item.get("kind") or ""), reverse=True)
    employee_ids = {str(item.get("employeeId") or "").strip() for item in rows if item.get("employeeId")}
    employee_names = {
        str(item.get("userId") or item.get("employeeId") or "").strip(): item.get("name") or ""
        for item in employee_collection.find(
            {"$or": [{"userId": {"$in": list(employee_ids)}}, {"employeeId": {"$in": list(employee_ids)}}]},
            {"userId": 1, "employeeId": 1, "name": 1},
        )
    } if employee_ids else {}
    for row in rows:
        canonical_id = str(row.get("employeeId") or "").strip()
        # Employee Master is the single source for a printable employee name.
        row["employeeName"] = employee_names.get(canonical_id) or row.get("employeeName") or canonical_id
    def leave_notice_hours(item):
        """Hours between submission and the start of the requested leave day."""
        applied_on = item.get("appliedOn") or item.get("createdOn")
        leave_date = _report_date(item.get("date"))
        if not applied_on or not leave_date:
            return None
        try:
            applied = datetime.fromisoformat(str(applied_on).replace("Z", "+00:00")).replace(tzinfo=None)
            leave_start = datetime.strptime(leave_date, "%Y-%m-%d")
            return (leave_start - applied).total_seconds() / 3600
        except (TypeError, ValueError):
            return None

    leave_notice_values = [leave_notice_hours(item) for item in leaves]
    leave_notice_values = [hours for hours in leave_notice_values if hours is not None]
    summary = {
        "leave": len(leaves),
        "leaveApproved": sum(1 for item in leaves if str(item.get("finalStatus") or "").lower() == "approved"),
        "leaveWeekend": sum(1 for item in rows if item.get("kind") == "Leave" and item.get("isWeekend") and not item.get("isHoliday")),
        "leaveHoliday": sum(1 for item in rows if item.get("kind") == "Leave" and item.get("isHoliday")),
        "leaveWorkingDay": sum(1 for item in rows if item.get("kind") == "Leave" and not item.get("isWeekend") and not item.get("isHoliday")),
        "leaveAppliedWithin24Hours": sum(1 for hours in leave_notice_values if hours <= 24),
        "leaveAppliedPrior24Hours": sum(1 for hours in leave_notice_values if hours > 24),
        "training": len(filtered_trainings),
        "trainingApproved": sum(1 for item in filtered_trainings if str(item.get("status") or "").lower() == "approved"),
        "trainingDays": sum(_inclusive_days(item.get("startDate"), item.get("endDate"), startDate, endDate) for item in filtered_trainings if str(item.get("status") or "").lower() == "approved"),
        "compOff": len(filtered_coff_records),
        "compOffAvailable": sum(1 for item in filtered_coff_records if str(item.get("status") or "Available").lower() == "available"),
        "compOffUsed": sum(1 for item in filtered_coff_records if str(item.get("status") or "").lower() == "used"),
        "compOffUsedDays": sum(1 for item in filtered_coff_records if str(item.get("status") or "").lower() == "used"),
        "compOffDates": [_report_date(item.get("earnedDate") or item.get("date")) for item in filtered_coff_records],
        "replacement": len(replacements),
    }
    employee_options = []
    if can_view_all:
        employee_options = [{
            "employeeId": str(item.get("userId") or item.get("employeeId") or ""),
            "name": item.get("name") or "", "designation": item.get("designation") or "",
        } for item in employee_collection.find({"isActive": {"$ne": False}}, {"userId": 1, "employeeId": 1, "name": 1, "designation": 1}).sort("name", 1)]
        employee_options = [item for item in employee_options if item["employeeId"]]

    return {"employeeId": "all" if target_all else target_id, "employeeIds": target_ids, "canViewAll": can_view_all, "employees": employee_options, "summary": summary, "rows": rows}


@router.get("/activity-matrix")
def activity_matrix(
    startDate: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    user=Depends(get_current_user),
):
    """Employee-wise approved leave and training-day matrix for the selected period."""
    if not _report_actor_can_view_all(user):
        raise HTTPException(403, detail="Employee activity matrix is available to administrators")
    if not startDate or not endDate or startDate > endDate:
        raise HTTPException(400, detail="A valid From and To date are required")

    people = {
        str(item.get("userId") or item.get("employeeId") or "").strip(): {
            "employeeId": str(item.get("userId") or item.get("employeeId") or "").strip(),
            "employeeName": item.get("name") or "", "designation": item.get("designation") or "",
            "trainingDays": 0, "trainingTargetDays": 7, "trainings": [], "leaveTotal": 0, "leaveByType": {},
        }
        for item in employee_collection.find({"isActive": {"$ne": False}}, {"userId": 1, "employeeId": 1, "name": 1, "designation": 1})
    }
    people = {key: value for key, value in people.items() if key}
    categories = set()

    for leave in leave_request_collection.find({"date": {"$gte": startDate, "$lte": endDate}, "finalStatus": "Approved"}):
        employee_id = str(leave.get("employeeId") or "").strip()
        if not employee_id:
            continue
        row = people.setdefault(employee_id, {"employeeId": employee_id, "employeeName": leave.get("name") or employee_id, "designation": "", "trainingDays": 0, "trainingTargetDays": 7, "trainings": [], "leaveTotal": 0, "leaveByType": {}})
        leave_type = str(leave.get("leaveType") or "Other").strip() or "Other"
        categories.add(leave_type)
        row["leaveTotal"] += 1
        row["leaveByType"][leave_type] = row["leaveByType"].get(leave_type, 0) + 1

    for nomination in training_nomination_history_collection.find({"status": "Approved", "startDate": {"$lte": endDate}, "endDate": {"$gte": startDate}}):
        employee_id = str(nomination.get("employeeId") or "").strip()
        if not employee_id:
            continue
        row = people.setdefault(employee_id, {"employeeId": employee_id, "employeeName": nomination.get("employeeName") or nomination.get("name") or employee_id, "designation": "", "trainingDays": 0, "trainingTargetDays": 7, "trainings": [], "leaveTotal": 0, "leaveByType": {}})
        counted_days = _inclusive_days(nomination.get("startDate"), nomination.get("endDate"), startDate, endDate)
        row["trainingDays"] += counted_days
        row["trainings"].append({
            "id": str(nomination.get("_id")),
            "name": nomination.get("trainingName") or "Training",
            "startDate": nomination.get("startDate"),
            "endDate": nomination.get("endDate"),
            "days": counted_days,
            "location": nomination.get("trainingLocation") or nomination.get("location") or "",
        })

    category_order = sorted(categories, key=lambda value: (value not in {"CL", "C-OFF"}, value))
    rows = sorted(
        [row for row in people.values() if row["trainingDays"] or row["leaveTotal"]],
        key=lambda row: ((row["employeeName"] or "").lower(), row["employeeId"]),
    )
    return {"startDate": startDate, "endDate": endDate, "trainingTargetDays": 7, "leaveCategories": category_order, "rows": rows}


# -----------------------------
# 1. Profile (static info only)
# -----------------------------
@router.get("/{employeeId}")
def get_profile(employeeId: str):
    employeeId = str(employeeId or "").strip()
    employee = employee_collection.find_one(_employee_id_query(employeeId))

    if not employee:
        return {"error": "Employee not found"}

    canonical_id = str(employee.get("userId") or employee.get("employeeId") or employeeId).strip()
    organization = _current_organization(employee, canonical_id)
    history = employee.get("organizationHistory") or []
    employee_ids = set()
    for value in [
        *(organization.get("reportingOfficerIds") or []),
        *(organization.get("groupAuthorityIds") or []),
        organization.get("reportingOfficerId"), organization.get("intermediaryReportingId"), organization.get("hodId"),
    ]:
        if value:
            employee_ids.add(str(value))
    for entry in history:
        for value in [*(entry.get("reportingOfficerIds") or []), entry.get("intermediaryReportingId"), entry.get("hodId")]:
            if value:
                employee_ids.add(str(value))
    employee_names = {
        str(item.get("userId") or item.get("employeeId")): item.get("name")
        for item in employee_collection.find({"$or": [{"userId": {"$in": list(employee_ids)}}, {"employeeId": {"$in": list(employee_ids)}}]}, {"userId": 1, "employeeId": 1, "name": 1})
    } if employee_ids else {}
    function_ids = [str(value) for value in (organization.get("functionIds") or employee.get("functionIds") or []) if value]
    all_function_ids = list(dict.fromkeys(function_ids + [str(value) for entry in history for value in (entry.get("functionIds") or []) if value]))
    function_names = {
        str(item["_id"]): item.get("name")
        for item in organization_unit_collection.find({"_id": {"$in": [ObjectId(value) for value in all_function_ids if ObjectId.is_valid(value)]}}, {"name": 1})
    }
    serialized_history = [{
        **entry,
        "functions": [function_names.get(str(value), str(value)) for value in (entry.get("functionIds") or [])],
        "reportingOfficers": [employee_names.get(str(value), str(value)) for value in (entry.get("reportingOfficerIds") or [])],
        "intermediaryReporting": employee_names.get(str(entry.get("intermediaryReportingId"))) if entry.get("intermediaryReportingId") else None,
        "hod": employee_names.get(str(entry.get("hodId"))) if entry.get("hodId") else None,
    } for entry in history]
    return {
        "employeeId": canonical_id,
        "userId": canonical_id,
        "name": employee.get("name"),
        "nameHindi": employee.get("nameHindi"),
        "designation": employee.get("designation"),
        "designationHindi": employee.get("designationHindi"),
        "department": organization.get("department") or employee.get("department") or employee.get("vertical"),
        "email": employee.get("gmail") or employee.get("email"),
        "gmail": employee.get("gmail") or employee.get("email"),
        "phone": employee.get("phone"),
        "profilePhoto": _profile_photo_url(employee, canonical_id),
        "isActive": employee.get("isActive", True) is not False,
        "functions": [function_names.get(value, value) for value in function_ids],
        "verticals": organization.get("verticals") or employee.get("verticals") or ([employee.get("vertical")] if employee.get("vertical") else []),
        "sections": organization.get("sections") or employee.get("sections") or [],
        "departments": organization.get("departments") or employee.get("departments") or ([employee.get("department")] if employee.get("department") else []),
        "groupName": organization.get("groupName"),
        "reportingOfficers": [employee_names.get(str(value), str(value)) for value in (organization.get("reportingOfficerIds") or [])],
        "intermediaryReporting": employee_names.get(str(organization.get("intermediaryReportingId"))) if organization.get("intermediaryReportingId") else None,
        "hod": employee_names.get(str(organization.get("hodId"))) if organization.get("hodId") else None,
        "reportingLine": [
            {"employeeId": str(value), "name": employee_names.get(str(value), str(value))}
            for value in dict.fromkeys([
                *(organization.get("reportingOfficerIds") or []),
                *(organization.get("groupAuthorityIds") or []),
                organization.get("intermediaryReportingId"),
                organization.get("hodId"),
            ]) if value
        ],
        "organizationHistory": serialized_history,
    }

@router.get("/photo/{employeeId}")
def get_profile_photo(employeeId: str):
    employee = employee_collection.find_one(_employee_id_query(employeeId)) or {}

    filename = str(employee.get("profilePhotoFilename") or "").strip()
    if not filename and employee.get("profilePhoto"):
        filename = Path(str(employee.get("profilePhoto")).split("?", 1)[0]).name

    candidate = UPLOAD_FOLDER / filename if filename else _latest_profile_file(employeeId)
    if not candidate or not candidate.exists():
        raise HTTPException(status_code=404, detail="Profile photo not found")

    return FileResponse(candidate)


# ---------------------------------
# 2. Monthly Duty Stats (dropdown)
# ---------------------------------
@router.get("/stats/duty")
def duty_stats(employeeId: str, year: int, month: int):
    pipeline = [
        {
            "$addFields": {
                "dateObj": {
                    "$dateFromString": {
                        "dateString": "$date"
                    }
                }
            }
        },
        {
            "$match": {
                "employeeId": employeeId,
                "$expr": {
                    "$and": [
                        {"$eq": [{"$year": "$dateObj"}, year]},
                        {"$eq": [{"$month": "$dateObj"}, month]}
                    ]
                }
            }
        },
        {
            "$group": {
                "_id": "$assignedDuty",
                "count": {"$sum": 1}
            }
        }
    ]

    stats = list(employee_daily_collection.aggregate(pipeline))

    return {
        "employeeId": employeeId,
        "year": year,
        "month": month,
        "stats": stats
    }


# ---------------------------------
# 3. Yearly Leave Stats
# ---------------------------------
@router.get("/stats/leave")
def leave_stats(employeeId: str, year: int):
    pipeline = [
        {
            "$addFields": {
                "dateObj": {
                    "$dateFromString": {
                        "dateString": "$date"
                    }
                }
            }
        },
        {
            "$match": {
                "employeeId": employeeId,
                "leaveStatus": "Approved",
                "$expr": {
                    "$eq": [
                        {"$year": "$dateObj"},
                        year
                    ]
                }
            }
        },
        {
            "$group": {
                "_id": "$leaveType",
                "count": {"$sum": 1}
            }
        }
    ]

    stats = list(employee_daily_collection.aggregate(pipeline))

    return {
        "employeeId": employeeId,
        "year": year,
        "stats": stats
    }


# ---------------------------------
# 4. Training Stats by Financial Year
# ---------------------------------
@router.get("/stats/training")
def training_stats(
    employeeId: str,
    financialYear: str = Query(...),
):
    stats = list(
        training_nomination_history_collection.aggregate([
            {
                "$match": {
                    "employeeId": employeeId,
                    "status": "Approved",
                    "financialYear": financialYear
                }
            },
            {
                "$group": {
                    "_id": "$trainingName",
                    "count": {"$sum": 1}
                }
            }
        ])
    )

    return {"financialYear": financialYear, "stats": stats}


# ---------------------------------
# 5. Profile Update
# ---------------------------------
@router.post("/update")
async def update_profile(
    employeeId: str = Form(...),
    name: str = Form(""),
    nameHindi: str = Form(""),
    designation: str = Form(""),
    designationHindi: str = Form(""),
    phone: str = Form(""),
    gmail: str = Form(""),
    photo: UploadFile = File(None),
    user=Depends(get_current_user),
):
    is_admin = user.get("role") == "admin" or str(user.get("employeeId") or "") == "50041"
    if not is_admin and str(user.get("employeeId") or "").strip() != employeeId:
        raise HTTPException(status_code=403, detail="Access denied")

    submitted = {
        "name": name,
        "nameHindi": nameHindi,
        "designation": designation,
        "designationHindi": designationHindi,
        "phone": phone,
        "gmail": gmail,
    }
    allowed = set(PROFILE_EDIT_FIELDS if is_admin else _profile_edit_settings()["enabledFields"])
    update_data = {field: value for field, value in submitted.items() if field in allowed}

    if photo and "profilePhoto" in allowed:
        content = ensure_upload_allowed(
            photo,
            allowed_content_types={"image/jpeg", "image/png", "image/webp"},
            allowed_extensions={"jpg", "jpeg", "png", "webp"},
            max_bytes=2 * 1024 * 1024,
        )

        extension = Path(photo.filename or "profile.jpg").suffix.lower()
        if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
            extension = ".jpg"

        filename = f"{employeeId}{extension}"
        filepath = UPLOAD_FOLDER / filename

        with open(filepath, "wb") as buffer:
            buffer.write(content)

        updated_on = datetime.utcnow()
        update_data["profilePhotoFilename"] = filename
        update_data["profilePhotoUpdatedOn"] = updated_on
        update_data["profilePhoto"] = f"/api/crew/profile/photo/{employeeId}?v={int(updated_on.timestamp())}"

    employee_collection.update_one(
        _employee_id_query(employeeId),
        {"$set": update_data},
    )

    employee = employee_collection.find_one(_employee_id_query(employeeId)) or {}

    return {
        "employeeId": employee.get("userId") or employee.get("employeeId"),
        "name": employee.get("name"),
        "nameHindi": employee.get("nameHindi"),
        "designation": employee.get("designation"),
        "designationHindi": employee.get("designationHindi"),
        "phone": employee.get("phone"),
        "email": employee.get("gmail") or employee.get("email"),
        "gmail": employee.get("gmail") or employee.get("email"),
        "profilePhoto": _profile_photo_url(employee, employeeId),
    }


@router.post("/change-password")
async def change_password(
    employeeId: str = Form(...),
    currentPassword: str = Form(""),
    newPassword: str = Form(...),
    confirmPassword: str = Form(...),
    user=Depends(get_current_user),
):
    is_admin = user.get("role") == "admin" or str(user.get("employeeId") or "") == "50041"
    if not is_admin and str(user.get("employeeId") or "").strip() != employeeId:
        raise HTTPException(status_code=403, detail="Access denied")
    if not is_admin and "password" not in _profile_edit_settings()["enabledFields"]:
        raise HTTPException(status_code=403, detail="Password change is disabled by the administrator")

    if newPassword != confirmPassword:
        raise HTTPException(status_code=400, detail="New password and confirm password do not match")

    validate_password_policy(newPassword)

    employee = employee_collection.find_one(_employee_id_query(employeeId))
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    if user.get("role") != "admin":
        stored_password = str(employee.get("password") or "")
        if not currentPassword:
            raise HTTPException(status_code=400, detail="Current password is required")
        if not verify_password(currentPassword, stored_password):
            raise HTTPException(status_code=400, detail="Current password is incorrect")

    employee_collection.update_one(
        {"_id": employee["_id"]},
        {"$set": {"password": hash_password(newPassword)}},
    )

    return {"message": "Password changed successfully"}


###########################################
#### C-OFF Collection #############
###########################################

@router.get("/stats/coff")
def get_coff_stats(employeeId: str):
    records = list(compensatory_off_collection.find({
        "employeeId": employeeId
    }))

    total = len(records)
    used = len([r for r in records if r.get("status") == "Used"])
    available = len([r for r in records if r.get("status") == "Available"])

    return {
        "summary": {
            "total": total,
            "used": used,
            "available": available
        },
        "details": [
            {
                "earnedDate": r.get("earnedDate"),
                "expiryDate": r.get("expiryDate"),
                "usedDate": r.get("usedDate"),
                "status": r.get("status"),
                "reason": r.get("reason")
            }
            for r in records
        ]
    }
