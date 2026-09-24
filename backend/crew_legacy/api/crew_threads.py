import hashlib
import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from crew_legacy.admin_logic.auth_utils import (
    get_authenticated_user,
    require_page_approve,
    require_page_view,
    require_page_write,
)
from crew_legacy.database.database_mongo import (
    crew_thread_collection,
    crew_thread_message_collection,
    crew_thread_file_store,
    employee_collection,
    organization_unit_collection,
    roster_group_collection,
)
from crew_legacy.security_utils import ensure_upload_allowed


router = APIRouter()
UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads" / "crew_threads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
crew_thread_collection.create_index([("updatedAt", -1)])
crew_thread_message_collection.create_index([("threadId", 1), ("createdAt", -1)])
crew_thread_message_collection.create_index([("threadId", 1), ("meetingAt", 1), ("createdAt", 1)])
MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_FILES_PER_MESSAGE = 10
ALLOWED_EXTENSIONS = {
    "txt", "csv", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "png", "jpg", "jpeg", "gif", "webp", "bmp",
}
ALLOWED_CONTENT_TYPES = {
    "text/plain", "text/csv", "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip", "application/x-zip-compressed",
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp",
    "application/octet-stream",
}


class ThreadCreate(BaseModel):
    title: str
    description: str = ""
    meetingAt: Optional[datetime] = None
    audience: Dict[str, Any] = Field(default_factory=dict)


class ThreadMeetingUpdate(BaseModel):
    meetingAt: Optional[datetime] = None


class MessageUpdate(BaseModel):
    heading: Optional[str] = None
    text: Optional[str] = None
    meetingAt: Optional[datetime] = None


def now_utc():
    return datetime.utcnow()


def actor(user: dict):
    return {
        "employeeId": str(user.get("employeeId") or user.get("userId") or "").strip(),
        "name": str(user.get("name") or "").strip(),
        "designation": str(user.get("designation") or "").strip(),
    }


def employee_identity(user: dict):
    employee_id = str(user.get("employeeId") or user.get("userId") or "").strip()
    employee = employee_collection.find_one(
        {"$or": [{"userId": employee_id}, {"employeeId": employee_id}]},
        {
            "userId": 1, "employeeId": 1, "functionIds": 1, "verticalIds": 1,
            "sectionIds": 1, "departmentIds": 1,
        },
    ) or {}
    identifiers = {
        str(value).strip()
        for value in (employee_id, employee.get("userId"), employee.get("employeeId"))
        if str(value or "").strip()
    }
    unit_ids = set()
    for key in ("functionIds", "verticalIds", "sectionIds", "departmentIds"):
        values = employee.get(key) or []
        if not isinstance(values, list):
            values = [values]
        unit_ids.update(str(value).strip() for value in values if str(value).strip())
    groups = roster_group_collection.find({
        "isActive": {"$ne": False},
        "$or": [
            {"members.employeeId": {"$in": list(identifiers)}}, {"members.userId": {"$in": list(identifiers)}},
            {"shiftInCharge.employeeId": {"$in": list(identifiers)}}, {"shiftInCharge.userId": {"$in": list(identifiers)}},
        ],
    }, {"groupName": 1})
    return {
        "employeeId": employee_id,
        "identifiers": sorted(identifiers),
        "unitIds": sorted(unit_ids),
        "groupNames": sorted({str(item.get("groupName") or "").strip() for item in groups if item.get("groupName")}),
    }


def can_approve_documents(user: dict) -> bool:
    try:
        require_page_approve(user, "crew_threads")
        return True
    except HTTPException:
        return False


def thread_access_query(user: dict):
    # Approvers need an inbox spanning every notice, including restricted
    # audiences, so that an upload can never be left without a reviewer.
    if can_approve_documents(user):
        return {}
    identity = employee_identity(user)
    conditions = [
        {"audience.scope": {"$in": [None, "", "everyone"]}},
        {"audience": {"$exists": False}},
        {"createdBy.employeeId": {"$in": identity["identifiers"]}},
        {"audience.employeeIds": {"$in": identity["identifiers"]}},
    ]
    if identity["unitIds"]:
        conditions.append({"audience.unitIds": {"$in": identity["unitIds"]}})
    if identity["groupNames"]:
        conditions.append({"audience.groupNames": {"$in": identity["groupNames"]}})
    return {"$or": conditions}


