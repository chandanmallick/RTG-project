from datetime import datetime, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from crew_legacy.admin_logic.auth_utils import get_authenticated_user
from crew_legacy.api.leave_api import active_leave_delegation
from crew_legacy.admin_logic.notification_service import notify_all
from crew_legacy.api.training_assignment import (
    approval_chain, employee_id, employee_snapshot, recipient_emails,
    shift_group_context,
)
from crew_legacy.database.database_mongo import (
    employee_collection, employee_daily_collection, page_access_collection, sports_application_collection,
    sports_event_collection,
)

router = APIRouter()


def clean(value): return str(value or "").strip()
def actor_id(user): return clean(user.get("employeeId") or user.get("userId"))


def can_manage_events(user):
    if str(user.get("role") or "").lower() == "admin" or actor_id(user) == "50041": return True
    access = page_access_collection.find_one({"userId": actor_id(user)}) or {}
    pages = access.get("pages") or {}
    return bool((pages.get("crew_training") or {}).get("approve") or (pages.get("crew_leave") or {}).get("approve"))


def serialize(document):
    output = dict(document)
    output["id"] = str(output.pop("_id"))
    for key in ("createdOn", "updatedOn"):
        if isinstance(output.get(key), datetime): output[key] = output[key].isoformat()
    return output


def employee_by_id(value):
    return employee_collection.find_one({"$or": [{"userId": clean(value)}, {"employeeId": clean(value)}]}) or {}


def step_actor(user, step):
    actor = actor_id(user)
    approvers = [clean(value) for value in (step.get("employeeIds") or [step.get("employeeId")]) if clean(value)]
    if actor in approvers or str(user.get("role") or "").lower() == "admin": return True
    return any(active_leave_delegation(approver, actor) for approver in approvers)


def application_dates(item):
    selected = sorted(set(clean(value) for value in (item.get("selectedDates") or []) if clean(value)))
    if selected:
        return selected
    try:
        current = datetime.strptime(item.get("startDate"), "%Y-%m-%d")
        end = datetime.strptime(item.get("endDate"), "%Y-%m-%d")
    except (TypeError, ValueError):
        return []
    output = []
    while current <= end:
        output.append(current.strftime("%Y-%m-%d"))
        current += timedelta(days=1)
    return output


def finalize_sports_daily(item):
    replacement = item.get("replacementEmployee") or {}
    replacement_id = clean(replacement.get("employeeId"))
    for date in application_dates(item):
        trainee_daily = employee_daily_collection.find_one({"employeeId": item.get("employeeId"), "date": date}) or {}
        original = trainee_daily.get("sportsOriginalAssignment") or {
            "assignedDuty": trainee_daily.get("assignedDuty"),
            "groupName": trainee_daily.get("groupName"),
        }
        group_name = original.get("groupName") or shift_group_context(item.get("employeeId")).get("groupName")
        employee_daily_collection.update_one(
            {"employeeId": item.get("employeeId"), "date": date},
            {
                "$set": {
                    "assignedDuty": "Sports",
                    "actualStatus": "Sports",
                    "sportsName": item.get("eventName"),
                    "sportsApplicationId": str(item["_id"]),
                    "sportsOriginalAssignment": original,
                    "replacementRequired": bool(item.get("replacementRequired")),
                    "updatedOn": datetime.utcnow(),
                },
                "$setOnInsert": {
                    "employeeId": item.get("employeeId"), "name": item.get("employeeName"),
                    "designation": item.get("designation"), "date": date,
                    "year": int(date[:4]), "month": int(date[5:7]),
                    "groupName": group_name, "flag": "Sports", "createdOn": datetime.utcnow(),
                },
            },
            upsert=True,
        )
        if replacement_id:
            candidate_daily = employee_daily_collection.find_one({"employeeId": replacement_id, "date": date}) or {}
            prior = (
                candidate_daily.get("sportsReplacementPreviousAssignment")
                if (candidate_daily.get("sportsReplacement") or {}).get("applicationId") == str(item["_id"])
                else {"assignedDuty": candidate_daily.get("assignedDuty"), "groupName": candidate_daily.get("groupName")}
            )
            employee_daily_collection.update_one(
                {"employeeId": replacement_id, "date": date},
                {
                    "$set": {
                        "assignedDuty": original.get("assignedDuty"), "actualStatus": original.get("assignedDuty"),
                        "groupName": group_name, "replacementDuty": True,
                        "replacementMode": item.get("replacementMode") or "normal",
                        "replacementFor": {"employeeId": item.get("employeeId"), "name": item.get("employeeName"), "reason": "Sports"},
                        "sportsReplacement": {"applicationId": str(item["_id"]), "eventName": item.get("eventName")},
                        "sportsReplacementPreviousAssignment": prior,
                        "replacementCreatedDaily": not bool(candidate_daily),
                        "name": replacement.get("name"), "designation": replacement.get("designation"),
                        "updatedOn": datetime.utcnow(),
                    },
                    "$setOnInsert": {
                        "employeeId": replacement_id, "date": date, "year": int(date[:4]),
                        "month": int(date[5:7]), "flag": "Sports Replacement", "createdOn": datetime.utcnow(),
                    },
                },
                upsert=True,
            )


