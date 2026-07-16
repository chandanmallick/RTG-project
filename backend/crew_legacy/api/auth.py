from datetime import datetime, timedelta, timezone
from time import time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from crew_legacy.admin_logic.auth_utils import (
    create_access_token,
    _employee_payload,
    get_authenticated_user,
    get_current_user,
    hash_password,
    require_admin,
    verify_password,
)
from crew_legacy.database.database_mongo import employee_collection, login_history_collection, page_access_collection

IST = timezone(timedelta(hours=5, minutes=30))
MAX_FAILED_LOGINS = 5
LOGIN_WINDOW_SECONDS = 15 * 60
FAILED_LOGIN_ATTEMPTS = {}

PAGE_CATALOG = [
    ("rtg_dashboard", "Homepage / RTG Dashboard", "/rtg-dashboard"),
    ("psp_dashboard", "PSP Dashboard", "/psp-dashboard"),
    ("psp_report_checking", "PSP Report Check", "/psp-report-checking"),
    ("frequency_report", "Frequency Data Analysis", "/frequency-report"),
    ("outage_analysis", "S/D Analysis", "/outage-analysis"),
    ("mis_report", "Generic Reports", "/mis-report"),
    ("old_logbook", "Old Logbook", "/old-logbook"),
    ("crew_dashboard", "Crew Dashboard", "/crew/dashboard"),
    ("crew_calendar", "Crew Calendar", "/crew/calendar"),
    ("crew_roster", "Duty Roster", "/crew/roster"),
    ("crew_leave", "Leave", "/crew/leave"),
    ("leave_master_delete", "Administration — Permanently Delete Leave Master Record", "Special permission"),
    ("crew_replacement", "Replacement", "/crew/replacement"),
    ("crew_training", "Holiday & Training", "/crew/training"),
    ("crew_setup", "Crew Setup", "/crew/setup"),
    ("crew_employees", "Employee Master", "/crew/employees"),
    ("crew_admin", "Crew Administration", "/crew/dropdowns"),
    ("database_sync", "Database Sync", "/database-sync"),
    ("psp_admin", "PSP Settings", "/psp-admin"),
    ("user_access", "User Access Control", "/admin/user-access"),
    ("profile", "My Profile", "/crew/profile"),
]


def _default_access(user_id: str) -> dict:
    full_access = user_id == "50041"
    return {key: {"view": full_access or key == "profile", "write": full_access} for key, _, _ in PAGE_CATALOG}


def _ensure_access(user_id: str) -> dict:
    existing = page_access_collection.find_one({"userId": user_id})
    defaults = _default_access(user_id)
    if not existing:
        page_access_collection.insert_one({"userId": user_id, "pages": defaults, "updatedOn": datetime.utcnow()})
        return defaults
    pages = existing.get("pages") or {}
    merged = {key: {"view": bool((pages.get(key) or defaults[key]).get("view")), "write": bool((pages.get(key) or defaults[key]).get("write"))} for key, _, _ in PAGE_CATALOG}
    if user_id == "50041":
        merged = {key: {"view": True, "write": True} for key, _, _ in PAGE_CATALOG}
    if merged != pages:
        page_access_collection.update_one({"_id": existing["_id"]}, {"$set": {"pages": merged, "updatedOn": datetime.utcnow()}})
    return merged


def _require_access_admin(user: dict):
    if user.get("employeeId") != "50041" and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="User access administration is required")


def convert_to_ist(dt):
    if not dt:
        return None
    return dt.replace(tzinfo=timezone.utc).astimezone(IST)


router = APIRouter()


class LoginRequest(BaseModel):
    userId: str
    password: str


def _login_key(data: LoginRequest, request: Request):
    return f"{request.client.host}:{data.userId}".lower()


def _check_login_lockout(data: LoginRequest, request: Request):
    key = _login_key(data, request)
    now = time()
    attempts = [ts for ts in FAILED_LOGIN_ATTEMPTS.get(key, []) if now - ts < LOGIN_WINDOW_SECONDS]
    FAILED_LOGIN_ATTEMPTS[key] = attempts

    if len(attempts) >= MAX_FAILED_LOGINS:
        raise HTTPException(status_code=429, detail="Too many failed login attempts. Try again later.")


def _record_failed_login(data: LoginRequest, request: Request):
    FAILED_LOGIN_ATTEMPTS.setdefault(_login_key(data, request), []).append(time())


def _clear_failed_login(data: LoginRequest, request: Request):
    FAILED_LOGIN_ATTEMPTS.pop(_login_key(data, request), None)


def _record_login_failure(user_id: str, name: str | None = None):
    login_history_collection.insert_one({
        "employeeId": user_id,
        "name": name,
        "status": "Failed",
        "loginTime": datetime.utcnow(),
        "createdOn": datetime.utcnow(),
    })


@router.post("/login")
def login(data: LoginRequest, request: Request):
    _check_login_lockout(data, request)

    user = employee_collection.find_one({"userId": data.userId})

    if not user:
        _record_login_failure(data.userId)
        _record_failed_login(data, request)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    stored_password = user.get("password")

    if stored_password and stored_password.startswith(("$2", "pbkdf2_sha256$")):
        if not verify_password(data.password, stored_password):
            _record_login_failure(data.userId, user.get("name"))
            _record_failed_login(data, request)
            raise HTTPException(status_code=401, detail="Invalid credentials")
    else:
        if data.password != stored_password:
            _record_login_failure(data.userId, user.get("name"))
            _record_failed_login(data, request)
            raise HTTPException(status_code=401, detail="Invalid credentials")

        employee_collection.update_one(
            {"_id": user["_id"]},
            {"$set": {"password": hash_password(data.password)}},
        )

    _clear_failed_login(data, request)

    token = create_access_token({
        "employeeId": user["userId"],
        "role": user.get("role", "user"),
    })

    login_history_collection.insert_one({
        "employeeId": user.get("userId"),
        "name": user.get("name"),
        "role": user.get("role"),
        "loginTime": datetime.utcnow(),
        "logoutTime": None,
        "ip": request.client.host,
        "userAgent": request.headers.get("user-agent"),
        "status": "Success",
        "createdOn": datetime.utcnow(),
    })

    return {
        "access_token": token,
        "employeeId": user["userId"],
        "role": user.get("role", "user"),
        "name": user.get("name"),
        "profilePhoto": user.get("profilePhoto"),
        "permissions": _ensure_access(str(user["userId"])),
    }


