from fastapi import APIRouter, Depends
from bson import ObjectId
from crew_legacy.admin_logic.auth_utils import get_current_user
from crew_legacy.database.database_mongo import duty_notification_collection

router = APIRouter()


@router.get("/")
def get_notifications(user=Depends(get_current_user)):

    emp_id = user["employeeId"]

    data = list(
        duty_notification_collection.find({"employeeId": emp_id})
        .sort("createdAt", -1)
        .limit(50)
    )

    for d in data:
        d["_id"] = str(d["_id"])

    return data


@router.put("/read/{id}")
def mark_read(id: str, user=Depends(get_current_user)):

    duty_notification_collection.update_one(
        {"_id": ObjectId(id), "employeeId": user["employeeId"]},
        {"$set": {"status": "Read"}}
    )

    return {"message": "Read"}

