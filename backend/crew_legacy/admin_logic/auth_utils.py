import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request

from crew_legacy.database.database_mongo import employee_collection
from crew_legacy.config import ACCESS_TOKEN_EXPIRE_HOURS, JWT_SECRET_KEY


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
    if encoded.startswith("$2"):
        try:
            import bcrypt
            return bcrypt.checkpw(plain_password.encode(), encoded.encode())
        except (ImportError, ValueError):
            return False
    if not encoded.startswith("pbkdf2_sha256$"):
        return plain_password == encoded
    _, rounds, salt_value, digest_value = encoded.split("$", 3)
    salt = base64.b64decode(salt_value)
    expected = base64.b64decode(digest_value)
    actual = hashlib.pbkdf2_hmac("sha256", plain_password.encode(), salt, int(rounds))
    return hmac.compare_digest(actual, expected)


def create_access_token(data: dict) -> str:
    payload = {
        **data,
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)).timestamp()),
    }
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(JWT_SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    return f"{body}.{encoded_signature}"


def decode_access_token(token: str) -> dict:
    try:
        body, encoded_signature = token.split(".", 1)
        expected = hmac.new(JWT_SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest()
        actual = base64.urlsafe_b64decode(encoded_signature + "=" * (-len(encoded_signature) % 4))
        if not hmac.compare_digest(expected, actual):
            raise ValueError("invalid signature")
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("expired token")
        return payload
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Session is invalid or expired") from exc


def get_authenticated_user(request: Request):
    authorization = request.headers.get("authorization") or ""
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = decode_access_token(authorization.split(" ", 1)[1].strip())
    employee_id = str(payload.get("employeeId") or "").strip()
    if not employee_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    employee = _employee_payload(employee_id)
    employee["role"] = payload.get("role") or employee.get("role") or "user"
    return employee


def _employee_payload(employee_id: str) -> dict:
    employee = employee_collection.find_one({
        "$or": [{"userId": employee_id}, {"employeeId": employee_id}]
    }) or {}
    profile_photo = str(employee.get("profilePhoto") or "").strip()
    if profile_photo and not profile_photo.startswith("/api/crew/profile/photo/"):
        filename = str(employee.get("profilePhotoFilename") or Path(profile_photo.split("?", 1)[0]).name).strip()
        if filename:
            profile_photo = f"/api/crew/profile/photo/{employee_id}"
    return {
        "employeeId": employee_id,
        "userId": employee_id,
        "name": employee.get("name"),
        "designation": employee.get("designation"),
        "role": employee.get("role") or "user",
        "isSIC": employee.get("isSIC", False),
        "isDeptIC": employee.get("isDeptIC", True),
        "profilePhoto": profile_photo,
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
