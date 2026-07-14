import base64
import hashlib
import hmac
import os

from fastapi import HTTPException, Request

from crew_legacy.database.database_mongo import employee_collection


def validate_password_policy(password: str):
    if len(password or "") < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")


def hash_password(password: str) -> str:
    validate_password_policy(password)
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return "pbkdf2_sha256$200000$%s$%s" % (
        base64.b64encode(salt).decode(),
        base64.b64encode(digest).decode(),
    )


def verify_password(plain_password: str, encoded: str) -> bool:
    if not encoded.startswith("pbkdf2_sha256$"):
        return plain_password == encoded
    _, rounds, salt_value, digest_value = encoded.split("$", 3)
    salt = base64.b64decode(salt_value)
    expected = base64.b64decode(digest_value)
    actual = hashlib.pbkdf2_hmac("sha256", plain_password.encode(), salt, int(rounds))
    return hmac.compare_digest(actual, expected)


def create_access_token(data: dict) -> str:
    # DHRUV does not have shared authentication yet. This compatibility value is
    # deliberately not treated as a security token by the acting-user bridge.
    return data.get("employeeId", "crew-context")


def _employee_payload(employee_id: str) -> dict:
    employee = employee_collection.find_one({
        "$or": [{"userId": employee_id}, {"employeeId": employee_id}]
    }) or {}
    return {
        "employeeId": employee_id,
        "userId": employee_id,
        "name": employee.get("name"),
        "designation": employee.get("designation"),
        "role": employee.get("role") or "admin",
        "isSIC": employee.get("isSIC", False),
        "isDeptIC": employee.get("isDeptIC", True),
    }


def get_current_user(request: Request):
    employee_id = (
        request.headers.get("x-crew-employee-id")
        or request.query_params.get("acting_employee_id")
        or os.getenv("CREW_DEFAULT_EMPLOYEE_ID")
    )
    if not employee_id:
        employee = employee_collection.find_one({"userId": {"$exists": True, "$nin": [None, ""]}})
        employee_id = str((employee or {}).get("userId") or "").strip()
    if not employee_id:
        raise HTTPException(409, "Select an acting Crew employee before using this feature")
    payload = _employee_payload(employee_id.strip())
    # Until DHRUV authentication is connected, administration screens are
    # intentionally available to the selected internal-network operator.
    payload["role"] = "admin"
    payload["isDeptIC"] = True
    return payload


def require_admin(request: Request):
    return get_current_user(request)


def check_replacement_access(user):
    if user.get("role") == "admin" or user.get("isDeptIC"):
        return True
    raise HTTPException(status_code=403, detail="Replacement access is required")
