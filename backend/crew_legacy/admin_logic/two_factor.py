import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from pymongo import ReturnDocument

from crew_legacy.admin_logic.notification_service import (
    graph_credentials_configured,
    replacement_mail_settings,
    send_email,
)
from crew_legacy.database.database_mongo import (
    employee_collection,
    login_otp_challenge_collection,
    mail_notification_settings_collection,
)


TWO_FACTOR_SETTINGS_ID = "login_2fa"
TWO_FACTOR_MODES = {"off", "admin", "all"}
OTP_EXPIRY_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_RESENDS = 3
OTP_MAX_ATTEMPTS = 5
OTP_PBKDF2_ROUNDS = 120_000
TRUTHY = {"1", "true", "yes", "on"}

login_otp_challenge_collection.create_index(
    [("expiresAt", 1)],
    expireAfterSeconds=0,
    name="login_otp_expiry",
)
login_otp_challenge_collection.create_index(
    [("userId", 1), ("createdAt", -1)],
    name="login_otp_user_created",
)


def two_factor_settings():
    stored = mail_notification_settings_collection.find_one(
        {"_id": TWO_FACTOR_SETTINGS_ID},
        {"_id": 0},
    ) or {}
    mode = str(stored.get("mode") or "off").strip().lower()
    configured_mode = mode if mode in TWO_FACTOR_MODES else "off"
    emergency_override = os.getenv("CREW_2FA_EMERGENCY_OFF", "0").strip().lower() in TRUTHY
    return {
        "mode": "off" if emergency_override else configured_mode,
        "configuredMode": configured_mode,
        "emergencyOverride": emergency_override,
        "updatedAt": stored.get("updatedAt"),
        "updatedBy": stored.get("updatedBy"),
    }


def employee_email(employee):
    email = str((employee or {}).get("gmail") or (employee or {}).get("email") or "").strip()
    return email if "@" in email and "." in email.rsplit("@", 1)[-1] else ""


def is_admin_account(employee):
    return (
        str((employee or {}).get("userId") or (employee or {}).get("employeeId") or "").strip() == "50041"
        or str((employee or {}).get("role") or "").strip().lower() == "admin"
    )


def requires_two_factor(employee, mode=None):
    mode = mode or two_factor_settings()["mode"]
    if mode == "all":
        return True
    if mode == "admin":
        return is_admin_account(employee)
    return False


def _affected_accounts(mode):
    if mode == "off":
        return []
    query = {
        "userId": {"$exists": True, "$nin": [None, ""]},
        "password": {"$exists": True, "$nin": [None, ""]},
        "isActive": {"$ne": False},
    }
    if mode == "admin":
        query["$or"] = [{"userId": "50041"}, {"role": {"$regex": "^admin$", "$options": "i"}}]
    return list(employee_collection.find(query, {
        "_id": 0, "userId": 1, "employeeId": 1, "name": 1, "gmail": 1, "email": 1, "role": 1,
    }))


def two_factor_readiness(mode=None):
    mode = mode or two_factor_settings()["mode"]
    affected = _affected_accounts(mode)
    missing = [
        {
            "userId": str(item.get("userId") or item.get("employeeId") or ""),
            "name": item.get("name"),
        }
        for item in affected
        if not employee_email(item)
    ]
    mail = replacement_mail_settings()
    sender = str(mail.get("sender") or os.getenv("CREW_GRAPH_SENDER", "")).strip()
    return {
        "affectedAccounts": len(affected),
        "accountsMissingEmail": len(missing),
        "missingEmailAccounts": missing[:25],
        "credentialsConfigured": graph_credentials_configured(),
        "senderConfigured": bool(sender and "@" in sender),
        "ready": bool(
            mode == "off"
            or (affected and not missing and graph_credentials_configured() and sender and "@" in sender)
        ),
    }


