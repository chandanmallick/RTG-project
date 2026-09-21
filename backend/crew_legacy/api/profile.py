from datetime import datetime, timedelta
from difflib import SequenceMatcher
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import ssl
from bson import ObjectId
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from crew_legacy.admin_logic.auth_utils import get_current_user, hash_password, validate_password_policy, verify_password
from crew_legacy.database.database_mongo import (
    compensatory_off_collection,
    DutyLeave_collection,
    duty_switch_collection,
    employee_collection,
    employee_daily_collection,
    leave_request_collection,
    roster_master_collection,
    training_nomination_history_collection,
    organization_unit_collection,
    organization_shift_group_collection,
    roster_group_collection,
    system_settings_collection,
    operational_collection,
)
from crew_legacy.security_utils import ensure_upload_allowed
from crew_legacy.api.duty_rules import duty_category, is_excluded_duty_record, normalized_duty
from crew_legacy.api.auth import LANDING_PAGE_KEYS

router = APIRouter()

UPLOAD_FOLDER = Path(__file__).resolve().parents[2] / "uploads" / "profile"
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

PROFILE_EDIT_SETTING_ID = "profile_edit_fields"
PROFILE_EDIT_FIELDS = (
    "name", "nameHindi", "designation", "designationHindi",
    "phone", "gmail", "profilePhoto", "password",
)

CRMS_BASE_URL = "https://crms.erldc.in/"
CRMS_LOGBOOK_URL = os.getenv(
    "CRMS_LOGBOOK_URL", "https://crms.erldc.in/LogBook/viewAllLoagBooks"
).strip()
CRMS_SSO_TOKEN_URL = os.getenv(
    "CRMS_SSO_TOKEN_URL", "https://sso.erldc.in:5000/token"
).strip()
# The ERLDC browser-based SSO client uses this public client-side signing
# value. It is not a CRMS account credential; deployments may override it.
DEFAULT_CRMS_SSO_JWT_SECRET = "frontendss0@posoco"
crms_logbook_cache_collection = operational_collection("crms_logbook_duty_cache")


class _CrmsLegacySslAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        context = create_urllib3_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        context.options |= 0x4  # OP_LEGACY_SERVER_CONNECT
        kwargs["ssl_context"] = context
        return super().init_poolmanager(*args, **kwargs)


def _base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _crms_sso_assertion(username: str, password: str, signing_secret: str) -> str:
    """Build the credential assertion expected by the ERLDC SSO token API."""
    header = _base64url(json.dumps(
        {"alg": "HS256", "typ": "JWT"}, separators=(",", ":")
    ).encode())
    body = _base64url(json.dumps(
        {"username": username, "password": password}, separators=(",", ":")
    ).encode())
    unsigned = f"{header}.{body}"
    signature = hmac.new(
        signing_secret.encode(), unsigned.encode(), hashlib.sha256
    ).digest()
    return f"{unsigned}.{_base64url(signature)}"


