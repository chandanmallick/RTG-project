from crew_legacy.database.database_mongo import employee_collection
from crew_legacy.admin_logic.auth_utils import hash_password, validate_password_policy


def _hash_if_present(password):
    if not password:
        return password
    if isinstance(password, str) and password.startswith("$2"):
        return password
    validate_password_policy(password)
    return hash_password(password)


def create_employee_logic(data):

    employee_data = {
        "name": data.get("name"),
        "nameHindi": data.get("nameHindi"),
        "designation": data.get("designation"),
        "designationHindi": data.get("designationHindi"),
        "userId": data.get("userId"),
        "password": _hash_if_present(data.get("password")),
        "phone": data.get("phone"),
        "gmail": data.get("gmail"),
        "dutyType": data.get("dutyType"),
        "category": data.get("category"),

        # ðŸ”¥ NEW STRUCTURE (Hierarchy)
        "vertical": data.get("vertical"),
        "department": data.get("department"),
        "reportingOfficerId": data.get("reportingOfficerId"),
        "intermediaryReportingId": data.get("intermediaryReportingId"),
        "hodId": data.get("hodId"),

        # ðŸ”¥ Metadata
        "createdAt": data.get("createdAt"),
        "updatedAt": data.get("updatedAt")
    }

    result = employee_collection.insert_one(employee_data)
    return str(result.inserted_id)


def get_all_employees_logic():
    return list(employee_collection.find())

