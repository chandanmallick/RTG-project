from fastapi import APIRouter, Query
from datetime import datetime, timedelta
from crew_legacy.database.database_mongo import employee_daily_collection, leave_request_collection, employee_collection

dashboard_router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# ===============================
# ðŸ”¹ API 1: Leave Next 2 Days
# ===============================

@dashboard_router.get("/leave-next-2-days")
def leave_next_2_days():

    today = datetime.today().strftime("%Y-%m-%d")
    tomorrow = (datetime.today() + timedelta(days=1)).strftime("%Y-%m-%d")

    pipeline = [
        {
            "$match": {
                "date": {"$in": [today, tomorrow]},
                "finalStatus": "Approved"
            }
        },
        {
            "$project": {
                "_id": 0,
                "employeeId": 1,
                "employeeName": "$name",
                "designation": 1,
                "date": 1,
                "leaveType": 1,
                "replacementRequired": 1,
                "replacement": 1
            }
        }
    ]

    data = list(leave_request_collection.aggregate(pipeline))

    # ðŸ”¥ FORMAT RESPONSE
    formatted = []

    for d in data:

        replacement_required = d.get("replacementRequired", False)
        replacement = d.get("replacement")

        formatted.append({
            "employeeId": d["employeeId"],
            "employeeName": d["employeeName"],
            "date": d["date"],
            "leaveType": d["leaveType"],

            "replacementRequired": replacement_required,

            "replacementName": (
                replacement.get("name")
                if replacement and isinstance(replacement, dict)
                else None
            )
        })

    return {"data": formatted}


# ===============================
# ðŸ”¹ API 2: Duty Today & Tomorrow
# ===============================

@dashboard_router.get("/duty-today-tomorrow")
def duty_today_tomorrow():

    today = datetime.today()
    tomorrow = today + timedelta(days=1)

    today_str = today.strftime("%Y-%m-%d")
    tomorrow_str = tomorrow.strftime("%Y-%m-%d")

    data = list(employee_daily_collection.find({
        "date": {"$in": [today_str, tomorrow_str]}
    }))

    result = {
        "today": {"Morning": [], "Evening": [], "Night": []},
        "tomorrow": {"Morning": [], "Evening": [], "Night": []}
    }

    for row in data:

        shift = row.get("assignedDuty")
        name = row.get("name")
        date = row.get("date")
        # permanent SIC
        is_sic_flag = row.get("isSIC", False)

        # acting / temporary SIC
        is_acting_sic = row.get("isActingSIC", False)

        # final SIC flag
        is_sic = True if (is_sic_flag or is_acting_sic) else False

        leave_status = row.get("leaveStatus")
        training = row.get("trainingName")
        actual_status = row.get("actualStatus")

        # âŒ EXCLUDE CONDITIONS
        leave_status = (row.get("leaveStatus") or "").strip().lower()
        training = row.get("trainingName")
        actual_status = (row.get("actualStatus") or "").strip().upper()

        # ðŸš« EXCLUDE CONDITIONS (STRICT)
        if (
            not shift
            or shift == "OFF"
            or leave_status == "approved"
            or training not in [None, "", "null"]
            or actual_status == "OFF"
        ):
            continue

        # print("CHECK:", row.get("name"), "| leaveStatus:", repr(row.get("leaveStatus")))

        # normalize shift (if short codes used)
        shift_map = {
            "M": "Morning",
            "E": "Evening",
            "N": "Night"
        }

        shift = shift_map.get(shift, shift)

        entry = {
            "name": name,
            "isSIC": is_sic,
            "sicType": "temporary" if is_acting_sic else "permanent"
        }

        if date == today_str:
            if shift in result["today"]:
                result["today"][shift].append(entry)

        elif date == tomorrow_str:
            if shift in result["tomorrow"]:
                result["tomorrow"][shift].append(entry)

    # âœ… SIC FIRST SORTING
    for day in ["today", "tomorrow"]:
        for shift in result[day]:
            result[day][shift].sort(
                key=lambda x: (not x["isSIC"], x["name"])
            )

    return result



################### Leave analysis


