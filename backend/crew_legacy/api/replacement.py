from fastapi import APIRouter, HTTPException, Depends, Query
from bson import ObjectId
from crew_legacy.admin_logic.auth_utils import check_replacement_access, get_current_user
from datetime import datetime, timedelta
from typing import Optional
from crew_legacy.admin_logic.notification_service import notify_all

import pytz

IST = pytz.timezone("Asia/Kolkata")


from crew_legacy.database.database_mongo import (
    leave_request_collection,
    employee_daily_collection,
    employee_collection,
    compensatory_off_collection,
    duty_denial_collection,
    duty_notification_collection
)

router = APIRouter()

def calculate_expiry(earned_date_str):
    from datetime import datetime

    earned = datetime.strptime(earned_date_str, "%Y-%m-%d")

    next_year = earned.year + 1

    return f"{next_year}-03-31"



import smtplib
from email.mime.text import MIMEText

EMAIL = "erldccroomcrew@gmail.com"
PASSWORD = "yfwj mqbg geiz vltv"


# =========================================================
# GET LEAVES REQUIRING REPLACEMENT
# =========================================================
@router.get("/pending")
def pending_replacements(user=Depends(get_current_user)):

    check_replacement_access(user)

    leaves = list(
        leave_request_collection.find({
            "finalStatus": "Approved",
            "replacementRequired": True,
            "replacement": None
        })
    )

    result = []

    for l in leaves:

        leave_date = l.get("date")

        # =============================
        # GET DAILY RECORD
        # =============================
        duty = employee_daily_collection.find_one({
            "employeeId": l["employeeId"],
            "date": leave_date
        })

        is_sic_flag = duty.get("isSIC", False) if duty else False

        # =============================
        # DATE LOGIC (FIXED POSITION)
        # =============================
        dt = datetime.strptime(leave_date, "%Y-%m-%d")
        weekday = dt.strftime("%A")

        next_day = (dt + timedelta(days=1)).strftime("%Y-%m-%d")

        next_day_record = employee_daily_collection.find_one({
            "employeeId": l["employeeId"],
            "date": next_day
        })

        next_day_is_holiday = (
            next_day_record and next_day_record.get("isHoliday") == "Y"
        )

        is_friday = weekday == "Friday"

        # =============================
        # RESPONSE
        # =============================
        result.append({
            "id": str(l["_id"]),
            "employeeId": l["employeeId"],
            "name": l["name"],
            "groupName": l.get("groupName"),
            "leaveType": l.get("leaveType"),
            "date": leave_date,
            "isSIC": is_sic_flag,

            # ðŸ”¥ NEW FIELDS
            "isFriday": is_friday,
            "nextDayHoliday": next_day_is_holiday
        })

    return result


# =========================================================
# GET REPLACEMENT CANDIDATES
# =========================================================

from datetime import datetime, timedelta

# =========================================================
# GET REPLACEMENT CANDIDATES (ADVANCED LOGIC)
# =========================================================

