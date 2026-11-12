import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from crew_legacy.admin_logic.auth_utils import get_authenticated_user, require_admin
from crew_legacy.database.database_mongo import system_settings_collection
from crew_legacy.services.google_sheet_sync_service import (
    get_webhook_url,
    sync_month_to_sheet,
    push_to_google_sheet,
)
import requests

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/google-sheet", tags=["Google Sheet Sync"])


class SyncMonthRequest(BaseModel):
    year: int
    month: int


class WebhookConfigRequest(BaseModel):
    webhookUrl: str


@router.get("/status")
def check_google_sheet_status(user=Depends(get_authenticated_user)):
    """Check connectivity to the Google Sheet Webhook."""
    url = get_webhook_url()
    try:
        res = requests.get(url, timeout=10, allow_redirects=True)
        res.raise_for_status()
        data = res.json()
        return {
            "success": True,
            "webhookUrl": url,
            "spreadsheet": data.get("spreadsheet"),
            "sheets": data.get("sheets", []),
        }
    except Exception as exc:
        return {
            "success": False,
            "webhookUrl": url,
            "error": str(exc),
        }


@router.post("/sync-month")
def sync_month_roster(payload: SyncMonthRequest, user=Depends(get_authenticated_user)):
    """Sync all duties and leaves for a specific month to Google Sheets."""
    result = sync_month_to_sheet(payload.year, payload.month)
    if result.get("status") == "error":
        raise HTTPException(500, result.get("message") or "Google Sheet sync failed")
    return {
        "success": True,
        "message": f"Successfully synced {result.get('cellsUpdated', 0)} entries to sheet '{result.get('sheetUpdated')}'.",
        "details": result,
    }


@router.put("/config")
def update_webhook_config(payload: WebhookConfigRequest, user=Depends(require_admin)):
    """Update Google Sheet Web App Webhook URL."""
    url = payload.webhookUrl.strip()
    if not url.startswith("https://script.google.com/"):
        raise HTTPException(400, "Invalid Google Apps Script Web App URL")

    system_settings_collection.update_one(
        {"type": "google_sheet_config"},
        {"$set": {"webhookUrl": url}},
        upsert=True,
    )
    return {"success": True, "message": "Google Sheet Webhook URL updated successfully."}

