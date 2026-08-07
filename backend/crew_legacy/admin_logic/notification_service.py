import os
import logging
from datetime import datetime

import requests

from crew_legacy.database.database_mongo import (
    duty_notification_collection,
    mail_notification_settings_collection,
)

TRUTHY = {"1", "true", "yes", "on"}
logger = logging.getLogger(__name__)
REPLACEMENT_MAIL_SETTINGS_ID = "replacement_duty_mail"
MAIL_TEMPLATE_SETTINGS_ID = "workflow_mail_templates"
DEFAULT_REPLACEMENT_SUBJECT = "Replacement Duty Request - {shift_name} - {date}"
DEFAULT_REPLACEMENT_BODY = (
    "{replacement_person} is requested to perform {shift_name} duty on {date} "
    "in place of {leave_person}."
)

WORKFLOW_MAIL_DEFAULTS = {
    "replacement_assigned": {
        "label": "Replacement duty assigned",
        "enabled": True,
        "subjectTemplate": DEFAULT_REPLACEMENT_SUBJECT,
        "bodyTemplate": DEFAULT_REPLACEMENT_BODY,
    },
    "leave_applied": {
        "label": "Leave application submitted to SIC",
        "enabled": True,
        "subjectTemplate": "Leave application for SIC review - {employee_name}",
        "bodyTemplate": "{employee_name} ({employee_id}) applied for {leave_count} leave day(s): {leave_dates}. Group: {group_name}.",
    },
    "leave_sic_forwarded": {
        "label": "Leave approved and forwarded by SIC",
        "enabled": True,
        "subjectTemplate": "Leave Approved and Forwarded by SIC",
        "bodyTemplate": "Leave approved by SIC and forwarded for final approval.\n\nName: {employee_name}\nEmployee ID: {employee_id}\nDate: {leave_date}\nType: {leave_type}",
    },
    "leave_sic_rejected": {
        "label": "Leave rejected by SIC",
        "enabled": True,
        "subjectTemplate": "Leave Rejected by SIC",
        "bodyTemplate": "Your leave has been rejected by SIC.\n\nDate: {leave_date}\nType: {leave_type}\nComment: {comment}",
    },
    "leave_dic_approved": {
        "label": "Leave finally approved by DIC",
        "enabled": True,
        "subjectTemplate": "Leave Finally Approved by DIC",
        "bodyTemplate": "Leave has received final approval from the DIC.\n\nName: {employee_name}\nEmployee ID: {employee_id}\nDate: {leave_date}\nType: {leave_type}",
    },
    "leave_dic_rejected": {
        "label": "Leave rejected by DIC",
        "enabled": True,
        "subjectTemplate": "Leave Rejected",
        "bodyTemplate": "Your leave has been rejected.\n\nDate: {leave_date}\nType: {leave_type}\nComment: {comment}",
    },
    "training_approved": {
        "label": "Training nomination finally approved",
        "enabled": True,
        "subjectTemplate": "Training approved - {training_name}",
        "bodyTemplate": (
            "Training nomination has been approved.\n\n"
            "Employee: {employee_name} ({employee_id})\n"
            "Training: {training_name}\nPeriod: {training_period}\n"
            "Location: {training_location}\nAdjacent OFF: {adjacent_off}"
        ),
    },
    "training_adjacent_off_approved": {
        "label": "Training adjacent OFF finally approved",
        "enabled": True,
        "subjectTemplate": "Training adjacent OFF approved - {training_name}",
        "bodyTemplate": (
            "Adjacent OFF has been approved.\n\n"
            "Employee: {employee_name} ({employee_id})\n"
            "Training: {training_name}\nPeriod: {training_period}\n"
            "Location: {training_location}\nApproved OFF: {adjacent_off}"
        ),
    },
}


