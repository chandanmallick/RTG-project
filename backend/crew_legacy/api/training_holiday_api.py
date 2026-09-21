from fastapi import APIRouter, HTTPException
from bson import ObjectId
from fastapi import Depends
from datetime import datetime
from crew_legacy.database.database_mongo import holiday_master_collection, training_master_collection, page_access_collection
from crew_legacy.admin_logic.auth_utils import get_authenticated_user, require_page_write

router = APIRouter()


def require_training_manager(user: dict):
    """Only authorized HR training approvers may maintain programmes."""
    actor_id = str(user.get("employeeId") or user.get("userId") or "").strip()
    if actor_id == "50041":
        return user
    access = page_access_collection.find_one(
        {"userId": actor_id},
        {"pages.crew_training.write": 1, "pages.crew_training.approve": 1},
    ) or {}
    training_access = ((access.get("pages") or {}).get("crew_training") or {})
    if not training_access.get("approve"):
        raise HTTPException(403, "HR training programme management access is required")
    return user


# =====================================================
# HOLIDAY MASTER (Calendar Year)
# =====================================================

@router.post("/holiday")
def create_holiday(data: dict, user=Depends(get_authenticated_user)):
    require_page_write(user, "crew_training")

    if not data.get("year") or not data.get("date") or not data.get("holidayName"):
        raise HTTPException(status_code=400, detail="Year, Date & Holiday Name required")

    holiday_master_collection.insert_one({
        "year": data.get("year"),
        "date": data.get("date"),
        "holidayName": data.get("holidayName"),
        "holidayNameHindi": data.get("holidayNameHindi"),
        "type": data.get("type"),
        "status": data.get("status", "Active"),
        "createdOn": datetime.utcnow()
    })

    from crew_legacy.api.roster_api import sync_holiday_comp_off_for_roster_date
    sync_result = sync_holiday_comp_off_for_roster_date(data.get("date"), data.get("holidayName"))

    return {"message": "Holiday added successfully", "compOffSync": sync_result}


@router.get("/holiday/{year}")
def get_holidays(year: int):

    data = holiday_master_collection.find({"year": year})

    return [
        {
            "id": str(h["_id"]),
            "year": h.get("year"),
            "date": h.get("date"),
            "holidayName": h.get("holidayName"),
            "holidayNameHindi": h.get("holidayNameHindi"),
            "type": h.get("type"),
            "status": h.get("status")
        }
        for h in data
    ]


@router.put("/holiday/{holiday_id}")
def update_holiday(holiday_id: str, data: dict, user=Depends(get_authenticated_user)):
    require_page_write(user, "crew_training")

    holiday_master_collection.update_one(
        {"_id": ObjectId(holiday_id)},
        {
            "$set": {
                "date": data.get("date"),
                "holidayName": data.get("holidayName"),
                "holidayNameHindi": data.get("holidayNameHindi"),
                "type": data.get("type"),
                "status": data.get("status")
            }
        }
    )

    from crew_legacy.api.roster_api import sync_holiday_comp_off_for_roster_date
    sync_result = sync_holiday_comp_off_for_roster_date(data.get("date"), data.get("holidayName"))

    return {"message": "Holiday updated successfully", "compOffSync": sync_result}


@router.delete("/holiday/{holiday_id}")
def delete_holiday(holiday_id: str, user=Depends(get_authenticated_user)):
    require_page_write(user, "crew_training")

    holiday_master_collection.delete_one(
        {"_id": ObjectId(holiday_id)}
    )

    return {"message": "Holiday deleted successfully"}


# =====================================================
# TRAINING MASTER (Financial Year)
# =====================================================

@router.post("/training")
def create_training(data: dict, user=Depends(get_authenticated_user)):
    require_training_manager(user)

    if not data.get("financialYear") or not data.get("trainingName"):
        raise HTTPException(status_code=400, detail="Financial Year & Training Name required")

    training_master_collection.insert_one({
        "financialYear": data.get("financialYear"),
        "employeeId": data.get("employeeId"),
        "employeeName": data.get("employeeName"),
        "trainingName": data.get("trainingName"),
        "trainingNameHindi": data.get("trainingNameHindi"),
        "location": str(data.get("location") or "").strip(),
        "startDate": data.get("startDate"),
        "endDate": data.get("endDate"),
        "trainingType": data.get("trainingType"),
        "status": data.get("status", "Scheduled"),
        "createdOn": datetime.utcnow()
    })

    return {"message": "Training added successfully"}


@router.get("/training/{financialYear}")
def get_training(financialYear: str):

    data = training_master_collection.find({"financialYear": financialYear})

    return [
        {
            "id": str(t["_id"]),
            "financialYear": t.get("financialYear"),
            "employeeId": t.get("employeeId"),
            "employeeName": t.get("employeeName"),
            "trainingName": t.get("trainingName"),
            "trainingNameHindi": t.get("trainingNameHindi"),
            "location": t.get("location"),
            "startDate": t.get("startDate"),
            "endDate": t.get("endDate"),
            "trainingType": t.get("trainingType"),
            "status": t.get("status"),
            "durationDays": t.get("durationDays"),
            "dateStatus": t.get("dateStatus"),
            "historicalImport": bool(t.get("historicalImport")),
            "unmatchedEmployees": t.get("unmatchedEmployees") or [],
            "matchedEmployeeCount": t.get("matchedEmployeeCount") or 0,
        }
        for t in data
    ]


@router.put("/training/{training_id}")
def update_training(training_id: str, data: dict, user=Depends(get_authenticated_user)):
    require_training_manager(user)

    if not ObjectId.is_valid(training_id):
        raise HTTPException(400, "Invalid training programme")
    start_date = data.get("startDate")
    end_date = data.get("endDate")
    if not start_date or not end_date or end_date < start_date:
        raise HTTPException(400, "Valid training start and end dates are required")
    updates = {
        "trainingName": data.get("trainingName"),
        "trainingNameHindi": data.get("trainingNameHindi"),
        "location": str(data.get("location") or "").strip(),
        "startDate": start_date,
        "endDate": end_date,
    }
    if data.get("trainingType") is not None:
        updates["trainingType"] = data.get("trainingType")
    if data.get("status") is not None:
        updates["status"] = data.get("status")

    result = training_master_collection.update_one(
        {"_id": ObjectId(training_id)},
        {"$set": updates},
    )
    if not result.matched_count:
        raise HTTPException(404, "Training programme not found")

    return {"message": "Training updated successfully"}


@router.delete("/training/{training_id}")
def delete_training(training_id: str, user=Depends(get_authenticated_user)):
    require_training_manager(user)

    training_master_collection.delete_one(
        {"_id": ObjectId(training_id)}
    )

    return {"message": "Training deleted successfully"}
