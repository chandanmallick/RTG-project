from fastapi import APIRouter
from crew_legacy.database.database_mongo import employee_daily_collection
from crew_legacy.database.database_mongo import training_nomination_history_collection
from datetime import datetime, timedelta
from bson import ObjectId

router = APIRouter()


################# small calender ##################

@router.get("/calendar/{startDate}/{endDate}")
def get_training_calendar(startDate: str, endDate: str):

    start_dt = datetime.strptime(startDate, "%Y-%m-%d")
    end_dt = datetime.strptime(endDate, "%Y-%m-%d")

    window_start = start_dt - timedelta(days=1)
    window_end = end_dt + timedelta(days=1)

    records = list(employee_daily_collection.find({
        "date": {
            "$gte": window_start.strftime("%Y-%m-%d"),
            "$lte": window_end.strftime("%Y-%m-%d")
        }
    }))

    grouped = {}

    for rec in records:

        group = rec.get("groupName", "Ungrouped")
        emp_id = rec["employeeId"]
        date = rec["date"]

        if group not in grouped:
            grouped[group] = {}

        if emp_id not in grouped[group]:
            grouped[group][emp_id] = {
                "employeeId": emp_id,
                "name": rec.get("name"),
                "duties": {}
            }

        grouped[group][emp_id]["duties"][date] = {
            "shift": rec.get("assignedDuty"),
            "leaveStatus": rec.get("leaveStatus")
        }

    # convert dict â†’ list
    final_output = {}

    for group, employees in grouped.items():
        final_output[group] = list(employees.values())

    return final_output


@router.get("/eligible/{date}/{group}")
def get_eligible_employees(date: str, group: str):

    records = list(employee_daily_collection.find({
        "date": date,
        "groupName": group
    }))

    employees = []

    for r in records:

        employees.append({
            "employeeId": r["employeeId"],
            "name": r["name"],
            "designation": r["designation"],
            "shift": r.get("assignedDuty"),
            "leaveStatus": r.get("leaveStatus"),
            "trainingNomination": r.get("trainingNomination"),
            "trainingFinal": r.get("trainingFinal")
        })

    return employees

@router.get("/pending")
def get_pending():

    records = list(
        training_nomination_history_collection.find({
            "status": "Nominated"
        })
    )

    result = []

    for r in records:

        result.append({
            "id": str(r["_id"]),
            "trainingName": r.get("trainingName"),
            "trainingDate": r.get("trainingDate"),
            "employeeId": r.get("employeeId"),
            "employeeName": r.get("employeeName"),
            "status": r.get("status")
        })

    return result

@router.post("/nominate")
def nominate_training(data: dict):

    date = data["date"]
    training = data["trainingName"]
    employees = data["employees"]

    for emp in employees:

        employee_daily_collection.update_one(
            {
                "employeeId": emp["employeeId"],
                "date": date
            },
            {
                "$set": {
                    "trainingNomination": {
                        "trainingName": training,
                        "status": "nominated"
                    }
                }
            }
        )

        training_nomination_history_collection.insert_one({
            "trainingName": training,
            "trainingDate": date,
            "employeeId": emp["employeeId"],
            "employeeName": emp["name"],
            "status": "Nominated",
            "createdOn": datetime.utcnow()
        })

    return {"message": "Training nomination saved"}

@router.post("/finalize")
def finalize_training(data: dict):

    date = data.get("date")
    training = data.get("trainingName")
    employees = data.get("employees", [])

    for emp in employees:

        employee_daily_collection.update_one(
            {
                "employeeId": emp,
                "date": date
            },
            {
                "$set": {
                    "trainingFinal": {
                        "trainingName": training,
                        "status": "final"
                    },
                    "assignedDuty": "Training"
                },
                "$unset": {
                    "trainingNomination": ""
                }
            }
        )

    return {"message": "Training finalized"}


@router.post("/approve")
def approve_training(data:dict):

    ids = data["ids"]

    for id in ids:

        training_nomination_history_collection.update_one(
            {"_id":ObjectId(id)},
            {
                "$set":{
                    "status":"Approved",
                    "approvedBy":"DIC"
                }
            }
        )

    return {"message":"Approved"}


@router.post("/finalize")
def finalize_training(data:dict):

    ids = data["ids"]

    for id in ids:

        record = training_nomination_history_collection.find_one({
            "_id":ObjectId(id)
        })

        employee_daily_collection.update_one(
            {
                "employeeId":record["employeeId"],
                "date":record["trainingDate"]
            },
            {
                "$set":{
                    "assignedDuty":"Training"
                }
            }
        )

        training_nomination_history_collection.update_one(
            {"_id":ObjectId(id)},
            {
                "$set":{
                    "status":"Finalized",
                    "finalizedBy":"Admin"
                }
            }
        )

    return {"message":"Finalized"}


@router.get("/history")
def get_training_nomination_history():

    data = training_nomination_history_collection.find().sort("createdOn",-1)

    return [
        {
            "id": str(x["_id"]),
            "trainingName": x.get("trainingName"),
            "trainingDate": x.get("trainingDate"),
            "employeeId": x.get("employeeId"),
            "status": x.get("status"),
            "createdOn": x.get("createdOn")
        }
        for x in data
    ]