def can_access_thread(user: dict, thread: dict):
    if can_approve_documents(user):
        return True
    audience = thread.get("audience") or {"scope": "everyone"}
    if audience.get("scope") != "restricted":
        return True
    identity = employee_identity(user)
    if str((thread.get("createdBy") or {}).get("employeeId") or "") in identity["identifiers"]:
        return True
    return bool(
        bool(set(identity["identifiers"]) & set(audience.get("employeeIds") or []))
        or set(identity["unitIds"]) & set(audience.get("unitIds") or [])
        or set(identity["groupNames"]) & set(audience.get("groupNames") or [])
    )


def resolve_audience(raw: dict):
    if str(raw.get("scope") or "everyone").lower() != "restricted":
        return {"scope": "everyone", "employees": [], "units": [], "groups": [], "employeeIds": [], "unitIds": [], "groupNames": []}
    employee_ids = list(dict.fromkeys(str(value).strip() for value in raw.get("employeeIds") or [] if str(value).strip()))
    unit_ids = list(dict.fromkeys(str(value).strip() for value in raw.get("unitIds") or [] if str(value).strip()))
    group_names = list(dict.fromkeys(str(value).strip() for value in raw.get("groupNames") or [] if str(value).strip()))
    employees = list(employee_collection.find(
        {"$or": [{"userId": {"$in": employee_ids}}, {"employeeId": {"$in": employee_ids}}]},
        {"userId": 1, "employeeId": 1, "name": 1, "designation": 1},
    )) if employee_ids else []
    valid_units = [ObjectId(value) for value in unit_ids if ObjectId.is_valid(value)]
    units = list(organization_unit_collection.find(
        {"_id": {"$in": valid_units}, "isActive": {"$ne": False}},
        {"name": 1, "unitType": 1},
    )) if valid_units else []
    valid_groups = list(roster_group_collection.find(
        {"groupName": {"$in": group_names}, "isActive": {"$ne": False}},
        {"groupName": 1},
    )) if group_names else []
    result = {
        "scope": "restricted",
        "employees": [{
            "id": str(item.get("userId") or item.get("employeeId") or ""),
            "name": item.get("name") or item.get("userId") or item.get("employeeId"),
            "designation": item.get("designation") or "",
        } for item in employees],
        "units": [{"id": str(item["_id"]), "name": item.get("name"), "type": item.get("unitType")} for item in units],
        "groups": [{"name": item.get("groupName")} for item in valid_groups],
    }
    result["employeeIds"] = [item["id"] for item in result["employees"]]
    result["unitIds"] = [item["id"] for item in result["units"]]
    result["groupNames"] = [item["name"] for item in result["groups"]]
    if not (result["employeeIds"] or result["unitIds"] or result["groupNames"]):
        raise HTTPException(400, "Select at least one employee, organization unit or shift group")
    return result


def sharepoint_link(value: dict):
    if not isinstance(value, dict):
        raise HTTPException(400, "Invalid SharePoint attachment data")
    url = str(value.get("url") or "").strip()
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not (host == "sharepoint.com" or host.endswith(".sharepoint.com")):
        raise HTTPException(400, "Only secure SharePoint links are supported")
    name = str(value.get("name") or Path(parsed.path).name or "SharePoint attachment").strip()[:180]
    extension = (Path(parsed.path).suffix or Path(name).suffix).lower().lstrip(".")
    return {"id": uuid.uuid4().hex, "name": name, "url": url, "extension": extension}


def object_id(value: str, label: str = "record"):
    try:
        return ObjectId(value)
    except Exception as exc:
        raise HTTPException(400, f"Invalid {label} identifier") from exc


def iso(value):
    return value.isoformat() + "Z" if isinstance(value, datetime) else value


def clean_filename(value: str):
    original = Path(str(value or "attachment")).name
    stem = re.sub(r"[^A-Za-z0-9._ -]+", "_", original).strip(" .") or "attachment"
    return stem[:180]