@router.get("/candidates/{leave_id}")
def replacement_candidates(leave_id: str, user=Depends(get_current_user)):

    check_replacement_access(user)

    leave = leave_request_collection.find_one({"_id": ObjectId(leave_id)})

    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

    leave_date = leave.get("date")
    is_sic = leave.get("isSIC", False)

    # ðŸ”¥ DATE RANGE (LAST 90 DAYS)
    today = datetime.utcnow()
    last_90_days_date = today - timedelta(days=90)
    last_90_days_str = last_90_days_date.strftime("%Y-%m-%d")

    result = []

    # ==========================================
    # GET CANDIDATES
    # ==========================================
    candidates = list(employee_collection.find({
        "$or": [
            {"dutyType": "Replacement"},
            {"isIC": True}
        ]
    }))

    for c in candidates:

        candidate_id = c.get("userId")
        if not candidate_id:
            continue

        category = (c.get("category") or "").lower()

        # ==========================================
        # ROLE FILTER (SIC / SHIFT ENGINEER)
        # ==========================================
        if is_sic:
            if "sic" not in category:
                continue
        else:
            if "shift engineer" not in category:
                continue

        # ==========================================
        # SKIP IF ON LEAVE
        # ==========================================
        duty = employee_daily_collection.find_one({
            "employeeId": candidate_id,
            "date": leave_date
        })

        if duty and duty.get("leaveStatus") == "Approved":
            continue

        # ==========================================
        # REPLACEMENT COUNT (LAST 90 DAYS)
        # ==========================================
        replacement_count = employee_daily_collection.count_documents({
            "employeeId": candidate_id,
            "replacementDuty": True,
            "date": {"$gte": last_90_days_str}
        })

        # ==========================================
        # DENIAL COUNT (LAST 90 DAYS)
        # ==========================================
        denial_count = duty_denial_collection.count_documents({
            "employeeId": candidate_id,
            "createdAt": {"$gte": last_90_days_date}
        })

        # ==========================================
        # NO DUTY IN LAST 90 DAYS
        # ==========================================
        last_duty = employee_daily_collection.find_one({
            "employeeId": candidate_id,
            "date": {"$gte": last_90_days_str}
        })

        no_duty_90 = last_duty is None

        # ==========================================
        # WEIGHT CALCULATION
        # ==========================================
        score = 0

        # Less replacement â†’ better
        score += replacement_count * 2

        # More denial â†’ higher priority
        score -= denial_count * 3

        # No duty â†’ highest priority boost
        if no_duty_90:
            score -= 10

        # ==========================================
        # APPEND RESULT
        # ==========================================
        result.append({
            "employeeId": candidate_id,
            "name": c.get("name"),
            "designation": c.get("designation"),
            "category": c.get("category"),

            "replacementCount90Days": replacement_count,
            "denialCount90Days": denial_count,
            "noDuty90Days": no_duty_90,

            "score": score,
            "isSIC": is_sic,
            "source": "replacement",

            "groupName": leave.get("groupName")
        })

    # ==========================================
    # SHIFT STAFF (LOW PRIORITY)
    # ==========================================
    shift_people = list(employee_daily_collection.find({
        "date": leave_date,
        "assignedDuty": {"$in": ["Morning", "Evening", "Night"]},
        "leaveStatus": {"$ne": "Approved"}
    }))

    existing_ids = {r["employeeId"] for r in result}

    for s in shift_people:

        candidate_id = s.get("employeeId")

        if not candidate_id or candidate_id in existing_ids:
            continue

        if candidate_id == leave.get("employeeId"):
            continue

        result.append({
            "employeeId": candidate_id,
            "name": s.get("name"),
            "designation": s.get("designation"),
            "category": "Shift Staff",

            "replacementCount90Days": 999,
            "denialCount90Days": 0,
            "noDuty90Days": False,

            "score": 999,  # lowest priority
            "isSIC": False,
            "source": "shift",

            "groupName": s.get("groupName")
        })

    # ==========================================
    # FINAL SORT
    # ==========================================
    result.sort(key=lambda x: x["score"])

    return result

# =========================================================
# ASSIGN REPLACEMENT
# =========================================================

