from datetime import date, datetime
import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Body, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from services.mobile_briefing_service import (
    build_mobile_briefing_data,
    generate_mobile_briefing_html,
)
from crew_legacy.admin_logic.notification_service import (
    workflow_mail_templates,
    replacement_mail_settings,
    send_email,
)
from crew_legacy.admin_logic.auth_utils import get_authenticated_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reports/mobile-briefing", tags=["Mobile Briefing"])


class SendBriefingRequest(BaseModel):
    date_str: Optional[str] = None
    recipients: Optional[str] = None
    cc_recipients: Optional[str] = None
    subject: Optional[str] = None


@router.get("")
async def get_mobile_briefing_json(date_str: Optional[str] = Query(None)):
    """Fetch structured data and rendered HTML for the daily mobile briefing."""
    try:
        data = await build_mobile_briefing_data(date_str=date_str)
        rendered_html = generate_mobile_briefing_html(data)
        
        # Also return configured mail recipients for UI display
        templates = workflow_mail_templates()
        briefing_tmpl = templates.get("daily_mobile_briefing") or {}

        return {
            "success": True,
            "date": data.get("date"),
            "date_formatted": data.get("date_formatted"),
            "day_of_week": data.get("day_of_week"),
            "data": data,
            "html": rendered_html,
            "mail_config": {
                "enabled": briefing_tmpl.get("enabled", True),
                "recipients": briefing_tmpl.get("recipients", ""),
                "ccRecipients": briefing_tmpl.get("ccRecipients", ""),
                "subjectTemplate": briefing_tmpl.get("subjectTemplate", "Daily Power System & Crew Briefing - {report_date}"),
            }
        }
    except Exception as e:
        logger.error(f"Failed to generate mobile briefing: {e}", exc_info=True)
        raise HTTPException(500, detail=f"Failed to generate mobile briefing: {str(e)}")


@router.get("/html", response_class=HTMLResponse)
async def get_mobile_briefing_raw_html(date_str: Optional[str] = Query(None)):
    """Return raw HTML for browser viewing or iframe embed."""
    try:
        data = await build_mobile_briefing_data(date_str=date_str)
        rendered_html = generate_mobile_briefing_html(data)
        return HTMLResponse(content=rendered_html, status_code=200)
    except Exception as e:
        logger.error(f"Failed to render mobile briefing HTML: {e}", exc_info=True)
        return HTMLResponse(content=f"<h3>Error generating briefing: {e}</h3>", status_code=500)


@router.post("/send")
async def send_mobile_briefing_email(
    req: SendBriefingRequest = Body(...),
    user=Depends(get_authenticated_user),
):
    """Send the mobile briefing HTML email to recipients configured in admin/mail-settings (or request overrides)."""
    try:
        templates = workflow_mail_templates()
        briefing_tmpl = templates.get("daily_mobile_briefing") or {}
        mail_settings = replacement_mail_settings()

        # Build data and HTML
        data = await build_mobile_briefing_data(date_str=req.date_str)
        rendered_html = generate_mobile_briefing_html(data)
        target_date_formatted = data.get("date_formatted") or data.get("date")

        # Resolve Recipients
        to_raw = req.recipients if (req.recipients is not None and req.recipients.strip()) else briefing_tmpl.get("recipients", "")
        cc_raw = req.cc_recipients if (req.cc_recipients is not None and req.cc_recipients.strip()) else briefing_tmpl.get("ccRecipients", "")

        to_list = [addr.strip() for addr in to_raw.replace(";", ",").split(",") if addr.strip()]
        cc_list = [addr.strip() for addr in cc_raw.replace(";", ",").split(",") if addr.strip()]

        if not to_list:
            raise HTTPException(
                400,
                detail="No recipient mail addresses configured. Please specify recipients or configure them in Admin > Mail Settings.",
            )

        # Resolve Subject
        subject_template = req.subject or briefing_tmpl.get("subjectTemplate") or "Daily Power System & Crew Briefing - {report_date}"
        subject = subject_template.replace("{report_date}", target_date_formatted).replace("{date}", target_date_formatted)

        # Dispatch via Microsoft Graph
        send_result = send_email(
            to_list=to_list,
            cc_list=cc_list,
            subject=subject,
            body=rendered_html,
            html=True,
            sender=mail_settings.get("sender"),
            enabled=True,
        )

        status = send_result.get("status")
        if status == "sent":
            return {
                "success": True,
                "status": "sent",
                "recipientCount": send_result.get("recipientCount", len(to_list)),
                "recipients": to_list,
                "ccRecipients": cc_list,
                "subject": subject,
                "message": f"Daily Mobile Briefing successfully dispatched to {len(to_list)} recipient(s).",
            }
        elif status == "disabled":
            raise HTTPException(400, detail="Email delivery is currently disabled in system settings.")
        else:
            err = send_result.get("error") or "Unknown delivery failure"
            raise HTTPException(502, detail=f"Email dispatch failed: {err}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending mobile briefing email: {e}", exc_info=True)
        raise HTTPException(500, detail=f"Error sending mobile briefing email: {str(e)}")


@router.post("/trigger-auto-job")
async def trigger_auto_briefing_job(user=Depends(get_authenticated_user)):
    """Manually test or trigger the 08:00 hrs automated mobile briefing dispatch job."""
    from scheduler.jobs import run_auto_daily_mobile_briefing_job
    try:
        res = run_auto_daily_mobile_briefing_job()
        return res
    except Exception as exc:
        logger.error(f"Manual trigger of auto mobile briefing job failed: {exc}", exc_info=True)
        raise HTTPException(500, detail=f"Job execution failed: {str(exc)}")