def user_read_at(item: dict, user: Optional[dict] = None):
    if not user:
        return None
    employee_id = str(user.get("employeeId") or user.get("userId") or "").strip()
    if not employee_id:
        return None
    for marker in item.get("readBy") or []:
        if str(marker.get("employeeId") or "").strip() == employee_id:
            return marker.get("readAt")
    return None


def thread_response(item: dict, user: Optional[dict] = None):
    response = {
        "id": str(item["_id"]),
        "title": item.get("title"),
        "description": item.get("description"),
        "meetingAt": iso(item.get("meetingAt")),
        "createdBy": item.get("createdBy") or {},
        "createdAt": iso(item.get("createdAt")),
        "updatedAt": iso(item.get("updatedAt")),
        "lastMessage": item.get("lastMessage") or {},
        "messageCount": int(item.get("messageCount") or 0),
        "isClosed": bool(item.get("isClosed")),
        "audience": item.get("audience") or {"scope": "everyone"},
    }
    if user:
        employee_id = str(user.get("employeeId") or user.get("userId") or "").strip()
        read_at = user_read_at(item, user)
        unread_query = {
            "threadId": item["_id"],
            "deleted": {"$ne": True},
            "createdBy.employeeId": {"$ne": employee_id},
        }
        if read_at:
            unread_query["createdAt"] = {"$gt": read_at}
        response["unreadCount"] = crew_thread_message_collection.count_documents(unread_query)
    return response


def message_response(item: dict):
    attachments = []
    for attachment in item.get("attachments") or []:
        attachments.append({
            "id": attachment.get("id"),
            "name": attachment.get("name"),
            "size": attachment.get("size"),
            "contentType": attachment.get("contentType"),
            "extension": attachment.get("extension"),
            "isImage": bool(attachment.get("isImage")),
            "downloadUrl": f"/api/crew/threads/attachments/{item['_id']}/{attachment.get('id')}",
        })
    return {
        "id": str(item["_id"]),
        "threadId": str(item.get("threadId")),
        "heading": item.get("heading") or "",
        "text": item.get("text") or "",
        "meetingAt": iso(item.get("meetingAt")),
        "attachments": attachments,
        "sharePointLinks": item.get("sharePointLinks") or [],
        "createdBy": item.get("createdBy") or {},
        "createdAt": iso(item.get("createdAt")),
        "editedAt": iso(item.get("editedAt")),
        "approvalStatus": item.get("approvalStatus") or "approved",
        "approvedBy": item.get("approvedBy") or {},
        "approvedAt": iso(item.get("approvedAt")),
    }


@router.get("")
def list_threads(
    search: str = "",
    limit: int = Query(100, ge=1, le=250),
    user=Depends(get_authenticated_user),
):
    require_page_view(user, "crew_threads")
    query = {"deleted": {"$ne": True}, **thread_access_query(user)}
    if search.strip():
        safe_search = re.escape(search.strip())
        access_conditions = query.pop("$or")
        query["$and"] = [
            {"$or": access_conditions},
            {"$or": [
                {"title": {"$regex": safe_search, "$options": "i"}},
                {"description": {"$regex": safe_search, "$options": "i"}},
            ]},
        ]
    # A notice represents a meeting/occurrence. Keep the board aligned to that
    # date instead of moving old meetings to the top when somebody adds a post.
    rows = list(crew_thread_collection.find(query).limit(limit))
    rows.sort(key=lambda item: item.get("meetingAt") or item.get("createdAt") or datetime.min, reverse=True)
    return [thread_response(item, user) for item in rows]


