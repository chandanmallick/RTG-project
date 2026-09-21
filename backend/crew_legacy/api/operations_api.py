"""Access and actionable counts for the crew operations landing page."""
from datetime import datetime

from fastapi import APIRouter, Depends

from crew_legacy.admin_logic.auth_utils import get_authenticated_user
from crew_legacy.api.leave_api import can_sic_act, can_authority_act, get_my_role, is_organization_leave
from crew_legacy.api.replacement import has_replacement_authority, exchange_request_summary
from crew_legacy.api.sports_api import applications as sports_applications, can_manage_events
from crew_legacy.api.training_assignment import get_training_nomination_access, is_training_hr, TRAINING_HR_POOL_ID
from crew_legacy.database.database_mongo import (
    page_access_collection, leave_request_collection, training_nomination_history_collection,
    sports_application_collection, duty_exchange_request_collection,
)

router = APIRouter()


def operation_actions(pages, role, nomination_access, counts, sports_manager=False, training_hr=False):
    """Page access governs navigation; current workflow rights enable decisions."""
    def view(page):
        return bool((pages.get(page) or {}).get("view"))

    def write(page):
        return view(page) and bool((pages.get(page) or {}).get("write"))

    authority = bool(role.get("isAdmin") or role.get("isSIC") or role.get("isDeptIC") or role.get("isLeaveAuthority"))
    actions = {
        "calendar": view("crew_calendar"),
        "trainingEvents": write("crew_training") and training_hr,
        "holidays": write("crew_training"),
        "sportsEvents": write("crew_leave") and sports_manager,
        "applyLeave": write("crew_leave"),
        "requestTraining": write("crew_training"),
        "applySports": write("crew_leave"),
        "requestExchange": write("crew_replacement"),
        "myTraining": view("crew_training"),
        "leaveApproval": view("crew_leave") and (authority or counts.get("leaveApproval", 0) > 0),
        "trainingAssignment": view("crew_training") and bool(nomination_access.get("canAssign")),
        "trainingApproval": (view("crew_training") and (authority or training_hr)) or counts.get("trainingApproval", 0) > 0,
        "sportsApproval": view("crew_leave") and (authority or sports_manager or counts.get("sportsApproval", 0) > 0),
        "delegate": write("crew_leave") and authority,
        "leaveReplacement": (view("crew_replacement") and authority) or counts.get("leaveReplacement", 0) > 0,
        "calendarCoverage": view("crew_calendar") and (authority or training_hr or sports_manager or write("crew_training")),
        "exchangeApproval": (view("crew_replacement") and authority) or counts.get("exchangeApproval", 0) > 0,
    }
    return {key: {"enabled": bool(enabled), "pending": int(counts.get(key, 0)) if enabled else 0} for key, enabled in actions.items()}


@router.get("/summary")
def operations_summary(user=Depends(get_authenticated_user)):
    actor = str(user.get("employeeId") or user.get("userId") or "").strip()
    pages = (page_access_collection.find_one({"userId": actor}) or {}).get("pages") or {}
    role = get_my_role(user=user)
    nomination_access = get_training_nomination_access(user=user)
    hr = is_training_hr(user)
    sports_manager = can_manage_events(user)
    counts = {key: 0 for key in ("leaveApproval", "trainingApproval", "sportsApproval", "exchangeApproval", "leaveReplacement", "calendarCoverage")}

    for leave in leave_request_collection.find({"finalStatus": "Applied"}):
        organization = is_organization_leave(leave)
        sic = (organization or leave.get("sicApprovalStatus") == "Pending") and can_sic_act(user, leave)
        final = leave.get("deptApprovalStatus") == "Pending" and (organization or leave.get("sicApprovalStatus") == "Forwarded") and can_authority_act(user, leave)
        if sic or final:
            counts["leaveApproval"] += 1

    for record in training_nomination_history_collection.find({"status": {"$in": ["Nominated", "Pending Approval"]}}):
        chain = record.get("approvalChain") or []
        index = int(record.get("currentApprovalIndex") or 0)
        current = chain[index] if index < len(chain) else None
        if user.get("role") == "admin" or (current and (current.get("employeeId") == actor or (hr and current.get("employeeId") == TRAINING_HR_POOL_ID))):
            counts["trainingApproval"] += 1

    counts["sportsApproval"] = sum(1 for item in sports_applications(user=user) if item.get("canAct"))
    for item in duty_exchange_request_collection.find({"status": "Pending"}):
        if exchange_request_summary(item, actor).get("canAct"):
            counts["exchangeApproval"] += 1

    today = datetime.now().strftime("%Y-%m-%d")
    for leave in leave_request_collection.find({"finalStatus": "Approved", "replacementRequired": True, "replacement.employeeId": {"$in": [None, ""]}, "date": {"$gte": today}}):
        if has_replacement_authority(user, leave):
            counts["leaveReplacement"] += 1
    # Count required coverage only. Optional replacements are available from
    # the workflow but do not represent an outstanding task.
    training_manager = role.get("isAdmin") or hr or bool((pages.get("crew_training") or {}).get("write"))
    coverage_query = {"status": "Approved", "replacementRequired": True, "replacementEmployee.employeeId": {"$in": [None, ""]}, "endDate": {"$gte": today}}
    if training_manager:
        counts["calendarCoverage"] += training_nomination_history_collection.count_documents({**coverage_query, "workflowKind": {"$ne": "Adjacent OFF"}})
    if sports_manager:
        counts["calendarCoverage"] += sports_application_collection.count_documents(coverage_query)
    actions = operation_actions(pages, role, nomination_access, counts, sports_manager, hr)
    return {"actions": actions, "totalPending": sum(item["pending"] for item in actions.values()), "updatedAt": datetime.utcnow().isoformat() + "Z"}