def _new_crms_session() -> tuple[requests.Session, str]:
    """Create an authenticated CRMS session using the central SSO token flow.

    A static cookie remains supported as a break-glass fallback, but normal
    operation uses stable service-account credentials and obtains fresh CRMS
    session/CSRF cookies for every report refresh.
    """
    session = requests.Session()
    session.mount("https://", _CrmsLegacySslAdapter())

    username = str(os.getenv("CRMS_SSO_USERNAME") or "").strip()
    password = str(os.getenv("CRMS_SSO_PASSWORD") or "").strip()
    static_cookie = str(os.getenv("CRMS_LOGBOOK_COOKIE") or "").strip()
    static_csrf = str(os.getenv("CRMS_LOGBOOK_CSRF_TOKEN") or "").strip()
    if not (username and password) and static_cookie:
        if not static_csrf:
            csrf_match = re.search(
                r"(?:^|;\s*)csrftoken=([^;]+)", static_cookie, re.IGNORECASE
            )
            static_csrf = csrf_match.group(1) if csrf_match else ""
        session.headers["Cookie"] = static_cookie
        return session, static_csrf

    signing_secret = str(
        os.getenv("CRMS_SSO_JWT_SECRET") or DEFAULT_CRMS_SSO_JWT_SECRET
    ).strip()
    if not all((username, password)):
        raise RuntimeError(
            "CRMS automatic SSO is not configured. Save an authorized CRMS "
            "username and password in Admin Module > Mail & 2FA Settings."
        )

    assertion = _crms_sso_assertion(username, password, signing_secret)
    token_response = session.post(
        CRMS_SSO_TOKEN_URL,
        json={"headers": {"token": assertion}},
        timeout=30,
        verify=False,
    )
    token_response.raise_for_status()
    try:
        token_payload = token_response.json()
    except ValueError as exc:
        raise RuntimeError("CRMS SSO returned an unexpected token response") from exc
    sso_token = str(
        (token_payload.get("Token") or token_payload.get("token") or "")
        if isinstance(token_payload, dict) else ""
    ).strip()
    if not sso_token:
        raise RuntimeError("CRMS SSO rejected the configured service account")

    # This is the same hand-off used by the ERLDC SSO application launcher.
    login_response = session.get(
        CRMS_BASE_URL,
        params={"token": sso_token},
        timeout=60,
        verify=False,
        allow_redirects=True,
    )
    login_response.raise_for_status()
    if "sso.erldc.in" in str(login_response.url).lower():
        raise RuntimeError("CRMS did not accept the SSO service-account session")

    csrf_token = ""
    for cookie in session.cookies:
        if cookie.name.lower() == "csrftoken":
            csrf_token = cookie.value
            break
    return session, csrf_token


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
    reporting_ids = (
        [group_sic_id]
        if group_sic_id and group_sic_id != employee_id
        else list(resolved.get("reportingOfficerIds") or direct_unit_heads)
    )
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
    # Crew Reports are an authenticated employee resource. This includes the
    # detailed report, consolidated activity matrix and CRMS reconciliation.
    return bool(str(user.get("employeeId") or user.get("userId") or "").strip())


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
    training_query["workflowKind"] = {"$ne": "Adjacent OFF"}
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
    """Consolidated employee duty, replacement, training and leave matrix."""
    if not _report_actor_can_view_all(user):
        raise HTTPException(403, detail="Employee activity matrix is available to administrators")
    if not startDate or not endDate or startDate > endDate:
        raise HTTPException(400, detail="A valid From and To date are required")

    duty_categories = ["Morning", "Evening", "Night", "OFF", "Other"]
    shift_duty_categories = ["Morning", "Evening", "Night", "OFF"]

    units = list(organization_unit_collection.find({"isActive": {"$ne": False}}))
    unit_map = {str(unit.get("_id")): unit for unit in units}
    department_sub_departments = {
        str(department.get("name") or "").strip(): sorted({
            str(unit.get("name") or "").strip()
            for unit in units
            if unit.get("unitType") == "vertical"
            and str(unit.get("parentId") or "") == str(department.get("_id") or "")
            and str(unit.get("name") or "").strip()
        })
        for department in units
        if department.get("unitType") == "department" and str(department.get("name") or "").strip()
    }

    period_groups = list(roster_group_collection.find({
        "startDate": {"$lte": endDate},
        "$or": [
            {"endDate": {"$gte": startDate}},
            {"endDate": {"$in": [None, ""]}},
            {"endDate": {"$exists": False}},
        ],
    }))
    period_group_members: dict[str, set[str]] = {}
    employee_period_groups: dict[str, set[str]] = {}
    for group in period_groups:
        group_name = str(group.get("groupName") or "").strip()
        if not group_name:
            continue
        member_ids = period_group_members.setdefault(group_name, set())
        for person in [group.get("shiftInCharge") or {}, *(group.get("members") or [])]:
            employee_id = str(person.get("employeeId") or person.get("userId") or person.get("id") or "").strip()
            if not employee_id:
                continue
            member_ids.add(employee_id)
            employee_period_groups.setdefault(employee_id, set()).add(group_name)

    sub_department_groups: dict[str, list[str]] = {}
    group_organization: dict[str, dict] = {}
    for mapping in organization_shift_group_collection.find({}):
        group_name = str(mapping.get("groupName") or "").strip()
        if not group_name or group_name not in period_group_members:
            continue
        unit_id = str(mapping.get("organizationUnitId") or "")
        lineage = []
        visited = set()
        while unit_id and unit_id in unit_map and unit_id not in visited:
            visited.add(unit_id)
            unit = unit_map[unit_id]
            lineage.append(unit)
            unit_id = str(unit.get("parentId") or "")
        sub_department = next((
            str(unit.get("name") or "").strip()
            for unit in lineage if unit.get("unitType") == "vertical"
        ), "")
        department = next((
            str(unit.get("name") or "").strip()
            for unit in lineage if unit.get("unitType") == "department"
        ), "")
        if sub_department:
            sub_department_groups.setdefault(sub_department, []).append(group_name)
            group_organization[group_name] = {"department": department, "subDepartment": sub_department}
    sub_department_groups = {
        name: sorted(set(groups), key=str.lower)
        for name, groups in sub_department_groups.items()
    }

    def empty_row(employee_id: str, name: str = "", designation: str = "", employee: dict | None = None) -> dict:
        organization = _current_organization(employee or {}, employee_id) if employee else {}
        departments = organization.get("departments") or (employee or {}).get("departments") or []
        if isinstance(departments, str):
            departments = [departments]
        fallback_department = organization.get("department") or (employee or {}).get("department")
        if fallback_department and fallback_department not in departments:
            departments.append(fallback_department)
        sub_departments = organization.get("verticals") or (employee or {}).get("verticals") or []
        if isinstance(sub_departments, str):
            sub_departments = [sub_departments]
        group_name = organization.get("groupName") or ""
        period_group_names = sorted(employee_period_groups.get(employee_id, set()), key=str.lower)
        for period_group_name in period_group_names:
            period_organization = group_organization.get(period_group_name) or {}
            period_department = period_organization.get("department")
            period_sub_department = period_organization.get("subDepartment")
            if period_department and period_department not in departments:
                departments.append(period_department)
            if period_sub_department and period_sub_department not in sub_departments:
                sub_departments.append(period_sub_department)
        return {
            "employeeId": employee_id,
            "employeeName": name,
            "designation": designation,
            "departments": [str(value).strip() for value in departments if str(value).strip()],
            "department": (departments or [""])[0],
            "subDepartments": [str(value).strip() for value in sub_departments if str(value).strip()],
            "groupName": group_name,
            "periodGroupNames": period_group_names,
            "workforceType": "Shift" if period_group_names or group_name else "Non-shift",
            "assignedDutyDays": 0,
            "shiftDutyDays": 0,
            "dutyCounts": {category: 0 for category in duty_categories},
            "replacementDutyDays": 0,
            "trainingDays": 0,
            "trainingTargetDays": 7,
            "trainings": [],
            "leaveTotal": 0,
            "leaveByType": {},
            "compOffDays": 0,
            "compOffUsable": 0,
            "compOffNonExpired": 0,
            "compOffCredits": [],
        }

    people = {}
    for item in employee_collection.find({"isActive": {"$ne": False}}):
        employee_id = str(item.get("userId") or item.get("employeeId") or "").strip()
        if employee_id:
            people[employee_id] = empty_row(employee_id, item.get("name") or "", item.get("designation") or "", item)
    categories = set()

    approved_leaves = list(leave_request_collection.find({
        "date": {"$gte": startDate, "$lte": endDate},
        "finalStatus": "Approved",
    }))
    approved_leave_dates = {
        (str(leave.get("employeeId") or "").strip(), _report_date(leave.get("date")))
        for leave in approved_leaves
        if str(leave.get("employeeId") or "").strip() and _report_date(leave.get("date")) and not leave.get("stationLeaveOnly")
    }

    for daily in employee_daily_collection.find(
        {"date": {"$gte": startDate, "$lte": endDate}, "employeeId": {"$exists": True, "$ne": None}},
        {"employeeId": 1, "name": 1, "designation": 1, "assignedDuty": 1, "actualStatus": 1,
         "date": 1, "groupName": 1, "replacementDuty": 1, "trainingName": 1,
         "trainingFinal": 1, "trainingAdjacentOff": 1, "leaveStatus": 1},
    ):
        employee_id = str(daily.get("employeeId") or "").strip()
        if not employee_id:
            continue
        row = people.setdefault(employee_id, empty_row(employee_id, daily.get("name") or employee_id, daily.get("designation") or ""))
        is_approved_leave_date = (employee_id, _report_date(daily.get("date"))) in approved_leave_dates
        category = duty_category(daily)
        excluded_from_duty = is_excluded_duty_record(daily, is_approved_leave_date)
        if category and not excluded_from_duty:
            row["assignedDutyDays"] += 1
            row["dutyCounts"][category] = row["dutyCounts"].get(category, 0) + 1
            if category in shift_duty_categories:
                row["shiftDutyDays"] += 1
        if daily.get("replacementDuty") and not excluded_from_duty:
            row["replacementDutyDays"] += 1
        if not row.get("groupName") and daily.get("groupName") and daily.get("groupName") != "Other Employees":
            row["groupName"] = daily.get("groupName")
            row["workforceType"] = "Shift"

    comp_off_keys = set()
    for leave in approved_leaves:
        employee_id = str(leave.get("employeeId") or "").strip()
        if not employee_id:
            continue
        row = people.setdefault(employee_id, empty_row(employee_id, leave.get("name") or employee_id))
        if leave.get("stationLeaveOnly"):
            continue
        leave_type = str(leave.get("leaveType") or "Other").strip() or "Other"
        if leave_type.upper().replace(" ", "-") in {"C-OFF", "COFF"}:
            comp_off_key = (employee_id, _report_date(leave.get("date")))
            if comp_off_key not in comp_off_keys:
                comp_off_keys.add(comp_off_key)
                row["compOffDays"] += 1
            continue
        categories.add(leave_type)
        row["leaveTotal"] += 1
        row["leaveByType"][leave_type] = row["leaveByType"].get(leave_type, 0) + 1

    for nomination in training_nomination_history_collection.find({
        "status": "Approved",
        "workflowKind": {"$ne": "Adjacent OFF"},
        "startDate": {"$lte": endDate},
        "endDate": {"$gte": startDate},
    }):
        employee_id = str(nomination.get("employeeId") or "").strip()
        if not employee_id:
            continue
        row = people.setdefault(employee_id, empty_row(employee_id, nomination.get("employeeName") or nomination.get("name") or employee_id))
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

    for comp_off in compensatory_off_collection.find({
        "$or": [
            {"earnedDate": {"$gte": startDate, "$lte": endDate}},
            {"date": {"$gte": startDate, "$lte": endDate}},
        ],
    }):
        employee_id = str(comp_off.get("employeeId") or "").strip()
        if not employee_id:
            continue
        row = people.setdefault(employee_id, empty_row(employee_id, comp_off.get("employeeName") or employee_id))
        comp_off_key = (employee_id, _report_date(comp_off.get("earnedDate") or comp_off.get("date")))
        if comp_off_key not in comp_off_keys:
            comp_off_keys.add(comp_off_key)
            row["compOffDays"] += 1

    # Current C-OFF balance/details are intentionally independent of the
    # activity report period. The matrix shows usable / total non-expired,
    # while the period-specific earned/used count remains in compOffDays.
    balance_as_of = datetime.now().date().isoformat()
    for comp_off in compensatory_off_collection.find({"employeeId": {"$exists": True, "$ne": None}}).sort([
        ("earnedDate", -1), ("date", -1), ("createdOn", -1),
    ]):
        employee_id = str(comp_off.get("employeeId") or "").strip()
        if not employee_id:
            continue
        row = people.setdefault(
            employee_id,
            empty_row(employee_id, comp_off.get("employeeName") or employee_id, comp_off.get("designation") or ""),
        )
        earned_date = _report_date(comp_off.get("earnedDate") or comp_off.get("date"))
        expiry_date = _report_date(comp_off.get("expiryDate"))
        if not expiry_date and earned_date:
            try:
                expiry_date = f"{datetime.strptime(earned_date, '%Y-%m-%d').year + 1}-03-31"
            except ValueError:
                expiry_date = ""
        raw_status = str(comp_off.get("status") or "Available").strip() or "Available"
        expired = bool(expiry_date and expiry_date < balance_as_of)
        display_status = "Expired" if expired and raw_status.lower() == "available" else raw_status
        non_expired = not expired
        usable = non_expired and raw_status.lower() == "available"
        if non_expired:
            row["compOffNonExpired"] += 1
        if usable:
            row["compOffUsable"] += 1
        reference = comp_off.get("reference") or {}
        row["compOffCredits"].append({
            "id": str(comp_off.get("_id")),
            "earnedDate": earned_date,
            "expiryDate": expiry_date,
            "status": display_status,
            "usable": usable,
            "nonExpired": non_expired,
            "usedDate": _report_date(comp_off.get("usedDate")),
            "reason": comp_off.get("reason") or reference.get("reason") or "",
            "source": reference.get("type") or ("Roster" if comp_off.get("rosterId") else "System"),
            "groupName": reference.get("groupName") or comp_off.get("groupName") or "",
            "linkedLeaveId": comp_off.get("linkedLeaveId") or reference.get("leaveRequestId"),
        })

    configured_leave_categories = {
        str(item.get("value") or "").strip()
        for item in DutyLeave_collection.find(
            {"dutyLeaveType_cat": "leaveType", "status": "Active"},
            {"value": 1},
        )
        if str(item.get("value") or "").strip()
        and str(item.get("value") or "").strip().upper().replace(" ", "-") not in {"C-OFF", "COFF"}
    }
    category_order = sorted(categories | configured_leave_categories, key=lambda value: (value not in {"CL", "C-OFF"}, value))
    rows = sorted(people.values(), key=lambda row: ((row["employeeName"] or "").lower(), row["employeeId"]))
    department_options = sorted({value for row in rows for value in row.get("departments") or []})
    sub_department_options = sorted({value for values in department_sub_departments.values() for value in values})
    group_options = sorted(period_group_members, key=str.lower)
    return {
        "startDate": startDate,
        "endDate": endDate,
        "trainingTargetDays": 7,
        "dutyCategories": duty_categories,
        "shiftDutyCategories": shift_duty_categories,
        "leaveCategories": category_order,
        "otherCategories": ["Training", "C-OFF"],
        "departments": department_options,
        "subDepartments": sub_department_options,
        "departmentSubDepartments": department_sub_departments,
        "groupNames": group_options,
        "subDepartmentGroups": sub_department_groups,
        "groupMembers": {name: sorted(members) for name, members in period_group_members.items()},
        "workforceTypes": ["Shift", "Non-shift"],
        "rows": rows,
    }


