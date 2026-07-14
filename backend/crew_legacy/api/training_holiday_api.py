from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime
from crew_legacy.database.database_mongo import holiday_master_collection, training_master_collection

router = APIRouter()


# =====================================================
# HOLIDAY MASTER (Calendar Year)
# =====================================================

@router.post("/holiday")
def create_holiday(data: dict):

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

    return {"message": "Holiday added successfully"}


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
def update_holiday(holiday_id: str, data: dict):

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

    return {"message": "Holiday updated successfully"}


@router.delete("/holiday/{holiday_id}")
def delete_holiday(holiday_id: str):

    holiday_master_collection.delete_one(
        {"_id": ObjectId(holiday_id)}
    )

    return {"message": "Holiday deleted successfully"}


# =====================================================
# TRAINING MASTER (Financial Year)
# =====================================================

@router.post("/training")
def create_training(data: dict):

    if not data.get("financialYear") or not data.get("trainingName"):
        raise HTTPException(status_code=400, detail="Financial Year & Training Name required")

    training_master_collection.insert_one({
        "financialYear": data.get("financialYear"),
        "employeeId": data.get("employeeId"),
        "employeeName": data.get("employeeName"),
        "trainingName": data.get("trainingName"),
        "trainingNameHindi": data.get("trainingNameHindi"),
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
            "startDate": t.get("startDate"),
            "endDate": t.get("endDate"),
            "trainingType": t.get("trainingType"),
            "status": t.get("status")
        }
        for t in data
    ]


@router.put("/training/{training_id}")
def update_training(training_id: str, data: dict):

    training_master_collection.update_one(
        {"_id": ObjectId(training_id)},
        {
            "$set": {
                "trainingName": data.get("trainingName"),
                "trainingNameHindi": data.get("trainingNameHindi"),
                "startDate": data.get("startDate"),
                "endDate": data.get("endDate"),
                "trainingType": data.get("trainingType"),
                "status": data.get("status")
            }
        }
    )

    return {"message": "Training updated successfully"}


@router.delete("/training/{training_id}")
def delete_training(training_id: str):

    training_master_collection.delete_one(
        {"_id": ObjectId(training_id)}
    )

    return {"message": "Training deleted successfully"}
