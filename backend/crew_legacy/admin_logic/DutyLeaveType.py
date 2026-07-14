from crew_legacy.database.database_mongo import DutyLeave_collection


def create_dutyLeave_logic(data):

    document = {
        "dutyLeaveType_cat": data.get("dutyLeaveType_cat"),
        "value": data.get("value"),
        "status": data.get("status", "Active"),
        "order": data.get("order", 0)
    }

    print("Saving to DB:", document)   # DEBUG

    result = DutyLeave_collection.insert_one(document)

    return {
        "message": "Created successfully",
        "id": str(result.inserted_id)
    }


def get_dutyLeave_by_type_logic(type_value):

    data = DutyLeave_collection.find(
        {"dutyLeaveType_cat": type_value}
    )

    result = []

    for item in data:
        result.append({
            "id": str(item["_id"]),
            "dutyLeaveType_cat": item.get("dutyLeaveType_cat"),
            "value": item.get("value"),
            "status": item.get("status", "Active"),
            "order": item.get("order", 0)
        })

    return result

