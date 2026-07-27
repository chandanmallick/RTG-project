from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from crew_legacy.admin_logic.auth_utils import get_current_user
from crew_legacy.database.database_mongo import duty_notification_collection


router = APIRouter()


@router.get("/")
def get_notifications(user=Depends(get_current_user)):
    employee_id = str(user.get("employeeId") or user.get("userId") or "")
    data = list(
        duty_notification_collection.find({
            "employeeId": employee_id,
            "type": {"$exists": True},
        })
        .sort("createdAt", -1)
        .limit(50)
    )
    for item in data:
        item["_id"] = str(item["_id"])
        item["unread"] = item.get("status") != "Read"
        item["notificationKind"] = str(item.get("type") or "GENERAL").lower()
    return data


@router.put("/read/{id}")
def mark_read(id: str, user=Depends(get_current_user)):
    if not ObjectId.is_valid(id):
        raise HTTPException(400, "Invalid notification")
    employee_id = str(user.get("employeeId") or user.get("userId") or "")
    notification = duty_notification_collection.find_one({
        "_id": ObjectId(id),
        "$or": [{"employeeId": employee_id}, {"controllerIds": employee_id}],
    })
    if not notification:
        raise HTTPException(404, "Notification not found")

    if notification.get("leaveId") and notification.get("assignedDuty"):
        duty_notification_collection.update_one(
            {"_id": notification["_id"]},
            {
                "$addToSet": {"readBy": employee_id},
                "$set": {"lastReadAt": datetime.utcnow()},
            },
        )
    else:
        duty_notification_collection.update_one(
            {"_id": notification["_id"]},
            {"$set": {"status": "Read", "readAt": datetime.utcnow()}},
        )
    return {"message": "Read"}
