"""Central, privacy-safe audit feed for portal data changes."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from crew_legacy.database.database_mongo import audit_trail_collection


SENSITIVE_KEYS = {
    "password", "currentpassword", "newpassword", "confirmpassword", "token",
    "authorization", "clientsecret", "secret", "otp", "file", "filedata",
}


def _safe(value: Any, depth: int = 0) -> Any:
    if depth > 4:
        return "[truncated]"
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            key_text = str(key)
            if key_text.replace("_", "").lower() in SENSITIVE_KEYS:
                result[key_text] = "[redacted]"
            else:
                result[key_text] = _safe(item, depth + 1)
        return result
    if isinstance(value, list):
        return [_safe(item, depth + 1) for item in value[:100]] + (["[truncated]"] if len(value) > 100 else [])
    if isinstance(value, str) and len(value) > 2000:
        return value[:2000] + "… [truncated]"
    return value


def section_for_path(path: str) -> str:
    text = str(path or "").lower()
    if "/leave" in text:
        return "Leave"
    if "/training" in text:
        return "Training & Holiday"
    if "/replacement" in text:
        return "Replacement & Duty Switching"
    if "/roster" in text or "/morning-presentation" in text:
        return "Roster"
    if "/admin/organization" in text or "/admin/employees" in text or "/admin/dropdown" in text:
        return "Crew Master Data"
    if "/threads" in text:
        return "Crew Notices"
    if "/psp" in text:
        return "PSP"
    if "/rtg" in text or "/pipeline" in text or "/sync" in text:
        return "RTG / CR Health Card"
    if "/dso" in text or "/report-preparation" in text:
        return "Report Preparation"
    return "Portal Administration"


def record_audit_event(*, actor: dict | None, method: str, path: str, status_code: int,
                       payload: Any = None, query: dict | None = None, ip: str | None = None):
    """Persist a compact event for every successful portal data mutation."""
    actor = actor or {}
    employee_id = str(actor.get("employeeId") or actor.get("userId") or "System").strip() or "System"
    document = {
        "createdOn": datetime.utcnow(),
        "section": section_for_path(path),
        "action": f"{method.upper()} {path}",
        "method": method.upper(),
        "path": path,
        "statusCode": int(status_code),
        "actorId": employee_id,
        "actorName": actor.get("name") or employee_id,
        "actorRole": actor.get("role") or "user",
        "changes": _safe(payload) if payload not in (None, "", {}, []) else {},
        "query": _safe(query or {}),
        "ip": ip,
    }
    audit_trail_collection.insert_one(document)
    return document
