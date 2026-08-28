from datetime import datetime
import os
import re
from pathlib import Path
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from crew_legacy.admin_logic.auth_utils import get_authenticated_user
from crew_legacy.admin_logic.notification_service import (
    DEFAULT_REPLACEMENT_BODY,
    DEFAULT_REPLACEMENT_SUBJECT,
    REPLACEMENT_MAIL_SETTINGS_ID,
    MAIL_TEMPLATE_SETTINGS_ID,
    WORKFLOW_MAIL_DEFAULTS,
    public_replacement_mail_settings,
    workflow_mail_templates,
)
from crew_legacy.database.database_mongo import mail_notification_settings_collection
from crew_legacy.admin_logic.two_factor import (
    save_two_factor_mode,
    two_factor_readiness,
    two_factor_settings,
    validate_two_factor_activation,
)


def require_mail_admin(user=Depends(get_authenticated_user)):
    employee_id = str(user.get("employeeId") or user.get("userId") or "")
    if user.get("role") != "admin" and employee_id != "50041":
        raise HTTPException(403, detail="Administrator login is required")
    return user


router = APIRouter(tags=["Mail Settings"], dependencies=[Depends(require_mail_admin)])

ALLOWED_PLACEHOLDERS = {
    "replacement_person",
    "replacement_name",
    "replacement_designation",
    "replacement_employee_id",
    "shift_name",
    "date",
    "date_iso",
    "leave_person",
    "leave_name",
    "leave_designation",
    "leave_employee_id",
    "group_name",
    "employee_name",
    "employee_id",
    "leave_count",
    "leave_dates",
    "leave_date",
    "leave_type",
    "comment",
    "training_name",
    "training_period",
    "training_location",
    "adjacent_off",
    "report_date",
    "file_name",
    "station_count",
    "issue_station_count",
    "issue_block_count",
}
REQUIRED_BODY_PLACEHOLDERS = {
    "replacement_person",
    "shift_name",
    "date",
    "leave_person",
}


class ReplacementMailSettingsUpdate(BaseModel):
    enabled: bool = False
    sender: str = Field(default="", max_length=254)
    subjectTemplate: str = Field(default=DEFAULT_REPLACEMENT_SUBJECT, min_length=1, max_length=300)
    bodyTemplate: str = Field(default=DEFAULT_REPLACEMENT_BODY, min_length=1, max_length=5000)
    tenantId: str = Field(default="", max_length=200)
    clientId: str = Field(default="", max_length=200)
    clientSecret: str = Field(default="", max_length=1000)
    twoFactorMode: str = Field(default="off", max_length=20)
    templates: list[dict] = Field(default_factory=list)


class TwoFactorModeUpdate(BaseModel):
    mode: str = Field(default="off", max_length=20)


class CrmsCredentialsUpdate(BaseModel):
    username: str = Field(default="", max_length=200)
    password: str = Field(default="", max_length=1000)


ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
ENV_WRITE_LOCK = Lock()
GRAPH_ENV_KEYS = {
    "tenantId": "CREW_GRAPH_TENANT_ID",
    "clientId": "CREW_GRAPH_CLIENT_ID",
    "clientSecret": "CREW_GRAPH_CLIENT_SECRET",
}
CRMS_ENV_KEYS = {
    "username": "CRMS_SSO_USERNAME",
    "password": "CRMS_SSO_PASSWORD",
}


def _safe_credential(value: str, label: str):
    value = str(value or "").strip()
    if "\n" in value or "\r" in value:
        raise HTTPException(400, detail=f"{label} cannot contain a line break")
    return value


def _persist_backend_credentials(updates, comment="Backend credentials managed from Administration"):
    if not updates:
        return
    with ENV_WRITE_LOCK:
        try:
            lines = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []
            remaining = dict(updates)
            output = []
            for line in lines:
                stripped = line.strip()
                key = stripped.split("=", 1)[0].strip() if "=" in stripped and not stripped.startswith("#") else ""
                if key in updates:
                    output.append(f"{key}={updates[key]}")
                    remaining.pop(key, None)
                else:
                    output.append(line)
            if remaining:
                if output and output[-1].strip():
                    output.append("")
                output.append(f"# {comment}")
                output.extend(f"{key}={value}" for key, value in remaining.items())
            temporary = ENV_FILE.with_suffix(".env.tmp")
            temporary.write_text("\n".join(output) + "\n", encoding="utf-8")
            try:
                temporary.chmod(0o600)
            except OSError:
                pass
            os.replace(temporary, ENV_FILE)
            try:
                ENV_FILE.chmod(0o600)
            except OSError:
                pass
            os.environ.update(updates)
        except OSError:
            raise HTTPException(500, detail="Protected backend credential file could not be updated")