def workflow_mail_templates():
    stored = mail_notification_settings_collection.find_one(
        {"_id": MAIL_TEMPLATE_SETTINGS_ID}, {"_id": 0}
    ) or {}
    stored_templates = stored.get("templates") or {}
    legacy_replacement = mail_notification_settings_collection.find_one(
        {"_id": REPLACEMENT_MAIL_SETTINGS_ID}, {"_id": 0}
    ) or {}
    result = {}
    for key, defaults in WORKFLOW_MAIL_DEFAULTS.items():
        custom = stored_templates.get(key) or {}
        if key == "replacement_assigned" and not custom:
            custom = {
                "enabled": legacy_replacement.get("enabled", defaults["enabled"]),
                "subjectTemplate": legacy_replacement.get("subjectTemplate"),
                "bodyTemplate": legacy_replacement.get("bodyTemplate"),
            }
        result[key] = {
            "key": key,
            "label": defaults["label"],
            "enabled": bool(custom.get("enabled", defaults["enabled"])),
            "subjectTemplate": custom.get("subjectTemplate") or defaults["subjectTemplate"],
            "bodyTemplate": custom.get("bodyTemplate") or defaults["bodyTemplate"],
        }
    return result


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


def send_email(to_list, subject, body, *, html=False, sender=None, enabled=None, attachments=None):
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

        graph_attachments = []
        for attachment in attachments or []:
            content = str(attachment.get("contentBytes") or "").strip()
            if not content:
                continue
            graph_attachments.append({
                "@odata.type": "#microsoft.graph.fileAttachment",
                "name": str(attachment.get("name") or "attachment"),
                "contentType": str(attachment.get("contentType") or "application/octet-stream"),
                "contentBytes": content,
            })
        message = {
            "subject": str(subject or "Duty notification"),
            "body": {"contentType": "HTML" if html else "Text", "content": str(body or "")},
            "toRecipients": [
                {"emailAddress": {"address": email}}
                for email in recipients
            ],
        }
        if graph_attachments:
            message["attachments"] = graph_attachments

        message_response = requests.post(
            f"https://graph.microsoft.com/v1.0/users/{sender_address}/sendMail",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={
                "message": message,
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
    template = workflow_mail_templates()["replacement_assigned"]
    rendered_values = _TemplateValues({key: str(value or "") for key, value in (values or {}).items()})
    try:
        subject = str(template["subjectTemplate"]).format_map(rendered_values)
        body = str(template["bodyTemplate"]).format_map(rendered_values)
    except (KeyError, ValueError):
        return {"status": "failed", "recipientCount": len(_clean_recipients(to_list)), "error": "Mail template is invalid"}
    return send_email(
        to_list,
        subject,
        body,
        sender=settings.get("sender"),
        enabled=bool(settings.get("enabled")) and bool(template.get("enabled")),
    )


def send_workflow_email(template_key, to_list, values):
    settings = replacement_mail_settings()
    template = workflow_mail_templates().get(template_key)
    if not template:
        return {"status": "skipped", "recipientCount": 0, "error": "Unknown workflow mail template"}
    rendered = _TemplateValues({key: str(value or "") for key, value in (values or {}).items()})
    try:
        subject = str(template["subjectTemplate"]).format_map(rendered)
        body = str(template["bodyTemplate"]).format_map(rendered)
    except (KeyError, ValueError):
        return {"status": "failed", "recipientCount": len(_clean_recipients(to_list)), "error": "Mail template is invalid"}
    return send_email(
        to_list, subject, body, sender=settings.get("sender"),
        enabled=bool(settings.get("enabled")) and bool(template.get("enabled")),
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
    template_key=None,
    template_values=None,
):
    mail_result = {"status": "skipped", "recipientCount": 0, "error": "No email recipients supplied"}
    if email_list:
        try:
            if template_key:
                mail_result = send_workflow_email(template_key, email_list, template_values or {})
            else:
                settings = replacement_mail_settings()
                mail_result = send_email(
                    email_list, subject, message, sender=settings.get("sender"),
                    enabled=bool(settings.get("enabled")),
                )
        except Exception as exc:
            # Notifications run after the business record is committed. A
            # delivery failure must not make the API report that operation as
            # failed and tempt the user to submit the same record again.
            logger.exception("Mail notification failed for %s", template_key or type)
            mail_result = {
                "status": "failed",
                "recipientCount": len(_clean_recipients(email_list)),
                "error": str(exc)[:180],
            }
    if employee_ids:
        try:
            send_app_notification(
                employee_ids,
                subject,
                message,
                ref_id=ref_id,
                action=action,
                type=type,
            )
        except Exception:
            logger.exception("Portal notification failed for %s", type)
    try:
        send_teams(f"{subject}\n\n{message}")
    except Exception:
        logger.exception("Teams notification failed for %s", type)
    return mail_result
