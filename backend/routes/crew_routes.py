from collections import defaultdict
from datetime import datetime, timedelta, timezone
import os

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query
from pymongo import MongoClient, UpdateOne


router = APIRouter(prefix="/api/crew", tags=["Crew Management"])

CREW_MONGO_URI = os.getenv("CREW_MONGO_URI", os.getenv("MONGO_URI", "mongodb://10.3.230.60:27017/"))
CREW_DB_NAME = os.getenv("CREW_MONGO_DB_NAME", "crew_management")
client = MongoClient(CREW_MONGO_URI, serverSelectionTimeoutMS=5000)
db = client[CREW_DB_NAME]

employees = db["employees"]
groups = db["roster_group_history"]
roster_working = db["roster_collection"]
rosters = db["roster_master_collection"]
cycle_config = db["roster_base_config"]
employee_daily = db["employee_daily_collection"]
employee_shift_history = db["employee_shift_history"]
compensatory_off = db["compensatory_off_collection"]

DUTY_SEQUENCE = ["E1", "E2", "M1", "M2", "N1", "N2", "O1", "O2"]
SHIFT_NAMES = {
    "M1": "Morning", "M2": "Morning",
    "E1": "Evening", "E2": "Evening",
    "N1": "Night", "N2": "Night",
    "O1": "OFF", "O2": "OFF", "OFF": "OFF",
}
DEFAULT_INSTRUCTIONS = (
    "1. Shift Timing: Morning Shift (08:30-14:30hrs), Evening Shift "
    "(14:30-20:30hrs), Night Shift (20:30-08:30hrs [Next day]).\n"
    "2. Control-room staff shall report in time for proper shift handover.\n"
    "3. The Shift In-Charge will assign responsibilities among team members."
)


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:
        raise HTTPException(400, "Invalid record ID") from exc


def employee_id(value: dict | None) -> str:
    value = value or {}
    return str(value.get("employeeId") or value.get("userId") or value.get("id") or "").strip()


def employee_snapshot(value: dict | None) -> dict:
    value = value or {}
    return {
        "employeeId": employee_id(value),
        "name": value.get("name"),
        "nameHindi": value.get("nameHindi"),
        "designation": value.get("designation"),
        "designationHindi": value.get("designationHindi"),
    }


def serialize_group(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "groupName": doc.get("groupName"),
        "startDate": doc.get("startDate"),
        "endDate": doc.get("endDate"),
        "isActive": doc.get("isActive", True),
        "shiftInCharge": doc.get("shiftInCharge") or {},
        "members": doc.get("members") or [],
    }


@router.get("/health")
def crew_health():
    client.admin.command("ping")
    return {"status": "ok", "database": CREW_DB_NAME}


@router.get("/employees")
def list_employees():
    output = []
    for doc in employees.find({}).sort([("name", 1)]):
        output.append({
            "id": str(doc["_id"]),
            "employeeId": employee_id(doc),
            "userId": doc.get("userId"),
            "name": doc.get("name"),
            "nameHindi": doc.get("nameHindi"),
            "designation": doc.get("designation"),
            "designationHindi": doc.get("designationHindi"),
            "dutyType": doc.get("dutyType"),
            "department": doc.get("department"),
        })
    return output


@router.get("/groups")
def list_groups():
    return [serialize_group(doc) for doc in groups.find({}).sort([("groupName", 1)])]


@router.post("/groups")
def create_group(payload: dict):
    name = str(payload.get("groupName") or "").strip()
    if not name:
        raise HTTPException(400, "Group name is required")
    if groups.find_one({"groupName": name, "isActive": True}):
        raise HTTPException(409, "An active group with this name already exists")
    document = {
        "groupName": name,
        "startDate": payload.get("startDate"),
        "endDate": payload.get("endDate"),
        "shiftInCharge": employee_snapshot(payload.get("shiftInCharge")),
        "members": [employee_snapshot(item) for item in payload.get("members", []) if employee_id(item)],
        "isActive": payload.get("isActive", True),
        "createdOn": datetime.now(timezone.utc),
    }
    result = groups.insert_one(document)
    return {"message": "Group created", "id": str(result.inserted_id)}


@router.put("/groups/{group_id}")
def update_group(group_id: str, payload: dict):
    document = {
        "groupName": str(payload.get("groupName") or "").strip(),
        "startDate": payload.get("startDate"),
        "endDate": payload.get("endDate"),
        "shiftInCharge": employee_snapshot(payload.get("shiftInCharge")),
        "members": [employee_snapshot(item) for item in payload.get("members", []) if employee_id(item)],
        "isActive": payload.get("isActive", True),
        "updatedOn": datetime.now(timezone.utc),
    }
    if not document["groupName"]:
        raise HTTPException(400, "Group name is required")
    result = groups.update_one({"_id": oid(group_id)}, {"$set": document})
    if not result.matched_count:
        raise HTTPException(404, "Group not found")
    return {"message": "Group updated"}