@router.get("/options")
def thread_options(user=Depends(get_authenticated_user)):
    require_page_view(user, "crew_threads")
    employees = employee_collection.find(
        {"isActive": {"$ne": False}},
        {"userId": 1, "employeeId": 1, "name": 1, "designation": 1},
    ).sort([("name", 1)])
    units = organization_unit_collection.find(
        {"isActive": {"$ne": False}},
        {"name": 1, "unitType": 1},
    ).sort([("unitType", 1), ("name", 1)])
    groups = roster_group_collection.find(
        {"isActive": {"$ne": False}}, {"groupName": 1},
    ).sort([("groupName", 1)])
    return {
        "employees": [{
            "id": str(item.get("userId") or item.get("employeeId") or ""),
            "name": item.get("name") or item.get("userId") or item.get("employeeId"),
            "designation": item.get("designation") or "",
        } for item in employees if item.get("userId") or item.get("employeeId")],
        "units": [{"id": str(item["_id"]), "name": item.get("name"), "type": item.get("unitType")} for item in units],
        "groups": [{"name": item.get("groupName")} for item in groups if item.get("groupName")],
    }


@router.post("")
def create_thread(data: ThreadCreate, user=Depends(get_authenticated_user)):
    require_page_write(user, "crew_threads")
    title = " ".join(data.title.split()).strip()
    if len(title) < 3:
        raise HTTPException(400, "Thread title must contain at least 3 characters")
    if len(title) > 160:
        raise HTTPException(400, "Thread title is too long")
    now = now_utc()
    document = {
        "title": title,
        "description": data.description.strip()[:1000],
        "meetingAt": data.meetingAt,
        "createdBy": actor(user),
        "createdAt": now,
        "updatedAt": now,
        "messageCount": 0,
        "lastMessage": {},
        "isClosed": False,
        "deleted": False,
        "audience": resolve_audience(data.audience),
    }
    result = crew_thread_collection.insert_one(document)
    document["_id"] = result.inserted_id
    return thread_response(document)


@router.patch("/{thread_id}")
def update_thread(
    thread_id: str,
    data: ThreadMeetingUpdate,
    user=Depends(get_authenticated_user),
):
    require_page_write(user, "crew_threads")
    thread_oid = object_id(thread_id, "thread")
    thread = crew_thread_collection.find_one({"_id": thread_oid, "deleted": {"$ne": True}})
    if not thread:
        raise HTTPException(404, "Thread not found")
    update_fields = {
        "updatedAt": now_utc(),
    }
    if data.meetingAt is not None:
        update_fields["meetingAt"] = data.meetingAt
    crew_thread_collection.update_one(
        {"_id": thread_oid},
        {"$set": update_fields},
    )
    updated = crew_thread_collection.find_one({"_id": thread_oid})
    return thread_response(updated)


@router.get("/{thread_id}/messages")
def list_messages(
    thread_id: str,
    limit: int = Query(200, ge=1, le=500),
    user=Depends(get_authenticated_user),
):
    require_page_view(user, "crew_threads")
    thread_oid = object_id(thread_id, "thread")
    thread = crew_thread_collection.find_one({"_id": thread_oid, "deleted": {"$ne": True}})
    if not thread or not can_access_thread(user, thread):
        raise HTTPException(404, "Thread not found")
    rows = list(
        crew_thread_message_collection.find({"threadId": thread_oid, "deleted": {"$ne": True}})
        .sort([("meetingAt", 1), ("createdAt", 1)]).limit(limit)
    )
    read_at = user_read_at(thread, user)
    employee_id = str(user.get("employeeId") or user.get("userId") or "").strip()
    response = []
    for item in rows:
        value = message_response(item)
        value["isUnread"] = bool(
            str((item.get("createdBy") or {}).get("employeeId") or "") != employee_id
            and (not read_at or item.get("createdAt") > read_at)
        )
        response.append(value)

    # Opening a thread acknowledges every post currently visible to that user.
    now = now_utc()
    if employee_id:
        crew_thread_collection.update_one(
            {"_id": thread_oid},
            {"$pull": {"readBy": {"employeeId": employee_id}}},
        )
        crew_thread_collection.update_one(
            {"_id": thread_oid},
            {"$push": {"readBy": {"employeeId": employee_id, "readAt": now}}},
        )
    return response