def validate_two_factor_activation(mode, *, credentials_configured=None, sender=None):
    mode = str(mode or "off").strip().lower()
    if mode not in TWO_FACTOR_MODES:
        raise HTTPException(400, "Two-factor mode must be Off, Admin only, or All users")
    if mode == "off":
        return
    affected = _affected_accounts(mode)
    if not affected:
        raise HTTPException(400, "No eligible login accounts were found for the selected two-factor mode")
    missing = [item for item in affected if not employee_email(item)]
    if missing:
        examples = ", ".join(
            f"{item.get('name') or item.get('userId')} ({item.get('userId')})"
            for item in missing[:5]
        )
        suffix = f" and {len(missing) - 5} more" if len(missing) > 5 else ""
        raise HTTPException(
            400,
            f"Add a valid profile email for {len(missing)} affected account(s): {examples}{suffix}",
        )
    if credentials_configured is None:
        credentials_configured = graph_credentials_configured()
    if not credentials_configured:
        raise HTTPException(400, "Microsoft Graph credentials are required before enabling two-factor authentication")
    sender = str(sender if sender is not None else replacement_mail_settings().get("sender") or "").strip()
    if not sender or "@" not in sender:
        raise HTTPException(400, "A valid sender mailbox is required before enabling two-factor authentication")


def save_two_factor_mode(mode, user_id):
    mode = str(mode or "off").strip().lower()
    if mode not in TWO_FACTOR_MODES:
        raise HTTPException(400, "Invalid two-factor mode")
    mail_notification_settings_collection.update_one(
        {"_id": TWO_FACTOR_SETTINGS_ID},
        {
            "$set": {
                "mode": mode,
                "updatedAt": datetime.utcnow(),
                "updatedBy": str(user_id or "ADMIN"),
            }
        },
        upsert=True,
    )
    # A challenge created while 2FA was enabled must not keep the login screen
    # in OTP mode after an administrator disables the feature.
    if mode == "off":
        login_otp_challenge_collection.delete_many({"consumedAt": None})


def mask_email(email):
    local, domain = str(email or "").split("@", 1)
    visible = local[:1] if local else ""
    return f"{visible}{'*' * max(3, len(local) - 1)}@{domain}"


def _new_otp():
    return f"{secrets.randbelow(1_000_000):06d}"


def _hash_otp(otp, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", otp.encode(), salt, OTP_PBKDF2_ROUNDS)
    return base64.b64encode(salt).decode(), base64.b64encode(digest).decode()


def _otp_matches(otp, salt_value, digest_value):
    try:
        salt = base64.b64decode(salt_value)
        expected = base64.b64decode(digest_value)
        actual = hashlib.pbkdf2_hmac("sha256", str(otp or "").encode(), salt, OTP_PBKDF2_ROUNDS)
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


def _send_otp(employee, otp):
    email = employee_email(employee)
    settings = replacement_mail_settings()
    result = send_email(
        [email],
        "COMPASS sign-in verification code",
        (
            f"Your COMPASS verification code is {otp}.\n\n"
            f"It expires in {OTP_EXPIRY_MINUTES} minutes. "
            "Do not share this code with anyone. If you did not attempt to sign in, contact the administrator."
        ),
        sender=settings.get("sender"),
        enabled=True,
    )
    if result.get("status") != "sent":
        raise HTTPException(
            503,
            result.get("error") or "Verification email could not be delivered. Contact the administrator.",
        )
    return email


def create_otp_challenge(employee, request):
    otp = _new_otp()
    email = employee_email(employee)
    if not email:
        raise HTTPException(409, "A profile email is required for two-factor authentication")
    now = datetime.utcnow()
    user_id = str(employee.get("userId") or employee.get("employeeId") or "")
    last_challenge = login_otp_challenge_collection.find_one(
        {"userId": user_id, "createdAt": {"$gt": now - timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS)}},
        sort=[("createdAt", -1)],
    )
    if last_challenge:
        remaining = OTP_RESEND_COOLDOWN_SECONDS - int(
            (now - last_challenge.get("createdAt", now)).total_seconds()
        )
        raise HTTPException(429, f"Wait {max(1, remaining)} seconds before requesting another code")
    recent_count = login_otp_challenge_collection.count_documents({
        "userId": user_id,
        "createdAt": {"$gt": now - timedelta(minutes=15)},
    })
    if recent_count >= 5:
        raise HTTPException(429, "Too many verification codes requested. Try again later.")
    salt, digest = _hash_otp(otp)
    challenge_id = secrets.token_urlsafe(32)
    document = {
        "_id": challenge_id,
        "userId": user_id,
        "role": employee.get("role") or "user",
        "otpSalt": salt,
        "otpHash": digest,
        "attempts": 0,
        "resendCount": 0,
        "createdAt": now,
        "lastSentAt": now,
        "expiresAt": now + timedelta(minutes=OTP_EXPIRY_MINUTES),
        "consumedAt": None,
        "ip": request.client.host if request.client else None,
        "userAgentHash": hashlib.sha256(
            str(request.headers.get("user-agent") or "").encode()
        ).hexdigest(),
    }
    login_otp_challenge_collection.insert_one(document)
    try:
        _send_otp(employee, otp)
    except Exception:
        login_otp_challenge_collection.delete_one({"_id": challenge_id})
        raise
    return {
        "requires_otp": True,
        "challenge_id": challenge_id,
        "masked_email": mask_email(email),
        "expires_in": OTP_EXPIRY_MINUTES * 60,
        "resend_after": OTP_RESEND_COOLDOWN_SECONDS,
    }