def release_sports_replacement(item, replacement):
    replacement_id = clean((replacement or {}).get("employeeId"))
    if not replacement_id:
        return
    application_id = str(item.get("_id") or "")
    for date in application_dates(item):
        daily = employee_daily_collection.find_one({
            "employeeId": replacement_id, "date": date,
            "sportsReplacement.applicationId": application_id,
        })
        if not daily:
            continue
        previous = daily.get("sportsReplacementPreviousAssignment") or {}
        if daily.get("replacementCreatedDaily") and not previous.get("assignedDuty"):
            employee_daily_collection.delete_one({"_id": daily["_id"]})
            continue
        employee_daily_collection.update_one(
            {"_id": daily["_id"]},
            {
                "$set": {
                    "assignedDuty": previous.get("assignedDuty"),
                    "actualStatus": previous.get("assignedDuty"),
                    "groupName": previous.get("groupName"),
                    "updatedOn": datetime.utcnow(),
                },
                "$unset": {
                    "replacementDuty": "", "replacementMode": "", "replacementFor": "",
                    "sportsReplacement": "", "sportsReplacementPreviousAssignment": "",
                    "replacementCreatedDaily": "",
                },
            },
        )


sports_event_collection.create_index([("startDate", 1), ("endDate", 1)])
sports_application_collection.create_index([("eventId", 1), ("employeeId", 1)], unique=True)


@router.get("/events")
def list_events(includePast: bool = False, user=Depends(get_authenticated_user)):
    query = {} if includePast else {"endDate": {"$gte": datetime.utcnow().strftime("%Y-%m-%d")}, "status": {"$ne": "Inactive"}}
    return [serialize(item) for item in sports_event_collection.find(query).sort("startDate", 1)]


@router.post("/events")
def save_event(data: dict, user=Depends(get_authenticated_user)):
    if not can_manage_events(user): raise HTTPException(403, "HR/HOD event-management permission is required")
    name, start, end = clean(data.get("name")), clean(data.get("startDate")), clean(data.get("endDate"))
    if not name or not start or not end or end < start: raise HTTPException(400, "Event name and a valid date range are required")
    now = datetime.utcnow()
    payload = {"name": name, "venue": clean(data.get("venue")), "startDate": start, "endDate": end,
               "description": clean(data.get("description")), "status": "Active", "updatedOn": now}
    raw_id = clean(data.get("id"))
    if raw_id:
        if not ObjectId.is_valid(raw_id): raise HTTPException(400, "Invalid sports event")
        sports_event_collection.update_one({"_id": ObjectId(raw_id)}, {"$set": payload})
        return {"message": "Sports event updated"}
    payload.update({"createdOn": now, "createdBy": actor_id(user)})
    sports_event_collection.insert_one(payload)
    return {"message": "Sports event created"}


@router.post("/apply")
def apply(data: dict, user=Depends(get_authenticated_user)):
    raw_id = clean(data.get("eventId"))
    if not ObjectId.is_valid(raw_id): raise HTTPException(400, "Select a sports event")
    event = sports_event_collection.find_one({"_id": ObjectId(raw_id), "status": {"$ne": "Inactive"}})
    if not event: raise HTTPException(404, "Sports event not found")
    employee = employee_by_id(actor_id(user))
    if not employee: raise HTTPException(404, "Employee profile not found")
    chain = approval_chain(employee)
    if not chain: raise HTTPException(409, "Approval hierarchy is not configured for this employee")
    selected_dates = sorted(set(clean(value) for value in (data.get("dates") or []) if clean(value)))
    if selected_dates and any(value < event.get("startDate", "") or value > event.get("endDate", "") for value in selected_dates):
        raise HTTPException(400, "Selected calendar dates must fall within the sports event period")
    application_start = selected_dates[0] if selected_dates else event.get("startDate")
    application_end = selected_dates[-1] if selected_dates else event.get("endDate")
    now = datetime.utcnow()
    if sports_application_collection.find_one({"eventId": raw_id, "employeeId": employee_id(employee)}):
        raise HTTPException(409, "You have already applied for this event")
    sports_application_collection.insert_one({
        "eventId": raw_id, "eventName": event.get("name"), "venue": event.get("venue"),
        "startDate": application_start, "endDate": application_end, "selectedDates": selected_dates,
        "employeeId": employee_id(employee), "employeeName": employee.get("name"),
        "designation": employee.get("designation"), "reason": clean(data.get("reason")),
        "approvalChain": chain, "currentApprovalIndex": 0, "status": "Pending Approval",
        "createdOn": now, "updatedOn": now,
    })
    return {"message": "Sports application submitted through your reporting hierarchy"}