@router.put("/assign/{leave_id}")
def assign_replacement(leave_id: str, payload: dict, user=Depends(get_current_user)):

    check_replacement_access(user)

    replacement_id = payload.get("replacementEmployeeId")
    mode = payload.get("mode", "normal")
    half_duty = payload.get("halfDuty", False)   # âœ… FIXED

    leave = leave_request_collection.find_one({
        "_id": ObjectId(leave_id)
    })

    if not leave:
        raise HTTPException(404, "Leave not found")

    # =============================
    # GET REPLACEMENT EMPLOYEE
    # =============================
    replacement_emp = employee_collection.find_one({
        "userId": replacement_id
    })

    if not replacement_emp:
        daily_emp = employee_daily_collection.find_one({
            "employeeId": replacement_id,
            "date": leave["date"]
        })

        if not daily_emp:
            raise HTTPException(404, "Employee not found")

        replacement_emp = {
            "userId": daily_emp["employeeId"],
            "name": daily_emp["name"],
            "designation": daily_emp["designation"]
        }

    leave_date = leave["date"]

    # =============================
    # UPDATE LEAVE
    # =============================
    leave_request_collection.update_one(
        {"_id": ObjectId(leave_id)},
        {
            "$set": {
                "replacement": {
                    "employeeId": replacement_emp["userId"],
                    "name": replacement_emp["name"],
                    "assignedOn": datetime.utcnow(),
                    "mode": mode
                }
            }
        }
    )

    # =============================
    # REPLACEMENT DAILY ENTRY
    # =============================
    existing_daily = employee_daily_collection.find_one({
        "employeeId": replacement_emp["userId"],
        "date": leave_date
    })

    update_data = {
        "replacementDuty": True,
        "replacementMode": mode,
        "halfDuty": half_duty,   # âœ… STORE

        "replacementFor": {
            "employeeId": leave["employeeId"],
            "name": leave["name"]
        },

        "groupName": leave.get("groupName"),
        "name": replacement_emp.get("name"),
        "designation": replacement_emp.get("designation"),
    }

    leave_daily = employee_daily_collection.find_one({
        "employeeId": leave["employeeId"],
        "date": leave_date
    })

    roster_id = leave_daily.get("rosterId") if leave_daily else None

    assigned_duty = leave_daily.get("assignedDuty") if leave_daily else None

    update_data["assignedDuty"] = assigned_duty
    if roster_id:
        update_data["rosterId"] = roster_id

    employee_daily_collection.update_one(
        {
            "employeeId": replacement_emp["userId"],
            "date": leave_date,
        },
        {
            "$set": update_data
        },
        upsert=True
    )

    # =============================================
    # FETCH DATA (AFTER UPDATE)
    # =============================================

    daily_record = employee_daily_collection.find_one({
        "employeeId": replacement_emp["userId"],
        "date": leave_date
    })

    assigned_duty = daily_record.get("assignedDuty") if daily_record else None

    if not assigned_duty:
        assigned_duty = leave.get("assignedDuty")   # âœ… FIX

    is_holiday = daily_record.get("isHoliday") == "Y" if daily_record else False

    emp_master = employee_collection.find_one({
        "userId": replacement_emp["userId"]
    })

    duty_type = (emp_master.get("dutyType") if emp_master else "Regular").lower()

    dt = datetime.strptime(leave_date, "%Y-%m-%d")
    weekday = dt.strftime("%A")

    # âœ… NOW READ FROM DB
    half_duty = daily_record.get("halfDuty", False) if daily_record else False

    eligible = False
    reason = None

    # =============================================
    # RULE SET
    # =============================================

    if duty_type == "replacement":

        if mode == "double":
            eligible = True
            reason = "Double Duty"

        elif is_holiday:
            eligible = True
            reason = "Holiday Duty"

        elif weekday == "Friday" and assigned_duty == "Night":
            eligible = True
            reason = "Friday Night Shift"

        elif weekday in ["Saturday", "Sunday"] and assigned_duty in ["Morning", "Evening", "Night"]:
            eligible = True
            reason = "Weekend Duty"

    else:

        if mode == "double":
            eligible = True
            reason = "Double Duty"

        elif weekday == "Friday" and assigned_duty == "Night":

            next_day = (dt + timedelta(days=1)).strftime("%Y-%m-%d")

            next_day_record = employee_daily_collection.find_one({
                "employeeId": replacement_emp["userId"],
                "date": next_day
            })

            next_day_is_holiday = next_day_record and next_day_record.get("isHoliday") == "Y"

            if next_day_is_holiday and half_duty:
                eligible = True
                reason = "Friday Night + Holiday Half Duty"

    # =============================================
    # INSERT COMP-OFF
    # =============================================

    if eligible:

        existing = compensatory_off_collection.find_one({
            "employeeId": replacement_emp["userId"],
            "earnedDate": leave_date,
            "reference.type": {"$in": ["Roster", "Replacement"]}
        })

        if not existing:

            expiry = calculate_expiry(leave_date)

            compensatory_off_collection.insert_one({
                "employeeId": replacement_emp["userId"],
                "employeeName": replacement_emp.get("name"),
                "designation": replacement_emp.get("designation"),

                "earnedDate": leave_date,
                "expiryDate": expiry,
                "status": "Available",

                "reason": reason,
                "dutyType": duty_type,

                "reference": {
                    "type": "Replacement",
                    "leaveRequestId": str(leave["_id"])
                },

                "createdOn": datetime.utcnow()
            })

    # =============================
    # UPDATE LEAVE PERSON DAILY
    # =============================
    employee_daily_collection.update_one(
        {
            "employeeId": leave["employeeId"],
            "date": leave_date
        },
        {
            "$set": {
                "leaveStatus": "Approved",
                "replacementAssigned": True
            }
        }
    )

    # return {"message": "Replacement processed successfully"}

    # =============================
    # SEND EMAIL
    # =============================

    leave_emp_email = leave.get("gmail")
    replacement_email = replacement_emp.get("gmail")
    # ADMIN_EMAIL = "admin@company.com"
    TEST_EMAIL = "chandan.mallick@erldc.onmicrosoft.com"   # ðŸ”¥ for testing

    ENABLE_TEST_EMAIL = True   # ðŸ”¥ turn ON/OFF easily

    # ðŸ”¥ GET SIC (if exists)
    sic_record = employee_daily_collection.find_one({
        "date": leave_date,
        "groupName": leave.get("groupName"),
        "isActingSIC": True
    })

    sic_email = None
    if sic_record:
        sic_emp = employee_collection.find_one({
            "userId": sic_record["employeeId"]
        })
        if sic_emp:
            sic_email = sic_emp.get("gmail")

    # ðŸ”¥ COLLECT EMAILS
    email_list = []

    # âœ… Always include test email (if enabled)
    if ENABLE_TEST_EMAIL:
        email_list.append(TEST_EMAIL)

    # âœ… Leave employee
    leave_emp_email = leave.get("gmail")
    if leave_emp_email:
        email_list.append(leave_emp_email)

    # âœ… Replacement employee
    replacement_email = replacement_emp.get("gmail")
    if replacement_email:
        email_list.append(replacement_email)

    # âœ… SIC email
    if sic_email:
        email_list.append(sic_email)

    # âœ… ADMIN (always notified)
    # email_list.append(ADMIN_EMAIL)

    # âœ… DIC (future field)
    # dic_email = leave.get("reportingOfficerEmail")  # ðŸ”¥ future ready
    # if dic_email:
    #     email_list.append(dic_email)

    # âœ… REMOVE DUPLICATES
    email_list = list(set(email_list))

    print("Final Email List:", email_list)

    # ðŸ”¥ EMAIL CONTENT
    subject = f"Duty Assignment Notification - {assigned_duty} | {leave_date}"

    body = f"""
    Duty Assignment Notification

    Date: {leave_date}
    Group: {leave.get("groupName")}

    ----------------------------------------
    Leave Employee:
    {leave.get("name")}

    Replacement Employee:
    {replacement_emp.get("name")}

    ----------------------------------------
    Duty Details:

    Shift (Duty Type): {assigned_duty}
    Assignment Mode: {mode}

    ----------------------------------------
    Additional Info:

    Comp-Off Eligible: {"Yes" if eligible else "No"}
    Reason: {reason if reason else "N/A"}

    ----------------------------------------

    Please check your duty schedule.

    - Crew Management System
    """

    # ðŸ”¥ SEND EMAIL
    if email_list:
        notify_all(
            email_list=email_list,
            employee_ids=[
                leave["employeeId"],
                replacement_emp["userId"]
            ],
            subject=f"Duty Assigned: {assigned_duty}",
            message=f"""
        Replacement Assigned

        Date: {leave_date}
        Group: {leave.get("groupName")}

        Leave: {leave.get("name")}
        Replacement: {replacement_emp.get("name")}

        Duty: {assigned_duty}
        Mode: {mode}
        """
        )


    
    # =============================
    # CREATE DUTY NOTIFICATION
    # =============================

    leave_date_obj = datetime.strptime(leave_date, "%Y-%m-%d")

    cutoff = IST.localize(
        leave_date_obj - timedelta(days=2)
    ).replace(hour=16, minute=0, second=0)

    duty_notification_collection.insert_one({
        "employeeId": replacement_emp["userId"],
        "leaveId": str(leave["_id"]),
        "date": leave_date,
        "groupName": leave.get("groupName"),
        "assignedDuty": assigned_duty,

        "status": "Pending",
        "reason": None,

        "cutoffTime": cutoff,

        "createdAt": datetime.utcnow(),
        "updatedAt": None
    })

    # =============================
    # FINAL RETURN
    # =============================
    return {"message": "Replacement processed successfully"}

