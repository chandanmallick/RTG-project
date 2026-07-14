from crew_legacy.database.database_mongo import db

dropdown_collection = db["dropdown_master"]


def create_dropdown_logic(data):
    dropdown_collection.insert_one({
        "type": data.get("type"),     # dutyType or category
        "value": data.get("value")
    })
    return {"message": "Dropdown value added"}


def get_dropdown_by_type_logic(dropdown_type):
    return list(dropdown_collection.find({"type": dropdown_type}))