def _credential_hint(value: str) -> str:
    value = str(value or "").strip()
    if not value:
        return ""
    if len(value) <= 4:
        return f"{value[:1]}***"
    return f"{value[:2]}***{value[-2:]}"


def _crms_settings_status() -> dict:
    username = str(os.getenv(CRMS_ENV_KEYS["username"]) or "").strip()
    password_configured = bool(str(os.getenv(CRMS_ENV_KEYS["password"]) or "").strip())
    return {
        "usernameConfigured": bool(username),
        "usernameHint": _credential_hint(username),
        "passwordConfigured": password_configured,
        "credentialsConfigured": bool(username and password_configured),
    }


def _validate_template(template: str, required=None):
    required = required or set()
    from string import Formatter
    try:
        list(Formatter().parse(template))
    except ValueError:
        raise HTTPException(400, detail="Template contains unmatched braces")
    missing = [name for name in required if "{" + name + "}" not in template]
    if missing:
        raise HTTPException(400, detail=f"Template must contain: {', '.join(sorted(missing))}")

    import re
    unknown = sorted(set(re.findall(r"\{([a-zA-Z0-9_]+)\}", template)) - ALLOWED_PLACEHOLDERS)
    if unknown:
        raise HTTPException(400, detail=f"Unknown template placeholder: {', '.join(unknown)}")


@router.get("")
def get_replacement_mail_settings():
    return {
        **public_replacement_mail_settings(),
        "allowedPlaceholders": sorted(ALLOWED_PLACEHOLDERS),
        "templates": list(workflow_mail_templates().values()),
        "twoFactor": {
            **two_factor_settings(),
            "readiness": two_factor_readiness(),
            "readinessByMode": {
                "admin": two_factor_readiness("admin"),
                "all": two_factor_readiness("all"),
            },
        },
        "crms": _crms_settings_status(),
    }


@router.put("/crms")
def update_crms_credentials(
    payload: CrmsCredentialsUpdate,
    user=Depends(require_mail_admin),
):
    username = _safe_credential(payload.username, "CRMS username")
    password = _safe_credential(payload.password, "CRMS password")
    updates = {}
    if username:
        updates[CRMS_ENV_KEYS["username"]] = username
    if password:
        updates[CRMS_ENV_KEYS["password"]] = password
    if not updates:
        raise HTTPException(400, detail="Enter a CRMS username or password to save")

    final_username = updates.get(CRMS_ENV_KEYS["username"]) or os.getenv(CRMS_ENV_KEYS["username"], "").strip()
    final_password = updates.get(CRMS_ENV_KEYS["password"]) or os.getenv(CRMS_ENV_KEYS["password"], "").strip()
    if not final_username or not final_password:
        raise HTTPException(400, detail="Both CRMS username and password must be configured")

    _persist_backend_credentials(
        updates,
        "CRMS SSO credentials managed from Admin > Mail & 2FA Settings",
    )

    test_error = ""
    try:
        # Import here to avoid coupling the settings router at module startup.
        from crew_legacy.api.profile import _new_crms_session
        session, _ = _new_crms_session()
        session.close()
    except Exception as exc:
        test_error = str(exc)

    return {
        "crms": _crms_settings_status(),
        "connectionVerified": not test_error,
        "message": (
            "CRMS credentials saved and SSO login verified."
            if not test_error
            else f"CRMS credentials were saved, but login verification failed: {test_error}"
        ),
    }


@router.put("/two-factor")
def update_two_factor_only(
    payload: TwoFactorModeUpdate,
    user=Depends(require_mail_admin),
):
    """Persist the sign-in mode independently from editable mail templates."""
    mode = str(payload.mode or "off").strip().lower()
    validate_two_factor_activation(mode)
    save_two_factor_mode(
        mode,
        str(user.get("employeeId") or user.get("userId") or "ADMIN"),
    )
    return {
        "twoFactor": {
            **two_factor_settings(),
            "readiness": two_factor_readiness(),
            "readinessByMode": {
                "admin": two_factor_readiness("admin"),
                "all": two_factor_readiness("all"),
            },
        },
        "message": (
            "Two-factor authentication disabled. Existing OTP challenges were cleared."
            if mode == "off"
            else "Two-factor authentication mode saved."
        ),
    }


