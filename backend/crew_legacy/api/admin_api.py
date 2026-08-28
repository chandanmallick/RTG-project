from fastapi import APIRouter, Depends, Response, UploadFile, File
from crew_legacy.admin_logic.employee import (
    create_employee_logic,
    get_all_employees_logic,
)
from fastapi import HTTPException
from crew_legacy.admin_logic.dropdown import (
    create_dropdown_logic,
    get_dropdown_by_type_logic
)

from bson import ObjectId
from crew_legacy.database.database_mongo import (
    employee_collection,
    designation_master_collection,
    organization_shift_group_collection,
    organization_unit_collection,
    roster_group_collection,
)
from crew_legacy.admin_logic.dropdown import dropdown_collection
from crew_legacy.database.database_mongo import DutyLeave_collection, system_settings_collection

from openpyxl import Workbook, load_workbook
from io import BytesIO
from crew_legacy.security_utils import ensure_upload_allowed

from crew_legacy.admin_logic.DutyLeaveType import (
    create_dutyLeave_logic,
    get_dutyLeave_by_type_logic
)
from crew_legacy.admin_logic.auth_utils import require_admin
from crew_legacy.admin_logic.auth_utils import hash_password, validate_password_policy
from datetime import datetime, timedelta
import re




router = APIRouter(tags=["Admin"], dependencies=[Depends(require_admin)])


def normalize_list(value):
    if isinstance(value, list):
        items = value
    elif value in [None, ""]:
        return []
    else:
        items = str(value).split(",")
    return list(dict.fromkeys(
        str(item).strip() for item in items if str(item).strip()
    ))


def normalize_seniority_order(value):
    if value in [None, ""]:
        return None
    try:
        order = int(value)
    except (TypeError, ValueError):
        return None
    return order if order > 0 else None


def organization_snapshot(employee: dict, *, end_date=None, reason=None):
    return {
        "startDate": employee.get("organizationAssignedOn") or employee.get("createdOn") or employee.get("createdAt"),
        "endDate": end_date,
        "reason": reason,
        "functionIds": normalize_list(employee.get("functionIds")),
        "verticalIds": normalize_list(employee.get("verticalIds")),
        "verticals": normalize_list(employee.get("verticals") or employee.get("vertical")),
        "sectionIds": normalize_list(employee.get("sectionIds")),
        "sections": normalize_list(employee.get("sections")),
        "departmentIds": normalize_list(employee.get("departmentIds")),
        "departments": normalize_list(employee.get("departments") or employee.get("department")),
        "reportingOfficerIds": normalize_list(employee.get("reportingOfficerIds") or employee.get("reportingOfficerId")),
        "intermediaryReportingId": employee.get("intermediaryReportingId"),
        "hodId": employee.get("hodId"),
    }


def resolve_employee_organization(function_ids=None, employee_id=None):
    """Resolve employee hierarchy only from the Organization Master."""
    employee_id = str(employee_id or "").strip()
    units = list(organization_unit_collection.find({"isActive": {"$ne": False}}))
    unit_by_id = {str(unit["_id"]): unit for unit in units}
    active_employee_ids = {
        str(item.get("userId") or item.get("employeeId") or "").strip()
        for item in employee_collection.find({"isActive": {"$ne": False}}, {"userId": 1, "employeeId": 1})
    }
    active_employee_ids.discard("")

    manual_function_ids = [
        unit_id for unit_id in normalize_list(function_ids)
        if unit_id in unit_by_id and unit_by_id[unit_id].get("unitType") == "function"
    ]
    role_unit_ids = []
    if employee_id:
        for unit in units:
            role_ids = normalize_list(unit.get("headEmployeeIds")) + normalize_list(unit.get("juniorEmployeeIds"))
            if employee_id in role_ids:
                role_unit_ids.append(str(unit["_id"]))
    role_function_ids = [
        unit_id for unit_id in role_unit_ids
        if unit_by_id[unit_id].get("unitType") == "function"
    ]
    manual_function_ids = [
        unit_id for unit_id in manual_function_ids
        if unit_id not in role_function_ids
    ]

    # Shift crews are maintained in the roster-group master rather than as
    # ordinary Function members. Include their dedicated organization mapping
    # so unit heads (and any explicitly selected SO-II/DIC) become reporting
    # officers without editing every crew member separately.
    shift_group_names = []
    if employee_id:
        for group in roster_group_collection.find(
            {"isActive": {"$ne": False}},
            {"groupName": 1, "shiftInCharge": 1, "members": 1},
        ):
            people = [group.get("shiftInCharge") or {}, *(group.get("members") or [])]
            member_ids = {
                str(person.get("employeeId") or person.get("userId") or person.get("id") or "").strip()
                for person in people
            }
            if employee_id in member_ids:
                group_name = str(group.get("groupName") or "").strip()
                if group_name:
                    shift_group_names.append(group_name)
    shift_mappings = list(organization_shift_group_collection.find({
        "groupName": {"$in": shift_group_names}
    })) if shift_group_names else []
    shift_unit_ids = [
        str(item.get("organizationUnitId") or "")
        for item in shift_mappings
        if str(item.get("organizationUnitId") or "") in unit_by_id
    ]
    shift_supervisor_ids = [
        value
        for item in shift_mappings
        for value in normalize_list(item.get("directSupervisorIds"))
        if value in active_employee_ids and value != employee_id
    ]

    selected_function_ids = list(dict.fromkeys(manual_function_ids + role_function_ids))
    seed_ids = list(dict.fromkeys(selected_function_ids + role_unit_ids + shift_unit_ids))
    vertical_ids = []
    section_ids = []
    department_ids = []
    reporting_ids = list(dict.fromkeys(shift_supervisor_ids))
    intermediary_candidates = []
    hod_candidates = []
    leave_approval_levels = None

    for seed_id in seed_ids:
        current = unit_by_id.get(seed_id)
        if not current:
            continue

        if leave_approval_levels is None and current.get("leaveApprovalLevels") in (2, 3):
            leave_approval_levels = int(current["leaveApprovalLevels"])

        configured_current_heads = normalize_list(current.get("headEmployeeIds"))
        employee_is_current_head = employee_id in configured_current_heads
        current_heads = [
            value for value in configured_current_heads
            if value and value != employee_id and value in active_employee_ids
        ]
        direct_found = False
        if current_heads and not employee_is_current_head:
            reporting_ids.extend(current_heads)
            direct_found = True

        parent_id = str(current.get("parentId")) if current.get("parentId") else ""
        while parent_id and parent_id in unit_by_id:
            parent = unit_by_id[parent_id]
            if leave_approval_levels is None and parent.get("leaveApprovalLevels") in (2, 3):
                leave_approval_levels = int(parent["leaveApprovalLevels"])
            parent_type = parent.get("unitType")
            if parent_type == "vertical":
                vertical_ids.append(parent_id)
            elif parent_type == "section":
                section_ids.append(parent_id)
            elif parent_type == "department":
                department_ids.append(parent_id)

            parent_heads = [
                value for value in normalize_list(parent.get("headEmployeeIds"))
                if value and value != employee_id and value in active_employee_ids
            ]
            if parent_heads:
                if not direct_found:
                    reporting_ids.extend(parent_heads)
                    direct_found = True
                elif parent_type != "department":
                    intermediary_candidates.extend(parent_heads)
                if parent_type == "department":
                    hod_candidates.extend(parent_heads)

            parent_id = str(parent.get("parentId")) if parent.get("parentId") else ""

        seed_type = current.get("unitType")
        if seed_type == "vertical":
            vertical_ids.append(seed_id)
        elif seed_type == "section":
            section_ids.append(seed_id)
        elif seed_type == "department":
            department_ids.append(seed_id)

    vertical_ids = list(dict.fromkeys(vertical_ids))
    section_ids = list(dict.fromkeys(section_ids))
    department_ids = list(dict.fromkeys(department_ids))
    reporting_ids = list(dict.fromkeys(reporting_ids))
    intermediary_candidates = [
        value for value in dict.fromkeys(intermediary_candidates)
        if value not in reporting_ids
    ]
    hod_candidates = list(dict.fromkeys(hod_candidates))

    return {
        "manualFunctionIds": manual_function_ids,
        "roleFunctionIds": role_function_ids,
        "functionIds": selected_function_ids,
        "verticalIds": vertical_ids,
        "verticals": [unit_by_id[value].get("name") for value in vertical_ids],
        "sectionIds": section_ids,
        "sections": [unit_by_id[value].get("name") for value in section_ids],
        "departmentIds": department_ids,
        "departments": [unit_by_id[value].get("name") for value in department_ids],
        "department": unit_by_id[department_ids[0]].get("name") if department_ids else None,
        "reportingOfficerIds": reporting_ids,
        "reportingOfficerId": reporting_ids[0] if reporting_ids else None,
        "intermediaryReportingId": intermediary_candidates[0] if intermediary_candidates else None,
        "hodId": hod_candidates[0] if hod_candidates else None,
        "shiftGroupNames": list(dict.fromkeys(shift_group_names)),
        "organizationLeaveApprovalLevels": leave_approval_levels or 2,
    }