def _crms_name_key(value) -> str:
    text = re.sub(r"[^a-z0-9 ]+", " ", str(value or "").lower())
    text = re.sub(r"\b(shri|sri|mr|ms|mrs|dr)\b", " ", text)
    return " ".join(text.split())


def _crms_shift(value) -> str:
    text = str(value or "").strip().lower()
    if text.startswith("m"):
        return "Morning"
    if text.startswith("e"):
        return "Evening"
    if text.startswith("n"):
        return "Night"
    return str(value or "").strip()


def _crms_log_datetime(value) -> datetime | None:
    text = str(value or "").strip()
    for pattern in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(text[:19], pattern)
        except ValueError:
            continue
    return None


def _fetch_crms_logbooks(start_date: str, end_date: str) -> list[dict]:
    session, csrf_token = _new_crms_session()
    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/json",
        "Referer": "https://crms.erldc.in/LogBook/",
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
    }
    if csrf_token:
        headers["X-CSRFToken"] = csrf_token
    response = session.post(
        CRMS_LOGBOOK_URL,
        json={"start_date": f"{start_date} 00:00", "end_date": f"{end_date} 23:59"},
        headers=headers,
        timeout=120,
        verify=False,
        allow_redirects=False,
    )
    content_type = str(response.headers.get("content-type") or "").lower()
    if response.status_code in {302, 401, 403} or "json" not in content_type:
        raise RuntimeError(
            "CRMS logbook access was not authorized. Verify the configured CRMS "
            "SSO service account, then refresh this report."
        )
    response.raise_for_status()
    payload = response.json()
    rows = (payload.get("data") or payload.get("rows") or []) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise RuntimeError("CRMS returned an unexpected logbook response")
    now = datetime.utcnow()
    for item in rows:
        if not isinstance(item, dict) or not item.get("Log_Key"):
            continue
        crms_logbook_cache_collection.update_one(
            {"Log_Key": item["Log_Key"]},
            {"$set": {**item, "cachedAt": now, "source": "CRMS"}},
            upsert=True,
        )
    return [item for item in rows if isinstance(item, dict)]