@router.patch("/groups/{group_id}/status")
def toggle_group(group_id: str):
    object_id = oid(group_id)
    group = groups.find_one({"_id": object_id})
    if not group:
        raise HTTPException(404, "Group not found")
    status = not group.get("isActive", True)
    groups.update_one({"_id": object_id}, {"$set": {"isActive": status, "updatedOn": datetime.now(timezone.utc)}})
    return {"message": "Group status updated", "isActive": status}


@router.get("/cycle")
def get_cycle():
    config = cycle_config.find_one({})
    if not config:
        return {"baseDate": "", "groups": [], "dutySequence": DUTY_SEQUENCE}
    return {"baseDate": config.get("baseDate"), "groups": config.get("groups", []), "dutySequence": DUTY_SEQUENCE}


@router.put("/cycle")
def save_cycle(payload: dict):
    if not payload.get("baseDate") or not payload.get("groups"):
        raise HTTPException(400, "Base date and group starting duties are required")
    for item in payload["groups"]:
        if item.get("startDuty") not in DUTY_SEQUENCE:
            raise HTTPException(400, f"Invalid starting duty for {item.get('groupName')}")
    cycle_config.replace_one({}, {
        "baseDate": payload["baseDate"],
        "groups": payload["groups"],
        "updatedOn": datetime.now(timezone.utc),
    }, upsert=True)
    return {"message": "Roster cycle saved"}


@router.post("/rosters/generate")
def generate_roster(payload: dict):
    try:
        start = datetime.strptime(payload["startDate"], "%Y-%m-%d")
        end = datetime.strptime(payload["endDate"], "%Y-%m-%d")
    except (KeyError, ValueError) as exc:
        raise HTTPException(400, "A valid start and end date are required") from exc
    if end < start:
        raise HTTPException(400, "End date cannot be before start date")

    config = cycle_config.find_one({})
    if not config:
        raise HTTPException(400, "Configure the roster cycle before generating a roster")
    base = datetime.strptime(config["baseDate"], "%Y-%m-%d")
    starts = {item["groupName"]: item.get("startDuty") for item in config.get("groups", [])}
    active_groups = list(groups.find({"isActive": True}).sort([("groupName", 1)]))
    if not active_groups:
        raise HTTPException(400, "No active roster groups are configured")

    result = []
    roster_working.delete_many({})
    for group in active_groups:
        name = group.get("groupName")
        start_duty = starts.get(name)
        if start_duty not in DUTY_SEQUENCE:
            raise HTTPException(400, f"No cycle configuration exists for {name}")
        start_index = DUTY_SEQUENCE.index(start_duty)
        duties = {}
        current = start
        while current <= end:
            duties[current.strftime("%Y-%m-%d")] = DUTY_SEQUENCE[(start_index + (current - base).days) % len(DUTY_SEQUENCE)]
            current += timedelta(days=1)
        item = {
            "groupName": name,
            "members": group.get("members", []),
            "shiftInCharge": group.get("shiftInCharge", {}),
            "data": duties,
        }
        roster_working.insert_one({**item, "startDate": payload["startDate"], "endDate": payload["endDate"]})
        result.append(item)
    return result


@router.post("/rosters")
def save_roster(payload: dict):
    if not payload.get("startDate") or not payload.get("endDate"):
        raise HTTPException(400, "Date range is required")
    is_final = bool(payload.get("isFinal", False))
    active_groups = list(groups.find({"isActive": True}).sort([("groupName", 1)]))
    group_snapshot = [{
        "groupName": group.get("groupName"),
        "shiftInCharge": employee_snapshot(group.get("shiftInCharge")),
        "members": [employee_snapshot(item) for item in group.get("members", []) if employee_id(item)],
    } for group in active_groups]
    document = {
        "startDate": payload["startDate"],
        "endDate": payload["endDate"],
        "data": payload.get("data", []),
        "groupDetails": group_snapshot,
        "instructions": payload.get("instructions") or DEFAULT_INSTRUCTIONS,
        "distribution": payload.get("distribution") or "",
        "signedBy": employee_snapshot(payload.get("signedBy")),
        "leaveAuthority": employee_snapshot(payload.get("leaveAuthority")),
        "isFinal": is_final,
        "signedOn": datetime.now(timezone.utc) if is_final else None,
        "updatedOn": datetime.now(timezone.utc),
    }
    roster_id = payload.get("rosterId")
    if roster_id:
        existing = rosters.find_one({"_id": oid(roster_id)})
        if not existing:
            raise HTTPException(404, "Roster not found")
        if existing.get("isFinal"):
            raise HTTPException(400, "A final roster cannot be modified")
        document["calendarPushed"] = existing.get("calendarPushed", False)
        rosters.update_one({"_id": existing["_id"]}, {"$set": document})
        result_id = existing["_id"]
    else:
        document.update({"createdOn": datetime.now(timezone.utc), "calendarPushed": False})
        result_id = rosters.insert_one(document).inserted_id
    return {"message": "Roster saved as final" if is_final else "Draft roster saved", "rosterId": str(result_id)}


