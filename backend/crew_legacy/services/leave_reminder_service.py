import logging
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo
from typing import Optional, List, Dict, Any

from crew_legacy.database.database_mongo import (
    leave_request_collection,
    employee_collection,
    employee_daily_collection,
    roster_group_collection,
)
from crew_legacy.admin_logic.notification_service import notify_all

logger = logging.getLogger("leave_reminder_service")

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")
PENDING_STATUSES = [
    "Applied",
    "Forwarded",
    "Forwarded by SIC",
    "Forwarded by Reporting Officer",
    "Forwarded to Intermediary Reporting Officer",
    "Forwarded to HOD",
]


def clean_id(value) -> str:
    return str(value or "").replace("\xa0", " ").strip()


def resolve_employee_emails(employee_ids: List[str]) -> List[str]:
    """Retrieve verified email addresses for a list of employee IDs."""
    emails = []
    seen = set()
    cleaned_ids = [clean_id(eid) for eid in employee_ids if clean_id(eid)]
    if not cleaned_ids:
        return emails

    employees = employee_collection.find({
        "$or": [
            {"userId": {"$in": cleaned_ids}},
            {"employeeId": {"$in": cleaned_ids}},
        ]
    })
    for emp in employees:
        mail = clean_id(emp.get("gmail") or emp.get("email") or emp.get("mailId"))
        if mail and "@" in mail and mail.lower() not in seen:
            seen.add(mail.lower())
            emails.append(mail)
    return emails


def get_pending_approver_details(leave: dict) -> tuple[List[str], str]:
    """
    Identifies the pending approver employee IDs and the current approval stage
    (SIC or DIC / Organization Authority) for an unapproved leave.
    """
    final_status = clean_id(leave.get("finalStatus"))
    approval_mode = clean_id(leave.get("approvalMode") or "Shift")
    date_str = clean_id(leave.get("date"))
    group_name = clean_id(leave.get("groupName"))
    employee_id = clean_id(leave.get("employeeId"))

    approver_ids = []
    stage_label = "SIC Review"

    if approval_mode == "Organization":
        chain = leave.get("approvalChain") or []
        curr_idx = int(leave.get("currentApprovalIndex") or 0)
        if curr_idx < len(chain):
            current_step = chain[curr_idx]
            approver_ids = [clean_id(eid) for eid in current_step.get("employeeIds") or [] if clean_id(eid)]
            stage_label = current_step.get("level") or f"Reporting Officer (Level {curr_idx + 1})"
        else:
            stage_label = "Organization Authority"
    else:
        # Shift mode
        if final_status == "Applied":
            stage_label = "SIC (Shift-in-Charge)"
            # Find SIC for this shift date and group
            daily_sics = employee_daily_collection.find({
                "date": date_str,
                "$or": [
                    {"groupName": group_name, "isSIC": True},
                    {"isActingSIC": True, "$or": [{"groupName": group_name}, {"actingSICGroup": group_name}]},
                ],
            }, {"employeeId": 1})
            approver_ids = [clean_id(r.get("employeeId")) for r in daily_sics if clean_id(r.get("employeeId"))]

            if not approver_ids and group_name:
                group_doc = roster_group_collection.find_one({"groupName": group_name, "isActive": {"$ne": False}})
                if group_doc and group_doc.get("shiftInCharge"):
                    sic_id = clean_id(group_doc["shiftInCharge"].get("employeeId") or group_doc["shiftInCharge"].get("userId"))
                    if sic_id:
                        approver_ids.append(sic_id)
        else:
            # 2nd layer: DIC / Department-in-Charge
            stage_label = "DIC (Department-in-Charge / 2nd Layer)"
            duty = employee_daily_collection.find_one({
                "employeeId": {"$regex": f"^{employee_id}$", "$options": "i"},
                "date": date_str,
            }) or {}
            dic_id = clean_id((duty.get("departmentIC") or {}).get("employeeId"))
            if dic_id:
                approver_ids.append(dic_id)

            emp = employee_collection.find_one({
                "$or": [{"userId": employee_id}, {"employeeId": employee_id}]
            }) or {}
            reporting_id = clean_id(emp.get("reportingOfficerId") or emp.get("reportingTo"))
            if reporting_id and reporting_id not in approver_ids:
                approver_ids.append(reporting_id)

    # Exclude applicant themselves
    approver_ids = [eid for eid in dict.fromkeys(approver_ids) if eid and eid != employee_id]
    return approver_ids, stage_label


