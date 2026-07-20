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


def normalized_categories(value):
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value in [None, ""]:
        return []
    return [str(value).strip()]


def category_matches(category_value, keyword: str) -> bool:
    target = str(keyword or "").strip().lower()
    return any(target in item.lower() for item in normalized_categories(category_value))


def employee_id_sort_key(value):
    text = str(value or "").strip()
    return (0, int(text)) if text.isdigit() else (1, text.lower())


def date_difference_days(later_date: str, earlier_date: str):
    if not later_date or not earlier_date:
        return None
    try:
        return (datetime.strptime(later_date, "%Y-%m-%d") - datetime.strptime(earlier_date, "%Y-%m-%d")).days
    except (TypeError, ValueError):
        return None


def utc_naive(value):
    if not isinstance(value, datetime):
        return value
    if value.tzinfo is not None:
        return value.astimezone(pytz.UTC).replace(tzinfo=None)
    return value


def controlling_officer_ids(employee_id: str, duty_date: str = "", group_name: str = ""):
    employee = employee_collection.find_one(
        {"userId": employee_id},
        {"reportingOfficerIds": 1, "reportingOfficerId": 1, "functionIds": 1, "manualFunctionIds": 1},
    ) or {}
    try:
        from crew_legacy.api.admin_api import resolve_employee_organization
        resolved = resolve_employee_organization(
            employee.get("manualFunctionIds", employee.get("functionIds")),
            employee_id,
        )
        values = (
            resolved.get("reportingOfficerIds")
            or [resolved.get("intermediaryReportingId"), resolved.get("hodId")]
        )
    except Exception:
        values = normalized_categories(
            employee.get("reportingOfficerIds") or employee.get("reportingOfficerId")
        )
    values = [value for value in values if value]
    if duty_date and group_name:
        shift_controllers = employee_daily_collection.find({
            "date": duty_date,
            "groupName": group_name,
            "$or": [{"isActingSIC": True}, {"isSIC": True}],
        }, {"employeeId": 1})
        values.extend(
            record.get("employeeId") for record in shift_controllers
            if record.get("employeeId")
        )
    return [value for value in dict.fromkeys(values) if value and value != employee_id]


def auto_accept_pending_duty_notifications():
    now = datetime.utcnow()
    result = duty_notification_collection.update_many(
        {
            "status": "Pending",
            "cutoffTime": {"$lte": now},
        },
        {
            "$set": {
                "status": "Accepted",
                "decision": "Auto accepted at 16:00 cutoff",
                "autoAccepted": True,
                "updatedAt": now,
            },
            "$push": {
                "decisionHistory": {
                    "action": "AutoAccepted",
                    "actedBy": "SYSTEM",
                    "actorRole": "System",
                    "actedAt": now,
                }
            },
        },
    )
    return result.modified_count


def release_replacement_assignment(leave, reason: str, acted_by: str, actor_role: str):
    replacement = leave.get("replacement") or {}
    replacement_id = replacement.get("employeeId")
    leave_date = leave.get("date")
    if not replacement_id or not leave_date:
        return

    consumed_credit = compensatory_off_collection.find_one({
        "employeeId": replacement_id,
        "reference.leaveRequestId": str(leave["_id"]),
        "status": {"$in": ["Reserved", "Used"]},
    })
    if consumed_credit:
        raise HTTPException(409, "Assignment cannot be changed because its C-OFF credit is reserved or used")

    compensatory_off_collection.delete_many({
        "employeeId": replacement_id,
        "reference.leaveRequestId": str(leave["_id"]),
        "status": "Available",
    })

    daily = employee_daily_collection.find_one({
        "employeeId": replacement_id,
        "date": leave_date,
    }) or {}
    original = daily.get("replacementOriginal") or {}
    created_by_replacement = bool(
        daily.get("replacementCreatedDaily")
        or (
            daily.get("replacementDuty")
            and not original
            and not daily.get("attachedRosterId")
            and not daily.get("isFinalRoster")
            and not daily.get("rosterVersion")
        )
    )
    if created_by_replacement:
        employee_daily_collection.delete_one({"_id": daily["_id"]})
    else:
        restore = {}
        unset = {
            "replacementDuty": "",
            "replacementMode": "",
            "halfDuty": "",
            "replacementFor": "",
            "replacementOriginal": "",
            "replacementCreatedDaily": "",
        }
        for field in ("assignedDuty", "groupName", "rosterId"):
            if field in original:
                restore[field] = original[field]
            elif field == "rosterId":
                unset[field] = ""
        update = {"$unset": unset}
        if restore:
            update["$set"] = restore
        employee_daily_collection.update_one({"_id": daily.get("_id")}, update)

    now = datetime.utcnow()
    audit = {
        **replacement,
        "releasedOn": now,
        "releaseReason": reason,
        "releasedBy": acted_by,
        "releasedByRole": actor_role,
    }
    leave_request_collection.update_one(
        {"_id": leave["_id"]},
        {
            "$set": {"replacement": None, "replacementAssigned": False},
            "$push": {"replacementAssignmentHistory": audit},
        },
    )
    employee_daily_collection.update_one(
        {"employeeId": leave.get("employeeId"), "date": leave_date},
        {"$set": {"replacementAssigned": False}},
    )


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