@router.get("/rosters")
def roster_history():
    return [{
        "id": str(doc["_id"]),
        "startDate": doc.get("startDate"),
        "endDate": doc.get("endDate"),
        "isFinal": doc.get("isFinal", False),
        "calendarPushed": doc.get("calendarPushed", False),
        "createdOn": doc.get("createdOn") or doc.get("updatedOn"),
    } for doc in rosters.find({}).sort([("createdOn", -1), ("updatedOn", -1)])]


@router.get("/rosters/{roster_id}")
def load_roster(roster_id: str):
    doc = rosters.find_one({"_id": oid(roster_id)})
    if not doc:
        raise HTTPException(404, "Roster not found")
    return {
        "id": str(doc["_id"]), "startDate": doc.get("startDate"), "endDate": doc.get("endDate"),
        "data": doc.get("data", []), "groupDetails": doc.get("groupDetails", []),
        "instructions": doc.get("instructions") or DEFAULT_INSTRUCTIONS,
        "distribution": doc.get("distribution") or "", "signedBy": doc.get("signedBy") or {},
        "leaveAuthority": doc.get("leaveAuthority") or {}, "isFinal": doc.get("isFinal", False),
        "calendarPushed": doc.get("calendarPushed", False),
    }


@router.delete("/rosters/{roster_id}")
def delete_roster(roster_id: str):
    doc = rosters.find_one({"_id": oid(roster_id)})
    if not doc:
        raise HTTPException(404, "Roster not found")
    if doc.get("isFinal"):
        raise HTTPException(400, "A final roster cannot be deleted")
    rosters.delete_one({"_id": doc["_id"]})
    return {"message": "Draft roster deleted"}