@router.get("/crms-duty-reconciliation")
def crms_duty_reconciliation(
    startDate: str = Query(...),
    endDate: str = Query(...),
    refresh: bool = Query(default=False),
    user=Depends(get_current_user),
):
    """Compare actual CRMS desk staffing with the final Crew daily assignment."""
    if not _report_actor_can_view_all(user):
        raise HTTPException(403, detail="CRMS duty reconciliation is available to administrators")
    if not startDate or not endDate or startDate > endDate:
        raise HTTPException(400, detail="A valid From and To date are required")

    source_error = ""
    source = "CRMS live"
    logs = []
    try:
        logs = _fetch_crms_logbooks(startDate, endDate)
    except Exception as exc:
        source_error = str(exc)
    if not logs:
        source = "Cached CRMS"
        logs = list(crms_logbook_cache_collection.find({
            "Log_In_Time": {"$gte": f"{startDate} 00:00", "$lte": f"{endDate} 23:59"}
        }, {"_id": 0}).sort("Log_In_Time", 1))
    if not logs and source_error:
        raise HTTPException(502, detail=source_error)

    employee_docs = list(employee_collection.find({"isActive": {"$ne": False}}))
    employees = {}
    exact_names = {}
    sorted_names = {}
    for item in employee_docs:
        employee_id = str(item.get("userId") or item.get("employeeId") or "").strip()
        if not employee_id:
            continue
        name = str(item.get("name") or employee_id).strip()
        employees[employee_id] = {
            "employeeId": employee_id,
            "employeeName": name,
            "designation": item.get("designation") or "",
        }
        stored_aliases = item.get("aliases") or []
        if isinstance(stored_aliases, str):
            stored_aliases = [stored_aliases]
        aliases = [name, *stored_aliases, item.get("nameHindi")]
        for alias in aliases:
            key = _crms_name_key(alias)
            if key:
                exact_names[key] = employee_id
                sorted_names[" ".join(sorted(key.split()))] = employee_id

    def match_employee(crms_name: str):
        key = _crms_name_key(crms_name)
        if not key:
            return None, 0.0
        employee_id = exact_names.get(key) or sorted_names.get(" ".join(sorted(key.split())))
        if employee_id:
            return employee_id, 1.0
        best_id, best_score = None, 0.0
        for candidate, candidate_id in exact_names.items():
            score = SequenceMatcher(None, key, candidate).ratio()
            if score > best_score:
                best_id, best_score = candidate_id, score
        return (best_id, round(best_score, 3)) if best_score >= 0.82 else (None, round(best_score, 3))

    daily_records = list(employee_daily_collection.find(
        {"date": {"$gte": startDate, "$lte": endDate}},
        {"_id": 0, "employeeId": 1, "date": 1, "assignedDuty": 1, "groupName": 1,
         "replacementDuty": 1, "replacementFor": 1, "lastDutySwitch": 1, "leaveId": 1,
         "leaveStatus": 1, "actualStatus": 1, "trainingName": 1, "trainingFinal": 1,
         "trainingAdjacentOff": 1},
    ))
    approved_leave_keys = {
        (str(item.get("employeeId") or "").strip(), _report_date(item.get("date")))
        for item in leave_request_collection.find({
            "date": {"$gte": startDate, "$lte": endDate},
            "finalStatus": "Approved",
        }, {"employeeId": 1, "date": 1})
    }
    daily_records = [
        item for item in daily_records
        if not is_excluded_duty_record(
            item,
            (str(item.get("employeeId") or "").strip(), _report_date(item.get("date"))) in approved_leave_keys,
        )
    ]
    destination_switches = list(duty_switch_collection.find({
        "date": {"$gte": startDate, "$lte": endDate},
        "direction": "destination",
        "source": "Cross-date duty transfer",
    }, {"_id": 0, "switchId": 1, "date": 1, "sourceDate": 1, "destinationDate": 1, "previous": 1, "updated": 1}))
    destination_switch_ids = [str(item.get("switchId") or "") for item in destination_switches if item.get("switchId")]
    source_switches = list(duty_switch_collection.find({
        "switchId": {"$in": destination_switch_ids},
        "direction": "source",
    }, {"_id": 0, "switchId": 1, "previous": 1, "updated": 1})) if destination_switch_ids else []
    source_switch_by_id = {str(item.get("switchId")): item for item in source_switches if item.get("switchId")}
    destination_switch_by_daily_key = {
        (str(item.get("date") or item.get("destinationDate") or ""), str(item.get("switchId") or "")): item
        for item in destination_switches
        if item.get("switchId")
    }

    roster_entries = []
    for daily in daily_records:
        employee_id = str(daily.get("employeeId") or "").strip()
        assigned_duty = _crms_shift(daily.get("assignedDuty"))
        if not employee_id or assigned_duty not in {"Morning", "Evening", "Night"}:
            continue
        switch = daily.get("lastDutySwitch") or {}
        switch_id = str(switch.get("switchId") or "")
        destination_switch = destination_switch_by_daily_key.get((str(daily.get("date") or ""), switch_id))
        source_switch = source_switch_by_id.get(switch_id) or {}
        original_duty = _crms_shift((destination_switch or {}).get("previous", {}).get("assignedDuty"))
        original_group = (destination_switch or {}).get("previous", {}).get("groupName") or daily.get("groupName") or ""
        moved_group = (source_switch.get("previous") or {}).get("groupName") or daily.get("groupName") or ""
        # A cross-group rescheduled duty is additional to the person's normal
        # roster duty on the destination date. Reconstruct both assignments
        # from the approved switch audit instead of letting the moved duty hide
        # the normal roster duty in reconciliation/reporting.
        is_cross_group_additional = bool(
            destination_switch
            and original_duty in {"Morning", "Evening", "Night"}
            and original_group
            and moved_group
            and original_group != moved_group
        )
        if is_cross_group_additional:
            roster_entries.extend([
                {
                    "id": f"roster:{daily.get('date')}:{employee_id}:normal:{switch_id}",
                    "date": str(daily.get("date") or ""), "employeeId": employee_id,
                    "employeeName": employees.get(employee_id, {}).get("employeeName") or employee_id,
                    "shift": original_duty, "groupName": original_group,
                    "replacementDuty": False, "replacementFor": "", "assignmentType": "Normal roster duty",
                },
                {
                    "id": f"roster:{daily.get('date')}:{employee_id}:rescheduled:{switch_id}",
                    "date": str(daily.get("date") or ""), "employeeId": employee_id,
                    "employeeName": employees.get(employee_id, {}).get("employeeName") or employee_id,
                    "shift": assigned_duty, "groupName": moved_group,
                    "replacementDuty": True, "replacementFor": "", "assignmentType": f"Rescheduled duty from {destination_switch.get('sourceDate') or 'another date'}",
                },
            ])
            continue
        roster_entries.append({
            "id": f"roster:{daily.get('date')}:{employee_id}",
            "date": str(daily.get("date") or ""),
            "employeeId": employee_id,
            "employeeName": employees.get(employee_id, {}).get("employeeName") or employee_id,
            "shift": assigned_duty,
            "groupName": daily.get("groupName") or "",
            "replacementDuty": bool(daily.get("replacementDuty")),
            "replacementFor": daily.get("replacementFor") or "",
            "assignmentType": "Replacement duty" if daily.get("replacementDuty") else "Normal roster duty",
        })
    roster_by_employee_date = {}
    for entry in roster_entries:
        roster_by_employee_date.setdefault((entry["date"], entry["employeeId"]), []).append(entry)
    role_fields = [
        ("Shift_Incharge_Name", "Shift In-charge"),
        ("Sch_Open_Acc_Desk", "Schedule & Open Access"),
        ("Rea_Tim_Sec_Desk", "Real-time Security"),
        ("Rep_Desk", "Reporting"),
        ("Rea_Tim_Mon_Con_Desk", "Real-time Monitoring & Control"),
    ]
    details = []
    seen_actual_by_log = {}

    for log in sorted(logs, key=lambda item: str(item.get("Log_In_Time") or "")):
        if str(log.get("Generated_Status") or "Generated").strip().lower() != "generated":
            continue
        log_dt = _crms_log_datetime(log.get("Log_In_Time"))
        if not log_dt:
            continue
        duty_date = log_dt.strftime("%Y-%m-%d")
        shift = _crms_shift(log.get("Shift_Type"))
        log_key = str(log.get("Log_Key") or f"{duty_date}-{shift}")
        people = [(str(log.get(field) or "").strip(), role) for field, role in role_fields]
        for extra in log.get("additional_employees") or []:
            if isinstance(extra, dict):
                name = extra.get("name") or extra.get("employee_name") or extra.get("Employee_Name")
                role = extra.get("desk") or extra.get("role") or "Additional employee"
            else:
                name, role = extra, "Additional employee"
            people.append((str(name or "").strip(), str(role or "Additional employee")))
        actual_ids = set()
        for crms_name, desk in people:
            if not crms_name:
                continue
            employee_id, confidence = match_employee(crms_name)
            expected_entries = roster_by_employee_date.get((duty_date, employee_id), []) if employee_id else []
            daily = next((entry for entry in expected_entries if entry.get("shift") == shift), {})
            assigned = daily.get("shift") or ""
            if employee_id:
                actual_ids.add(employee_id)
            if not employee_id:
                status = "Unmapped employee"
            elif not daily and expected_entries:
                assigned = ", ".join(entry.get("shift") or "" for entry in expected_entries)
                status = "Duty mismatch"
            elif not daily:
                status = "No roster record"
            elif assigned != shift:
                status = "Duty mismatch"
            elif daily.get("replacementDuty"):
                status = "Replacement match"
            elif daily.get("lastDutySwitch"):
                status = "Reassigned match"
            else:
                status = "Matched"
            details.append({
                "id": f"{log_key}:{desk}:{crms_name}", "logKey": log_key, "date": duty_date,
                "logInTime": log.get("Log_In_Time"), "logGeneratedTime": log.get("Log_Gen_Time"),
                "shift": shift, "desk": desk, "crmsName": crms_name, "employeeId": employee_id or "",
                "employeeName": employees.get(employee_id, {}).get("employeeName") if employee_id else "",
                "matchConfidence": confidence, "assignedDuty": assigned or "No record",
                "groupName": daily.get("groupName") or "", "replacementDuty": bool(daily.get("replacementDuty")),
                "replacementFor": daily.get("replacementFor") or "", "status": status,
            })
        seen_actual_by_log[log_key] = actual_ids

        for daily in roster_entries:
            employee_id = str(daily.get("employeeId") or "")
            if str(daily.get("date")) != duty_date or daily.get("shift") != shift or employee_id in actual_ids:
                continue
            person = employees.get(employee_id, {})
            details.append({
                "id": f"{log_key}:missing:{employee_id}", "logKey": log_key, "date": duty_date,
                "logInTime": log.get("Log_In_Time"), "logGeneratedTime": log.get("Log_Gen_Time"),
                "shift": shift, "desk": "Not present in CRMS log", "crmsName": "",
                "employeeId": employee_id, "employeeName": person.get("employeeName") or employee_id,
                "matchConfidence": 1.0, "assignedDuty": shift, "groupName": daily.get("groupName") or "",
                "replacementDuty": bool(daily.get("replacementDuty")), "replacementFor": daily.get("replacementFor") or "",
                "status": "Rostered but absent",
            })

    # A person can be posted at multiple CRMS desks simultaneously.  Counts are
    # therefore duty counts (employee + date + shift), not desk-posting counts.
    # Individual desks remain in `details` as evidence for the comparison popup.
    matched_statuses = {"Matched", "Replacement match", "Reassigned match"}
    duty_groups = {}
    for item in details:
        identity = item.get("employeeId") or f"unmapped:{_crms_name_key(item.get('crmsName'))}"
        duty_key = (identity, item.get("date") or "", item.get("shift") or "")
        duty_groups.setdefault(duty_key, []).append(item)

    summary_rows = {}
    matched_count = 0
    exception_count = 0
    actual_assignment_count = 0
    rostered_absent_count = 0
    unmapped_count = 0
    for (identity, _date, shift), duty_items in duty_groups.items():
        representative = duty_items[0]
        row = summary_rows.setdefault(identity, {
            "employeeId": representative.get("employeeId") or "",
            "employeeName": representative.get("employeeName") or representative.get("crmsName") or "Unmapped",
            "Morning": 0, "Evening": 0, "Night": 0, "actualDuties": 0, "matched": 0,
            "replacementDuties": 0, "exceptions": 0, "rosteredButAbsent": 0, "deskCounts": {},
        })
        is_absent = all(item.get("status") == "Rostered but absent" for item in duty_items)
        if is_absent:
            row["rosteredButAbsent"] += 1
            row["exceptions"] += 1
            rostered_absent_count += 1
            exception_count += 1
            continue

        actual_items = [item for item in duty_items if item.get("status") != "Rostered but absent"]
        actual_assignment_count += 1
        row["actualDuties"] += 1
        if shift in {"Morning", "Evening", "Night"}:
            row[shift] += 1
        for desk in {item.get("desk") or "Other" for item in actual_items}:
            row["deskCounts"][desk] = row["deskCounts"].get(desk, 0) + 1
        duty_matched = bool(actual_items) and all(item.get("status") in matched_statuses for item in actual_items)
        if duty_matched:
            row["matched"] += 1
            matched_count += 1
        else:
            row["exceptions"] += 1
            exception_count += 1
        if any(item.get("replacementDuty") for item in actual_items):
            row["replacementDuties"] += 1
        if any(item.get("status") == "Unmapped employee" for item in actual_items):
            unmapped_count += 1
    return {
        "startDate": startDate, "endDate": endDate, "source": source, "sourceUrl": CRMS_LOGBOOK_URL,
        "sourceWarning": source_error, "logCount": len(logs),
        "summary": {
            "actualAssignments": actual_assignment_count, "matched": matched_count,
            "matchPercent": round((matched_count / actual_assignment_count * 100), 1) if actual_assignment_count else 0,
            "exceptions": exception_count,
            "unmapped": unmapped_count,
            "rosteredButAbsent": rostered_absent_count,
        },
        "deskRoles": [label for _, label in role_fields] + ["Additional employee"],
        "statuses": sorted({item["status"] for item in details}),
        "rows": sorted(summary_rows.values(), key=lambda row: (row["employeeName"].lower(), row["employeeId"])),
        "details": details,
        "rosterEntries": sorted(roster_entries, key=lambda item: (item["date"], item["employeeName"].lower())),
    }