@router.get("/assigned")
def assigned_replacements(user=Depends(get_current_user)):
    check_replacement_access(user)
    leaves = leave_request_collection.find({
        "finalStatus": "Approved",
        "replacement.employeeId": {"$exists": True, "$ne": None},
    }).sort([("date", 1), ("replacement.assignedOn", -1)])
    result = []
    for leave in leaves:
        replacement = leave.get("replacement") or {}
        notification = duty_notification_collection.find_one(
            {
                "leaveId": str(leave["_id"]),
                "employeeId": replacement.get("employeeId"),
                "status": {"$ne": "Superseded"},
            },
            sort=[("createdAt", -1)],
        ) or {}
        leave_daily = employee_daily_collection.find_one({
            "employeeId": leave.get("employeeId"),
            "date": leave.get("date"),
        }) or {}
        result.append({
            "id": str(leave["_id"]),
            "employeeId": leave.get("employeeId"),
            "name": leave.get("name"),
            "groupName": leave.get("groupName"),
            "leaveType": leave.get("leaveType"),
            "date": leave.get("date"),
            "assignedDuty": leave_daily.get("assignedDuty") or leave.get("assignedDuty"),
            "replacement": {
                "employeeId": replacement.get("employeeId"),
                "name": replacement.get("name"),
                "mode": replacement.get("mode"),
                "assignedOn": replacement.get("assignedOn"),
            },
            "notificationStatus": notification.get("status") or "Not recorded",
            "canChange": notification.get("status") not in {"Denied", "Superseded"},
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
def replacement_candidates(
    leave_id: str,
    roleFilter: str = Query("auto"),
    user=Depends(get_current_user),
):

    check_replacement_access(user)

    leave = leave_request_collection.find_one({"_id": ObjectId(leave_id)})

    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

    leave_date = leave.get("date")
    is_sic = leave.get("isSIC", False)
    leave_daily = employee_daily_collection.find_one({
        "employeeId": leave.get("employeeId"),
        "date": leave_date,
    }) or {}
    is_sic = bool(leave_daily.get("isSIC", is_sic))
    required_duty = leave_daily.get("assignedDuty") or leave.get("assignedDuty") or ""
    next_date = (
        datetime.strptime(leave_date, "%Y-%m-%d") + timedelta(days=1)
    ).strftime("%Y-%m-%d")

    # ðŸ”¥ DATE RANGE (LAST 90 DAYS)
    today = datetime.utcnow()
    last_90_days_date = today - timedelta(days=90)
    last_90_days_str = last_90_days_date.strftime("%Y-%m-%d")

    result = []
    effective_role_filter = (roleFilter or "auto").strip().lower()
    if effective_role_filter == "auto":
        effective_role_filter = "sic" if is_sic else "shift_engineer"

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

        category = normalized_categories(c.get("category"))

        # ==========================================
        # ROLE FILTER (SIC / SHIFT ENGINEER)
        # ==========================================
        if effective_role_filter == "sic" and not category_matches(category, "sic"):
            continue
        if effective_role_filter == "shift_engineer" and not category_matches(category, "shift engineer"):
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
        total_denial_count = duty_denial_collection.count_documents({
            "employeeId": candidate_id,
        })

        # Use the last occurrence of the duty being replaced as the transparent
        # fairness basis for replacement-tagged employees.
        last_matching_duty = employee_daily_collection.find_one({
            "employeeId": candidate_id,
            "assignedDuty": required_duty,
            "date": {"$lt": leave_date},
        }, sort=[("date", -1)])
        last_matching_duty_date = (
            last_matching_duty.get("date") if last_matching_duty else ""
        )
        days_since_matching_duty = date_difference_days(
            leave_date, last_matching_duty_date
        )

        # ==========================================
        # APPEND RESULT
        # ==========================================
        result.append({
            "employeeId": candidate_id,
            "name": c.get("name"),
            "designation": c.get("designation"),
            "category": category,

            "replacementCount90Days": replacement_count,
            "denialCount90Days": denial_count,
            "denialCount": total_denial_count,
            "requiredDuty": required_duty,
            "lastMatchingDutyDate": last_matching_duty_date,
            "daysSinceMatchingDuty": days_since_matching_duty,
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
    }).sort([("groupName", 1), ("employeeId", 1)]))

    existing_ids = {r["employeeId"] for r in result}

    for s in shift_people:

        candidate_id = s.get("employeeId")

        if not candidate_id or candidate_id in existing_ids:
            continue

        if candidate_id == leave.get("employeeId"):
            continue

        employee_master = employee_collection.find_one(
            {"userId": candidate_id},
            {"category": 1},
        ) or {}
        category = normalized_categories(employee_master.get("category"))
        if effective_role_filter == "sic" and not category_matches(category, "sic"):
            continue
        if effective_role_filter == "shift_engineer" and not category_matches(category, "shift engineer"):
            continue

        next_day_record = employee_daily_collection.find_one({
            "employeeId": candidate_id,
            "date": next_date,
        }) or {}
        assigned_duty = s.get("assignedDuty") or "-"
        source = "shift" if assigned_duty == required_duty else "otherShift"

        result.append({
            "employeeId": candidate_id,
            "name": s.get("name"),
            "designation": s.get("designation"),
            "category": category or ["Shift Staff"],
            "assignedDuty": assigned_duty,
            "nextDayDuty": next_day_record.get("assignedDuty") or "-",
            "requiredDuty": required_duty,
            "isSIC": False,
            "source": source,

            "groupName": s.get("groupName")
        })

    # ==========================================
    # FINAL SERIAL ORDER
    # ==========================================
    source_order = {"replacement": 0, "shift": 1, "otherShift": 2}

    def candidate_order(item):
        source = item.get("source")
        if source == "replacement":
            days = item.get("daysSinceMatchingDuty")
            return (
                source_order[source],
                0 if days is None else 1,
                -(days if days is not None else 0),
                employee_id_sort_key(item.get("employeeId")),
            )
        return (
            source_order.get(source, 9),
            employee_id_sort_key(item.get("employeeId")),
        )

    result.sort(key=candidate_order)
    for index, item in enumerate(result, start=1):
        item["serialNo"] = index

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

    existing_replacement = leave.get("replacement") or {}
    if existing_replacement.get("employeeId"):
        release_replacement_assignment(
            leave,
            "Assignment changed by replacement manager",
            str(user.get("employeeId") or user.get("userId") or "ADMIN"),
            "Replacement Manager",
        )
        duty_notification_collection.update_many(
            {
                "leaveId": str(leave["_id"]),
                "status": {"$in": ["Pending", "Accepted"]},
            },
            {
                "$set": {
                    "status": "Superseded",
                    "decision": "Assignment changed by replacement manager",
                    "updatedAt": datetime.utcnow(),
                }
            },
        )
        leave = leave_request_collection.find_one({"_id": ObjectId(leave_id)})

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
        "replacementCreatedDaily": existing_daily is None,
        "replacementOriginal": {
            field: existing_daily.get(field)
            for field in ("assignedDuty", "groupName", "rosterId")
            if existing_daily and field in existing_daily
        },
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

    cutoff_local = IST.localize(
        leave_date_obj - timedelta(days=2)
    ).replace(hour=16, minute=0, second=0)
    cutoff = cutoff_local.astimezone(pytz.UTC).replace(tzinfo=None)
    now_utc = datetime.utcnow()
    auto_accepted = now_utc >= cutoff
    controller_ids = controlling_officer_ids(
        replacement_emp["userId"],
        leave_date,
        leave.get("groupName") or "",
    )

    duty_notification_collection.insert_one({
        "employeeId": replacement_emp["userId"],
        "employeeName": replacement_emp.get("name"),
        "controllerIds": controller_ids,
        "leaveId": str(leave["_id"]),
        "date": leave_date,
        "groupName": leave.get("groupName"),
        "assignedDuty": assigned_duty,
        "assignmentMode": mode,

        "status": "Accepted" if auto_accepted else "Pending",
        "decision": "Auto accepted at 16:00 cutoff" if auto_accepted else None,
        "autoAccepted": auto_accepted,
        "reason": None,

        "cutoffTime": cutoff,

        "createdAt": now_utc,
        "updatedAt": now_utc if auto_accepted else None,
        "decisionHistory": [{
            "action": "AutoAccepted",
            "actedBy": "SYSTEM",
            "actorRole": "System",
            "actedAt": now_utc,
        }] if auto_accepted else [],
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
    auto_accept_pending_duty_notifications()
    now = datetime.utcnow()

    data = list(duty_notification_collection.find({
        "$or": [
            {"employeeId": user_id},
            {"controllerIds": user_id},
        ],
        "status": {"$ne": "Superseded"},
    }).sort([("createdAt", -1)]))

    result = []

    for n in data:

        cutoff = utc_naive(n.get("cutoffTime"))

        n["_id"] = str(n["_id"])
        is_assignee = n.get("employeeId") == user_id
        is_controller = user_id in normalized_categories(n.get("controllerIds"))
        before_cutoff = bool(cutoff and now <= cutoff)
        n["viewerRole"] = "Employee" if is_assignee else "Controlling Officer"
        n["canAccept"] = bool(is_assignee and n.get("status") == "Pending" and before_cutoff)
        n["canDeny"] = bool(
            (is_assignee or is_controller)
            and n.get("status") in {"Pending", "Accepted"}
            and before_cutoff
        )

        result.append(n)

    return result


@router.put("/notifications/accept/{id}")
def accept_duty(id: str, user=Depends(get_current_user)):
    if not ObjectId.is_valid(id):
        raise HTTPException(400, "Invalid duty notification")
    notif = duty_notification_collection.find_one({"_id": ObjectId(id)})
    if not notif:
        raise HTTPException(404, "Duty notification not found")
    user_id = str(user.get("userId") or user.get("employeeId") or "")
    if notif.get("employeeId") != user_id:
        raise HTTPException(403, "Only the assigned employee can accept this duty")
    if notif.get("status") != "Pending":
        raise HTTPException(409, f"Duty is already {notif.get('status')}")
    now = datetime.utcnow()
    cutoff = utc_naive(notif.get("cutoffTime"))
    if cutoff and now > cutoff:
        auto_accept_pending_duty_notifications()
        return {"message": "Duty auto accepted at the 16:00 cutoff"}

    duty_notification_collection.update_one(
        {"_id": notif["_id"]},
        {
            "$set": {
                "status": "Accepted",
                "decision": "Accepted by employee",
                "acceptedBy": user_id,
                "updatedAt": now,
            },
            "$push": {
                "decisionHistory": {
                    "action": "Accepted",
                    "actedBy": user_id,
                    "actorRole": "Employee",
                    "actedAt": now,
                }
            },
        },
    )

    return {"message": "Accepted"}



@router.put("/notifications/deny/{id}")
def deny_duty(id: str, payload: dict, user=Depends(get_current_user)):

    if not ObjectId.is_valid(id):
        raise HTTPException(400, "Invalid duty notification")
    notif = duty_notification_collection.find_one({
        "_id": ObjectId(id)
    })

    if not notif:
        raise HTTPException(404, "Notification not found")

    user_id = str(user.get("userId") or user.get("employeeId") or "")
    is_assignee = notif.get("employeeId") == user_id
    is_controller = user_id in normalized_categories(notif.get("controllerIds"))
    if not is_assignee and not is_controller:
        raise HTTPException(403, "Only the assigned employee or controlling officer can deny this duty")
    if notif.get("status") not in {"Pending", "Accepted"}:
        raise HTTPException(409, f"Duty is already {notif.get('status')}")

    now = datetime.utcnow()
    cutoff = utc_naive(notif.get("cutoffTime"))
    if cutoff and now > cutoff:
        auto_accept_pending_duty_notifications()
        raise HTTPException(400, "Denial time expired after the 16:00 cutoff")

    reason = str(payload.get("reason") or "").strip()
    if not reason:
        raise HTTPException(400, "Denial reason is required")
    actor_role = "Employee" if is_assignee else "Controlling Officer"
    leave = None
    if ObjectId.is_valid(str(notif.get("leaveId") or "")):
        leave = leave_request_collection.find_one({"_id": ObjectId(notif["leaveId"])})
    if leave:
        replacement = leave.get("replacement") or {}
        consumed_credit = compensatory_off_collection.find_one({
            "employeeId": replacement.get("employeeId"),
            "reference.leaveRequestId": str(leave["_id"]),
            "status": {"$in": ["Reserved", "Used"]},
        })
        if consumed_credit:
            raise HTTPException(409, "Duty cannot be denied because its C-OFF credit is reserved or used")

    duty_notification_collection.update_one(
        {"_id": notif["_id"]},
        {
            "$set": {
                "status": "Denied",
                "decision": f"Denied by {actor_role}",
                "reason": reason,
                "deniedBy": user_id,
                "deniedByRole": actor_role,
                "updatedAt": now,
            },
            "$push": {
                "decisionHistory": {
                    "action": "Denied",
                    "actedBy": user_id,
                    "actorRole": actor_role,
                    "reason": reason,
                    "actedAt": now,
                }
            },
        },
    )

    duty_denial_collection.insert_one({
        "employeeId": notif.get("employeeId"),
        "employeeName": notif.get("employeeName"),
        "date": notif.get("date"),
        "assignedDuty": notif.get("assignedDuty"),
        "leaveId": notif.get("leaveId"),
        "notificationId": str(notif["_id"]),
        "deniedBy": user_id,
        "deniedByRole": actor_role,
        "reason": reason,
        "createdAt": now,
    })
    if leave:
        release_replacement_assignment(
            leave,
            reason,
            user_id,
            actor_role,
        )

    return {"message": "Denied"}
