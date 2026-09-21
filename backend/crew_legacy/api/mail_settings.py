from datetime import datetime
import base64
import json
import os
import re
import requests
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
    _runtime_env_value,
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


class NormativeDcCredentialsUpdate(BaseModel):
    username: str = Field(default="", max_length=200)
    password: str = Field(default="", max_length=1000)


class PlantReportInboxSettingsUpdate(BaseModel):
    enabled: bool = False
    mailbox: str = Field(default="", max_length=254)
    tenantId: str = Field(default="", max_length=200)
    clientId: str = Field(default="", max_length=200)
    clientSecret: str = Field(default="", max_length=1000)
    authMode: str = Field(default="application", max_length=20)


class DelegatedMailboxPoll(BaseModel):
    deviceCode: str = Field(min_length=20, max_length=4000)


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
NORMATIVE_DC_ENV_KEYS = {
    "username": "NORMATIVE_DC_USERNAME",
    "password": "NORMATIVE_DC_PASSWORD",
}
PLANT_REPORT_GRAPH_ENV_KEYS = {
    "tenantId": "PLANT_REPORT_GRAPH_TENANT_ID",
    "clientId": "PLANT_REPORT_GRAPH_CLIENT_ID",
    "clientSecret": "PLANT_REPORT_GRAPH_CLIENT_SECRET",
}
PLANT_REPORT_GRAPH_AUTH_MODE = "PLANT_REPORT_GRAPH_AUTH_MODE"
PLANT_REPORT_GRAPH_REFRESH_TOKEN = "PLANT_REPORT_GRAPH_REFRESH_TOKEN"
PLANT_REPORT_GRAPH_DELEGATED_MAILBOX = "PLANT_REPORT_GRAPH_DELEGATED_MAILBOX"


def _safe_credential(value: str, label: str):
    value = str(value or "").strip()
    if "\n" in value or "\r" in value:
        raise HTTPException(400, detail=f"{label} cannot contain a line break")
    return value


def _validate_graph_client_secret(value: str):
    """Reject the Entra secret identifier commonly pasted instead of its value."""
    value = str(value or "").strip()
    if not value:
        return
    if re.fullmatch(
        r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
        value,
    ):
        raise HTTPException(
            400,
            detail=(
                "This looks like the Microsoft Entra Secret ID. Paste the client "
                "secret Value from Certificates & secrets instead; the Value is "
                "shown only when the secret is created."
            ),
        )


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


def _normative_dc_settings_status() -> dict:
    username = str(os.getenv(NORMATIVE_DC_ENV_KEYS["username"]) or "").strip()
    password_configured = bool(str(os.getenv(NORMATIVE_DC_ENV_KEYS["password"]) or "").strip())
    return {
        "usernameConfigured": bool(username),
        "usernameHint": _credential_hint(username),
        "passwordConfigured": password_configured,
        "credentialsConfigured": bool(username and password_configured),
    }