# -----------------------------
# 1. Profile (static info only)
# -----------------------------
class LandingPagePreference(BaseModel):
    landingPage: str


@router.post("/landing-page")
@router.put("/landing-page")
def update_landing_page(data: LandingPagePreference, user=Depends(get_current_user)):
    employee_id = str(user.get("employeeId") or "").strip()
    landing_page = str(data.landingPage or "").strip()
    if landing_page not in LANDING_PAGE_KEYS:
        raise HTTPException(status_code=400, detail="Select a valid page to open after login")
    result = employee_collection.update_one(
        _employee_id_query(employee_id),
        {"$set": {"landingPage": landing_page, "updatedOn": datetime.utcnow()}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    return {"employeeId": employee_id, "landingPage": landing_page}


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
        "landingPage": employee.get("landingPage") or "",
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
    if month < 1 or month > 12:
        raise HTTPException(400, detail="Month must be between 1 and 12")
    start_date = f"{year:04d}-{month:02d}-01"
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    end_date = (datetime(next_year, next_month, 1) - timedelta(days=1)).strftime("%Y-%m-%d")
    approved_leave_dates = {
        _report_date(item.get("date"))
        for item in leave_request_collection.find({
            "employeeId": employeeId,
            "date": {"$gte": start_date, "$lte": end_date},
            "finalStatus": "Approved",
        }, {"date": 1})
    }
    counts = {}
    records = employee_daily_collection.find({
        "employeeId": employeeId,
        "date": {"$gte": start_date, "$lte": end_date},
    })
    for record in records:
        record_date = _report_date(record.get("date"))
        if is_excluded_duty_record(record, record_date in approved_leave_dates):
            continue
        duty = normalized_duty(record.get("assignedDuty"))
        if not duty or duty.upper() in {"-", "NIL", "NONE"}:
            continue
        counts[duty] = counts.get(duty, 0) + 1
    stats = [{"_id": duty, "count": count} for duty, count in sorted(counts.items())]

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
                    "workflowKind": {"$ne": "Adjacent OFF"},
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