# =========================================================
# REPLACEMENT HISTORY
# =========================================================

@router.get("/history")
def replacement_history(
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    employeeId: Optional[str] = Query(None)
):

    query = {
        "replacement.employeeId": {"$exists": True}
    }

    if startDate or endDate:

        date_filter = {}

        if startDate:
            date_filter["$gte"] = startDate

        if endDate:
            date_filter["$lte"] = endDate

        query["date"] = date_filter

    if employeeId:
        query["replacement.employeeId"] = employeeId

    leaves = leave_request_collection.find(query)

    results = []

    for leave in leaves:

        replacement_emp_id = leave.get("replacement", {}).get("employeeId")

        replacement_emp = employee_collection.find_one(
            {"userId": replacement_emp_id}
        )

        results.append({

            "date": leave.get("date"),
            "employeeName": replacement_emp.get("name") if replacement_emp else "",
            "replacedEmployee": leave.get("name"),
            "groupName": leave.get("groupName"),
            "leaveType": leave.get("leaveType")

        })

    return results


# =========================================================
# ASSIGN SIC
# =========================================================

@router.put("/assign-sic/{leave_id}")
def assign_sic(leave_id: str, payload: dict):

    sic_id = payload.get("sicEmployeeId")

    leave = leave_request_collection.find_one({
        "_id": ObjectId(leave_id)
    })

    if not leave:
        raise HTTPException(404, "Leave not found")

    leave_date = leave.get("date")
    group_name = leave.get("groupName")

    # =============================
    # VALIDATION
    # =============================

    sic_daily = employee_daily_collection.find_one({
        "employeeId": sic_id,
        "date": leave_date
    })

    if not sic_daily:
        raise HTTPException(400, "SIC must be from same day")

    if sic_daily.get("groupName") != group_name:
        raise HTTPException(400, "SIC must be from same group")

    # if sic_daily.get("assignedDuty") not in ["Morning", "Evening", "Night"]:
    #     raise HTTPException(400, "SIC must be on active shift")

    if sic_daily.get("leaveStatus") == "Approved":
        raise HTTPException(400, "Cannot assign SIC from leave")

    # =============================
    # GET EMPLOYEE MASTER
    # =============================

    sic_emp = employee_collection.find_one({
        "userId": sic_id
    })

    if not sic_emp:
        raise HTTPException(404, "Employee not found")

    # =============================
    # 1ï¸âƒ£ REMOVE OLD SIC
    # =============================

    employee_daily_collection.update_many(
        {
            "date": leave_date,
            "groupName": group_name
        },
        {
            "$unset": {
                "sic": "",
                "isActingSIC": ""
            }
        }
    )

    # =============================
    # 2ï¸âƒ£ APPLY SIC TO SHIFT STAFF ONLY
    # =============================

    employee_daily_collection.update_many(
        {
            "date": leave_date,
            "groupName": group_name,
            # "assignedDuty": {"$in": ["Morning", "Evening", "Night"]},
            "leaveStatus": {"$ne": "Approved"}
        },
        {
            "$set": {
                "sic": {
                    "employeeId": sic_emp["userId"],
                    "name": sic_emp["name"],
                    "designation": sic_emp["designation"],
                    "type": "temporary"
                }
            }
        }
    )

    # =============================
    # 3ï¸âƒ£ MARK ACTING SIC
    # =============================

    employee_daily_collection.update_one(
        {
            "employeeId": sic_emp["userId"],
            "date": leave_date
        },
        {
            "$set": {
                "isActingSIC": True
            }
        }
    )

    return {"message": "Temporary SIC assigned successfully"}