def sync_employee_organization():
    for employee in employee_collection.find({}):
        resolved = resolve_employee_organization(
            employee.get("manualFunctionIds", employee.get("functionIds")),
            employee.get("userId"),
        )
        next_values = {
                **resolved,
                "vertical": (resolved.get("verticals") or [None])[0],
                "updatedAt": datetime.utcnow(),
            }
        old_snapshot = organization_snapshot(employee)
        new_snapshot = organization_snapshot({**employee, **next_values})
        compare_keys = ("functionIds", "verticalIds", "sectionIds", "departmentIds", "reportingOfficerIds", "intermediaryReportingId", "hodId")
        changed = any(old_snapshot.get(key) != new_snapshot.get(key) for key in compare_keys)
        mutation = {"$set": next_values}
        if changed:
            next_values["organizationAssignedOn"] = datetime.utcnow()
            mutation["$push"] = {"organizationHistory": organization_snapshot(employee, end_date=datetime.utcnow(), reason="Organization hierarchy synchronized")}
        employee_collection.update_one({"_id": employee["_id"]}, mutation)


def serialize(emp):

    # ðŸ”¥ FETCH RELATED EMPLOYEES
    reporting_ids = normalize_list(
        emp.get("reportingOfficerIds") or emp.get("reportingOfficerId")
    )
    verticals = normalize_list(emp.get("verticals") or emp.get("vertical"))
    reporting_people = list(employee_collection.find(
        {"userId": {"$in": reporting_ids}}, {"userId": 1, "name": 1}
    )) if reporting_ids else []
    reporting_names = {
        person.get("userId"): person.get("name") for person in reporting_people
    }
    function_ids = normalize_list(emp.get("functionIds"))
    function_docs = list(organization_unit_collection.find(
        {"_id": {"$in": [ObjectId(value) for value in function_ids if ObjectId.is_valid(value)]}},
        {"name": 1},
    )) if function_ids else []
    function_names = {str(item["_id"]): item.get("name") for item in function_docs}

    hod = employee_collection.find_one({
        "userId": emp.get("hodId")
    })

    intermediary = employee_collection.find_one({
        "userId": emp.get("intermediaryReportingId")
    })

    return {
        "id": str(emp["_id"]),
        "name": emp.get("name"),
        "nameHindi": emp.get("nameHindi"),
        "designation": emp.get("designation"),
        "designationHindi": emp.get("designationHindi"),
        "designationMasterId": str(emp.get("designationMasterId") or ""),
        "userId": emp.get("userId"),
        "seniorityOrder": normalize_seniority_order(emp.get("seniorityOrder")),
        "phone": emp.get("phone"),
        "gmail": emp.get("gmail"),
        "dutyType": emp.get("dutyType"),
        "category": normalize_list(emp.get("category")),
        "isActive": emp.get("isActive", True) is not False,
        "deactivatedOn": emp.get("deactivatedOn"),
        "deactivationReason": emp.get("deactivationReason"),
        "organizationHistory": emp.get("organizationHistory") or [],

        # ðŸ”¥ NEW FIELDS
        "verticals": verticals,
        "vertical": verticals[0] if verticals else None,
        "verticalIds": normalize_list(emp.get("verticalIds")),
        "sections": normalize_list(emp.get("sections")),
        "sectionIds": normalize_list(emp.get("sectionIds")),
        "departments": normalize_list(emp.get("departments")),
        "departmentIds": normalize_list(emp.get("departmentIds")),
        "department": emp.get("department"),

        # ðŸ”¥ IDs (keep for logic)
        "reportingOfficerIds": reporting_ids,
        "reportingOfficerId": reporting_ids[0] if reporting_ids else None,
        "intermediaryReportingId": emp.get("intermediaryReportingId"),
        "hodId": emp.get("hodId"),
        "leaveApprovalLevelsOverride": emp.get("leaveApprovalLevelsOverride"),
        "organizationLeaveApprovalLevels": emp.get("organizationLeaveApprovalLevels", 2),

        # ðŸ”¥ NAMES (for frontend display)
        "reportingOfficerNames": [
            reporting_names.get(officer_id, officer_id) for officer_id in reporting_ids
        ],
        "reportingOfficerName": reporting_names.get(reporting_ids[0]) if reporting_ids else None,
        "functionIds": function_ids,
        "functionNames": [function_names.get(value, value) for value in function_ids],
        "intermediaryReportingName": intermediary.get("name") if intermediary else None,
        "hodName": hod.get("name") if hod else None
    }


