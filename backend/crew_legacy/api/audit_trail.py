from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from crew_legacy.admin_logic.auth_utils import get_authenticated_user
from crew_legacy.database.database_mongo import audit_trail_collection, employee_collection

router = APIRouter()


def _is_audit_admin(user: dict) -> bool:
    return str(user.get("employeeId") or user.get("userId") or "") == "50041"


@router.get("")
def list_audit_trail(
    section: str | None = Query(default=None),
    actorId: str | None = Query(default=None),
    startDate: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    limit: int = Query(default=250, ge=1, le=1000),
    user=Depends(get_authenticated_user),
):
    if not _is_audit_admin(user):
        raise HTTPException(403, "Audit trail access is restricted to the configured administrator")
    query = {}
    if section:
        query["section"] = section
    if actorId:
        query["actorId"] = str(actorId).strip()
    created = {}
    for value, op in ((startDate, "$gte"), (endDate, "$lte")):
        if value:
            try:
                point = datetime.strptime(value, "%Y-%m-%d")
                if op == "$lte":
                    point += timedelta(days=1)
                created[op] = point
            except ValueError:
                raise HTTPException(400, "Dates must use YYYY-MM-DD")
    if created:
        query["createdOn"] = created
    items = list(audit_trail_collection.find(query).sort("createdOn", -1).limit(limit))
    for item in items:
        item["id"] = str(item.pop("_id"))
    sections = sorted(audit_trail_collection.distinct("section"))
    actors = []
    for item in employee_collection.find({}, {"userId": 1, "employeeId": 1, "name": 1}).sort("name", 1):
        employee_id = str(item.get("userId") or item.get("employeeId") or "").strip()
        if employee_id:
            actors.append({"employeeId": employee_id, "name": item.get("name") or employee_id})
    return {"items": items, "sections": sections, "actors": actors}
