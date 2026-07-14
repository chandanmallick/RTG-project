from fastapi import APIRouter, Depends, Response, UploadFile, File
from crew_legacy.admin_logic.employee import (
    create_employee_logic,
    get_all_employees_logic,
)
from crew_legacy.admin_logic.dropdown import (
    create_dropdown_logic,
    get_dropdown_by_type_logic
)

from bson import ObjectId
from crew_legacy.database.database_mongo import employee_collection
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




router = APIRouter(tags=["Admin"], dependencies=[Depends(require_admin)])


def serialize(emp):

    # ðŸ”¥ FETCH RELATED EMPLOYEES
    reporting = employee_collection.find_one({
        "userId": emp.get("reportingOfficerId")
    })

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
        "userId": emp.get("userId"),
        "phone": emp.get("phone"),
        "gmail": emp.get("gmail"),
        "dutyType": emp.get("dutyType"),
        "category": emp.get("category"),

        # ðŸ”¥ NEW FIELDS
        "vertical": emp.get("vertical"),
        "department": emp.get("department"),

        # ðŸ”¥ IDs (keep for logic)
        "reportingOfficerId": emp.get("reportingOfficerId"),
        "intermediaryReportingId": emp.get("intermediaryReportingId"),
        "hodId": emp.get("hodId"),

        # ðŸ”¥ NAMES (for frontend display)
        "reportingOfficerName": reporting.get("name") if reporting else None,
        "intermediaryReportingName": intermediary.get("name") if intermediary else None,
        "hodName": hod.get("name") if hod else None
    }



@router.post("/employees")  #### save employee entry to database
def create_employee(employee: dict):
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



@router.put("/employees/{employee_id}")
def update_employee(employee_id: str, data: dict):

    update_data = {
        "name": data.get("name"),
        "nameHindi": data.get("nameHindi"),
        "designation": data.get("designation"),
        "designationHindi": data.get("designationHindi"),
        "userId": data.get("userId"),
        "phone": data.get("phone"),
        "gmail": data.get("gmail"),
        "dutyType": data.get("dutyType"),
        "category": data.get("category")
    }

    password = data.get("password")
    if password:
        validate_password_policy(password)
        update_data["password"] = password if password.startswith("$2") else hash_password(password)

    employee_collection.update_one(
        {"_id": ObjectId(employee_id)},
        {"$set": update_data}
    )

    return {"message": "Employee updated successfully"}

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

    # headers
    headers = list(data[0].keys())
    ws.append(headers)

    # rows
    for row in data:
        ws.append([row.get(h, "") for h in headers])

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
            "phone": emp_raw.get("phone"),
            "gmail": emp_raw.get("gmail"),

            "vertical": emp_raw.get("vertical"),
            "department": emp_raw.get("department"),

            # ðŸ”¥ IMPORTANT MAPPING (userId based)
            "reportingOfficerId": str(emp_raw.get("reportingOfficerId")).strip() if emp_raw.get("reportingOfficerId") else None,
            "intermediaryReportingId": str(emp_raw.get("intermediaryReportingId")).strip() if emp_raw.get("intermediaryReportingId") else None,
            "hodId": str(emp_raw.get("hodId")).strip() if emp_raw.get("hodId") else None,

            "updatedAt": datetime.utcnow()
        }

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



