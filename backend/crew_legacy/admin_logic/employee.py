from crew_legacy.database.database_mongo import employee_collection
from crew_legacy.admin_logic.auth_utils import hash_password, validate_password_policy


def _hash_if_present(password):
    if not password:
        return password
    if isinstance(password, str) and password.startswith("$2"):
        return password
    validate_password_policy(password)
    return hash_password(password)


def _normalize_list(value):
    if isinstance(value, list):
        items = value
    elif value in [None, ""]:
        return []
    else:
        items = str(value).split(",")

    # Preserve the configured/display order while removing duplicates.
    return list(dict.fromkeys(
        str(item).strip() for item in items if str(item).strip()
    ))


def create_employee_logic(data):

    verticals = _normalize_list(
        data.get("verticals") if "verticals" in data else data.get("vertical")
    )
    reporting_officer_ids = _normalize_list(
        data.get("reportingOfficerIds")
        if "reportingOfficerIds" in data
        else data.get("reportingOfficerId")
    )

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
        "category": _normalize_list(data.get("category")),

        # Organization hierarchy. The singular fields are retained as aliases
        # for older roster/leave code while the arrays are the source of truth.
        "verticals": verticals,
        "vertical": (verticals or [None])[0],
        "department": data.get("department"),
        "reportingOfficerIds": reporting_officer_ids,
        "reportingOfficerId": (reporting_officer_ids or [None])[0],
        "functionIds": _normalize_list(data.get("functionIds")),
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