@router.post("/{thread_id}/messages")
def post_message(
    thread_id: str,
    heading: str = Form(""),
    text: str = Form(""),
    meeting_at: Optional[datetime] = Form(None),
    sharepoint_links: str = Form("[]"),
    files: Optional[List[UploadFile]] = File(None),
    user=Depends(get_authenticated_user),
):
    require_page_write(user, "crew_threads")
    thread_oid = object_id(thread_id, "thread")
    thread = crew_thread_collection.find_one({"_id": thread_oid, "deleted": {"$ne": True}})
    if not thread or not can_access_thread(user, thread):
        raise HTTPException(404, "Thread not found")
    if thread.get("isClosed"):
        raise HTTPException(409, "This thread is closed")
    post_heading = " ".join(heading.split()).strip()
    body = text.strip()
    upload_files = [item for item in (files or []) if item and item.filename]
    try:
        raw_sharepoint_links = json.loads(sharepoint_links or "[]")
        if not isinstance(raw_sharepoint_links, list):
            raise ValueError
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(400, "Invalid SharePoint attachment data") from exc
    if len(raw_sharepoint_links) > MAX_FILES_PER_MESSAGE:
        raise HTTPException(400, f"A message can contain up to {MAX_FILES_PER_MESSAGE} SharePoint links")
    resolved_sharepoint_links = [sharepoint_link(item) for item in raw_sharepoint_links]
    if not post_heading:
        raise HTTPException(400, "Enter a heading for the timeline post")
    if not body and not upload_files and not resolved_sharepoint_links:
        raise HTTPException(400, "Write a description or attach at least one file")
    if len(post_heading) > 180:
        raise HTTPException(400, "Post heading is too long")
    if len(body) > 10000:
        raise HTTPException(400, "Message is too long")
    if len(upload_files) > MAX_FILES_PER_MESSAGE:
        raise HTTPException(400, f"A message can contain up to {MAX_FILES_PER_MESSAGE} files")

    message_id = ObjectId()
    message_folder = UPLOAD_ROOT / str(thread_oid) / str(message_id)
    attachments = []
    try:
        for upload in upload_files:
            content = ensure_upload_allowed(
                upload,
                allowed_content_types=ALLOWED_CONTENT_TYPES,
                allowed_extensions=ALLOWED_EXTENSIONS,
                max_bytes=MAX_FILE_BYTES,
            )
            safe_name = clean_filename(upload.filename)
            extension = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""
            attachment_id = uuid.uuid4().hex
            stored_name = f"{attachment_id}_{safe_name}"
            message_folder.mkdir(parents=True, exist_ok=True)
            target = message_folder / stored_name
            target.write_bytes(content)
            attachments.append({
                "id": attachment_id,
                "name": safe_name,
                "storedName": stored_name,
                "relativePath": str(target.relative_to(UPLOAD_ROOT)),
                "size": len(content),
                "contentType": upload.content_type,
                "extension": extension,
                "isImage": extension in {"png", "jpg", "jpeg", "gif", "webp", "bmp"},
                "sha256": hashlib.sha256(content).hexdigest(),
                "gridFsId": None,
            })
    except Exception:
        if message_folder.exists():
            for candidate in message_folder.iterdir():
                candidate.unlink(missing_ok=True)
            message_folder.rmdir()
        raise

    now = now_utc()
    document = {
        "_id": message_id,
        "threadId": thread_oid,
        "heading": post_heading,
        "text": body,
        "meetingAt": meeting_at or now,
        "attachments": attachments,
        "sharePointLinks": resolved_sharepoint_links,
        "createdBy": actor(user),
        "createdAt": now,
        "deleted": False,
        "approvalStatus": "pending" if attachments or resolved_sharepoint_links else "approved",
    }
    crew_thread_message_collection.insert_one(document)
    preview = body[:180] if body else f"Shared {len(attachments) + len(resolved_sharepoint_links)} attachment(s)"
    crew_thread_collection.update_one(
        {"_id": thread_oid},
        {
            "$set": {
                "updatedAt": now,
                "lastMessage": {"text": preview, "createdBy": actor(user), "createdAt": now},
            },
            "$inc": {"messageCount": 1},
        },
    )
    return message_response(document)