def update_shift_records(roster: dict):
    start_date = roster.get("startDate")
    group_details = {item.get("groupName"): item for item in roster.get("groupDetails", [])}
    assignments = {}
    for group in roster.get("data", []):
        details = group_details.get(group.get("groupName"), {})
        people = list(details.get("members", []))
        if details.get("shiftInCharge"):
            people.append(details["shiftInCharge"])
        for person in people:
            emp_id = employee_id(person)
            if emp_id:
                assignments[emp_id] = group.get("groupName")
    for emp_id, group_name in assignments.items():
        current = employee_shift_history.find_one({"employeeId": emp_id, "isActive": True})
        if current and current.get("groupName") == group_name:
            continue
        if current:
            previous_day = (datetime.strptime(start_date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
            employee_shift_history.update_one({"_id": current["_id"]}, {"$set": {"endDate": previous_day, "isActive": False}})
        person = employees.find_one({"$or": [{"userId": emp_id}, {"employeeId": emp_id}]}) or {}
        employee_shift_history.insert_one({
            "employeeId": emp_id, "name": person.get("name"), "groupName": group_name,
            "startDate": start_date, "endDate": None, "isActive": True,
            "createdOn": datetime.now(timezone.utc),
        })


@router.post("/rosters/{roster_id}/push")
def push_roster(roster_id: str):
    object_id = oid(roster_id)
    roster = rosters.find_one({"_id": object_id})
    if not roster:
        raise HTTPException(404, "Roster not found")
    if not roster.get("isFinal"):
        raise HTTPException(400, "Only a final roster can be pushed to the calendar")
    start_date, end_date = roster.get("startDate"), roster.get("endDate")
    employee_daily.delete_many({"date": {"$gte": start_date, "$lte": end_date}, "dataSource": "Roster"})
    details_by_group = {item.get("groupName"): item for item in roster.get("groupDetails", [])}
    operations = []
    for group in roster.get("data", []):
        details = details_by_group.get(group.get("groupName"), {})
        people = list(details.get("members", []))
        sic = details.get("shiftInCharge") or {}
        if employee_id(sic):
            people.append(sic)
        for date, duty_code in group.get("data", {}).items():
            for person in people:
                emp_id = employee_id(person)
                if not emp_id:
                    continue
                query = {"employeeId": emp_id, "date": date}
                existing = employee_daily.find_one(query) or {}
                set_fields = {
                    "name": person.get("name"), "designation": person.get("designation"),
                    "groupName": group.get("groupName"), "updatedOn": datetime.now(timezone.utc),
                    "isSIC": emp_id == employee_id(sic), "attachedRosterId": roster_id,
                    "rosterVersion": roster_id, "isFinalRoster": True, "rosterType": "FINAL",
                }
                if existing.get("leaveStatus") not in {"Approved", "Pending", "Applied", "Forwarded by SIC"} and not existing.get("trainingName"):
                    shift = SHIFT_NAMES.get(duty_code, duty_code)
                    set_fields.update({"assignedDuty": shift, "actualStatus": shift, "dutyAsPerLogbook": shift})
                operations.append(UpdateOne(query, {
                    "$set": set_fields,
                    "$setOnInsert": {
                        "employeeId": emp_id, "date": date, "year": int(date[:4]), "month": int(date[5:7]),
                        "flag": "Duty", "isEditable": True, "dataSource": "Roster",
                        "departmentIC": roster.get("leaveAuthority") or {}, "createdOn": datetime.now(timezone.utc),
                    },
                }, upsert=True))
                if existing.get("isHoliday") == "Y" and SHIFT_NAMES.get(duty_code, duty_code) != "OFF":
                    compensatory_off.update_one({"employeeId": emp_id, "date": date, "type": "C-OFF"}, {
                        "$setOnInsert": {"employeeId": emp_id, "date": date, "type": "C-OFF", "createdOn": datetime.now(timezone.utc), "rosterId": roster_id}
                    }, upsert=True)
    if operations:
        employee_daily.bulk_write(operations)
    update_shift_records(roster)
    rosters.update_many({"_id": {"$ne": object_id}, "calendarPushed": True}, {"$set": {"calendarPushed": False}})
    rosters.update_one({"_id": object_id}, {"$set": {"calendarPushed": True, "pushedOn": datetime.now(timezone.utc)}})
    return {"message": "Final roster pushed to the duty calendar"}


@router.get("/calendar")
def calendar_view(start_date: str = Query(...), end_date: str = Query(...)):
    try:
        start, end = datetime.strptime(start_date, "%Y-%m-%d"), datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(400, "A valid start and end date are required") from exc
    if end < start:
        raise HTTPException(400, "End date cannot be before start date")
    if (end - start).days > 45:
        raise HTTPException(400, "Calendar range cannot exceed 45 days")

    active = rosters.find_one({"calendarPushed": True}, sort=[("pushedOn", -1), ("createdOn", -1)])
    if not active:
        return []
    members_by_group = {}
    roster_employee_ids = set()
    for group in active.get("groupDetails", []):
        people = [{**item, "IsSIC": False} for item in group.get("members", [])]
        if employee_id(group.get("shiftInCharge")):
            people.append({**group["shiftInCharge"], "IsSIC": True})
        for person in people:
            emp_id = employee_id(person)
            if emp_id:
                roster_employee_ids.add(emp_id)
        members_by_group[group.get("groupName")] = people
    if not roster_employee_ids:
        return [{"groupName": group_name, "employees": []} for group_name in sorted(members_by_group)]

    records = list(employee_daily.find(
        {
            "date": {"$gte": start_date, "$lte": end_date},
            "employeeId": {"$in": list(roster_employee_ids)},
        },
        {
            "_id": 0,
            "employeeId": 1,
            "name": 1,
            "date": 1,
            "assignedDuty": 1,
            "leaveType": 1,
            "leaveStatus": 1,
            "trainingName": 1,
            "replacementDuty": 1,
            "replacementFor": 1,
        },
    ))
    replacement_map = {}
    for record in records:
        replacement_for = record.get("replacementFor") if record.get("replacementDuty") else None
        if replacement_for:
            replacement_map[(employee_id(replacement_for), record.get("date"))] = {"employeeId": employee_id(record), "name": record.get("name")}
    daily = defaultdict(dict)
    for record in records:
        emp_id, date = employee_id(record), record.get("date")
        if emp_id and date:
            daily[(emp_id, date)] = {
                "shift": record.get("assignedDuty") or "-", "leaveType": record.get("leaveType"),
                "leaveStatus": record.get("leaveStatus"), "trainingName": record.get("trainingName"),
                "replacementEmployee": replacement_map.get((emp_id, date)),
            }
    dates = []
    while start <= end:
        dates.append(start.strftime("%Y-%m-%d"))
        start += timedelta(days=1)
    output = []
    for group_name in sorted(members_by_group):
        crew = []
        for person in sorted(members_by_group[group_name], key=lambda item: item.get("IsSIC", False), reverse=True):
            emp_id = employee_id(person)
            crew.append({
                "employeeId": emp_id, "name": person.get("name"), "designation": person.get("designation"),
                "IsSIC": person.get("IsSIC", False),
                "duties": {date: daily.get((emp_id, date), {"shift": "-", "leaveType": None, "leaveStatus": None, "trainingName": None, "replacementEmployee": None}) for date in dates},
            })
        output.append({"groupName": group_name, "employees": crew})
    return output