def designation_key(value):
    value = str(value or "").strip().casefold()
    value = value.replace("&", " and ")
    value = "".join(character if character.isalnum() else " " for character in value)
    return re.sub(r"\s+", " ", value).strip()


def serialize_designation(doc, employee_counts=None):
    employee_counts = employee_counts or {}
    keys = {
        designation_key(doc.get("name")),
        *(designation_key(value) for value in normalize_list(doc.get("aliases"))),
    }
    keys.discard("")
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name") or "",
        "nameHindi": doc.get("nameHindi") or "",
        "shortName": doc.get("shortName") or "",
        "aliases": normalize_list(doc.get("aliases")),
        "seniorityOrder": normalize_seniority_order(doc.get("seniorityOrder")),
        "isActive": doc.get("isActive", True),
        "reviewRequired": bool(doc.get("reviewRequired")),
        "employeeCount": sum(employee_counts.get(key, 0) for key in keys),
        "source": doc.get("source") or "Manual",
        "updatedAt": doc.get("updatedAt"),
    }


def designation_comparison():
    masters = sorted(
        designation_master_collection.find(),
        key=lambda item: (
            normalize_seniority_order(item.get("seniorityOrder")) or 10**9,
            str(item.get("name") or "").casefold(),
        ),
    )
    key_to_master = {}
    for master in masters:
        for value in [master.get("name"), *normalize_list(master.get("aliases"))]:
            key = designation_key(value)
            if key:
                key_to_master[key] = master

    raw_groups = {}
    blank_employees = []
    for employee in employee_collection.find(
        {},
        {"userId": 1, "name": 1, "designation": 1, "designationHindi": 1, "designationMasterId": 1},
    ):
        raw_value = str(employee.get("designation") or "").strip()
        key = designation_key(raw_value)
        if not key:
            blank_employees.append({
                "employeeId": str(employee.get("userId") or ""),
                "name": employee.get("name") or "",
            })
            continue
        group = raw_groups.setdefault(key, {
            "key": key,
            "value": raw_value,
            "employeeCount": 0,
            "employeeIds": [],
            "employeeNames": [],
            "hindiValues": [],
        })
        group["employeeCount"] += 1
        group["employeeIds"].append(str(employee.get("userId") or ""))
        group["employeeNames"].append(employee.get("name") or "")
        hindi_value = str(employee.get("designationHindi") or "").strip()
        if hindi_value and hindi_value not in group["hindiValues"]:
            group["hindiValues"].append(hindi_value)

    employee_counts = {key: group["employeeCount"] for key, group in raw_groups.items()}
    unmatched = []
    matched_employee_count = 0
    for key, group in raw_groups.items():
        master = key_to_master.get(key)
        if master:
            matched_employee_count += group["employeeCount"]
        else:
            unmatched.append(group)
    unmatched.sort(key=lambda item: (-item["employeeCount"], item["value"].casefold()))

    return {
        "masters": [serialize_designation(doc, employee_counts) for doc in masters],
        "unmatched": unmatched,
        "blankEmployees": blank_employees,
        "stats": {
            "masterCount": len(masters),
            "activeMasterCount": sum(1 for item in masters if item.get("isActive", True)),
            "reviewRequiredCount": sum(1 for item in masters if item.get("reviewRequired")),
            "employeeDesignationCount": sum(employee_counts.values()),
            "matchedEmployeeCount": matched_employee_count,
            "unmatchedEmployeeCount": sum(item["employeeCount"] for item in unmatched),
            "unmatchedValueCount": len(unmatched),
            "blankEmployeeCount": len(blank_employees),
        },
    }


def apply_designation_master_matches():
    masters = list(designation_master_collection.find({"isActive": {"$ne": False}}))
    key_to_master = {}
    for master in masters:
        for value in [master.get("name"), *normalize_list(master.get("aliases"))]:
            key = designation_key(value)
            if key:
                key_to_master[key] = master
    updated = 0
    for employee in employee_collection.find({}, {"designation": 1, "designationHindi": 1, "designationMasterId": 1}):
        master = key_to_master.get(designation_key(employee.get("designation")))
        if not master:
            continue
        desired = {
            "designation": master.get("name") or employee.get("designation"),
            "designationHindi": master.get("nameHindi") or employee.get("designationHindi") or "",
            "designationMasterId": str(master["_id"]),
        }
        if any(employee.get(field) != value for field, value in desired.items()):
            employee_collection.update_one(
                {"_id": employee["_id"]},
                {"$set": {**desired, "updatedAt": datetime.utcnow()}},
            )
            updated += 1
    return updated


@router.get("/designations")
def get_designation_master():
    masters = sorted(
        designation_master_collection.find(),
        key=lambda item: (
            normalize_seniority_order(item.get("seniorityOrder")) or 10**9,
            str(item.get("name") or "").casefold(),
        ),
    )
    return {
        "masters": [serialize_designation(doc) for doc in masters],
        "stats": {
            "masterCount": len(masters),
            "activeMasterCount": sum(1 for item in masters if item.get("isActive", True)),
            "seniorityPendingCount": sum(
                1 for item in masters
                if not normalize_seniority_order(item.get("seniorityOrder"))
            ),
        },
    }