@router.get("/me")
def current_session(user=Depends(get_authenticated_user)):
    employee = employee_collection.find_one({"$or": [{"userId": user["employeeId"]}, {"employeeId": user["employeeId"]}]}) or {}
    normalized = _employee_payload(user["employeeId"])
    return {
        "employeeId": user["employeeId"],
        "userId": user["employeeId"],
        "name": employee.get("name"),
        "designation": employee.get("designation"),
        "department": employee.get("department") or employee.get("vertical"),
        "email": employee.get("gmail") or employee.get("email"),
        "gmail": employee.get("gmail") or employee.get("email"),
        "phone": employee.get("phone"),
        "profilePhoto": normalized.get("profilePhoto") or employee.get("profilePhoto"),
        "role": user.get("role", "user"),
        "permissions": _ensure_access(user["employeeId"]),
    }


@router.get("/admin/access")
def list_user_access(user=Depends(get_authenticated_user)):
    _require_access_admin(user)
    output = []
    for employee in employee_collection.find({}, {"password": 0}).sort([("name", 1)]):
        user_id = str(employee.get("userId") or employee.get("employeeId") or "").strip()
        if not user_id:
            continue
        output.append({
            "userId": user_id,
            "name": employee.get("name"),
            "designation": employee.get("designation"),
            "permissions": _ensure_access(user_id),
        })
    return {"pages": [{"key": key, "label": label, "path": path} for key, label, path in PAGE_CATALOG], "users": output}


class AccessUpdateRequest(BaseModel):
    permissions: dict[str, dict[str, bool]]


@router.put("/admin/access/{user_id}")
def update_user_access(user_id: str, data: AccessUpdateRequest, user=Depends(get_authenticated_user)):
    _require_access_admin(user)
    if user_id == "50041":
        pages = {key: {"view": True, "write": True} for key, _, _ in PAGE_CATALOG}
    else:
        pages = {}
        for key, _, _ in PAGE_CATALOG:
            requested = data.permissions.get(key) or {}
            write = bool(requested.get("write"))
            pages[key] = {"view": bool(requested.get("view")) or write, "write": write}
    page_access_collection.update_one(
        {"userId": user_id},
        {"$set": {"pages": pages, "updatedBy": user["employeeId"], "updatedOn": datetime.utcnow()}},
        upsert=True,
    )
    return {"userId": user_id, "permissions": pages}


@router.get("/login-history/{employeeId}")
def get_login_history(employeeId: str, user=Depends(get_current_user)):
    if user.get("role") != "admin" and user.get("employeeId") != employeeId:
        raise HTTPException(status_code=403, detail="Access denied")

    data = list(
        login_history_collection.find({"employeeId": employeeId})
        .sort("loginTime", -1)
        .limit(10)
    )

    for item in data:
        item["_id"] = str(item["_id"])
        item["loginTime"] = convert_to_ist(item.get("loginTime"))
        item["logoutTime"] = convert_to_ist(item.get("logoutTime"))

    return data


@router.get("/admin/login-history")
def admin_login_history(
    startDate: str = None,
    endDate: str = None,
    user=Depends(require_admin),
):
    query = {}

    if startDate and endDate:
        start = datetime.fromisoformat(startDate).replace(tzinfo=IST).astimezone(timezone.utc)
        end = (datetime.fromisoformat(endDate) + timedelta(days=1)).replace(tzinfo=IST).astimezone(timezone.utc)
        query["loginTime"] = {"$gte": start, "$lt": end}

    data = list(login_history_collection.find(query).sort("loginTime", -1).limit(200))

    for item in data:
        item["_id"] = str(item["_id"])
        item["loginTime"] = convert_to_ist(item.get("loginTime"))
        item["logoutTime"] = convert_to_ist(item.get("logoutTime"))

    return data


@router.post("/logout")
def logout(user=Depends(get_authenticated_user)):
    latest = login_history_collection.find_one(
        {"employeeId": user["employeeId"], "logoutTime": None},
        sort=[("loginTime", -1)],
    )

    if not latest:
        return {"message": "No active session found"}

    login_history_collection.update_one(
        {"_id": latest["_id"]},
        {"$set": {"logoutTime": datetime.utcnow()}},
    )

    return {"message": "Logged out successfully"}


@router.get("/admin/login-summary")
def login_summary(startDate: str = None, endDate: str = None, user=Depends(require_admin)):
    query = {}

    if startDate and endDate:
        start = datetime.fromisoformat(startDate).replace(tzinfo=IST).astimezone(timezone.utc)
        end = (datetime.fromisoformat(endDate) + timedelta(days=1)).replace(tzinfo=IST).astimezone(timezone.utc)
        query["loginTime"] = {"$gte": start, "$lt": end}

    data = list(login_history_collection.find(query))

    total = len(data)
    success = len([item for item in data if item.get("status") == "Success"])
    failed = len([item for item in data if item.get("status") == "Failed"])
    active = len([item for item in data if not item.get("logoutTime")])

    return {
        "total": total,
        "success": success,
        "failed": failed,
        "active": active,
    }