@router.get("/applications")
def applications(user=Depends(get_authenticated_user)):
    actor = actor_id(user)
    query = {} if can_manage_events(user) else {"$or": [{"employeeId": actor}, {"approvalChain.employeeId": actor}, {"approvalChain.employeeIds": actor}]}
    output = []
    for item in sports_application_collection.find(query).sort("createdOn", -1):
        index, chain = int(item.get("currentApprovalIndex") or 0), item.get("approvalChain") or []
        current = chain[index] if index < len(chain) else None
        row = serialize(item)
        row["canAct"] = bool(current and step_actor(user, current) and item.get("status") == "Pending Approval")
        row["currentApproverName"] = (current or {}).get("name")
        output.append(row)
    return output


def decide(application_id, approved, user):
    if not ObjectId.is_valid(application_id): raise HTTPException(400, "Invalid application")
    item = sports_application_collection.find_one({"_id": ObjectId(application_id)})
    if not item or item.get("status") != "Pending Approval": raise HTTPException(409, "Application is no longer pending")
    chain, index = item.get("approvalChain") or [], int(item.get("currentApprovalIndex") or 0)
    current = chain[index] if index < len(chain) else None
    if not current or not step_actor(user, current): raise HTTPException(403, "This application is awaiting another approver")
    now, next_index = datetime.utcnow(), index + 1
    updates = {f"approvalChain.{index}.status": "Approved" if approved else "Rejected",
               f"approvalChain.{index}.actedBy": actor_id(user), f"approvalChain.{index}.actedOn": now, "updatedOn": now}
    if not approved: updates["status"] = "Rejected"
    elif next_index >= len(chain): updates.update({"status": "Approved", "currentApprovalIndex": next_index})
    else: updates["currentApprovalIndex"] = next_index
    sports_application_collection.update_one({"_id": item["_id"]}, {"$set": updates})
    if approved and updates.get("status") == "Approved":
        approved_item = {**item, **updates}
        finalize_sports_daily(approved_item)
        chain_ids = [clean(step.get("employeeId")) for step in chain if clean(step.get("employeeId"))]
        recipients = list(dict.fromkeys([clean(item.get("employeeId")), *chain_ids]))
        notify_all(
            email_list=recipient_emails(recipients), employee_ids=recipients,
            subject="Sports application approved",
            message=f"{item.get('employeeName')} has been approved for {item.get('eventName')} ({item.get('startDate')} to {item.get('endDate')}).",
            ref_id=str(item["_id"]), action="/crew/calendar", type="SPORTS",
        )
    return {"message": "Sports application approved" if approved else "Sports application rejected"}


@router.post("/applications/{application_id}/approve")
def approve(application_id: str, user=Depends(get_authenticated_user)): return decide(application_id, True, user)


@router.post("/applications/{application_id}/reject")
def reject(application_id: str, user=Depends(get_authenticated_user)): return decide(application_id, False, user)


@router.get("/applications/{application_id}/replacement-candidates")
def sports_replacement_candidates(application_id: str, user=Depends(get_authenticated_user)):
    if not ObjectId.is_valid(application_id): raise HTTPException(400, "Invalid application")
    item = sports_application_collection.find_one({"_id": ObjectId(application_id)})
    if not item: raise HTTPException(404, "Sports application not found")
    if item.get("status") != "Approved": raise HTTPException(409, "Sports application is not approved")
    if not can_manage_events(user): raise HTTPException(403, "Administrator or approval permission is required")
    target_id = clean(item.get("employeeId"))
    dates = application_dates(item)
    employees = list(employee_collection.find({"$or": [{"isActive": {"$exists": False}}, {"isActive": True}]}))
    candidate_ids = [employee_id(person) for person in employees if employee_id(person) and employee_id(person) != target_id]
    duties = list(employee_daily_collection.find({"employeeId": {"$in": candidate_ids}, "date": {"$in": dates}}))
    by_employee = {}
    for duty in duties: by_employee.setdefault(clean(duty.get("employeeId")), []).append(duty)
    target_context = shift_group_context(target_id)
    output = []
    for person in employees:
        candidate_id = employee_id(person)
        if not candidate_id or candidate_id == target_id: continue
        candidate_duties = sorted(by_employee.get(candidate_id, []), key=lambda row: row.get("date") or "")
        conflicts = [row for row in candidate_duties if str(row.get("leaveStatus") or "").lower() in {"applied", "forwarded by sic", "approved"} or row.get("trainingName") or row.get("sportsName") or row.get("replacementDuty")]
        context = shift_group_context(candidate_id)
        source = "Same shift group" if context.get("groupName") == target_context.get("groupName") else "Other shift group" if context.get("isShiftEmployee") else "Outside shift groups"
        output.append({
            **employee_snapshot(person), "groupName": context.get("groupName"), "source": source,
            "isGroupSIC": bool(context.get("isGroupSIC")), "hasConflict": bool(conflicts),
            "dutySummary": ", ".join(f"{row.get('date')}: {row.get('assignedDuty') or '-'}" for row in candidate_duties[:4]) or "No roster duty",
        })
    source_order = {"Same shift group": 0, "Other shift group": 1, "Outside shift groups": 2}
    output.sort(key=lambda row: (source_order.get(row["source"], 9), str(row.get("name") or "").lower()))
    return {"groupName": target_context.get("groupName"), "candidates": output}