@router.post("/messages/{message_id}/approve")
def approve_message(message_id: str, user=Depends(get_authenticated_user)):
    require_page_approve(user, "crew_threads")
    message_oid = object_id(message_id, "message")
    message = crew_thread_message_collection.find_one({"_id": message_oid, "deleted": {"$ne": True}})
    if not message:
        raise HTTPException(404, "Post not found")
    thread = crew_thread_collection.find_one({"_id": message.get("threadId"), "deleted": {"$ne": True}})
    if not thread or not can_access_thread(user, thread):
        raise HTTPException(404, "Post not found")
    now = now_utc()
    crew_thread_message_collection.update_one(
        {"_id": message_oid},
        {"$set": {"approvalStatus": "approved", "approvedBy": actor(user), "approvedAt": now}},
    )
    updated = crew_thread_message_collection.find_one({"_id": message_oid})
    return message_response(updated)


@router.patch("/messages/{message_id}")
def update_message(
    message_id: str,
    data: MessageUpdate,
    user=Depends(get_authenticated_user),
):
    require_page_write(user, "crew_threads")
    message_oid = object_id(message_id, "message")
    message = crew_thread_message_collection.find_one({"_id": message_oid, "deleted": {"$ne": True}})
    if not message:
        raise HTTPException(404, "Post not found")
    thread = crew_thread_collection.find_one({"_id": message.get("threadId"), "deleted": {"$ne": True}})
    if not thread or not can_access_thread(user, thread):
        raise HTTPException(404, "Post not found")
    updates = {"editedAt": now_utc()}
    if data.heading is not None:
        heading = " ".join(data.heading.split()).strip()
        if len(heading) > 180:
            raise HTTPException(400, "Post heading is too long")
        updates["heading"] = heading
    if data.text is not None:
        text = data.text.strip()
        if len(text) > 10000:
            raise HTTPException(400, "Post text is too long")
        updates["text"] = text
    if data.meetingAt is not None:
        updates["meetingAt"] = data.meetingAt
    crew_thread_message_collection.update_one({"_id": message_oid}, {"$set": updates})
    crew_thread_collection.update_one({"_id": message.get("threadId")}, {"$set": {"updatedAt": now_utc()}})
    updated = crew_thread_message_collection.find_one({"_id": message_oid})
    return message_response(updated)


@router.get("/attachments/{message_id}/{attachment_id}")
def download_attachment(
    message_id: str,
    attachment_id: str,
    user=Depends(get_authenticated_user),
):
    require_page_view(user, "crew_threads")
    message = crew_thread_message_collection.find_one({
        "_id": object_id(message_id, "message"),
        "deleted": {"$ne": True},
        "attachments.id": attachment_id,
    })
    if not message:
        raise HTTPException(404, "Attachment not found")
    thread = crew_thread_collection.find_one({"_id": message.get("threadId"), "deleted": {"$ne": True}})
    if not thread or not can_access_thread(user, thread):
        raise HTTPException(404, "Attachment not found")
    identity = employee_identity(user)
    is_uploader = str((message.get("createdBy") or {}).get("employeeId") or "") in identity["identifiers"]
    if message.get("approvalStatus") == "pending" and not is_uploader:
        try:
            require_page_approve(user, "crew_threads")
        except HTTPException as exc:
            raise HTTPException(403, "This document is awaiting approval") from exc
    attachment = next(
        (item for item in message.get("attachments") or [] if item.get("id") == attachment_id),
        None,
    )
    if not attachment:
        raise HTTPException(404, "Attachment not found")
    gridfs_id = attachment.get("gridFsId")
    if gridfs_id and crew_thread_file_store.exists(gridfs_id):
        stored = crew_thread_file_store.get(gridfs_id)

        def chunks():
            while True:
                chunk = stored.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk

        return StreamingResponse(
            chunks(),
            media_type=attachment.get("contentType") or "application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{clean_filename(attachment.get("name"))}"'},
        )
    candidate = (UPLOAD_ROOT / str(attachment.get("relativePath") or "")).resolve()
    root = UPLOAD_ROOT.resolve()
    if root not in candidate.parents or not candidate.is_file():
        raise HTTPException(404, "Attachment file is unavailable")
    return FileResponse(
        candidate,
        filename=attachment.get("name") or "attachment",
        media_type=attachment.get("contentType") or "application/octet-stream",
    )
