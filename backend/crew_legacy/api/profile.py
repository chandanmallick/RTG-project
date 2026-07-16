from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from crew_legacy.admin_logic.auth_utils import get_current_user, hash_password, validate_password_policy, verify_password
from crew_legacy.database.database_mongo import (
    compensatory_off_collection,
    employee_collection,
    employee_daily_collection,
    roster_master_collection,
    training_nomination_history_collection,
)
from crew_legacy.security_utils import ensure_upload_allowed

router = APIRouter()

UPLOAD_FOLDER = Path(__file__).resolve().parents[2] / "uploads" / "profile"
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)


def _profile_photo_url(employee: dict, employee_id: str) -> str:
    stored = str(employee.get("profilePhoto") or "").strip()
    if stored.startswith("/api/crew/profile/photo/"):
        return stored

    filename = str(employee.get("profilePhotoFilename") or "").strip()
    if not filename and stored:
        filename = Path(stored.split("?", 1)[0]).name

    if not filename:
        return ""

    candidate = UPLOAD_FOLDER / filename
    if candidate.exists():
        version = int(candidate.stat().st_mtime)
    else:
        updated = employee.get("profilePhotoUpdatedOn")
        version = int(updated.timestamp()) if isinstance(updated, datetime) else int(datetime.utcnow().timestamp())

    return f"/api/crew/profile/photo/{employee_id}?v={version}"


def _latest_profile_file(employee_id: str) -> Path | None:
    latest = None
    for candidate in sorted(UPLOAD_FOLDER.glob(f"{employee_id}.*")):
        latest = candidate
    return latest


# -----------------------------
# 1. Profile (static info only)
# -----------------------------
@router.get("/profile/{employeeId}")
def get_profile(employeeId: str):
    employee = employee_collection.find_one({"userId": employeeId})

    if not employee:
        return {"error": "Employee not found"}

    return {
        "employeeId": employee.get("employeeId"),
        "name": employee.get("name"),
        "nameHindi": employee.get("nameHindi"),
        "designation": employee.get("designation"),
        "designationHindi": employee.get("designationHindi"),
        "department": employee.get("department") or employee.get("vertical"),
        "email": employee.get("gmail") or employee.get("email"),
        "gmail": employee.get("gmail") or employee.get("email"),
        "phone": employee.get("phone"),
        "profilePhoto": _profile_photo_url(employee, employeeId),
    }


@router.get("/photo/{employeeId}")
def get_profile_photo(employeeId: str):
    employee = employee_collection.find_one({"userId": employeeId}) or {}

    filename = str(employee.get("profilePhotoFilename") or "").strip()
    if not filename and employee.get("profilePhoto"):
        filename = Path(str(employee.get("profilePhoto")).split("?", 1)[0]).name

    candidate = UPLOAD_FOLDER / filename if filename else _latest_profile_file(employeeId)
    if not candidate or not candidate.exists():
        raise HTTPException(status_code=404, detail="Profile photo not found")

    return FileResponse(candidate)


# ---------------------------------
# 2. Monthly Duty Stats (dropdown)
# ---------------------------------
@router.get("/stats/duty")
def duty_stats(employeeId: str, year: int, month: int):
    pipeline = [
        {
            "$addFields": {
                "dateObj": {
                    "$dateFromString": {
                        "dateString": "$date"
                    }
                }
            }
        },
        {
            "$match": {
                "employeeId": employeeId,
                "$expr": {
                    "$and": [
                        {"$eq": [{"$year": "$dateObj"}, year]},
                        {"$eq": [{"$month": "$dateObj"}, month]}
                    ]
                }
            }
        },
        {
            "$group": {
                "_id": "$assignedDuty",
                "count": {"$sum": 1}
            }
        }
    ]

    stats = list(employee_daily_collection.aggregate(pipeline))

    return {
        "employeeId": employeeId,
        "year": year,
        "month": month,
        "stats": stats
    }


# ---------------------------------
# 3. Yearly Leave Stats
# ---------------------------------
@router.get("/stats/leave")
def leave_stats(employeeId: str, year: int):
    pipeline = [
        {
            "$addFields": {
                "dateObj": {
                    "$dateFromString": {
                        "dateString": "$date"
                    }
                }
            }
        },
        {
            "$match": {
                "employeeId": employeeId,
                "leaveStatus": "Approved",
                "$expr": {
                    "$eq": [
                        {"$year": "$dateObj"},
                        year
                    ]
                }
            }
        },
        {
            "$group": {
                "_id": "$leaveType",
                "count": {"$sum": 1}
            }
        }
    ]

    stats = list(employee_daily_collection.aggregate(pipeline))

    return {
        "employeeId": employeeId,
        "year": year,
        "stats": stats
    }


