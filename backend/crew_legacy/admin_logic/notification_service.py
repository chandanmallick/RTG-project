import os
from datetime import datetime

import requests

from crew_legacy.database.database_mongo import (
    duty_notification_collection,
    mail_notification_settings_collection,
)

TRUTHY = {"1", "true", "yes", "on"}
REPLACEMENT_MAIL_SETTINGS_ID = "replacement_duty_mail"
DEFAULT_REPLACEMENT_SUBJECT = "Replacement Duty Request - {shift_name} - {date}"
DEFAULT_REPLACEMENT_BODY = (
    "{replacement_person} is requested to perform {shift_name} duty on {date} "
    "in place of {leave_person}."
)


def graph_credentials_configured():
    return all(
        str(os.getenv(key, "")).strip()
        for key in ("CREW_GRAPH_TENANT_ID", "CREW_GRAPH_CLIENT_ID", "CREW_GRAPH_CLIENT_SECRET")
    )


def replacement_mail_settings():
    stored = mail_notification_settings_collection.find_one(
        {"_id": REPLACEMENT_MAIL_SETTINGS_ID},
        {"_id": 0},
    ) or {}
    return {
        "enabled": stored.get(
            "enabled",
            os.getenv("CREW_EMAIL_ENABLED", "0").strip().lower() in TRUTHY,
        ),
        "sender": str(stored.get("sender") or os.getenv("CREW_GRAPH_SENDER", "")).strip(),
        "subjectTemplate": stored.get("subjectTemplate") or DEFAULT_REPLACEMENT_SUBJECT,
        "bodyTemplate": stored.get("bodyTemplate") or DEFAULT_REPLACEMENT_BODY,
    }


def public_replacement_mail_settings():
    settings = replacement_mail_settings()
    tenant_id = os.getenv("CREW_GRAPH_TENANT_ID", "").strip()
    client_id = os.getenv("CREW_GRAPH_CLIENT_ID", "").strip()

    def masked_hint(value):
        if not value:
            return ""
        return ("*" * max(4, len(value) - 4)) + value[-4:]

    return {
        **settings,
        "provider": "Microsoft Graph",
        "credentialsConfigured": graph_credentials_configured(),
        "tenantConfigured": bool(tenant_id),
        "tenantHint": masked_hint(tenant_id),
        "clientConfigured": bool(client_id),
        "clientHint": masked_hint(client_id),
        "secretConfigured": bool(os.getenv("CREW_GRAPH_CLIENT_SECRET", "").strip()),
    }


def _clean_recipients(to_list):
    recipients = []
    seen = set()
    for value in to_list or []:
        email = str(value or "").strip()
        key = email.lower()
        if not email or "@" not in email or key in seen:
            continue
        seen.add(key)
        recipients.append(email)
    return recipients


def send_email(to_list, subject, body, *, html=False, sender=None, enabled=None):
    """Send mail through Microsoft Graph without exposing credentials or tokens."""
    recipients = _clean_recipients(to_list)
    if enabled is None:
        enabled = os.getenv("CREW_EMAIL_ENABLED", "0").strip().lower() in TRUTHY
    if not enabled:
        return {"status": "disabled", "recipientCount": len(recipients)}
    if not recipients:
        return {"status": "skipped", "recipientCount": 0, "error": "No recipient email address is configured"}
    if not graph_credentials_configured():
        return {"status": "failed", "recipientCount": len(recipients), "error": "Microsoft Graph credentials are not configured"}

    tenant_id = os.getenv("CREW_GRAPH_TENANT_ID", "").strip()
    client_id = os.getenv("CREW_GRAPH_CLIENT_ID", "").strip()
    client_secret = os.getenv("CREW_GRAPH_CLIENT_SECRET", "").strip()
    sender_address = str(sender or os.getenv("CREW_GRAPH_SENDER", "")).strip()
    if not sender_address:
        return {"status": "failed", "recipientCount": len(recipients), "error": "Sender mailbox is not configured"}

    try:
        token_response = requests.post(
            f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "https://graph.microsoft.com/.default",
            },
            timeout=20,
        )
        token_response.raise_for_status()
        access_token = token_response.json().get("access_token")
        if not access_token:
            raise RuntimeError("Microsoft Graph did not return an access token")

        message_response = requests.post(
            f"https://graph.microsoft.com/v1.0/users/{sender_address}/sendMail",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={
                "message": {
                    "subject": str(subject or "Duty notification"),
                    "body": {"contentType": "HTML" if html else "Text", "content": str(body or "")},
                    "toRecipients": [
                        {"emailAddress": {"address": email}}
                        for email in recipients
                    ],
                },
                "saveToSentItems": True,
            },
            timeout=30,
        )
        if message_response.status_code != 202:
            return {
                "status": "failed",
                "recipientCount": len(recipients),
                "error": f"Microsoft Graph returned HTTP {message_response.status_code}",
            }
        return {"status": "sent", "recipientCount": len(recipients)}
    except requests.RequestException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        suffix = f" (HTTP {status_code})" if status_code else ""
        return {"status": "failed", "recipientCount": len(recipients), "error": f"Microsoft Graph request failed{suffix}"}
    except Exception as exc:
        return {"status": "failed", "recipientCount": len(recipients), "error": str(exc)[:180]}


class _TemplateValues(dict):
    def __missing__(self, key):
        return "{" + key + "}"


def send_replacement_duty_email(to_list, values):
    settings = replacement_mail_settings()
    rendered_values = _TemplateValues({key: str(value or "") for key, value in (values or {}).items()})
    try:
        subject = str(settings["subjectTemplate"]).format_map(rendered_values)
        body = str(settings["bodyTemplate"]).format_map(rendered_values)
    except (KeyError, ValueError):
        return {"status": "failed", "recipientCount": len(_clean_recipients(to_list)), "error": "Mail template is invalid"}
    return send_email(
        to_list,
        subject,
        body,
        sender=settings.get("sender"),
        enabled=bool(settings.get("enabled")),
    )


def send_teams(message):
    webhook_url = os.getenv("CREW_TEAMS_WEBHOOK_URL", "").strip()
    if not webhook_url:
        return
    try:
        requests.post(webhook_url, json={"text": message}, timeout=10)
    except requests.RequestException:
        pass


def send_app_notification(employee_ids, title, message, ref_id=None, action=None, type="GENERAL"):
    now = datetime.utcnow()
    docs = [
        {
            "employeeId": emp_id,
            "title": title,
            "message": message,
            "refId": ref_id,
            "action": action,
            "type": type,
            "status": "Unread",
            "createdAt": now,
        }
        for emp_id in (employee_ids or [])
        if emp_id
    ]
    if docs:
        duty_notification_collection.insert_many(docs)


def notify_all(
    email_list=None,
    employee_ids=None,
    subject=None,
    message=None,
    ref_id=None,
    action=None,
    type="GENERAL",
):
    if email_list:
        send_email(email_list, subject, message)
    if employee_ids:
        send_app_notification(
            employee_ids,
            subject,
            message,
            ref_id=ref_id,
            action=action,
            type=type,
        )
    send_teams(f"{subject}\n\n{message}")