@router.post("/designations")
def create_designation_master(data: dict):
    name = str(data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Designation name is required")
    aliases = normalize_list(data.get("aliases"))
    keys = [designation_key(name), *(designation_key(value) for value in aliases)]
    duplicate = designation_master_collection.find_one({
        "$or": [
            {"normalizedName": {"$in": keys}},
            {"normalizedAliases": {"$in": keys}},
        ]
    })
    if duplicate:
        raise HTTPException(409, "This designation or alias already exists in the master")
    now = datetime.utcnow()
    document = {
        "name": name,
        "nameHindi": str(data.get("nameHindi") or "").strip(),
        "shortName": str(data.get("shortName") or "").strip(),
        "seniorityOrder": normalize_seniority_order(data.get("seniorityOrder")),
        "aliases": aliases,
        "normalizedName": designation_key(name),
        "normalizedAliases": [designation_key(value) for value in aliases if designation_key(value)],
        "isActive": data.get("isActive", True) is not False,
        "reviewRequired": bool(data.get("reviewRequired", False)),
        "source": data.get("source") or "Manual",
        "createdAt": now,
        "updatedAt": now,
    }
    inserted = designation_master_collection.insert_one(document)
    return {"message": "Designation created", "id": str(inserted.inserted_id)}


@router.put("/designations/{designation_id}")
def update_designation_master(designation_id: str, data: dict):
    if not ObjectId.is_valid(designation_id):
        raise HTTPException(400, "Invalid designation ID")
    existing = designation_master_collection.find_one({"_id": ObjectId(designation_id)})
    if not existing:
        raise HTTPException(404, "Designation not found")
    name = str(data.get("name", existing.get("name")) or "").strip()
    if not name:
        raise HTTPException(400, "Designation name is required")
    aliases = normalize_list(data.get("aliases", existing.get("aliases")))
    if designation_key(existing.get("name")) != designation_key(name):
        aliases = normalize_list([*aliases, existing.get("name")])
    normalized_name = designation_key(name)
    normalized_aliases = [designation_key(value) for value in aliases if designation_key(value)]
    duplicate = designation_master_collection.find_one({
        "_id": {"$ne": existing["_id"]},
        "$or": [
            {"normalizedName": {"$in": [normalized_name, *normalized_aliases]}},
            {"normalizedAliases": {"$in": [normalized_name, *normalized_aliases]}},
        ],
    })
    if duplicate:
        raise HTTPException(409, "This designation or alias is already assigned to another master entry")
    designation_master_collection.update_one(
        {"_id": existing["_id"]},
        {"$set": {
            "name": name,
            "nameHindi": str(data.get("nameHindi", existing.get("nameHindi")) or "").strip(),
            "shortName": str(data.get("shortName", existing.get("shortName")) or "").strip(),
            "seniorityOrder": normalize_seniority_order(
                data.get("seniorityOrder", existing.get("seniorityOrder"))
            ),
            "aliases": aliases,
            "normalizedName": normalized_name,
            "normalizedAliases": normalized_aliases,
            "isActive": data.get("isActive", existing.get("isActive", True)) is not False,
            "reviewRequired": bool(data.get("reviewRequired", False)),
            "updatedAt": datetime.utcnow(),
        }},
    )
    employees_updated = apply_designation_master_matches()
    return {"message": "Designation updated", "employeesUpdated": employees_updated}


@router.post("/designations/sync-employees")
def sync_designations_from_employees():
    comparison = designation_comparison()
    now = datetime.utcnow()
    inserted = 0
    for item in comparison["unmatched"]:
        name = str(item.get("value") or "").strip()
        if not name:
            continue
        normalized_name = designation_key(name)
        result = designation_master_collection.update_one(
            {
                "$or": [
                    {"normalizedName": normalized_name},
                    {"normalizedAliases": normalized_name},
                ]
            },
            {
                "$setOnInsert": {
                    "name": name,
                    "nameHindi": (item.get("hindiValues") or [""])[0],
                    "shortName": "",
                    "aliases": [],
                    "normalizedName": normalized_name,
                    "normalizedAliases": [],
                    "isActive": True,
                    "reviewRequired": True,
                    "source": "Employee Sync",
                    "createdAt": now,
                },
                "$set": {"updatedAt": now},
            },
            upsert=True,
        )
        if result.upserted_id:
            inserted += 1
    employees_updated = apply_designation_master_matches()
    return {
        "message": "Employee designations compared and imported for review",
        "inserted": inserted,
        "employeesUpdated": employees_updated,
        "comparison": designation_comparison(),
    }


@router.post("/designations/{designation_id}/map")
def map_employee_designation(designation_id: str, data: dict):
    if not ObjectId.is_valid(designation_id):
        raise HTTPException(400, "Invalid designation ID")
    master = designation_master_collection.find_one({"_id": ObjectId(designation_id)})
    if not master:
        raise HTTPException(404, "Designation not found")
    raw_value = str(data.get("rawValue") or "").strip()
    if not raw_value:
        raise HTTPException(400, "Employee designation value is required")
    raw_key = designation_key(raw_value)
    aliases = normalize_list([*(master.get("aliases") or []), raw_value])
    designation_master_collection.update_one(
        {"_id": master["_id"]},
        {"$set": {
            "aliases": aliases,
            "normalizedAliases": [designation_key(value) for value in aliases if designation_key(value)],
            "reviewRequired": False,
            "updatedAt": datetime.utcnow(),
        }},
    )
    employee_ids = [
        employee["_id"]
        for employee in employee_collection.find({}, {"designation": 1})
        if designation_key(employee.get("designation")) == raw_key
    ]
    result = employee_collection.update_many(
        {"_id": {"$in": employee_ids}},
        {"$set": {
            "designation": master.get("name"),
            "designationHindi": master.get("nameHindi") or "",
            "designationMasterId": str(master["_id"]),
            "updatedAt": datetime.utcnow(),
        }},
    ) if employee_ids else None
    return {
        "message": "Employee designation mapped to master",
        "employeesUpdated": result.modified_count if result else 0,
    }



@router.post("/employees")  #### save employee entry to database
def create_employee(employee: dict):
    employee.setdefault("isActive", True)
    employee.setdefault("organizationAssignedOn", datetime.utcnow())
    employee.update(resolve_employee_organization(
        employee.get("manualFunctionIds", employee.get("functionIds")),
        employee.get("userId"),
    ))
    inserted_id = create_employee_logic(employee)
    return {"message": "Employee added", "id": inserted_id}


@router.get("/employees")  #### fetch employee entry to database
def get_employees():
    employees = get_all_employees_logic()
    return [serialize(emp) for emp in employees]

@router.post("/dropdown")    ###### create new dropdown entry
def create_dropdown(data: dict):
    return create_dropdown_logic(data)


@router.get("/dropdown/{dropdown_type}")    ###### fetch dropdown entry
def get_dropdown(dropdown_type: str):
    data = get_dropdown_by_type_logic(dropdown_type)
    return [
        {
            "id": str(item["_id"]),
            "value": item["value"]
        }
        for item in data
    ]



ORG_PARENT_TYPES = {
    "department": set(),
    "vertical": {"department"},
    "section": {"vertical"},
    "function": {"vertical", "section"},
}


def serialize_org_unit(unit, employee_names=None, parent_names=None):
    employee_names = employee_names or {}
    parent_names = parent_names or {}
    head_ids = normalize_list(unit.get("headEmployeeIds"))
    junior_ids = normalize_list(unit.get("juniorEmployeeIds"))
    parent_id = str(unit.get("parentId")) if unit.get("parentId") else None
    return {
        "id": str(unit["_id"]),
        "name": unit.get("name"),
        "unitType": unit.get("unitType"),
        "parentId": parent_id,
        "parentName": parent_names.get(parent_id),
        "headEmployeeIds": head_ids,
        "headEmployeeNames": [employee_names.get(value, value) for value in head_ids],
        "juniorEmployeeIds": junior_ids,
        "juniorEmployeeNames": [employee_names.get(value, value) for value in junior_ids],
        "leaveApprovalLevels": unit.get("leaveApprovalLevels"),
        "isActive": unit.get("isActive", True),
    }


def validate_org_unit(data, current_id=None):
    name = str(data.get("name") or "").strip()
    unit_type = str(data.get("unitType") or "").strip().lower()
    parent_id = data.get("parentId") or None
    if not name or unit_type not in ORG_PARENT_TYPES:
        raise HTTPException(400, "Name and a valid unit type are required")

    current_unit = None
    if current_id and ObjectId.is_valid(current_id):
        current_unit = organization_unit_collection.find_one({"_id": ObjectId(current_id)})

    parent = None
    if parent_id:
        if not ObjectId.is_valid(parent_id):
            raise HTTPException(400, "Invalid parent unit")
        if current_id and parent_id == current_id:
            raise HTTPException(400, "A unit cannot be its own parent")
        parent = organization_unit_collection.find_one({"_id": ObjectId(parent_id)})
        if not parent:
            raise HTTPException(404, "Parent unit not found")

    allowed = ORG_PARENT_TYPES[unit_type]
    if allowed and (not parent or parent.get("unitType") not in allowed):
        if not (
            current_unit
            and unit_type == "section"
            and str(current_unit.get("parentId")) == parent_id
        ):
            raise HTTPException(400, f"{unit_type.title()} must belong to a {' or '.join(sorted(allowed))}")
    if not allowed and parent:
        raise HTTPException(400, "Department is a top-level unit")

    raw_approval_levels = data.get("leaveApprovalLevels")
    approval_levels = int(raw_approval_levels) if str(raw_approval_levels or "").strip() in {"2", "3"} else None
    return {
        "name": name,
        "unitType": unit_type,
        "parentId": parent.get("_id") if parent else None,
        "headEmployeeIds": normalize_list(data.get("headEmployeeIds")),
        "juniorEmployeeIds": normalize_list(data.get("juniorEmployeeIds")) if unit_type == "function" else [],
        "leaveApprovalLevels": approval_levels,
        "isActive": bool(data.get("isActive", True)),
        "updatedAt": datetime.utcnow(),
    }


@router.get("/organization/units")
def get_organization_units():
    units = list(organization_unit_collection.find({}).sort([("unitType", 1), ("name", 1)]))
    employee_names = {
        item.get("userId"): item.get("name")
        for item in employee_collection.find({}, {"userId": 1, "name": 1})
    }
    parent_names = {str(item["_id"]): item.get("name") for item in units}
    return [serialize_org_unit(item, employee_names, parent_names) for item in units]


organization_shift_group_collection.create_index(
    [("groupName", 1)],
    unique=True,
    name="organization_shift_group_unique",
)


@router.get("/organization/shift-groups")
def get_organization_shift_groups():
    active_group_names = sorted({
        str(item.get("groupName") or "").strip()
        for item in roster_group_collection.find(
            {"isActive": {"$ne": False}},
            {"groupName": 1},
        )
        if str(item.get("groupName") or "").strip()
    })
    units = list(organization_unit_collection.find(
        {
            "isActive": {"$ne": False},
            "unitType": {"$in": ["department", "vertical", "section", "function"]},
        },
        {"name": 1, "unitType": 1},
    ).sort([("unitType", 1), ("name", 1)]))
    unit_map = {str(item["_id"]): item for item in units}
    employee_names = {
        str(item.get("userId") or item.get("employeeId") or "").strip(): item.get("name")
        for item in employee_collection.find(
            {"isActive": {"$ne": False}},
            {"userId": 1, "employeeId": 1, "name": 1},
        )
    }
    mappings = []
    for item in organization_shift_group_collection.find({}).sort("groupName", 1):
        unit_id = str(item.get("organizationUnitId") or "")
        unit = unit_map.get(unit_id)
        mappings.append({
            "id": str(item["_id"]),
            "groupName": item.get("groupName"),
            "organizationUnitId": unit_id,
            "organizationUnitName": (unit or {}).get("name") or item.get("organizationUnitName"),
            "organizationUnitType": (unit or {}).get("unitType") or item.get("organizationUnitType"),
            "directSupervisorIds": normalize_list(item.get("directSupervisorIds")),
            "directSupervisorNames": [
                employee_names.get(value, value)
                for value in normalize_list(item.get("directSupervisorIds"))
            ],
            "isGroupActive": item.get("groupName") in active_group_names,
            "updatedAt": item.get("updatedAt"),
        })
    return {
        "activeGroups": active_group_names,
        "organizationUnits": [{
            "id": str(item["_id"]),
            "name": item.get("name"),
            "unitType": item.get("unitType"),
        } for item in units],
        "mappings": mappings,
    }


@router.post("/organization/shift-groups/attach")
def attach_organization_shift_group(data: dict):
    group_names = normalize_list(data.get("groupNames") or data.get("groupName"))
    unit_id = str(data.get("organizationUnitId") or "").strip()
    supervisor_ids = normalize_list(data.get("directSupervisorIds"))
    if not group_names or (not unit_id and not supervisor_ids):
        raise HTTPException(400, "Select at least one active shift group and a direct supervisor or organization unit")
    active_groups = {
        str(item.get("groupName") or "").strip()
        for item in roster_group_collection.find({
            "groupName": {"$in": group_names},
            "isActive": {"$ne": False},
        }, {"groupName": 1})
    }
    missing_groups = [name for name in group_names if name not in active_groups]
    if missing_groups:
        raise HTTPException(404, f"Active shift group not found: {', '.join(missing_groups)}")
    unit = None
    if unit_id:
        if not ObjectId.is_valid(unit_id):
            raise HTTPException(400, "Invalid reporting organization unit")
        unit = organization_unit_collection.find_one({
            "_id": ObjectId(unit_id),
            "isActive": {"$ne": False},
            "unitType": {"$in": ["department", "vertical", "section", "function"]},
        })
        if not unit:
            raise HTTPException(404, "Department, Vertical, Section or Function not found")
    active_supervisors = {
        str(item.get("userId") or item.get("employeeId") or "").strip()
        for item in employee_collection.find({
            "$or": [
                {"userId": {"$in": supervisor_ids}},
                {"employeeId": {"$in": supervisor_ids}},
            ],
            "isActive": {"$ne": False},
        }, {"userId": 1, "employeeId": 1})
    } if supervisor_ids else set()
    missing_supervisors = [value for value in supervisor_ids if value not in active_supervisors]
    if missing_supervisors:
        raise HTTPException(404, f"Active supervisor not found: {', '.join(missing_supervisors)}")
    now = datetime.utcnow()
    for group_name in group_names:
        organization_shift_group_collection.update_one(
            {"groupName": group_name},
            {
                "$set": {
                    "groupName": group_name,
                    "organizationUnitId": unit["_id"] if unit else None,
                    "organizationUnitName": unit.get("name") if unit else None,
                    "organizationUnitType": unit.get("unitType") if unit else None,
                    "directSupervisorIds": supervisor_ids,
                    "updatedAt": now,
                },
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )
    # Remove the short-lived embedded representation, if it was saved before
    # shift-group reporting was moved into this dedicated mapping collection.
    organization_unit_collection.update_many(
        {"shiftGroupNames": {"$in": group_names}},
        {"$pull": {"shiftGroupNames": {"$in": group_names}}},
    )
    sync_employee_organization()
    target_names = [unit.get("name")] if unit else []
    target_names.extend(supervisor_ids)
    return {"message": f"{len(group_names)} shift group(s) now report to {', '.join(target_names)}"}


@router.delete("/organization/shift-groups/{mapping_id}")
def detach_organization_shift_group(mapping_id: str):
    if not ObjectId.is_valid(mapping_id):
        raise HTTPException(400, "Invalid shift-group mapping")
    result = organization_shift_group_collection.delete_one({"_id": ObjectId(mapping_id)})
    if not result.deleted_count:
        raise HTTPException(404, "Shift-group mapping not found")
    sync_employee_organization()
    return {"message": "Shift group detached from the organization hierarchy"}


@router.post("/organization/resolve-employee")
def resolve_organization_employee(data: dict):
    resolved = resolve_employee_organization(
        data.get("manualFunctionIds", data.get("functionIds")),
        data.get("userId"),
    )
    related_ids = list(dict.fromkeys(
        resolved["reportingOfficerIds"]
        + [resolved.get("intermediaryReportingId"), resolved.get("hodId")]
    ))
    related_ids = [value for value in related_ids if value]
    employee_names = {
        item.get("userId"): item.get("name")
        for item in employee_collection.find(
            {"userId": {"$in": related_ids}},
            {"userId": 1, "name": 1},
        )
    }
    resolved.update({
        "reportingOfficerNames": [
            employee_names.get(value, value) for value in resolved["reportingOfficerIds"]
        ],
        "intermediaryReportingName": employee_names.get(resolved.get("intermediaryReportingId")),
        "hodName": employee_names.get(resolved.get("hodId")),
    })
    return resolved


@router.post("/organization/units")
def create_organization_unit(data: dict):
    unit = validate_org_unit(data)
    if organization_unit_collection.find_one({
        "name": unit["name"], "unitType": unit["unitType"], "parentId": unit["parentId"]
    }):
        raise HTTPException(409, "This organization unit already exists")
    unit["createdAt"] = datetime.utcnow()
    result = organization_unit_collection.insert_one(unit)
    sync_employee_organization()
    return {"message": "Organization unit created", "id": str(result.inserted_id)}


@router.put("/organization/units/{unit_id}")
def update_organization_unit(unit_id: str, data: dict):
    if not ObjectId.is_valid(unit_id):
        raise HTTPException(400, "Invalid organization unit")
    if not organization_unit_collection.find_one({"_id": ObjectId(unit_id)}):
        raise HTTPException(404, "Organization unit not found")
    organization_unit_collection.update_one(
        {"_id": ObjectId(unit_id)}, {"$set": validate_org_unit(data, unit_id)}
    )
    sync_employee_organization()
    return {"message": "Organization unit updated"}


@router.delete("/organization/units/{unit_id}")
def delete_organization_unit(unit_id: str):
    if not ObjectId.is_valid(unit_id):
        raise HTTPException(400, "Invalid organization unit")
    object_id = ObjectId(unit_id)
    if organization_unit_collection.find_one({"parentId": object_id}):
        raise HTTPException(409, "Remove or move child units first")
    if employee_collection.find_one({"functionIds": unit_id}):
        raise HTTPException(409, "Remove employee function assignments first")
    result = organization_unit_collection.delete_one({"_id": object_id})
    if not result.deleted_count:
        raise HTTPException(404, "Organization unit not found")
    sync_employee_organization()
    return {"message": "Organization unit deleted"}


@router.get("/organization/tree")
def get_organization_tree():
    units = list(organization_unit_collection.find({"isActive": {"$ne": False}}))
    if not units:
        return []
    child_map = {}
    for unit in units:
        parent_id = str(unit.get("parentId")) if unit.get("parentId") else "ROOT"
        child_map.setdefault(parent_id, []).append(unit)

    employees = list(employee_collection.find({}))
    employee_map = {item.get("userId"): item for item in employees if item.get("userId")}
    members = {}
    for employee in employees:
        for function_id in normalize_list(employee.get("functionIds")):
            members.setdefault(function_id, []).append(employee)
    shift_groups_by_unit = {}
    for mapping in organization_shift_group_collection.find({}):
        unit_id = str(mapping.get("organizationUnitId") or "")
        group_name = str(mapping.get("groupName") or "").strip()
        if unit_id and group_name:
            shift_groups_by_unit.setdefault(unit_id, []).append(group_name)

    def person_node(employee):
        return {
            "expanded": True,
            "type": "person",
            "data": {
                "userId": employee.get("userId"),
                "name": employee.get("name") or employee.get("userId"),
                "title": employee.get("designation") or "",
                "role": "Member",
                "image": employee.get("profilePhoto"),
            },
            "children": [],
        }

    def unit_node(unit, path=None):
        path = path or set()
        unit_id = str(unit["_id"])
        if unit_id in path:
            return None
        head_ids = normalize_list(unit.get("headEmployeeIds"))
        junior_ids = normalize_list(unit.get("juniorEmployeeIds"))
        children = [unit_node(child, {*path, unit_id}) for child in child_map.get(unit_id, [])]
        if unit.get("unitType") == "function":
            excluded = set(head_ids + junior_ids)
            children.extend(
                person_node(employee) for employee in members.get(unit_id, [])
                if employee.get("userId") not in excluded
            )
        return {
            "expanded": True,
            "type": "unit",
            "data": {
                "id": unit_id,
                "name": unit.get("name"),
                "unitType": unit.get("unitType"),
                "shiftGroups": sorted(shift_groups_by_unit.get(unit_id, [])),
                "heads": [
                    {"userId": value, "name": employee_map.get(value, {}).get("name") or value}
                    for value in head_ids
                ],
                "juniors": [
                    {"userId": value, "name": employee_map.get(value, {}).get("name") or value}
                    for value in junior_ids
                ],
            },
            "children": [child for child in children if child],
        }

    return [unit_node(unit) for unit in child_map.get("ROOT", [])]


@router.put("/employees/{employee_id}")
def update_employee(employee_id: str, data: dict):
    existing = employee_collection.find_one({"_id": ObjectId(employee_id)})
    if not existing:
        raise HTTPException(404, "Employee not found")
    organization = resolve_employee_organization(
        data.get("manualFunctionIds", data.get("functionIds")),
        data.get("userId"),
    )
    verticals = organization["verticals"]
    reporting_officer_ids = organization["reportingOfficerIds"]

    update_data = {
        "name": data.get("name"),
        "nameHindi": data.get("nameHindi"),
        "designation": data.get("designation"),
        "designationHindi": data.get("designationHindi"),
        "designationMasterId": data.get("designationMasterId"),
        "userId": data.get("userId"),
        "seniorityOrder": normalize_seniority_order(data.get("seniorityOrder")),
        "phone": data.get("phone"),
        "gmail": data.get("gmail"),
        "dutyType": data.get("dutyType"),
        "category": normalize_list(data.get("category")),
        "verticals": verticals,
        "vertical": verticals[0] if verticals else None,
        "verticalIds": organization["verticalIds"],
        "sections": organization["sections"],
        "sectionIds": organization["sectionIds"],
        "departments": organization["departments"],
        "departmentIds": organization["departmentIds"],
        "department": organization["department"],
        "reportingOfficerIds": reporting_officer_ids,
        "reportingOfficerId": reporting_officer_ids[0] if reporting_officer_ids else None,
        "functionIds": organization["functionIds"],
        "manualFunctionIds": organization["manualFunctionIds"],
        "roleFunctionIds": organization["roleFunctionIds"],
        "intermediaryReportingId": organization["intermediaryReportingId"],
        "hodId": organization["hodId"],
        "organizationLeaveApprovalLevels": organization.get("organizationLeaveApprovalLevels", 2),
        "leaveApprovalLevelsOverride": int(data["leaveApprovalLevelsOverride"]) if str(data.get("leaveApprovalLevelsOverride") or "") in {"2", "3"} else None,
        "isActive": existing.get("isActive", True) is not False,
    }

    old_snapshot = organization_snapshot(existing)
    new_snapshot = organization_snapshot({**existing, **update_data})
    compare_keys = ("functionIds", "verticalIds", "sectionIds", "departmentIds", "reportingOfficerIds", "intermediaryReportingId", "hodId")
    organization_changed = any(old_snapshot.get(key) != new_snapshot.get(key) for key in compare_keys)
    if organization_changed:
        update_data["organizationAssignedOn"] = datetime.utcnow()

    password = data.get("password")
    if password:
        validate_password_policy(password)
        update_data["password"] = password if password.startswith("$2") else hash_password(password)

    mutation = {"$set": update_data}
    if organization_changed:
        mutation["$push"] = {"organizationHistory": organization_snapshot(existing, end_date=datetime.utcnow(), reason="Organization mapping changed")}
    employee_collection.update_one({"_id": ObjectId(employee_id)}, mutation)

    return {"message": "Employee updated successfully"}


@router.patch("/employees/{employee_id}/status")
def set_employee_status(employee_id: str, data: dict):
    if not ObjectId.is_valid(employee_id):
        raise HTTPException(400, "Invalid employee ID")
    employee = employee_collection.find_one({"_id": ObjectId(employee_id)})
    if not employee:
        raise HTTPException(404, "Employee not found")
    active = bool(data.get("isActive"))
    now = datetime.utcnow()
    update = {"isActive": active, "updatedAt": now}
    mutation = {"$set": update}
    if active:
        update.update({"reactivatedOn": now, "organizationAssignedOn": now})
        mutation["$unset"] = {"deactivatedOn": "", "deactivationReason": ""}
    else:
        reason = str(data.get("reason") or "Transferred / relieved").strip()
        update.update({"deactivatedOn": now, "deactivationReason": reason})
        mutation["$push"] = {"organizationHistory": organization_snapshot(employee, end_date=now, reason=reason)}
    employee_collection.update_one({"_id": employee["_id"]}, mutation)
    sync_employee_organization()
    return {"message": "Employee activated" if active else "Employee deactivated", "isActive": active}

############## Duty leave tyoe area start ############

def serialize_duty_leave(doc):
    return {
        "id": str(doc["_id"]),
        "dutyLeaveType_cat": doc.get("dutyLeaveType_cat"),
        "value": doc.get("value"),
        "status": doc.get("status", "Active"),
        "order": doc.get("order", 0)
    }


@router.post("/DutyLeaveType")
def create_dutyLeave(data: dict):
    return create_dutyLeave_logic(data)
    


@router.get("/DutyLeaveType/{dutyLeaveType_cat}")
def get_by_type(dutyLeaveType_cat: str):

    data = DutyLeave_collection.find(
        {"dutyLeaveType_cat": dutyLeaveType_cat}
    )

    return [serialize_duty_leave(item) for item in data]



@router.get("/DutyLeaveType")
def get_all_types():

    data = DutyLeave_collection.find()

    return [serialize_duty_leave(item) for item in data]


@router.put("/DutyLeaveType/{item_id}")
def update_duty_leave(item_id: str, data: dict):

    DutyLeave_collection.update_one(
        {"_id": ObjectId(item_id)},
        {
            "$set": {
                "value": data.get("value"),
                "status": data.get("status"),
                "dutyLeaveType_cat": data.get("dutyLeaveType_cat")
            }
        }
    )

    return {"message": "Updated successfully"}



@router.delete("/DutyLeaveType/{DutyLeaveType_id}")
def delete_DutyLeaveType(DutyLeaveType_id: str):

    DutyLeave_collection.delete_one(
        {"_id": ObjectId(DutyLeaveType_id)}
    )

    return {"message": "Deleted successfully"}



############## System setting for 2 person leave ############

@router.get("/settings/group-leave-rule")
def get_group_leave_rule():

    setting = system_settings_collection.find_one(
        {"settingName": "singleLeavePerGroupPerDay"}
    )

    if not setting:
        return {"enabled": False}

    return {"enabled": setting.get("enabled", False)}

@router.put("/settings/group-leave-rule")
def update_group_leave_rule(data: dict):

    enabled = data.get("enabled", False)

    system_settings_collection.update_one(
        {"settingName": "singleLeavePerGroupPerDay"},
        {"$set": {"enabled": enabled}},
        upsert=True
    )

    return {
        "message": "Setting updated",
        "enabled": enabled
    }


@router.get("/employees/export")
def export_employees():

    data = list(employee_collection.find({}, {"_id": 0}))  # remove ObjectId

    return {
        "count": len(data),
        "data": data
    }

@router.post("/employees/import")
def import_employees(data: list):

    # Optional: clear existing data
    employee_collection.delete_many({})

    if data:
        employee_collection.insert_many(data)

    return {
        "message": "Employees imported successfully",
        "count": len(data)
    }


@router.get("/employees/export-excel")
def export_employees_excel():

    data = list(employee_collection.find({}, {"_id": 0}))

    wb = Workbook()
    ws = wb.active
    ws.title = "Employees"

    if not data:
        return {"message": "No data"}

    # Include optional fields even when the first document predates them.
    headers = list(dict.fromkeys(
        key for row in data for key in row.keys()
    ))
    ws.append(headers)

    # rows
    for row in data:
        ws.append([
            ", ".join(str(item) for item in row.get(h, []))
            if isinstance(row.get(h), list)
            else row.get(h, "")
            for h in headers
        ])

    stream = BytesIO()
    wb.save(stream)

    return Response(
        content=stream.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=employees.xlsx"
        }
    )


@router.post("/employees/import-excel")
async def import_employees_excel(file: UploadFile = File(...)):

    contents = ensure_upload_allowed(
        file,
        allowed_content_types={
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        },
        allowed_extensions={"xlsx", "xls"},
        max_bytes=5 * 1024 * 1024,
    )

    wb = load_workbook(BytesIO(contents))
    sheet = wb.active

    rows = list(sheet.iter_rows(values_only=True))

    headers = [h.strip() for h in rows[0]]
    data_rows = rows[1:]

    employees_processed = 0

    for row in data_rows:

        emp_raw = dict(zip(headers, row))

        user_id = str(emp_raw.get("userId")).strip() if emp_raw.get("userId") else None

        if not user_id:
            continue  # skip invalid rows

        # ============================
        # CLEAN + MAP DATA
        # ============================

        emp_data = {
            "name": emp_raw.get("name"),
            "designation": emp_raw.get("designation"),
            "userId": user_id,
            "seniorityOrder": normalize_seniority_order(
                emp_raw.get("seniorityOrder", emp_raw.get("Seniority Order"))
            ),
            "phone": emp_raw.get("phone"),
            "gmail": emp_raw.get("gmail"),

            "functionIds": normalize_list(emp_raw.get("functionIds")),

            "updatedAt": datetime.utcnow()
        }
        emp_data.update(resolve_employee_organization(emp_data["functionIds"], user_id))
        emp_data["vertical"] = (emp_data.get("verticals") or [None])[0]

        # ============================
        # UPSERT (UPDATE OR INSERT)
        # ============================

        employee_collection.update_one(
            {"userId": user_id},
            {
                "$set": emp_data,
                "$setOnInsert": {
                    "createdAt": datetime.utcnow()
                }
            },
            upsert=True
        )

        employees_processed += 1

    return {
        "message": "Excel processed successfully",
        "processed": employees_processed
    }