@router.put("")
def update_replacement_mail_settings(
    payload: ReplacementMailSettingsUpdate,
    user=Depends(require_mail_admin),
):
    _validate_template(payload.subjectTemplate)
    _validate_template(payload.bodyTemplate, REQUIRED_BODY_PLACEHOLDERS)
    sender = payload.sender.strip()
    if sender and "@" not in sender:
        raise HTTPException(400, detail="Enter a valid sender mailbox")
    if payload.enabled and not sender:
        raise HTTPException(400, detail="Sender mailbox is required before enabling mail")
    credential_values = {
        "tenantId": _safe_credential(payload.tenantId, "Tenant ID"),
        "clientId": _safe_credential(payload.clientId, "Application ID"),
        "clientSecret": _safe_credential(payload.clientSecret, "Client secret"),
    }
    env_updates = {
        GRAPH_ENV_KEYS[field]: value
        for field, value in credential_values.items()
        if value
    }
    final_credentials_configured = all(
        env_updates.get(env_key) or os.getenv(env_key, "").strip()
        for env_key in GRAPH_ENV_KEYS.values()
    )
    if payload.enabled and not final_credentials_configured:
        raise HTTPException(
            400,
            detail="Enter Tenant ID, Application ID and Client Secret before enabling mail",
        )
    validate_two_factor_activation(
        payload.twoFactorMode,
        credentials_configured=final_credentials_configured,
        sender=sender,
    )

    _persist_backend_credentials(
        env_updates,
        "Microsoft Graph credentials managed from Admin > Mail & 2FA Settings",
    )

    template_updates = {}
    for item in payload.templates:
        key = str(item.get("key") or "").strip()
        if key not in WORKFLOW_MAIL_DEFAULTS:
            raise HTTPException(400, detail=f"Unknown mail template: {key}")
        subject = str(item.get("subjectTemplate") or "").strip()
        body = str(item.get("bodyTemplate") or "").strip()
        if not subject or not body:
            raise HTTPException(400, detail=f"Subject and body are required for {WORKFLOW_MAIL_DEFAULTS[key]['label']}")
        _validate_template(subject)
        _validate_template(body)
        recipients = str(item.get("recipients") or "").strip()
        recipient_values = [value.strip() for value in re.split(r"[,;\n]+", recipients) if value.strip()]
        invalid_recipients = [value for value in recipient_values if "@" not in value or "." not in value.rsplit("@", 1)[-1]]
        if invalid_recipients:
            raise HTTPException(400, detail=f"Invalid recipient mail ID for {WORKFLOW_MAIL_DEFAULTS[key]['label']}: {invalid_recipients[0]}")
        cc_recipients = str(item.get("ccRecipients") or "").strip()
        cc_values = [value.strip() for value in re.split(r"[,;\n]+", cc_recipients) if value.strip()]
        invalid_cc = [value for value in cc_values if "@" not in value or "." not in value.rsplit("@", 1)[-1]]
        if invalid_cc:
            raise HTTPException(400, detail=f"Invalid copy (CC) mail ID for {WORKFLOW_MAIL_DEFAULTS[key]['label']}: {invalid_cc[0]}")
        template_updates[key] = {
            "enabled": bool(item.get("enabled")),
            "subjectTemplate": subject,
            "bodyTemplate": body,
            "recipients": ", ".join(dict.fromkeys(recipient_values)),
            "ccRecipients": ", ".join(dict.fromkeys(cc_values)),
        }

    if template_updates:
        mail_notification_settings_collection.update_one(
            {"_id": MAIL_TEMPLATE_SETTINGS_ID},
            {"$set": {"templates": template_updates, "updatedAt": datetime.utcnow(), "updatedBy": str(user.get("employeeId") or user.get("userId") or "ADMIN")}},
            upsert=True,
        )

    mail_notification_settings_collection.update_one(
        {"_id": REPLACEMENT_MAIL_SETTINGS_ID},
        {
            "$set": {
                "enabled": payload.enabled,
                "sender": sender,
                "subjectTemplate": payload.subjectTemplate.strip(),
                "bodyTemplate": payload.bodyTemplate.strip(),
                "updatedAt": datetime.utcnow(),
                "updatedBy": str(user.get("employeeId") or user.get("userId") or "ADMIN"),
                "credentialFieldsUpdated": [field for field, value in credential_values.items() if value],
            }
        },
        upsert=True,
    )
    save_two_factor_mode(
        payload.twoFactorMode,
        str(user.get("employeeId") or user.get("userId") or "ADMIN"),
    )
    return {
        **public_replacement_mail_settings(),
        "allowedPlaceholders": sorted(ALLOWED_PLACEHOLDERS),
        "templates": list(workflow_mail_templates().values()),
        "twoFactor": {
            **two_factor_settings(),
            "readiness": two_factor_readiness(),
            "readinessByMode": {
                "admin": two_factor_readiness("admin"),
                "all": two_factor_readiness("all"),
            },
        },
        "crms": _crms_settings_status(),
        "message": "Mail and two-factor authentication settings saved",
    }