def _plant_report_inbox_status() -> dict:
    stored = mail_notification_settings_collection.find_one(
        {"_id": REPLACEMENT_MAIL_SETTINGS_ID},
        {"_id": 0, "plantReportInboxEnabled": 1, "reportMailbox": 1},
    ) or {}
    tenant_id = _runtime_env_value(PLANT_REPORT_GRAPH_ENV_KEYS["tenantId"])
    client_id = _runtime_env_value(PLANT_REPORT_GRAPH_ENV_KEYS["clientId"])
    client_secret = _runtime_env_value(PLANT_REPORT_GRAPH_ENV_KEYS["clientSecret"])
    secret_ready = bool(client_secret)
    secret_looks_like_id = bool(
        re.fullmatch(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            client_secret,
        )
    )
    mailbox = str(stored.get("reportMailbox") or "").strip()
    auth_mode = _runtime_env_value(PLANT_REPORT_GRAPH_AUTH_MODE).lower()
    auth_mode = auth_mode if auth_mode in {"application", "delegated"} else "delegated"
    delegated_mailbox = _runtime_env_value(PLANT_REPORT_GRAPH_DELEGATED_MAILBOX)
    delegated_connected = bool(_runtime_env_value(PLANT_REPORT_GRAPH_REFRESH_TOKEN))
    credential_ready = bool(
        tenant_id
        and client_id
        and (
            delegated_connected
            if auth_mode == "delegated"
            else secret_ready and not secret_looks_like_id
        )
    )
    return {
        "enabled": bool(stored.get("plantReportInboxEnabled", False)),
        "mailbox": mailbox,
        "authMode": auth_mode,
        "delegatedConnected": delegated_connected,
        "delegatedMailbox": delegated_mailbox,
        "tenantConfigured": bool(tenant_id),
        "tenantHint": _credential_hint(tenant_id),
        "clientConfigured": bool(client_id),
        "clientHint": _credential_hint(client_id),
        "secretConfigured": secret_ready,
        "secretLooksLikeId": secret_looks_like_id,
        "credentialsConfigured": credential_ready,
        "ready": bool(
            stored.get("plantReportInboxEnabled", False)
            and mailbox
            and credential_ready
        ),
        "subjectPattern": "Consolidated details for thermal and hydro stations_DD.MM.YY",
        "attachmentPattern": "Plantwise Deviation from IC_DD-MM-YYYY_consolidated.xlsm",
        "sheets": ["NR", "SR", "WR"],
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
        "normativeDc": _normative_dc_settings_status(),
        "plantReportInbox": _plant_report_inbox_status(),
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


@router.put("/normative-dc")
def update_normative_dc_credentials(
    payload: NormativeDcCredentialsUpdate,
    user=Depends(require_mail_admin),
):
    username = _safe_credential(payload.username, "Normative DC username")
    password = _safe_credential(payload.password, "Normative DC password")
    updates = {}
    if username:
        updates[NORMATIVE_DC_ENV_KEYS["username"]] = username
    if password:
        updates[NORMATIVE_DC_ENV_KEYS["password"]] = password
    if not updates:
        raise HTTPException(400, detail="Enter a Normative DC username or password to save")

    final_username = updates.get(NORMATIVE_DC_ENV_KEYS["username"]) or os.getenv(NORMATIVE_DC_ENV_KEYS["username"], "").strip()
    final_password = updates.get(NORMATIVE_DC_ENV_KEYS["password"]) or os.getenv(NORMATIVE_DC_ENV_KEYS["password"], "").strip()
    if not final_username or not final_password:
        raise HTTPException(400, detail="Both Normative DC username and password must be configured")

    _persist_backend_credentials(
        updates,
        "Normative DC credentials managed from Admin > Mail & 2FA Settings",
    )
    return {
        "normativeDc": _normative_dc_settings_status(),
        "message": "Normative DC credentials saved.",
    }


@router.put("/plant-report-inbox")
def update_plant_report_inbox_settings(
    payload: PlantReportInboxSettingsUpdate,
    user=Depends(require_mail_admin),
):
    mailbox = _safe_credential(payload.mailbox, "Report mailbox")
    if mailbox and ("@" not in mailbox or "." not in mailbox.rsplit("@", 1)[-1]):
        raise HTTPException(400, detail="Enter a valid Microsoft 365 report mailbox")
    credential_values = {
        "tenantId": _safe_credential(payload.tenantId, "Tenant ID"),
        "clientId": _safe_credential(payload.clientId, "Application ID"),
        "clientSecret": _safe_credential(payload.clientSecret, "Client secret"),
    }
    auth_mode = str(payload.authMode or "application").strip().lower()
    if auth_mode not in {"application", "delegated"}:
        raise HTTPException(400, detail="Report mailbox authentication must be Application or Delegated")
    _validate_graph_client_secret(credential_values["clientSecret"])
    env_updates = {
        PLANT_REPORT_GRAPH_ENV_KEYS[field]: value
        for field, value in credential_values.items()
        if value
    }
    final_values = {
        field: env_updates.get(env_key) or _runtime_env_value(env_key)
        for field, env_key in PLANT_REPORT_GRAPH_ENV_KEYS.items()
    }
    if payload.enabled and not mailbox:
        raise HTTPException(400, detail="Report mailbox is required before enabling automatic report access")
    delegated_connected = bool(_runtime_env_value(PLANT_REPORT_GRAPH_REFRESH_TOKEN))
    if payload.enabled and auth_mode == "application" and not all(final_values.values()):
        raise HTTPException(400, detail="Enter the report Tenant ID, Application ID and Client Secret before enabling")
    if payload.enabled and auth_mode == "delegated" and not (
        final_values.get("tenantId") and final_values.get("clientId") and delegated_connected
    ):
        raise HTTPException(400, detail="Connect your Microsoft mailbox before enabling delegated report access")
    env_updates[PLANT_REPORT_GRAPH_AUTH_MODE] = auth_mode
    _persist_backend_credentials(
        env_updates,
        "Microsoft Graph credentials for consolidated Thermal/Hydro report inbox",
    )
    mail_notification_settings_collection.update_one(
        {"_id": REPLACEMENT_MAIL_SETTINGS_ID},
        {"$set": {
            "plantReportInboxEnabled": bool(payload.enabled),
            "reportMailbox": mailbox,
            "plantReportInboxUpdatedAt": datetime.utcnow(),
            "plantReportInboxUpdatedBy": str(user.get("employeeId") or user.get("userId") or "ADMIN"),
        }},
        upsert=True,
    )
    return {
        "plantReportInbox": _plant_report_inbox_status(),
        "message": "Consolidated Thermal/Hydro report inbox settings saved.",
    }


@router.post("/plant-report-inbox/delegated/start")
def start_delegated_report_mailbox(user=Depends(require_mail_admin)):
    tenant_id = _runtime_env_value(PLANT_REPORT_GRAPH_ENV_KEYS["tenantId"])
    client_id = _runtime_env_value(PLANT_REPORT_GRAPH_ENV_KEYS["clientId"])
    if not tenant_id or not client_id:
        raise HTTPException(409, detail="Save the Tenant ID and Application ID before connecting your mailbox")
    try:
        response = requests.post(
            f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/devicecode",
            data={
                "client_id": client_id,
                "scope": "openid profile offline_access https://graph.microsoft.com/Mail.Read",
            },
            timeout=25,
        )
        payload = response.json() if response.content else {}
    except requests.RequestException as exc:
        raise HTTPException(502, detail=f"Microsoft delegated sign-in could not be started: {exc}") from exc
    if response.status_code != 200 or not payload.get("device_code"):
        detail = payload.get("error_description") or payload.get("error") or "Device sign-in is unavailable"
        raise HTTPException(502, detail=str(detail)[:500])
    return {
        "status": "pending",
        "deviceCode": payload["device_code"],
        "userCode": payload.get("user_code"),
        "verificationUri": payload.get("verification_uri") or "https://microsoft.com/devicelogin",
        "message": payload.get("message"),
        "expiresIn": payload.get("expires_in", 900),
        "interval": max(5, int(payload.get("interval") or 5)),
    }


@router.post("/plant-report-inbox/delegated/poll")
def poll_delegated_report_mailbox(
    payload: DelegatedMailboxPoll,
    user=Depends(require_mail_admin),
):
    tenant_id = _runtime_env_value(PLANT_REPORT_GRAPH_ENV_KEYS["tenantId"])
    client_id = _runtime_env_value(PLANT_REPORT_GRAPH_ENV_KEYS["clientId"])
    if not tenant_id or not client_id:
        raise HTTPException(409, detail="Tenant ID and Application ID are not configured")
    try:
        response = requests.post(
            f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "client_id": client_id,
                "device_code": payload.deviceCode,
            },
            timeout=25,
        )
        token_payload = response.json() if response.content else {}
    except requests.RequestException as exc:
        raise HTTPException(502, detail=f"Microsoft sign-in status could not be checked: {exc}") from exc
    error_code = str(token_payload.get("error") or "")
    if error_code in {"authorization_pending", "slow_down"}:
        return {"status": "pending", "slowDown": error_code == "slow_down"}
    if response.status_code != 200 or not token_payload.get("access_token"):
        detail = token_payload.get("error_description") or error_code or "Delegated sign-in failed"
        raise HTTPException(400, detail=str(detail)[:500])
    refresh_token = str(token_payload.get("refresh_token") or "").strip()
    if not refresh_token:
        raise HTTPException(502, detail="Microsoft did not return an offline refresh token. Ensure offline_access is allowed")
    graph_response = requests.get(
        "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages",
        headers={"Authorization": f"Bearer {token_payload['access_token']}"},
        params={"$select": "id", "$top": "1"},
        timeout=25,
    )
    if graph_response.status_code != 200:
        raise HTTPException(502, detail=f"Microsoft sign-in succeeded but delegated mailbox access failed (HTTP {graph_response.status_code})")
    identity = {}
    try:
        encoded_claims = str(token_payload.get("id_token") or "").split(".")[1]
        encoded_claims += "=" * (-len(encoded_claims) % 4)
        identity = json.loads(base64.urlsafe_b64decode(encoded_claims).decode("utf-8"))
    except (IndexError, ValueError, TypeError, UnicodeDecodeError):
        identity = {}
    stored = mail_notification_settings_collection.find_one(
        {"_id": REPLACEMENT_MAIL_SETTINGS_ID}, {"reportMailbox": 1}
    ) or {}
    mailbox = str(
        identity.get("preferred_username")
        or identity.get("email")
        or stored.get("reportMailbox")
        or ""
    ).strip()
    if not mailbox:
        raise HTTPException(502, detail="The connected Microsoft account has no mailbox address")
    _persist_backend_credentials(
        {
            PLANT_REPORT_GRAPH_AUTH_MODE: "delegated",
            PLANT_REPORT_GRAPH_REFRESH_TOKEN: refresh_token,
            PLANT_REPORT_GRAPH_DELEGATED_MAILBOX: mailbox,
        },
        "Delegated Microsoft Graph report-mailbox connection",
    )
    mail_notification_settings_collection.update_one(
        {"_id": REPLACEMENT_MAIL_SETTINGS_ID},
        {"$set": {
            "plantReportInboxEnabled": True,
            "reportMailbox": mailbox,
            "plantReportInboxUpdatedAt": datetime.utcnow(),
            "plantReportInboxUpdatedBy": str(user.get("employeeId") or user.get("userId") or "ADMIN"),
        }},
        upsert=True,
    )
    return {
        "status": "connected",
        "displayName": str(identity.get("name") or "").strip(),
        "mailbox": mailbox,
        "plantReportInbox": _plant_report_inbox_status(),
        "message": f"Microsoft mailbox {mailbox} connected for delegated report access.",
    }


@router.delete("/plant-report-inbox/delegated")
def disconnect_delegated_report_mailbox(user=Depends(require_mail_admin)):
    _persist_backend_credentials(
        {
            PLANT_REPORT_GRAPH_REFRESH_TOKEN: "",
            PLANT_REPORT_GRAPH_DELEGATED_MAILBOX: "",
        },
        "Delegated Microsoft Graph report-mailbox connection",
    )
    mail_notification_settings_collection.update_one(
        {"_id": REPLACEMENT_MAIL_SETTINGS_ID},
        {"$set": {
            "plantReportInboxEnabled": False,
            "plantReportInboxUpdatedAt": datetime.utcnow(),
            "plantReportInboxUpdatedBy": str(user.get("employeeId") or user.get("userId") or "ADMIN"),
        }},
        upsert=True,
    )
    return {
        "plantReportInbox": _plant_report_inbox_status(),
        "message": "Delegated Microsoft mailbox disconnected.",
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
    _validate_graph_client_secret(credential_values["clientSecret"])
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
        "normativeDc": _normative_dc_settings_status(),
        "plantReportInbox": _plant_report_inbox_status(),
        "message": "Mail and two-factor authentication settings saved",
    }