@router.put("/applications/{application_id}/assign-replacement")
def assign_sports_replacement(application_id: str, data: dict, user=Depends(get_authenticated_user)):
    if not ObjectId.is_valid(application_id): raise HTTPException(400, "Invalid application")
    item = sports_application_collection.find_one({"_id": ObjectId(application_id)})
    if not item: raise HTTPException(404, "Sports application not found")
    if item.get("status") != "Approved": raise HTTPException(409, "Replacement can only be assigned after sports approval")
    if not can_manage_events(user): raise HTTPException(403, "Administrator or approval permission is required")
    replacement_id = clean(data.get("replacementEmployeeId"))
    if not replacement_id or replacement_id == clean(item.get("employeeId")): raise HTTPException(400, "Select another employee as replacement")
    replacement = employee_by_id(replacement_id)
    if not replacement: raise HTTPException(404, "Selected replacement employee was not found")
    previous_replacement = item.get("replacementEmployee") or {}
    if clean(previous_replacement.get("employeeId")) and clean(previous_replacement.get("employeeId")) != replacement_id:
        release_sports_replacement(item, previous_replacement)
    update = {
        "replacementRequired": True, "replacementEmployee": employee_snapshot(replacement),
        "replacementMode": clean(data.get("mode")) or "normal", "updatedOn": datetime.utcnow(),
        "replacementAssignedBy": actor_id(user),
    }
    sports_application_collection.update_one({"_id": item["_id"]}, {"$set": update})
    approved_item = {**item, **update}
    finalize_sports_daily(approved_item)
    context = shift_group_context(item.get("employeeId"))
    chain_ids = [clean(step.get("employeeId")) for step in (item.get("approvalChain") or []) if clean(step.get("employeeId"))]
    recipients = [value for value in dict.fromkeys([clean(item.get("employeeId")), replacement_id, clean(context.get("sicEmployeeId")), *chain_ids]) if value]
    sports_period = item.get("startDate") if item.get("startDate") == item.get("endDate") else f"{item.get('startDate')} to {item.get('endDate')}"
    replacement_person = (
        f"{replacement.get('name') or replacement_id} "
        f"({replacement.get('designation') or 'Designation not available'}, Employee ID {replacement_id})"
    )
    mail_result = notify_all(
        email_list=recipient_emails(recipients), employee_ids=recipients,
        subject="Sports replacement assigned",
        message=f"{replacement.get('name') or replacement_id} will cover {item.get('employeeName')} during {item.get('eventName')}.",
        ref_id=str(item["_id"]), action="/crew/calendar", type="SPORTS_REPLACEMENT",
        template_key="replacement_assigned",
        template_values={
            "replacement_person": replacement_person,
            "replacement_name": replacement.get("name"),
            "replacement_designation": replacement.get("designation"),
            "replacement_employee_id": replacement_id,
            "shift_name": f"Sports replacement - {item.get('eventName') or 'Sports'}",
            "date": sports_period,
            "date_iso": sports_period,
            "leave_person": item.get("employeeName") or item.get("employeeId"),
            "leave_name": item.get("employeeName"),
            "leave_designation": item.get("designation"),
            "leave_employee_id": item.get("employeeId"),
            "group_name": context.get("groupName"),
        },
    )
    sports_application_collection.update_one(
        {"_id": item["_id"]},
        {"$set": {"replacementMailDelivery": {**mail_result, "attemptedAt": datetime.utcnow()}}},
    )
    return {"message": "Sports replacement assigned successfully", "mailDelivery": mail_result}
