from datetime import datetime, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import UpdateOne

from crew_legacy.admin_logic.auth_utils import get_authenticated_user, require_page_write
from crew_legacy.admin_logic.notification_service import notify_all
from crew_legacy.api.admin_api import resolve_employee_organization
from crew_legacy.database.database_mongo import (
    employee_collection,
    employee_daily_collection,
    organization_shift_group_collection,
    organization_unit_collection,
    roster_group_collection,
    training_nomination_history_collection,
)


router = APIRouter()
PENDING_STATUSES = {"Nominated", "Pending Approval"}

# MongoDB creates a collection on first write. Creating these indexes at module
# startup also guarantees that a fresh installation has the nomination
# collection before the first user submits a record.
training_nomination_history_collection.create_index(
    [("employeeId", 1), ("startDate", 1), ("endDate", 1)],
    name="training_employee_period",
)
training_nomination_history_collection.create_index(
    [("status", 1), ("currentApproverId", 1), ("createdOn", -1)],
    name="training_pending_approval",
)
training_nomination_history_collection.create_index(
    [("trainingName", 1), ("startDate", 1)],
    name="training_program_period",
)


def clean_id(value) -> str:
    return str(value or "").strip()


def employee_id(value: dict | None) -> str:
    value = value or {}
    return clean_id(value.get("userId") or value.get("employeeId"))


def date_range(start_date: str, end_date: str):
    try:
        current = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")
    except (TypeError, ValueError) as exc:
        raise HTTPException(400, "Valid training start and end dates are required") from exc
    if end < current:
        raise HTTPException(400, "Training end date cannot be before its start date")
    if (end - current).days > 90:
        raise HTTPException(400, "A training nomination cannot exceed 90 days")
    while current <= end:
        yield current.strftime("%Y-%m-%d")
        current += timedelta(days=1)


def employee_snapshot(employee: dict | None):
    employee = employee or {}
    return {
        "employeeId": employee_id(employee),
        "name": employee.get("name"),
        "designation": employee.get("designation"),
    }


def financial_year_bounds(value: str):
    moment = datetime.strptime(value, "%Y-%m-%d")
    start_year = moment.year if moment.month >= 4 else moment.year - 1
    return f"{start_year}-04-01", f"{start_year + 1}-03-31"


def recipient_emails(employee_ids):
    ids = [clean_id(value) for value in dict.fromkeys(employee_ids or []) if clean_id(value)]
    if not ids:
        return []
    output, seen = [], set()
    for item in employee_collection.find({"$or": [{"userId": {"$in": ids}}, {"employeeId": {"$in": ids}}]}):
        value = clean_id(item.get("gmail") or item.get("email") or item.get("mailId"))
        if value and "@" in value and value.lower() not in seen:
            seen.add(value.lower())
            output.append(value)
    return output


def shift_group_context(emp_id: str):
    emp_id = clean_id(emp_id)
    if not emp_id:
        return {}
    group = roster_group_collection.find_one({
        "isActive": {"$ne": False},
        "$or": [
            {"members.employeeId": emp_id},
            {"members.userId": emp_id},
            {"shiftInCharge.employeeId": emp_id},
            {"shiftInCharge.userId": emp_id},
        ],
    }) or {}
    if not group:
        return {}
    sic_id = employee_id(group.get("shiftInCharge"))
    return {
        "groupName": str(group.get("groupName") or "").strip(),
        "sicEmployeeId": sic_id,
        "isGroupSIC": bool(sic_id and sic_id == emp_id),
        "isShiftEmployee": True,
    }


def shift_group_approval_steps(employee: dict):
    """Resolve SIC and organization heads from the employee's attached shift group."""
    emp_id = employee_id(employee)
    if not emp_id:
        return []
    groups = roster_group_collection.find({
        "isActive": {"$ne": False},
        "$or": [
            {"members.employeeId": emp_id},
            {"members.userId": emp_id},
            {"shiftInCharge.employeeId": emp_id},
            {"shiftInCharge.userId": emp_id},
        ],
    }).sort("_id", -1)
    for group in groups:
        group_name = str(group.get("groupName") or "").strip()
        mapping = organization_shift_group_collection.find_one({"groupName": group_name})
        if not mapping:
            continue
        steps = []
        sic = group.get("shiftInCharge") or {}
        sic_id = employee_id(sic)
        if sic_id and sic_id != emp_id:
            steps.append((sic_id, "Shift In-Charge"))

        raw_unit_id = mapping.get("organizationUnitId")
        if isinstance(raw_unit_id, ObjectId):
            unit = organization_unit_collection.find_one({"_id": raw_unit_id})
        elif ObjectId.is_valid(str(raw_unit_id or "")):
            unit = organization_unit_collection.find_one({"_id": ObjectId(str(raw_unit_id))})
        else:
            unit = None
        visited = set()
        while unit and str(unit["_id"]) not in visited:
            visited.add(str(unit["_id"]))
            unit_type = str(unit.get("unitType") or "Organization Unit").title()
            for head_id in unit.get("headEmployeeIds") or []:
                head_id = clean_id(head_id)
                if head_id and head_id != emp_id:
                    steps.append((head_id, f"{unit_type} Head"))
            parent_id = unit.get("parentId")
            unit = (
                organization_unit_collection.find_one({"_id": parent_id})
                if isinstance(parent_id, ObjectId)
                else organization_unit_collection.find_one({"_id": ObjectId(str(parent_id))})
                if ObjectId.is_valid(str(parent_id or ""))
                else None
            )
        deduplicated = []
        seen = set()
        for approver_id, level in steps:
            if approver_id not in seen:
                seen.add(approver_id)
                deduplicated.append((approver_id, level))
        if deduplicated:
            return deduplicated
    return []


