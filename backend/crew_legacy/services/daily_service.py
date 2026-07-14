from pymongo import UpdateOne
from datetime import datetime, timedelta

from crew_legacy.database.database_mongo import employee_daily_collection


def create_employee_daily_indexes():
    employee_daily_collection.create_index(
        [("employeeId", 1), ("date", 1)],
        unique=True
    )

    employee_daily_collection.create_index(
        [("year", 1), ("month", 1)]
    )

    employee_daily_collection.create_index(
        [("attachedRosterId", 1)]
    )


def generate_date_range(start_date_str, end_date_str):
    start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    end_date = datetime.strptime(end_date_str, "%Y-%m-%d")

    date_list = []
    current = start_date

    while current <= end_date:
        date_list.append(current)
        current += timedelta(days=1)

    return date_list


def generate_or_update_daily_from_roster(
    roster_id,
    roster_version,
    employee_list,
    start_date,
    end_date,
    is_final=False
):
    bulk_operations = []
    date_range = generate_date_range(start_date, end_date)

    for date_obj in date_range:
        date_str = date_obj.strftime("%Y-%m-%d")
        year = date_obj.year
        month = date_obj.month

        for emp in employee_list:

            filter_query = {
                "employeeId": emp["employeeId"],
                "date": date_str
            }

            update_doc = {
                "$set": {
                    "assignedDuty": emp["assignedDuty"],
                    "attachedRosterId": roster_id,
                    "rosterVersion": roster_version,
                    "groupName": emp["groupName"],   # âœ… Only here
                    "isFinalRoster": is_final,
                    "updatedOn": datetime.utcnow()
                },
                "$setOnInsert": {
                    "employeeId": emp["employeeId"],
                    "name": emp["name"],
                    "designation": emp["designation"],
                    "date": date_str,
                    "year": year,
                    "month": month,
                    "flag": "Duty",
                    "actualStatus": emp["assignedDuty"],     # ðŸ”¥ match shift
                    "trainingName": None,
                    "trainingLocation": None,
                    "isSIC": emp.get("isSIC", False),
                    "sic": emp.get("sic"),
                    "leaveRequestId": None,
                    "leaveStatus": None,
                    "exchangeRequestId": None,
                    "exchangeStatus": None,
                    "dutyAsPerLogbook": emp["assignedDuty"], # ðŸ”¥ match shift
                    "isEditable": True,
                    "dataSource": "Roster",
                    "remarks": None,
                    "createdOn": datetime.utcnow()
                }
            }

            bulk_operations.append(
                UpdateOne(filter_query, update_doc, upsert=True)
            )

    if bulk_operations:
        employee_daily_collection.bulk_write(bulk_operations)