def scan_and_send_leave_approval_reminders(force: bool = False) -> Dict[str, Any]:
    """
    Scans for leave applications pending approval that have reached or passed
    the 6th day since submission, and sends twice-daily reminders to SIC/DIC.
    """
    now_kolkata = datetime.now(KOLKATA_TZ)
    now_utc = datetime.utcnow()
    today_date = now_kolkata.date()

    query = {
        "finalStatus": {"$in": PENDING_STATUSES},
    }

    leaves = list(leave_request_collection.find(query))
    logger.info(f"Checking {len(leaves)} active pending leaves for 6-day approval reminders...")

    checked_count = len(leaves)
    eligible_count = 0
    reminders_sent = 0
    skipped_recent = 0
    results_detail = []

    for leave in leaves:
        leave_id = str(leave["_id"])
        created_on = leave.get("createdOn")

        # Determine application date
        if isinstance(created_on, datetime):
            app_date = created_on.date()
        elif isinstance(created_on, str):
            try:
                app_date = datetime.fromisoformat(created_on.replace("Z", "+00:00")).date()
            except Exception:
                app_date = datetime.strptime(created_on[:10], "%Y-%m-%d").date()
        elif leave.get("_id"):
            app_date = leave["_id"].generation_time.date()
        else:
            continue

        days_pending = (today_date - app_date).days
        if days_pending < 6 and not force:
            continue

        eligible_count += 1

        # Check deduplication: avoid sending multiple times within 3.5 hours
        last_sent = leave.get("lastReminderSentAt")
        if last_sent and not force:
            if isinstance(last_sent, str):
                try:
                    last_sent = datetime.fromisoformat(last_sent.replace("Z", "+00:00"))
                except Exception:
                    last_sent = None
            if isinstance(last_sent, datetime):
                # Ensure tz-naive or compare UTC
                last_sent_utc = last_sent.replace(tzinfo=None)
                if (now_utc - last_sent_utc) < timedelta(hours=3.5):
                    skipped_recent += 1
                    continue

        approver_ids, stage_label = get_pending_approver_details(leave)
        recipient_mails = resolve_employee_emails(approver_ids)

        urgency_tag = leave.get("urgencyTag") or "Urgent"
        employee_name = leave.get("name") or leave.get("employeeId")
        leave_date = leave.get("date")
        leave_type = leave.get("leaveType") or ("Station Leave" if leave.get("stationLeaveOnly") else "Leave")

        if recipient_mails:
            try:
                notify_all(
                    email_list=recipient_mails,
                    employee_ids=approver_ids,
                    subject=f"Reminder: Leave Approval Pending ({urgency_tag}) - {employee_name}",
                    message=(
                        f"Leave application for {employee_name} ({leave.get('employeeId')}) on {leave_date} "
                        f"has been pending {stage_label} approval for {days_pending} days. Urgency: {urgency_tag}."
                    ),
                    ref_id=leave.get("leaveGroupId") or leave_id,
                    action="VIEW_LEAVE",
                    type="LEAVE",
                    template_key="leave_approval_reminder",
                    template_values={
                        "employee_name": employee_name,
                        "employee_id": leave.get("employeeId"),
                        "leave_date": leave_date,
                        "leave_type": leave_type,
                        "urgency_tag": urgency_tag,
                        "approval_stage": stage_label,
                        "final_status": leave.get("finalStatus"),
                        "pending_days": days_pending,
                        "applied_date": app_date.strftime("%d %b %Y"),
                        "reason": leave.get("reason") or "N/A",
                    },
                    force_email=True,
                )

                # Update reminder tracking in DB
                leave_request_collection.update_one(
                    {"_id": leave["_id"]},
                    {
                        "$set": {
                            "lastReminderSentAt": now_utc,
                            "lastReminderStage": stage_label,
                        },
                        "$inc": {"reminderCount": 1},
                    },
                )
                reminders_sent += 1
                results_detail.append({
                    "leaveId": leave_id,
                    "employeeId": leave.get("employeeId"),
                    "employeeName": employee_name,
                    "stage": stage_label,
                    "daysPending": days_pending,
                    "urgencyTag": urgency_tag,
                    "recipients": recipient_mails,
                    "status": "SENT",
                })
            except Exception as exc:
                logger.error(f"Failed to send reminder for leave {leave_id}: {exc}", exc_info=True)
                results_detail.append({
                    "leaveId": leave_id,
                    "employeeId": leave.get("employeeId"),
                    "error": str(exc),
                    "status": "FAILED",
                })
        else:
            logger.warning(f"No recipient email found for pending leave {leave_id} (approvers: {approver_ids})")
            results_detail.append({
                "leaveId": leave_id,
                "employeeId": leave.get("employeeId"),
                "stage": stage_label,
                "approvers": approver_ids,
                "status": "NO_EMAIL_FOUND",
            })

    summary = {
        "timestamp": now_kolkata.isoformat(),
        "checked": checked_count,
        "eligibleOver6Days": eligible_count,
        "sent": reminders_sent,
        "skippedRecent": skipped_recent,
        "details": results_detail,
    }
    logger.info(f"Leave approval reminder run complete: {summary}")
    return summary