def approval_chain(employee: dict):
    shift_steps = shift_group_approval_steps(employee)
    if shift_steps:
        approver_ids = [value for value, _level in shift_steps]
        level_by_id = {value: level for value, level in shift_steps}
    else:
        resolved = resolve_employee_organization(
            employee.get("manualFunctionIds", employee.get("functionIds")),
            employee_id(employee),
        )
        approver_ids = (
            list(resolved.get("reportingOfficerIds") or [])
            + [resolved.get("intermediaryReportingId"), resolved.get("hodId")]
        )
        approver_ids = [
            value for value in dict.fromkeys(clean_id(value) for value in approver_ids)
            if value and value != employee_id(employee)
        ]
        level_by_id = {}
    approvers = {
        employee_id(item): item
        for item in employee_collection.find(
            {
                "$or": [
                    {"userId": {"$in": approver_ids}},
                    {"employeeId": {"$in": approver_ids}},
                ]
            },
            {"userId": 1, "employeeId": 1, "name": 1, "designation": 1},
        )
    }
    chain = []
    for index, approver_id in enumerate(approver_ids):
        approver = approvers.get(approver_id, {})
        is_last = index == len(approver_ids) - 1
        chain.append({
            "employeeId": approver_id,
            "name": approver.get("name") or approver_id,
            "designation": approver.get("designation"),
            "level": level_by_id.get(approver_id)
            or ("HOD" if is_last else ("Reporting Officer" if index == 0 else "Intermediary Approver")),
            "status": "Pending",
            "actedAt": None,
        })
    return chain


def serialize_nomination(record: dict, actor_id: str | None = None, is_admin: bool = False):
    chain = record.get("approvalChain") or []
    current_index = int(record.get("currentApprovalIndex") or 0)
    current = chain[current_index] if current_index < len(chain) else None
    group_context = {
        "groupName": record.get("groupName"),
        "isGroupSIC": bool(record.get("isGroupSIC")),
        "isShiftEmployee": bool(record.get("isShiftEmployee") or record.get("employeeType") == "Shift"),
    }
    if not group_context["groupName"]:
        group_context = {**group_context, **shift_group_context(record.get("employeeId"))}
    return {
        "id": str(record["_id"]),
        "workflowKind": record.get("workflowKind") or "Training",
        "parentNominationId": clean_id(record.get("parentNominationId")),
        "trainingName": record.get("trainingName"),
        "trainingLocation": record.get("trainingLocation"),
        "trainingDate": record.get("trainingDate") or record.get("startDate"),
        "startDate": record.get("startDate") or record.get("trainingDate"),
        "endDate": record.get("endDate") or record.get("trainingDate"),
        "employeeId": record.get("employeeId"),
        "employeeName": record.get("employeeName"),
        "employeeDesignation": record.get("employeeDesignation"),
        "employeeType": record.get("employeeType"),
        "groupName": group_context.get("groupName"),
        "isShiftEmployee": bool(group_context.get("isShiftEmployee")),
        "isGroupSIC": bool(group_context.get("isGroupSIC")),
        "replacementRequired": bool(record.get("replacementRequired")),
        "replacementEmployee": record.get("replacementEmployee"),
        "actingSICEmployee": record.get("actingSICEmployee"),
        "adjacentOff": record.get("adjacentOff") or {"before": False, "after": False},
        "replacementDecisionHistory": record.get("replacementDecisionHistory") or [],
        "status": record.get("status"),
        "approvalChain": chain,
        "approvalProgress": f"{sum(1 for item in chain if item.get('status') == 'Approved')}/{len(chain)}",
        "currentApproverId": current.get("employeeId") if current else None,
        "currentApproverName": current.get("name") if current else None,
        "currentApproverLevel": current.get("level") if current else None,
        "canApprove": bool(
            record.get("status") in PENDING_STATUSES
            and (is_admin or (current and current.get("employeeId") == actor_id))
        ),
        "createdOn": record.get("createdOn"),
        "approvedOn": record.get("approvedOn"),
    }