# ---------------------------------
# 4. Training Stats by Financial Year
# ---------------------------------
@router.get("/stats/training")
def training_stats(
    employeeId: str,
    financialYear: str = Query(...),
):
    stats = list(
        training_nomination_history_collection.aggregate([
            {
                "$match": {
                    "employeeId": employeeId,
                    "status": "Approved",
                    "financialYear": financialYear
                }
            },
            {
                "$group": {
                    "_id": "$trainingName",
                    "count": {"$sum": 1}
                }
            }
        ])
    )

    return {"financialYear": financialYear, "stats": stats}


# ---------------------------------
# 5. Profile Update
# ---------------------------------
@router.post("/update")
async def update_profile(
    employeeId: str = Form(...),
    name: str = Form(""),
    nameHindi: str = Form(""),
    designation: str = Form(""),
    designationHindi: str = Form(""),
    phone: str = Form(""),
    gmail: str = Form(""),
    photo: UploadFile = File(None),
    user=Depends(get_current_user),
):
    if user.get("role") != "admin" and user.get("employeeId") != employeeId:
        raise HTTPException(status_code=403, detail="Access denied")

    update_data = {
        "name": name,
        "nameHindi": nameHindi,
        "designation": designation,
        "designationHindi": designationHindi,
        "phone": phone,
        "gmail": gmail,
    }

    if photo:
        content = ensure_upload_allowed(
            photo,
            allowed_content_types={"image/jpeg", "image/png", "image/webp"},
            allowed_extensions={"jpg", "jpeg", "png", "webp"},
            max_bytes=2 * 1024 * 1024,
        )

        extension = Path(photo.filename or "profile.jpg").suffix.lower()
        if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
            extension = ".jpg"

        filename = f"{employeeId}{extension}"
        filepath = UPLOAD_FOLDER / filename

        with open(filepath, "wb") as buffer:
            buffer.write(content)

        updated_on = datetime.utcnow()
        update_data["profilePhotoFilename"] = filename
        update_data["profilePhotoUpdatedOn"] = updated_on
        update_data["profilePhoto"] = f"/api/crew/profile/photo/{employeeId}?v={int(updated_on.timestamp())}"

    employee_collection.update_one(
        {"userId": employeeId},
        {"$set": update_data},
    )

    employee = employee_collection.find_one({"userId": employeeId}) or {}

    return {
        "employeeId": employee.get("employeeId"),
        "name": employee.get("name"),
        "nameHindi": employee.get("nameHindi"),
        "designation": employee.get("designation"),
        "designationHindi": employee.get("designationHindi"),
        "phone": employee.get("phone"),
        "email": employee.get("gmail") or employee.get("email"),
        "gmail": employee.get("gmail") or employee.get("email"),
        "profilePhoto": _profile_photo_url(employee, employeeId),
    }


@router.post("/change-password")
async def change_password(
    employeeId: str = Form(...),
    currentPassword: str = Form(""),
    newPassword: str = Form(...),
    confirmPassword: str = Form(...),
    user=Depends(get_current_user),
):
    if user.get("role") != "admin" and user.get("employeeId") != employeeId:
        raise HTTPException(status_code=403, detail="Access denied")

    if newPassword != confirmPassword:
        raise HTTPException(status_code=400, detail="New password and confirm password do not match")

    validate_password_policy(newPassword)

    employee = employee_collection.find_one({"userId": employeeId})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    if user.get("role") != "admin":
        stored_password = str(employee.get("password") or "")
        if not currentPassword:
            raise HTTPException(status_code=400, detail="Current password is required")
        if not verify_password(currentPassword, stored_password):
            raise HTTPException(status_code=400, detail="Current password is incorrect")

    employee_collection.update_one(
        {"_id": employee["_id"]},
        {"$set": {"password": hash_password(newPassword)}},
    )

    return {"message": "Password changed successfully"}


###########################################
#### C-OFF Collection #############
###########################################

@router.get("/stats/coff")
def get_coff_stats(employeeId: str):
    records = list(compensatory_off_collection.find({
        "employeeId": employeeId
    }))

    total = len(records)
    used = len([r for r in records if r.get("status") == "Used"])
    available = len([r for r in records if r.get("status") == "Available"])

    return {
        "summary": {
            "total": total,
            "used": used,
            "available": available
        },
        "details": [
            {
                "earnedDate": r.get("earnedDate"),
                "expiryDate": r.get("expiryDate"),
                "usedDate": r.get("usedDate"),
                "status": r.get("status"),
                "reason": r.get("reason")
            }
            for r in records
        ]
    }
