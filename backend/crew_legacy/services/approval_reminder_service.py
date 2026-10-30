import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, List, Any

from crew_legacy.database.database_mongo import (
    leave_request_collection,
    employee_collection,
    employee_daily_collection,
    roster_group_collection,
    duty_notification_collection,
    duty_exchange_request_collection,
    training_nomination_history_collection,
    sports_application_collection,
)
from crew_legacy.admin_logic.notification_service import notify_all
from crew_legacy.services.leave_reminder_service import (
    get_pending_approver_details,
    resolve_employee_emails,
    clean_id,
    PENDING_STATUSES,
)

logger = logging.getLogger("approval_reminder_service")
KOLKATA_TZ = ZoneInfo("Asia/Kolkata")


def scan_and_send_all_pending_approval_reminders(force: bool = False) -> Dict[str, Any]:
    """
    Cron Job: Scans for any pending approvals across Leave, Replacement duties,
    Duty Exchanges, Training nominations & Sports applications.
    Groups pending tasks by Reporting Officer / HOD / In-Charge and sends
    a comprehensive email reminder to each eligible approver.
    """
    now_kolkata = datetime.now(KOLKATA_TZ)
    today_str = now_kolkata.date().isoformat()
    now_utc = datetime.utcnow()

    approver_map: Dict[str, Dict[str, Any]] = {}

    def ensure_approver(eid: str):
        cleaned = clean_id(eid)
        if not cleaned:
            return
        if cleaned not in approver_map:
            emp = employee_collection.find_one({"$or": [{"userId": cleaned}, {"employeeId": cleaned}]}) or {}
            approver_map[cleaned] = {
                "approver_id": cleaned,
                "approver_name": emp.get("name") or emp.get("employeeName") or cleaned,
                "last_sent": emp.get("lastApprovalReminderSentAt"),
                "pending_items": {
                    "leaves": [],
                    "replacements": [],
                    "exchanges": [],
                    "trainings": [],
                    "sports": [],
                },
            }

    # 1. Scan Pending Leaves
    for leave in leave_request_collection.find({"finalStatus": {"$in": PENDING_STATUSES}}):
        approver_ids, stage_label = get_pending_approver_details(leave)
        emp_name = leave.get("name") or leave.get("employeeName") or leave.get("employeeId") or "Employee"
        l_date = leave.get("date") or "Scheduled Date"
        l_type = leave.get("leaveType") or "Leave"
        for aid in approver_ids:
            ensure_approver(aid)
            cid = clean_id(aid)
            if cid in approver_map:
                approver_map[cid]["pending_items"]["leaves"].append({
                    "id": str(leave["_id"]),
                    "employee": emp_name,
                    "date": l_date,
                    "type": l_type,
                    "stage": stage_label,
                })

    # 2. Scan Pending Replacement Duties (Duty Notifications)
    for notif in duty_notification_collection.find({"status": "Pending"}):
        notif_date = str(notif.get("date") or "")
        # If duty date has elapsed, do not send approval reminders
        if notif_date and notif_date < today_str:
            continue
        controllers = [clean_id(c) for c in (notif.get("controllerIds") or []) if clean_id(c)]
        emp_name = notif.get("employeeName") or notif.get("employeeId") or "Staff"
        shift_name = notif.get("assignedDuty") or "Shift"
        for cid in controllers:
            ensure_approver(cid)
            if cid in approver_map:
                approver_map[cid]["pending_items"]["replacements"].append({
                    "id": str(notif["_id"]),
                    "employee": emp_name,
                    "date": notif_date,
                    "shift": shift_name,
                    "kind": "Replacement Duty Review",
                })

    # 3. Scan Pending Duty Exchanges
    for exc in duty_exchange_request_collection.find({"status": "Pending"}):
        exc_date = str(exc.get("sourceDate") or exc.get("date") or "")
        if exc_date and exc_date < today_str:
            continue
        emp1_id = clean_id((exc.get("firstEmployee") or {}).get("employeeId") or exc.get("requesterEmployeeId"))
        emp2_id = clean_id((exc.get("secondEmployee") or {}).get("employeeId") or exc.get("targetEmployeeId"))
        target_approvers = set()
        for eid in [emp1_id, emp2_id]:
            if not eid:
                continue
            emp_doc = employee_collection.find_one({"$or": [{"userId": eid}, {"employeeId": eid}]}) or {}
            ro_id = clean_id(emp_doc.get("reportingOfficerId") or emp_doc.get("reportingTo"))
            if ro_id:
                target_approvers.add(ro_id)
            grp = emp_doc.get("groupName")
            if grp and exc_date:
                daily_sic = employee_daily_collection.find_one({"date": exc_date, "groupName": grp, "isSIC": True})
                if daily_sic and daily_sic.get("employeeId"):
                    target_approvers.add(clean_id(daily_sic["employeeId"]))
        for aid in target_approvers:
            ensure_approver(aid)
            if aid in approver_map:
                approver_map[aid]["pending_items"]["exchanges"].append({
                    "id": str(exc["_id"]),
                    "firstEmployee": (exc.get("firstEmployee") or {}).get("name") or emp1_id,
                    "secondEmployee": (exc.get("secondEmployee") or {}).get("name") or emp2_id,
                    "date": exc_date,
                })

    # 4. Scan Uncovered Mandatory Leaves Requiring Replacement
    for leave in leave_request_collection.find({
        "finalStatus": "Approved",
        "replacementRequired": True,
        "replacement.employeeId": {"$in": [None, ""]},
        "date": {"$gte": today_str},
    }):
        grp = leave.get("groupName")
        ldate = leave.get("date")
        auth_ids = set()
        if grp and ldate:
            sics = employee_daily_collection.find({
                "date": ldate,
                "groupName": grp,
                "$or": [{"isSIC": True}, {"isActingSIC": True}],
            })
            for s in sics:
                if s.get("employeeId"):
                    auth_ids.add(clean_id(s["employeeId"]))
        for aid in auth_ids:
            ensure_approver(aid)
            if aid in approver_map:
                approver_map[aid]["pending_items"]["replacements"].append({
                    "id": str(leave["_id"]),
                    "employee": leave.get("name") or leave.get("employeeId"),
                    "date": ldate,
                    "shift": leave.get("assignedDuty") or "Shift",
                    "kind": "Uncovered Leave Replacement Needed",
                })

    # 5. Scan Pending Training Nominations
    for rec in training_nomination_history_collection.find({"status": {"$in": ["Nominated", "Pending Approval"]}}):
        chain = rec.get("approvalChain") or []
        idx = int(rec.get("currentApprovalIndex") or 0)
        if idx < len(chain):
            curr_approver = clean_id(chain[idx].get("employeeId"))
            if curr_approver:
                ensure_approver(curr_approver)
                if curr_approver in approver_map:
                    approver_map[curr_approver]["pending_items"]["trainings"].append({
                        "id": str(rec["_id"]),
                        "employee": rec.get("employeeName") or rec.get("employeeId"),
                        "training": rec.get("trainingName") or "Training",
                        "date": rec.get("startDate"),
                    })

    # 6. Send Consolidated Reminder Mails
    reminders_sent = 0
    skipped_recent = 0
    results_detail = []

    for aid, data in approver_map.items():
        pending = data["pending_items"]
        total_count = (
            len(pending["leaves"])
            + len(pending["replacements"])
            + len(pending["exchanges"])
            + len(pending["trainings"])
            + len(pending["sports"])
        )

        if total_count == 0:
            continue

        # Check deduplication: avoid sending multiple times within 3 hours unless force=True
        last_sent = data.get("last_sent")
        if last_sent and not force:
            if isinstance(last_sent, str):
                try:
                    last_sent = datetime.fromisoformat(last_sent.replace("Z", "+00:00"))
                except Exception:
                    last_sent = None
            if isinstance(last_sent, datetime):
                last_sent_utc = last_sent.replace(tzinfo=None)
                if (now_utc - last_sent_utc) < timedelta(hours=3):
                    skipped_recent += 1
                    continue

        emails = resolve_employee_emails([aid])
        if not emails:
            logger.warning(f"No verified email found for approver {aid} ({data['approver_name']})")
            continue

        approver_name = data["approver_name"]

        # Build clean bulleted summary for email
        summary_lines = []
        if pending["leaves"]:
            summary_lines.append(f"<li><strong>Leave Applications:</strong> {len(pending['leaves'])} pending</li>")
        if pending["replacements"]:
            summary_lines.append(f"<li><strong>Replacement Duties & Approvals:</strong> {len(pending['replacements'])} pending</li>")
        if pending["exchanges"]:
            summary_lines.append(f"<li><strong>Duty Exchange Requests:</strong> {len(pending['exchanges'])} pending</li>")
        if pending["trainings"]:
            summary_lines.append(f"<li><strong>Training Approvals:</strong> {len(pending['trainings'])} pending</li>")
        if pending["sports"]:
            summary_lines.append(f"<li><strong>Sports Applications:</strong> {len(pending['sports'])} pending</li>")

        html_body = f"""
        <div style="font-family: Arial, sans-serif; color: #1E293B; line-height: 1.6; max-width: 600px;">
          <h2 style="color: #03624C; margin-bottom: 8px;">COMPASS Crew Management</h2>
          <h3 style="color: #991B1B; margin-top: 0;">Action Required: Pending Approvals Reminder</h3>
          <p>Dear {approver_name},</p>
          <p>You have <strong>{total_count}</strong> item(s) awaiting your review and approval as an authorized In-Charge / Reporting Officer / HOD:</p>
          <ul style="padding-left: 20px; margin: 12px 0;">
            {''.join(summary_lines)}
          </ul>
          <p>Please log in to the COMPASS portal to review and take timely decision:</p>
          <p style="margin: 20px 0;">
            <a href="/crew/dashboard" style="background-color: #03624C; color: #FFFFFF; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Open Approval Dashboard &rarr;
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 20px 0;" />
          <p style="font-size: 11px; color: #64748B;">This is an automated notification from COMPASS System. Please do not reply directly to this mail.</p>
        </div>
        """

        try:
            notify_all(
                email_list=emails,
                employee_ids=[aid],
                subject=f"[ACTION REQUIRED] Pending Approvals Reminder ({total_count} pending) - COMPASS",
                message=f"Dear {approver_name}, you have {total_count} pending crew approval items awaiting your decision in COMPASS.",
                ref_id=f"REMINDER_{aid}_{now_kolkata.strftime('%Y%m%d_%H%M%S')}",
                action="VIEW_APPROVALS",
                type="APPROVAL_REMINDER",
                force_email=True,
                html=True,
            )

            # Update last reminder timestamp on employee doc
            employee_collection.update_many(
                {"$or": [{"userId": aid}, {"employeeId": aid}]},
                {"$set": {"lastApprovalReminderSentAt": now_utc}},
            )
            reminders_sent += 1
            results_detail.append({
                "approverId": aid,
                "approverName": approver_name,
                "totalCount": total_count,
                "emails": emails,
                "status": "SENT",
            })
        except Exception as exc:
            logger.error(f"Failed to send approval reminder to {aid}: {exc}", exc_info=True)
            results_detail.append({
                "approverId": aid,
                "error": str(exc),
                "status": "FAILED",
            })

    result_summary = {
        "timestamp": now_kolkata.isoformat(),
        "approversWithPendingTasks": len(approver_map),
        "remindersSent": reminders_sent,
        "skippedRecent": skipped_recent,
        "details": results_detail,
    }
    logger.info(f"All-pending approvals reminder cron run finished: {result_summary}")
    return result_summary

