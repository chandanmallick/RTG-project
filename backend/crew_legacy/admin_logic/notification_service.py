import smtplib
import requests
import os
from email.mime.text import MIMEText
from datetime import datetime

from crew_legacy.database.database_mongo import duty_notification_collection

EMAIL = "erldccroomcrew@gmail.com"
PASSWORD = "yfwj mqbg geiz vltv"
EMAIL_ENABLED = os.getenv("CREW_EMAIL_ENABLED", "0").strip().lower() in {"1", "true", "yes", "on"}

TEAMS_WEBHOOK_URL = "YOUR_TEAMS_WEBHOOK_URL"  # ðŸ”¥ replace


# ============================================
# EMAIL
# ============================================

def send_email(to_list, subject, body):
    if not EMAIL_ENABLED:
        print("MAIL BYPASSED: email notifications are disabled.")
        return

    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = EMAIL
        msg["To"] = ", ".join(to_list)

        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(EMAIL, PASSWORD)

        server.sendmail(EMAIL, to_list, msg.as_string())
        server.quit()

    except Exception as e:
        print("MAIL ERROR:", str(e))


# ============================================
# TEAMS
# ============================================

def send_teams(message):

    try:
        payload = {
            "text": message
        }
        requests.post(TEAMS_WEBHOOK_URL, json=payload)

    except Exception as e:
        print("TEAMS ERROR:", str(e))


# ============================================
# IN-APP NOTIFICATION
# ============================================

def send_app_notification(employee_ids, title, message, ref_id=None, action=None, type="GENERAL"):

    now = datetime.utcnow()

    docs = []

    for emp_id in employee_ids:
        docs.append({
            "employeeId": emp_id,
            "title": title,
            "message": message,

            # ðŸ”¥ NEW FIELDS
            "refId": ref_id,
            "action": action,
            "type": type,

            "status": "Unread",
            "createdAt": now
        })

    if docs:
        duty_notification_collection.insert_many(docs)


# ============================================
# MASTER FUNCTION
# ============================================

def notify_all(
    email_list=None,
    employee_ids=None,
    subject=None,
    message=None,
    ref_id=None,
    action=None,
    type="GENERAL"
):

    # ðŸ“§ EMAIL
    if email_list:
        send_email(email_list, subject, message)

    # ðŸ“± IN-APP
    if employee_ids:
        send_app_notification(
            employee_ids,
            subject,
            message,
            ref_id=ref_id,
            action=action,
            type=type
        )

    # ðŸ’¬ TEAMS (single summary)
    send_teams(f"{subject}\n\n{message}")