def finalize_daily_records(record: dict):
    employee = employee_collection.find_one({
        "$or": [
            {"userId": record.get("employeeId")},
            {"employeeId": record.get("employeeId")},
        ]
    }) or {}
    operations = []
    replacement = record.get("replacementEmployee") or {}
    acting_sic = record.get("actingSICEmployee") or {}
    replacement_id = clean_id(replacement.get("employeeId"))
    acting_sic_id = clean_id(acting_sic.get("employeeId"))
    for date in date_range(
        record.get("startDate") or record.get("trainingDate"),
        record.get("endDate") or record.get("trainingDate"),
    ):
        trainee_daily = employee_daily_collection.find_one({
            "employeeId": record.get("employeeId"),
            "date": date,
        }) or {}
        original_assignment = trainee_daily.get("trainingOriginalAssignment") or {
            "assignedDuty": trainee_daily.get("assignedDuty"),
            "groupName": trainee_daily.get("groupName"),
        }
        original_duty = original_assignment.get("assignedDuty")
        group_name = original_assignment.get("groupName") or record.get("groupName")
        operations.append(UpdateOne(
            {"employeeId": record.get("employeeId"), "date": date},
            {
                "$set": {
                    "assignedDuty": "Training",
                    "actualStatus": "Training",
                    "trainingName": record.get("trainingName"),
                    "trainingFinal": {
                        "trainingName": record.get("trainingName"),
                        "status": "Approved",
                        "nominationId": str(record["_id"]),
                    },
                    "trainingOriginalAssignment": original_assignment,
                    "updatedOn": datetime.utcnow(),
                },
                "$unset": {"trainingNomination": ""},
                "$setOnInsert": {
                    "employeeId": record.get("employeeId"),
                    "name": record.get("employeeName") or employee.get("name"),
                    "designation": record.get("employeeDesignation") or employee.get("designation"),
                    "date": date,
                    "year": int(date[:4]),
                    "month": int(date[5:7]),
                    "groupName": "Other Employees",
                    "flag": "Training",
                    "createdOn": datetime.utcnow(),
                },
            },
            upsert=True,
        ))
        if record.get("replacementRequired") and replacement_id:
            replacement_daily = employee_daily_collection.find_one({
                "employeeId": replacement_id,
                "date": date,
            }) or {}
            previous_replacement_assignment = (
                replacement_daily.get("trainingReplacementPreviousAssignment")
                if (replacement_daily.get("trainingReplacement") or {}).get("nominationId") == str(record["_id"])
                else {
                    "assignedDuty": replacement_daily.get("assignedDuty"),
                    "groupName": replacement_daily.get("groupName"),
                }
            )
            operations.append(UpdateOne(
                {"employeeId": replacement_id, "date": date},
                {
                    "$set": {
                        "assignedDuty": original_duty,
                        "actualStatus": original_duty,
                        "groupName": group_name,
                        "replacementDuty": True,
                        "replacementFor": {
                            "employeeId": record.get("employeeId"),
                            "name": record.get("employeeName"),
                            "reason": "Training",
                        },
                        "trainingReplacement": {
                            "nominationId": str(record["_id"]),
                            "trainingName": record.get("trainingName"),
                            "traineeEmployeeId": record.get("employeeId"),
                        },
                        "trainingReplacementPreviousAssignment": previous_replacement_assignment,
                        "updatedOn": datetime.utcnow(),
                    },
                    "$setOnInsert": {
                        "employeeId": replacement_id,
                        "name": replacement.get("name"),
                        "designation": replacement.get("designation"),
                        "date": date,
                        "year": int(date[:4]),
                        "month": int(date[5:7]),
                        "flag": "Training Replacement",
                        "createdOn": datetime.utcnow(),
                    },
                },
                upsert=True,
            ))
        if record.get("isGroupSIC") and acting_sic_id:
            acting_employee = acting_sic
            operations.append(UpdateOne(
                {"employeeId": acting_sic_id, "date": date},
                {
                    "$set": {
                        "isActingSIC": True,
                        "actingSICFor": {
                            "employeeId": record.get("employeeId"),
                            "name": record.get("employeeName"),
                            "nominationId": str(record["_id"]),
                        },
                        "actingSICGroup": group_name,
                        "updatedOn": datetime.utcnow(),
                    },
                    "$setOnInsert": {
                        "employeeId": acting_sic_id,
                        "name": acting_employee.get("name"),
                        "designation": acting_employee.get("designation"),
                        "date": date,
                        "year": int(date[:4]),
                        "month": int(date[5:7]),
                        "groupName": group_name,
                        "flag": "Acting SIC",
                        "createdOn": datetime.utcnow(),
                    },
                },
                upsert=True,
            ))
    if operations:
        employee_daily_collection.bulk_write(operations)

    adjacent_off = record.get("adjacentOff") or {}
    boundary_dates = []
    if adjacent_off.get("before"):
        boundary_dates.append((datetime.strptime(record.get("startDate"), "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d"))
    if adjacent_off.get("after"):
        boundary_dates.append((datetime.strptime(record.get("endDate"), "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d"))
    for off_date in boundary_dates:
        current = employee_daily_collection.find_one({"employeeId": record.get("employeeId"), "date": off_date}) or {}
        employee_daily_collection.update_one(
            {"employeeId": record.get("employeeId"), "date": off_date},
            {
                "$set": {
                    "assignedDuty": "OFF",
                    "actualStatus": "OFF",
                    "trainingAdjacentOff": {
                        "nominationId": str(record["_id"]),
                        "trainingName": record.get("trainingName"),
                        "status": "Approved",
                    },
                    "trainingAdjacentOffOriginalAssignment": current.get("trainingAdjacentOffOriginalAssignment") or {
                        "assignedDuty": current.get("assignedDuty"),
                        "actualStatus": current.get("actualStatus"),
                        "groupName": current.get("groupName"),
                    },
                    "updatedOn": datetime.utcnow(),
                },
                "$setOnInsert": {
                    "employeeId": record.get("employeeId"), "name": record.get("employeeName"),
                    "designation": record.get("employeeDesignation"), "date": off_date,
                    "year": int(off_date[:4]), "month": int(off_date[5:7]),
                    "groupName": record.get("groupName") or "Other Employees", "createdOn": datetime.utcnow(),
                },
            },
            upsert=True,
        )


@router.get("/calendar/{startDate}/{endDate}")
def get_training_calendar(startDate: str, endDate: str):
    dates = list(date_range(startDate, endDate))
    window_start = (
        datetime.strptime(dates[0], "%Y-%m-%d") - timedelta(days=1)
    ).strftime("%Y-%m-%d")
    window_end = (
        datetime.strptime(dates[-1], "%Y-%m-%d") + timedelta(days=1)
    ).strftime("%Y-%m-%d")

    records = list(employee_daily_collection.find({
        "date": {"$gte": window_start, "$lte": window_end},
        "employeeId": {"$exists": True, "$nin": [None, ""]},
    }))
    employees = list(employee_collection.find(
        {
            "$and": [
                {"$or": [{"isActive": {"$exists": False}}, {"isActive": True}]},
                {"$or": [
                    {"userId": {"$exists": True, "$nin": [None, ""]}},
                    {"employeeId": {"$exists": True, "$nin": [None, ""]}},
                ]},
            ]
        },
        {
            "userId": 1, "employeeId": 1, "name": 1, "designation": 1,
            "department": 1, "vertical": 1, "verticals": 1,
        },
    ))
    employee_map = {employee_id(item): item for item in employees if employee_id(item)}
    fy_start, fy_end = financial_year_bounds(startDate)
    training_days = {}
    for item in training_nomination_history_collection.find(
        {
            "status": "Approved",
            "startDate": {"$lte": fy_end},
            "workflowKind": {"$ne": "Adjacent OFF"},
            "$or": [
                {"endDate": {"$gte": fy_start}},
                {"endDate": {"$exists": False}, "trainingDate": {"$gte": fy_start}},
            ],
        },
        {"employeeId": 1, "startDate": 1, "endDate": 1},
    ):
        try:
            period_start = max(
                datetime.strptime(item.get("startDate"), "%Y-%m-%d"),
                datetime.strptime(fy_start, "%Y-%m-%d"),
            )
            period_end = min(
                datetime.strptime(item.get("endDate") or item.get("startDate"), "%Y-%m-%d"),
                datetime.strptime(fy_end, "%Y-%m-%d"),
            )
            days = (period_end - period_start).days + 1
        except (TypeError, ValueError):
            days = 0
        emp_key = clean_id(item.get("employeeId"))
        training_days[emp_key] = training_days.get(emp_key, 0) + max(0, days)

    active_shift_ids = set()
    for group in roster_group_collection.find(
        {"isActive": True},
        {"members": 1, "shiftInCharge": 1},
    ):
        for member in group.get("members") or []:
            if employee_id(member):
                active_shift_ids.add(employee_id(member))
        if employee_id(group.get("shiftInCharge")):
            active_shift_ids.add(employee_id(group.get("shiftInCharge")))

    grouped = {}
    non_shift_duties = {}
    seen = set()
    for record in records:
        emp_id = clean_id(record.get("employeeId"))
        if not emp_id:
            continue
        if emp_id not in active_shift_ids:
            non_shift_duties.setdefault(emp_id, {})[record.get("date")] = {
                "shift": record.get("assignedDuty"),
                "leaveStatus": record.get("leaveStatus"),
                "leaveType": record.get("leaveType"),
                "trainingName": record.get("trainingName"),
                "trainingStatus": (record.get("trainingFinal") or {}).get("status")
                or (record.get("trainingNomination") or {}).get("status"),
            }
            continue
        group_name = record.get("groupName") or "Shift Employees"
        employee = employee_map.get(emp_id, {})
        group_people = grouped.setdefault(group_name, {})
        person = group_people.setdefault(emp_id, {
            "employeeId": emp_id,
            "name": record.get("name") or employee.get("name") or emp_id,
            "designation": record.get("designation") or employee.get("designation"),
            "organization": employee.get("department") or employee.get("vertical"),
            "employeeType": "Shift",
            "financialYearTrainingDays": training_days.get(emp_id, 0),
            "duties": {},
        })
        person["duties"][record.get("date")] = {
            "shift": record.get("assignedDuty"),
            "leaveStatus": record.get("leaveStatus"),
            "leaveType": record.get("leaveType"),
            "trainingName": record.get("trainingName"),
            "trainingStatus": (record.get("trainingFinal") or {}).get("status")
            or (record.get("trainingNomination") or {}).get("status"),
        }
        seen.add(emp_id)

    # Non-shift employees do not normally have employee_daily records. Include
    # them from Employee Master so they can still be nominated for training.
    for emp_id, employee in employee_map.items():
        if emp_id in active_shift_ids:
            continue
        verticals = employee.get("verticals") or []
        organization = (
            employee.get("department")
            or employee.get("vertical")
            or (verticals[0] if isinstance(verticals, list) and verticals else None)
            or "General"
        )
        group_name = f"Other Employees - {organization}"
        grouped.setdefault(group_name, {})[emp_id] = {
            "employeeId": emp_id,
            "name": employee.get("name") or emp_id,
            "designation": employee.get("designation"),
            "organization": organization,
            "employeeType": "Non-shift",
            "financialYearTrainingDays": training_days.get(emp_id, 0),
            "duties": non_shift_duties.get(emp_id, {}),
        }

    return {
        group_name: sorted(people.values(), key=lambda item: (item.get("name") or "").lower())
        for group_name, people in sorted(grouped.items())
    }


@router.get("/eligible/{date}/{group}")
def get_eligible_employees(date: str, group: str):
    records = list(employee_daily_collection.find({"date": date, "groupName": group}))
    return [{
        "employeeId": record.get("employeeId"),
        "name": record.get("name"),
        "designation": record.get("designation"),
        "shift": record.get("assignedDuty"),
        "leaveStatus": record.get("leaveStatus"),
        "trainingNomination": record.get("trainingNomination"),
        "trainingFinal": record.get("trainingFinal"),
    } for record in records]


@router.get("/pending")
def get_pending(user=Depends(get_authenticated_user)):
    actor_id = clean_id(user.get("employeeId"))
    is_admin = user.get("role") == "admin"
    query = {"status": {"$in": list(PENDING_STATUSES)}}
    if not is_admin:
        query["currentApproverId"] = actor_id
    records = training_nomination_history_collection.find(query).sort([
        ("startDate", 1),
        ("createdOn", 1),
    ])
    return [serialize_nomination(item, actor_id, is_admin) for item in records]


@router.get("/my-approved")
def get_my_approved_training(user=Depends(get_authenticated_user)):
    """Return the logged-in employee's approved training and linked OFF request."""
    actor_id = clean_id(user.get("employeeId"))
    if not actor_id:
        raise HTTPException(401, "Employee identity is required")
    records = list(training_nomination_history_collection.find({
        "employeeId": actor_id,
        "status": "Approved",
        "workflowKind": {"$ne": "Adjacent OFF"},
    }).sort("startDate", -1).limit(100))
    parent_ids = [str(item["_id"]) for item in records]
    requests = list(training_nomination_history_collection.find({
        "workflowKind": "Adjacent OFF",
        "parentNominationId": {"$in": parent_ids},
    }).sort("createdOn", -1)) if parent_ids else []
    request_by_parent = {}
    for item in requests:
        request_by_parent.setdefault(clean_id(item.get("parentNominationId")), item)
    output = []
    for item in records:
        serialized = serialize_nomination(item, actor_id, False)
        linked = request_by_parent.get(str(item["_id"]))
        serialized["adjacentOffRequest"] = (
            serialize_nomination(linked, actor_id, False) if linked else None
        )
        output.append(serialized)
    return output


@router.post("/request-adjacent-off/{nomination_id}")
def request_training_adjacent_off(
    nomination_id: str,
    data: dict,
    user=Depends(get_authenticated_user),
):
    """Start a new hierarchy approval after the employee's training is approved."""
    if not ObjectId.is_valid(nomination_id):
        raise HTTPException(400, "Invalid training nomination")
    actor_id = clean_id(user.get("employeeId"))
    parent = training_nomination_history_collection.find_one({
        "_id": ObjectId(nomination_id),
        "employeeId": actor_id,
        "status": "Approved",
        "workflowKind": {"$ne": "Adjacent OFF"},
    })
    if not parent:
        raise HTTPException(404, "Approved training was not found for this employee")
    adjacent_off = {
        "before": bool(data.get("before")),
        "after": bool(data.get("after")),
    }
    if not any(adjacent_off.values()):
        raise HTTPException(400, "Select the day before, the day after, or both")
    existing = training_nomination_history_collection.find_one({
        "workflowKind": "Adjacent OFF",
        "parentNominationId": nomination_id,
        "status": {"$nin": ["Rejected", "Cancelled"]},
    })
    if existing:
        raise HTTPException(409, "An adjacent OFF request already exists for this training")
    employee = employee_collection.find_one({
        "$or": [{"userId": actor_id}, {"employeeId": actor_id}],
    }) or {}
    chain = approval_chain(employee)
    if not chain:
        raise HTTPException(409, "Organization reporting hierarchy is not mapped")
    now = datetime.utcnow()
    linked = {
        **{key: parent.get(key) for key in (
            "trainingName", "trainingLocation", "trainingDate", "startDate", "endDate",
            "employeeId", "employeeName", "employeeDesignation", "employeeType",
            "groupName", "isShiftEmployee", "isGroupSIC",
        )},
        "workflowKind": "Adjacent OFF",
        "parentNominationId": nomination_id,
        "adjacentOff": adjacent_off,
        "replacementRequired": False,
        "replacementEmployee": None,
        "actingSICEmployee": None,
        "replacementDecisionHistory": [],
        "status": "Pending Approval",
        "approvalChain": chain,
        "currentApprovalIndex": 0,
        "currentApproverId": chain[0]["employeeId"],
        "nominatedBy": employee_snapshot(employee),
        "createdOn": now,
        "updatedOn": now,
    }
    result = training_nomination_history_collection.insert_one(linked)
    return {
        "id": str(result.inserted_id),
        "message": "Adjacent OFF request sent through the reporting hierarchy",
    }


@router.get("/replacement-candidates/{nomination_id}")
def get_training_replacement_candidates(
    nomination_id: str,
    user=Depends(get_authenticated_user),
):
    if not ObjectId.is_valid(nomination_id):
        raise HTTPException(400, "Invalid nomination")
    record = training_nomination_history_collection.find_one({"_id": ObjectId(nomination_id)})
    if not record:
        raise HTTPException(404, "Training nomination not found")
    actor_id = clean_id(user.get("employeeId"))
    is_admin = user.get("role") == "admin"
    current_index = int(record.get("currentApprovalIndex") or 0)
    chain = record.get("approvalChain") or []
    current = chain[current_index] if current_index < len(chain) else {}
    if not is_admin and clean_id(current.get("employeeId")) != actor_id:
        raise HTTPException(403, "Only the current training approver can select a replacement")

    trainee_id = clean_id(record.get("employeeId"))
    trainee_context = shift_group_context(trainee_id)
    start_date = record.get("startDate") or record.get("trainingDate")
    end_date = record.get("endDate") or start_date
    employees = list(employee_collection.find(
        {
            "$and": [
                {"$or": [{"isActive": {"$exists": False}}, {"isActive": True}]},
                {"$or": [
                    {"userId": {"$exists": True, "$nin": [None, ""]}},
                    {"employeeId": {"$exists": True, "$nin": [None, ""]}},
                ]},
            ]
        },
        {
            "userId": 1,
            "employeeId": 1,
            "name": 1,
            "designation": 1,
            "typeOfDuty": 1,
            "category": 1,
        },
    ))
    candidate_ids = [employee_id(item) for item in employees if employee_id(item) and employee_id(item) != trainee_id]
    duties = list(employee_daily_collection.find(
        {
            "employeeId": {"$in": candidate_ids},
            "date": {"$gte": start_date, "$lte": end_date},
        },
        {
            "employeeId": 1,
            "date": 1,
            "assignedDuty": 1,
            "groupName": 1,
            "leaveStatus": 1,
            "trainingName": 1,
        },
    ))
    duties_by_employee = {}
    for duty in duties:
        duties_by_employee.setdefault(clean_id(duty.get("employeeId")), []).append(duty)

    output = []
    for employee in employees:
        candidate_id = employee_id(employee)
        if not candidate_id or candidate_id == trainee_id:
            continue
        context = shift_group_context(candidate_id)
        candidate_duties = sorted(duties_by_employee.get(candidate_id, []), key=lambda item: item.get("date") or "")
        conflicts = [
            item for item in candidate_duties
            if str(item.get("leaveStatus") or "").lower() in {"applied", "forwarded by sic", "approved"}
            or item.get("trainingName")
        ]
        if context.get("groupName") == trainee_context.get("groupName"):
            source = "Same shift group"
        elif context.get("isShiftEmployee"):
            source = "Other shift group"
        else:
            source = "Outside shift groups"
        duty_summary = ", ".join(
            f"{item.get('date')}: {item.get('assignedDuty') or '-'}"
            for item in candidate_duties[:4]
        ) or "No roster duty"
        if len(candidate_duties) > 4:
            duty_summary += f" +{len(candidate_duties) - 4} days"
        output.append({
            "employeeId": candidate_id,
            "name": employee.get("name") or candidate_id,
            "designation": employee.get("designation"),
            "groupName": context.get("groupName"),
            "source": source,
            "isGroupSIC": bool(context.get("isGroupSIC")),
            "dutySummary": duty_summary,
            "hasConflict": bool(conflicts),
        })
    source_order = {"Same shift group": 0, "Other shift group": 1, "Outside shift groups": 2}
    output.sort(key=lambda item: (
        source_order.get(item["source"], 9),
        str(item.get("name") or "").lower(),
    ))
    return {
        "groupName": trainee_context.get("groupName") or record.get("groupName"),
        "isGroupSIC": bool(trainee_context.get("isGroupSIC") or record.get("isGroupSIC")),
        "candidates": output,
    }


@router.post("/nominate")
def nominate_training(data: dict, user=Depends(get_authenticated_user)):
    require_page_write(user, "crew_training")
    training_name = str(data.get("trainingName") or "").strip()
    training_location = str(data.get("trainingLocation") or "").strip()
    start_date = data.get("startDate") or data.get("date")
    end_date = data.get("endDate") or start_date
    list(date_range(start_date, end_date))
    raw_employees = data.get("employees") or []
    selected_ids = list(dict.fromkeys(
        clean_id(item.get("employeeId") if isinstance(item, dict) else item)
        for item in raw_employees
        if clean_id(item.get("employeeId") if isinstance(item, dict) else item)
    ))
    if not training_name or not selected_ids:
        raise HTTPException(400, "Training and at least one employee are required")

    selected = {
        employee_id(item): item
        for item in employee_collection.find({
            "$or": [
                {"userId": {"$in": selected_ids}},
                {"employeeId": {"$in": selected_ids}},
            ]
        })
    }
    missing = [value for value in selected_ids if value not in selected]
    if missing:
        raise HTTPException(404, f"Employee not found: {', '.join(missing)}")

    prepared = []
    unmapped = []
    for emp_id in selected_ids:
        employee = selected[emp_id]
        chain = approval_chain(employee)
        if not chain:
            unmapped.append(employee.get("name") or emp_id)
            continue
        duplicate = training_nomination_history_collection.find_one({
            "trainingName": training_name,
            "startDate": start_date,
            "endDate": end_date,
            "employeeId": emp_id,
            "status": {"$nin": ["Rejected", "Cancelled"]},
        })
        if duplicate:
            raise HTTPException(409, f"{employee.get('name') or emp_id} is already nominated for this training")
        prepared.append((employee, chain))

    if unmapped:
        raise HTTPException(
            409,
            "Organization reporting hierarchy is not mapped for: "
            + ", ".join(unmapped),
        )

    now = datetime.utcnow()
    for employee, chain in prepared:
        snapshot = employee_snapshot(employee)
        group_context = shift_group_context(snapshot["employeeId"])
        result = training_nomination_history_collection.insert_one({
            "trainingName": training_name,
            "trainingLocation": training_location,
            "trainingDate": start_date,
            "startDate": start_date,
            "endDate": end_date,
            "employeeId": snapshot["employeeId"],
            "employeeName": snapshot["name"],
            "employeeDesignation": snapshot["designation"],
            "employeeType": "Shift" if group_context else "Non-shift",
            "groupName": group_context.get("groupName"),
            "isShiftEmployee": bool(group_context),
            "isGroupSIC": bool(group_context.get("isGroupSIC")),
            "replacementRequired": False,
            "replacementEmployee": None,
            "actingSICEmployee": None,
            "workflowKind": "Training",
            "adjacentOff": {"before": False, "after": False},
            "replacementDecisionHistory": [],
            "status": "Pending Approval",
            "approvalChain": chain,
            "currentApprovalIndex": 0,
            "currentApproverId": chain[0]["employeeId"],
            "nominatedBy": employee_snapshot(user),
            "createdOn": now,
            "updatedOn": now,
        })
        for date in date_range(start_date, end_date):
            employee_daily_collection.update_one(
                {"employeeId": snapshot["employeeId"], "date": date},
                {
                    "$set": {
                        "trainingNomination": {
                            "trainingName": training_name,
                            "status": "Pending Approval",
                            "nominationId": str(result.inserted_id),
                        },
                        "updatedOn": now,
                    },
                    "$setOnInsert": {
                        "employeeId": snapshot["employeeId"],
                        "name": snapshot["name"],
                        "designation": snapshot["designation"],
                        "date": date,
                        "year": int(date[:4]),
                        "month": int(date[5:7]),
                        "groupName": "Other Employees",
                        "flag": "Training Nomination",
                        "createdOn": now,
                    },
                },
                upsert=True,
            )
    return {"message": f"{len(prepared)} training nomination(s) sent through the reporting hierarchy"}


@router.post("/approve")
def approve_training(data: dict, user=Depends(get_authenticated_user)):
    ids = list(dict.fromkeys(clean_id(value) for value in (data.get("ids") or []) if clean_id(value)))
    if not ids:
        raise HTTPException(400, "Select at least one nomination")
    if any(not ObjectId.is_valid(value) for value in ids):
        raise HTTPException(400, "Invalid nomination")

    actor_id = clean_id(user.get("employeeId"))
    is_admin = user.get("role") == "admin"
    records = list(training_nomination_history_collection.find({
        "_id": {"$in": [ObjectId(value) for value in ids]},
        "status": {"$in": list(PENDING_STATUSES)},
    }))
    if len(records) != len(ids):
        raise HTTPException(409, "One or more nominations are no longer pending")

    raw_decisions = data.get("replacementDecisions") or {}
    if isinstance(raw_decisions, list):
        decisions_by_id = {
            clean_id(item.get("id")): item
            for item in raw_decisions
            if isinstance(item, dict) and clean_id(item.get("id"))
        }
    elif isinstance(raw_decisions, dict):
        decisions_by_id = raw_decisions
    else:
        decisions_by_id = {}

    for record in records:
        chain = record.get("approvalChain") or []
        index = int(record.get("currentApprovalIndex") or 0)
        current = chain[index] if index < len(chain) else None
        if not current:
            raise HTTPException(409, f"Approval hierarchy is missing for {record.get('employeeName')}")
        if not is_admin and current.get("employeeId") != actor_id:
            raise HTTPException(403, f"{record.get('employeeName')}'s nomination is awaiting {current.get('name')}")
        record_id = str(record["_id"])
        decision = decisions_by_id.get(record_id) or {}
        group_context = shift_group_context(record.get("employeeId"))
        is_shift_employee = bool(
            record.get("isShiftEmployee")
            or record.get("employeeType") == "Shift"
            or group_context
        )
        is_group_sic = bool(record.get("isGroupSIC") or group_context.get("isGroupSIC"))
        replacement_required = bool(
            decision.get("replacementRequired")
            if "replacementRequired" in decision
            else record.get("replacementRequired")
        )
        replacement_id = clean_id(
            decision.get("replacementEmployeeId")
            if "replacementEmployeeId" in decision
            else (record.get("replacementEmployee") or {}).get("employeeId")
        )
        acting_sic_id = clean_id(
            decision.get("actingSICEmployeeId")
            if "actingSICEmployeeId" in decision
            else (record.get("actingSICEmployee") or {}).get("employeeId")
        )
        if not is_shift_employee and (replacement_required or acting_sic_id):
            raise HTTPException(409, f"{record.get('employeeName')} is not attached to an active shift group")
        if replacement_required and not replacement_id:
            raise HTTPException(400, f"Select a replacement for {record.get('employeeName')}")
        if acting_sic_id and not is_group_sic:
            raise HTTPException(400, f"Acting SIC can only be assigned when the trainee is the group SIC")
        selected_ids = [value for value in dict.fromkeys([replacement_id, acting_sic_id]) if value]
        if clean_id(record.get("employeeId")) in selected_ids:
            raise HTTPException(400, "The trainee cannot replace themselves or act as their own SIC")
        selected_employees = {
            employee_id(item): item
            for item in employee_collection.find({
                "$or": [
                    {"userId": {"$in": selected_ids}},
                    {"employeeId": {"$in": selected_ids}},
                ],
                "$and": [{"$or": [{"isActive": {"$exists": False}}, {"isActive": True}]}],
            })
        } if selected_ids else {}
        missing = [value for value in selected_ids if value not in selected_employees]
        if missing:
            raise HTTPException(404, f"Selected replacement employee not found: {', '.join(missing)}")
        record["_replacement_update"] = {
            "groupName": record.get("groupName") or group_context.get("groupName"),
            "isShiftEmployee": is_shift_employee,
            "isGroupSIC": is_group_sic,
            "replacementRequired": replacement_required,
            "replacementEmployee": (
                employee_snapshot(selected_employees.get(replacement_id))
                if replacement_required and replacement_id
                else None
            ),
            "actingSICEmployee": (
                employee_snapshot(selected_employees.get(acting_sic_id))
                if acting_sic_id
                else None
            ),
        }

    now = datetime.utcnow()
    for record in records:
        chain = record.get("approvalChain") or []
        index = int(record.get("currentApprovalIndex") or 0)
        replacement_update = record.pop("_replacement_update")
        decision_audit = {
            **replacement_update,
            "actedBy": actor_id,
            "actedByName": user.get("name"),
            "approvalLevel": chain[index].get("level"),
            "actedAt": now,
        }
        chain[index] = {
            **chain[index],
            "status": "Approved",
            "actedBy": actor_id,
            "actedByName": user.get("name"),
            "actedAt": now,
            "replacementDecision": {
                "replacementRequired": replacement_update["replacementRequired"],
                "replacementEmployee": replacement_update["replacementEmployee"],
                "actingSICEmployee": replacement_update["actingSICEmployee"],
            },
        }
        next_index = index + 1
        if next_index < len(chain):
            update = {
                "approvalChain": chain,
                "currentApprovalIndex": next_index,
                "currentApproverId": chain[next_index]["employeeId"],
                "status": "Pending Approval",
                "updatedOn": now,
                **replacement_update,
            }
        else:
            update = {
                "approvalChain": chain,
                "currentApprovalIndex": next_index,
                "currentApproverId": None,
                "status": "Approved",
                "approvedOn": now,
                "approvedBy": actor_id,
                "updatedOn": now,
                **replacement_update,
            }
        training_nomination_history_collection.update_one(
            {"_id": record["_id"]},
            {
                "$set": update,
                "$push": {"replacementDecisionHistory": decision_audit},
            },
        )
        if update["status"] == "Approved":
            approved_record = {**record, **update}
            finalize_daily_records(approved_record)
            chain_ids = [clean_id(item.get("employeeId")) for item in chain]
            recipient_ids = list(dict.fromkeys([clean_id(record.get("employeeId")), *chain_ids]))
            adjacent = record.get("adjacentOff") or {}
            off_text = ", ".join(label for label, enabled in (("day before", adjacent.get("before")), ("day after", adjacent.get("after"))) if enabled) or "Not requested"
            is_adjacent_off = record.get("workflowKind") == "Adjacent OFF"
            notify_all(
                email_list=recipient_emails(recipient_ids), employee_ids=recipient_ids,
                subject="Training adjacent OFF approved" if is_adjacent_off else "Training nomination approved",
                message=(
                    f"Adjacent OFF has been approved for {record.get('employeeName')} against {record.get('trainingName')}."
                    if is_adjacent_off else
                    f"{record.get('employeeName')} has been approved for {record.get('trainingName')} ({record.get('startDate')} to {record.get('endDate')})."
                ),
                ref_id=str(record["_id"]), action="/crew/training", type="TRAINING",
                template_key="training_adjacent_off_approved" if is_adjacent_off else "training_approved",
                template_values={
                    "employee_name": record.get("employeeName"), "employee_id": record.get("employeeId"),
                    "training_name": record.get("trainingName"),
                    "training_period": f"{record.get('startDate')} to {record.get('endDate')}",
                    "training_location": record.get("trainingLocation") or "Not specified",
                    "adjacent_off": off_text,
                },
            )
    return {"message": f"{len(records)} nomination(s) approved and forwarded"}


@router.post("/finalize")
def finalize_training(data: dict, user=Depends(get_authenticated_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Administrator access is required")
    ids = [clean_id(value) for value in (data.get("ids") or []) if ObjectId.is_valid(clean_id(value))]
    records = list(training_nomination_history_collection.find({
        "_id": {"$in": [ObjectId(value) for value in ids]},
        "status": "Approved",
    }))
    for record in records:
        finalize_daily_records(record)
    return {"message": f"{len(records)} approved nomination(s) synchronized to duty records"}


@router.get("/history")
def get_training_nomination_history(
    financialYear: str | None = Query(default=None),
    employeeId: str | None = Query(default=None),
    user=Depends(get_authenticated_user),
):
    query = {}
    if employeeId:
        query["employeeId"] = employeeId
    if financialYear and "-" in financialYear:
        try:
            start_year = int(financialYear.split("-", 1)[0])
            query["startDate"] = {
                "$gte": f"{start_year}-04-01",
                "$lte": f"{start_year + 1}-03-31",
            }
        except ValueError:
            pass
    data = training_nomination_history_collection.find(query).sort("createdOn", -1).limit(2000)
    actor_id = clean_id(user.get("employeeId"))
    return [
        serialize_nomination(item, actor_id, user.get("role") == "admin")
        for item in data
    ]