# =========================================================
# GET SIC CANDIDATES
# =========================================================

@router.get("/sic-candidates/{leave_id}")
def get_sic_candidates(leave_id: str, user=Depends(get_current_user)):

    check_replacement_access(user)

    leave = leave_request_collection.find_one({
        "_id": ObjectId(leave_id)
    })

    if not leave:
        raise HTTPException(404, "Leave not found")

    leave_date = leave.get("date")
    group_name = leave.get("groupName")

    shift_people = list(employee_daily_collection.find({
        "date": leave_date,
        "groupName": group_name,

        # âœ… only active shift
        # "assignedDuty": {"$in": ["Morning", "Evening", "Night"]},

        # â— exclude leave person
        "employeeId": {"$ne": leave.get("employeeId")},

        # âœ… include normal + replacement
        # "leaveStatus": {"$ne": "Approved"}
    }))

    result = []

    for s in shift_people:
        result.append({
            "employeeId": s.get("employeeId"),
            "name": s.get("name"),
            "designation": s.get("designation"),
            "assignedDuty": s.get("assignedDuty"),
            "isReplacement": s.get("replacementDuty", False)
        })

    return result


# =========================================================
# PENDING SIC LIST
# =========================================================

@router.get("/pending-sic")
def pending_sic(user=Depends(get_current_user)):

    check_replacement_access(user)

    leaves = list(leave_request_collection.find({
        "finalStatus": "Approved",
        "replacement.employeeId": {"$exists": True}
    }))

    result = []

    for l in leaves:

        duty = employee_daily_collection.find_one({
            "employeeId": l["employeeId"],
            "date": l.get("date")
        })

        # â— only if SIC required
        if not duty or not duty.get("isSIC"):
            continue

        # â— skip if already assigned
        existing_sic = employee_daily_collection.find_one({
            "date": l["date"],
            "groupName": l["groupName"],
            "isActingSIC": True
        })

        if existing_sic:
            continue

        result.append({
            "id": str(l["_id"]),
            "employeeId": l["employeeId"],
            "name": l["name"],
            "groupName": l.get("groupName"),
            "date": l.get("date"),
            "leaveType": l.get("leaveType")
        })

    return result