def resend_otp_challenge(challenge_id):
    challenge = login_otp_challenge_collection.find_one({"_id": str(challenge_id or "")})
    now = datetime.utcnow()
    if not challenge or challenge.get("consumedAt") or challenge.get("expiresAt", now) <= now:
        raise HTTPException(400, "Verification challenge has expired. Sign in again.")
    if int(challenge.get("resendCount") or 0) >= OTP_MAX_RESENDS:
        raise HTTPException(429, "Maximum OTP resend limit reached. Sign in again.")
    last_sent = challenge.get("lastSentAt") or challenge.get("createdAt") or now
    remaining = OTP_RESEND_COOLDOWN_SECONDS - int((now - last_sent).total_seconds())
    if remaining > 0:
        raise HTTPException(429, f"Wait {remaining} seconds before requesting another code")
    employee = employee_collection.find_one({"userId": challenge.get("userId")}) or {}
    otp = _new_otp()
    salt, digest = _hash_otp(otp)
    _send_otp(employee, otp)
    login_otp_challenge_collection.update_one(
        {"_id": challenge["_id"], "consumedAt": None},
        {
            "$set": {
                "otpSalt": salt,
                "otpHash": digest,
                "attempts": 0,
                "lastSentAt": now,
                "expiresAt": now + timedelta(minutes=OTP_EXPIRY_MINUTES),
            },
            "$inc": {"resendCount": 1},
        },
    )
    return {
        "message": "A new verification code was sent",
        "masked_email": mask_email(employee_email(employee)),
        "expires_in": OTP_EXPIRY_MINUTES * 60,
        "resend_after": OTP_RESEND_COOLDOWN_SECONDS,
    }


def consume_otp_challenge(challenge_id, otp):
    challenge = login_otp_challenge_collection.find_one({"_id": str(challenge_id or "")})
    now = datetime.utcnow()
    if not challenge or challenge.get("consumedAt") or challenge.get("expiresAt", now) <= now:
        raise HTTPException(400, "Verification challenge has expired. Sign in again.")
    attempts = int(challenge.get("attempts") or 0)
    if attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(429, "Too many incorrect codes. Sign in again.")
    if not _otp_matches(otp, challenge.get("otpSalt"), challenge.get("otpHash")):
        updated = login_otp_challenge_collection.find_one_and_update(
            {"_id": challenge["_id"], "consumedAt": None, "attempts": {"$lt": OTP_MAX_ATTEMPTS}},
            {"$inc": {"attempts": 1}, "$set": {"lastAttemptAt": now}},
            return_document=ReturnDocument.AFTER,
        )
        attempts = int((updated or {}).get("attempts") or OTP_MAX_ATTEMPTS)
        remaining = OTP_MAX_ATTEMPTS - attempts
        if remaining <= 0:
            raise HTTPException(429, "Too many incorrect codes. Sign in again.")
        raise HTTPException(401, f"Incorrect verification code. {remaining} attempt(s) remaining.")
    consumed = login_otp_challenge_collection.find_one_and_update(
        {"_id": challenge["_id"], "consumedAt": None, "expiresAt": {"$gt": now}},
        {"$set": {"consumedAt": now, "verifiedAt": now}},
        return_document=ReturnDocument.AFTER,
    )
    if not consumed:
        raise HTTPException(409, "Verification code has already been used")
    return str(consumed.get("userId") or "")