@dashboard_router.get("/analytics/leave")
def leave_analytics(
    year: int,
    month: int = None,
    groupName: str = None,
    employeeId: str = None
):

    # ðŸ“… DATE RANGE
    if month:
        start_date = datetime(year, month, 1)
        end_date = datetime(year + (month // 12), (month % 12) + 1, 1)
    else:
        start_date = datetime(year, 1, 1)
        end_date = datetime(year + 1, 1, 1)

    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    # ðŸ”¹ FILTER
    match_filter = {
        "date": {"$gte": start_str, "$lt": end_str},
        "finalStatus": "Approved"
    }

    if groupName:
        match_filter["groupName"] = groupName

    if employeeId:
        match_filter["employeeId"] = employeeId

    # ðŸ”¹ COUNT
    leave_count = leave_request_collection.count_documents(match_filter)

    return {
        "leaveCount": leave_count,
        "year": year,
        "month": month
    }


@dashboard_router.get("/analytics/leave-trend")
def leave_trend(year: int):

    pipeline = [
        {
            "$match": {
                "finalStatus": "Approved",
                "date": {
                    "$gte": f"{year}-01-01",
                    "$lt": f"{year+1}-01-01"
                }
            }
        },
        {
            "$group": {
                "_id": {"$substr": ["$date", 5, 2]},
                "count": {"$sum": 1}
            }
        }
    ]

    raw = list(leave_request_collection.aggregate(pipeline))

    # ðŸ”¥ fill all months
    month_map = {d["_id"]: d["count"] for d in raw}

    months = [
        "Jan","Feb","Mar","Apr","May","Jun",
        "Jul","Aug","Sep","Oct","Nov","Dec"
    ]

    result = []
    for i in range(1,13):
        key = str(i).zfill(2)
        result.append({
            "month": months[i-1],
            "leave": month_map.get(key, 0)
        })

    return result


@dashboard_router.get("/analytics/shift-wise")
def shift_wise_leave(year: int, month: int):

    start = f"{year}-{str(month).zfill(2)}-01"
    end = f"{year}-{str(month+1).zfill(2)}-01" if month < 12 else f"{year+1}-01-01"

    pipeline = [
        {
            "$match": {
                "finalStatus": "Approved",
                "date": {"$gte": start, "$lt": end}
            }
        },
        {
            "$group": {
                "_id": "$shift",
                "count": {"$sum": 1}
            }
        }
    ]

    data = list(leave_request_collection.aggregate(pipeline))

    return [
        {"name": d["_id"] or "Unknown", "value": d["count"]}
        for d in data
    ]


@dashboard_router.get("/analytics/group-wise")
def group_wise_leave(year: int, month: int = None):

    if month:
        start = f"{year}-{str(month).zfill(2)}-01"
        end = f"{year}-{str(month+1).zfill(2)}-01" if month < 12 else f"{year+1}-01-01"
    else:
        start = f"{year}-01-01"
        end = f"{year+1}-01-01"

    pipeline = [
        {
            "$match": {
                "finalStatus": "Approved",
                "date": {"$gte": start, "$lt": end}
            }
        },
        {
            "$group": {
                "_id": "$groupName",
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"count": -1}}
    ]

    data = list(leave_request_collection.aggregate(pipeline))

    return [
        {"group": d["_id"] or "Unknown", "count": d["count"]}
        for d in data
    ]


################ Replacment analysis#######################

@dashboard_router.get("/analytics/replacement")
def replacement_analytics(
    year: int,
    month: int = None,
    groupName: str = None
):

    # ðŸ“… DATE RANGE
    if month:
        start_date = datetime(year, month, 1)
        end_date = datetime(year + (month // 12), (month % 12) + 1, 1)
    else:
        start_date = datetime(year, 1, 1)
        end_date = datetime(year + 1, 1, 1)

    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    # ðŸ”¹ FILTER
    match_filter = {
        "date": {"$gte": start_str, "$lt": end_str},
        "finalStatus": "Approved",
        "replacementRequired": True,
        "replacement": {"$ne": None}
    }

    if groupName:
        match_filter["groupName"] = groupName

    # ðŸ”¹ COUNT
    replacement_count = leave_request_collection.count_documents(match_filter)

    return {
        "replacementCount": replacement_count,
        "year": year,
        "month": month
    }


################# Top replacement duty ##########################

@dashboard_router.get("/top-replacements")
def top_replacements():

    from datetime import datetime, timedelta

    last_60 = (datetime.utcnow() - timedelta(days=60)).strftime("%Y-%m-%d")

    pipeline = [
        {
            "$match": {
                "replacementDuty": True,
                "date": {"$gte": last_60}
            }
        },
        {
            "$group": {
                "_id": "$employeeId",
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"count": -1}},
        {"$limit": 4}
    ]

    data = list(employee_daily_collection.aggregate(pipeline))

    result = []

    for d in data:
        emp = employee_collection.find_one({"userId": d["_id"]})
        result.append({
            "name": emp.get("name"),
            "value": d["count"],
            "image": emp.get("profilePhoto")
        })

    return result