@router.get("/notifications")
def get_notifications(user=Depends(get_current_user)):

    user_id = user.get("userId")
    now = datetime.now(IST)

    data = list(duty_notification_collection.find({
        "employeeId": user_id
    }))

    result = []

    for n in data:

        cutoff = n.get("cutoffTime")

        # ðŸ”¥ AUTO ACCEPT AFTER CUT-OFF
        if cutoff and now > cutoff and n["status"] == "Pending":
            duty_notification_collection.update_one(
                {"_id": n["_id"]},
                {"$set": {"status": "Accepted"}}
            )
            n["status"] = "Accepted"

        n["_id"] = str(n["_id"])

        # ðŸ”¥ FLAG FOR FRONTEND
        n["canDeny"] = cutoff and now <= cutoff

        result.append(n)

    return result


@router.put("/notifications/accept/{id}")
def accept_duty(id: str):

    duty_notification_collection.update_one(
        {"_id": ObjectId(id)},
        {"$set": {
            "status": "Accepted",
            "updatedAt": datetime.utcnow()
        }}
    )

    return {"message": "Accepted"}



@router.put("/notifications/deny/{id}")
def deny_duty(id: str, payload: dict):

    notif = duty_notification_collection.find_one({
        "_id": ObjectId(id)
    })

    if not notif:
        raise HTTPException(404, "Notification not found")

    now = datetime.now(IST)

    # ðŸ”¥ BLOCK AFTER CUT-OFF
    if notif.get("cutoffTime") and now > notif["cutoffTime"]:
        raise HTTPException(400, "Denial time expired (after D-2 4PM)")

    duty_notification_collection.update_one(
        {"_id": ObjectId(id)},
        {"$set": {
            "status": "Denied",
            "reason": payload.get("reason"),
            "updatedAt": datetime.utcnow()
        }}
    )

    # ðŸ”¥ STORE DENIAL
    duty_denial_collection.insert_one({
        "employeeId": notif.get("employeeId"),
        "date": notif.get("date"),
        "reason": payload.get("reason"),
        "createdAt": datetime.utcnow()
    })

    return {"message": "Denied"}
