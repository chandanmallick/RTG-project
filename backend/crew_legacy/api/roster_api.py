# roster_api.py

from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta
from bson import ObjectId
from collections import defaultdict
from pymongo import UpdateOne
from fastapi.responses import FileResponse
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.platypus import HRFlowable
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase import pdfmetrics
import os
import logging
from fastapi import UploadFile, File
import pandas as pd
from crew_legacy.security_utils import ensure_upload_allowed

from crew_legacy.database.database_mongo import (
    cycle_config_collection,
    roster_group_collection,
    roster_collection,
    roster_master_collection,
    compensatory_off_collection,
    roster_master_collection,
    employee_collection,
    employee_shift_history
)

from crew_legacy.database.database_mongo import roster_master_collection, employee_daily_collection, holiday_master_collection
from crew_legacy.services.daily_service import generate_or_update_daily_from_roster

router = APIRouter()

DUTY_SEQUENCE = ["E1","E2","M1","M2","N1","N2","O1","O2"]

def calculate_expiry(date_str):
    from datetime import datetime

    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return f"{dt.year + 1}-03-31"


def get_emp_id(obj):
    return (obj.get("employeeId") or obj.get("id") or "").strip()


def enrich_authority_snapshot(authority: dict | None):
    if not authority:
        return None

    employee_id = (
        authority.get("employeeId")
        or authority.get("userId")
        or authority.get("id")
        or ""
    ).strip()

    lookup = {}
    if employee_id:
        lookup = employee_collection.find_one({
            "$or": [
                {"employeeId": employee_id},
                {"userId": employee_id},
            ]
        }) or {}
    elif authority.get("name"):
        lookup = employee_collection.find_one({"name": authority.get("name")}) or {}

    return {
        "employeeId": employee_id or lookup.get("employeeId") or lookup.get("userId") or "",
        "name": authority.get("name") or lookup.get("name") or "",
        "nameHindi": authority.get("nameHindi") or lookup.get("nameHindi") or "",
        "designation": authority.get("designation") or lookup.get("designation") or "",
        "designationHindi": authority.get("designationHindi") or lookup.get("designationHindi") or "",
    }

# =====================================================
# CYCLE SETUP
# =====================================================

@router.post("/cycle-setup")
def save_cycle_setup(data: dict):

    if not data.get("baseDate") or not data.get("groups"):
        raise HTTPException(400, "baseDate & groups required")

    cycle_config_collection.delete_many({})
    cycle_config_collection.insert_one(data)

    return {"message": "Cycle setup saved"}


@router.get("/cycle-setup")
def get_cycle_setup():
    config = cycle_config_collection.find_one()
    if not config:
        return {}
    return {
        "baseDate": config["baseDate"],
        "groups": config["groups"]
    }


# =====================================================
# GROUP MASTER (MAX 4 ACTIVE)
# =====================================================

@router.post("/group")
def create_group(data: dict):

    members = []
    for m in data.get("members", []):
        emp_id = get_emp_id(m)
        if not emp_id:
            continue

        members.append({
            "employeeId": emp_id,
            "name": m.get("name"),
            "designation": m.get("designation")
        })

    sic_raw = data.get("shiftInCharge") or {}

    sic = None
    if sic_raw:
        sic = {
            "employeeId": get_emp_id(sic_raw),
            "name": sic_raw.get("name"),
            "designation": sic_raw.get("designation")
        }

    roster_group_collection.insert_one({
        "groupName": data["groupName"],
        "startDate": data.get("startDate"),
        "endDate": data.get("endDate"),
        "members": members,
        "shiftInCharge": sic,
        "isActive": True
    })

    return {"message": "Group saved successfully"}


@router.get("/group")
def get_groups():

    groups = roster_group_collection.find({})   # ðŸ”¥ REMOVE FILTER

    return [
        {
            "id": str(g["_id"]),
            "groupName": g.get("groupName"),
            "members": g.get("members", []),
            "shiftInCharge": g.get("shiftInCharge"),
            "startDate": g.get("startDate"),
            "endDate": g.get("endDate"),
            "isActive": g.get("isActive", True)
        }
        for g in groups
    ]

@router.put("/group/toggle-status/{group_id}")
def toggle_group_status(group_id: str):

    try:
        object_id = ObjectId(group_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid group ID")

    group = roster_group_collection.find_one({"_id": object_id})

    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    new_status = not group.get("isActive", True)

    roster_group_collection.update_one(
        {"_id": object_id},
        {
            "$set": {
                "isActive": new_status,
                "updatedOn": datetime.utcnow()
            }
        }
    )

    return {
        "message": "Group status updated",
        "isActive": new_status
    }


@router.put("/group/update/{group_id}")
def update_group(group_id: str, data: dict):

    try:
        object_id = ObjectId(group_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid group ID")

    update_fields = {}

    if "groupName" in data:
        update_fields["groupName"] = data["groupName"]

    if "startDate" in data:
        update_fields["startDate"] = data["startDate"]

    if "endDate" in data:
        update_fields["endDate"] = data["endDate"]

    # ðŸ”¥ FIX MEMBERS
    if "members" in data:
        members = []
        for m in data.get("members", []):
            emp_id = get_emp_id(m)
            if not emp_id:
                continue

            members.append({
                "employeeId": emp_id,
                "name": m.get("name"),
                "designation": m.get("designation")
            })

        update_fields["members"] = members

    # ðŸ”¥ FIX SIC
    if "shiftInCharge" in data:
        sic_raw = data.get("shiftInCharge") or {}

        update_fields["shiftInCharge"] = {
            "employeeId": get_emp_id(sic_raw),
            "name": sic_raw.get("name"),
            "designation": sic_raw.get("designation")
        }

    update_fields["updatedOn"] = datetime.utcnow()

    roster_group_collection.update_one(
        {"_id": object_id},
        {"$set": update_fields}
    )

    return {"message": "Group updated successfully"}

# =====================================================
# GENERATE PREVIEW
# =====================================================

@router.post("/generate")
def generate_roster(data: dict):

    start_date = datetime.strptime(data["startDate"], "%Y-%m-%d")
    end_date = datetime.strptime(data["endDate"], "%Y-%m-%d")

    config = cycle_config_collection.find_one()
    if not config:
        raise HTTPException(400, "Cycle not configured")

    base_date = datetime.strptime(config["baseDate"], "%Y-%m-%d")
    engine_groups = config["groups"]

    active_groups = list(roster_group_collection.find({"isActive": True}))

    if len(active_groups) != 4:
        raise HTTPException(400, "Exactly 4 active groups required")

    roster_collection.delete_many({})

    result = []

    for g in active_groups:

        engine_group = next(
            (eg for eg in engine_groups if eg["groupName"] == g["groupName"]),
            None
        )

        if not engine_group:
            raise HTTPException(400, f"No engine config for {g['groupName']}")

        start_index = DUTY_SEQUENCE.index(engine_group["startDuty"])

        group_data = {}
        current = start_date

        while current <= end_date:
            diff = (current - base_date).days
            duty_index = (start_index + diff) % 8
            group_data[current.strftime("%Y-%m-%d")] = DUTY_SEQUENCE[duty_index]
            current += timedelta(days=1)

        roster_collection.insert_one({
            "groupName": g["groupName"],
            "members": g["members"],
            "shiftInCharge": g["shiftInCharge"],
            "startDate": data["startDate"],
            "endDate": data["endDate"],
            "data": group_data
        })

        result.append({
            "groupName": g["groupName"],
            "members": g["members"],
            "shiftInCharge": g["shiftInCharge"],
            "data": group_data
        })

    return result


# =====================================================
# SAVE ROSTER
# =====================================================
DEFAULT_INSTRUCTIONS = "1.  Shift Timing: Morning Shift (08:30-14:30hrs), Evening Shift (14:30-20:30hrs), Night Shift (20:30-08:30hrs [Next day]). 2. Shri Debashis Mondal, Shri Akash Kumar Modi, Shri Sumanta Sadhukhan & Shri SSK Suman shall report to Control Room 15 minutes before the commencement of shift duty to note the salient status of the Grid from the previous shift and may leave 15 minutes before the scheduled time. 3. Shift In Charge of a group will assign different responsibilities to his team members. Every Shift-in-charge shall nominate one person from his sub-ordinates to look after the RTSD work."
DEFAULT_ROSTER_HEADER = {
    "organizationHindi": "ग्रिड कंट्रोलर ऑफ इंडिया लिमिटेड (ग्रिड-इंडिया)",
    "officeHindi": "पूर्वी क्षेत्रीय भार प्रेषण केंद्र, कोलकाता",
    "organizationEnglish": "Grid Controller of India Limited (GRID-INDIA)",
    "officeEnglish": "EASTERN REGIONAL LOAD DESPATCH CENTRE, KOLKATA",
    "rosterTitle": "CONTROL ROOM SHIFT DUTY ROSTER",
}


def roster_header(value: dict | None) -> dict:
    return {**DEFAULT_ROSTER_HEADER, **(value or {})}

@router.post("/saveroster")
def save_roster(data: dict):

    start_date = data.get("startDate")
    end_date = data.get("endDate")
    is_final = data.get("isFinal", False)

    if not start_date or not end_date:
        raise HTTPException(status_code=400, detail="Date range required")

    instructions = data.get("instructions") or DEFAULT_INSTRUCTIONS

    # ðŸ”¹ Leave Approving Authority (NEW)
    leave_auth_raw = data.get("leaveAuthority") or {}

    leave_authority_snapshot = {
        "employeeId": leave_auth_raw.get("employeeId") or leave_auth_raw.get("userId") or leave_auth_raw.get("id"),
        "name": leave_auth_raw.get("name"),
        "designation": leave_auth_raw.get("designation")
    }

    # ðŸ”¹ FETCH ACTIVE GROUP SNAPSHOT
    active_groups = list(roster_group_collection.find({"isActive": True}))
    group_snapshot = []

    for g in active_groups:

        sic = g.get("shiftInCharge", {}) or {}

        shift_incharge_snapshot = {
            "name": sic.get("name"),
            "designation": sic.get("designation"),
            "employeeId": sic.get("employeeId") or sic.get("id")
        }

        members_snapshot = []

        for m in g.get("members", []):
            members_snapshot.append({
                "name": m.get("name"),
                "designation": m.get("designation"),
                "employeeId": m.get("employeeId") or m.get("id")
            })

        group_snapshot.append({
            "groupName": g.get("groupName"),
            "shiftInCharge": shift_incharge_snapshot,
            "members": members_snapshot
        })

    signed = data.get("signedBy") or {}

    signed_snapshot = {
        "employeeId": signed.get("employeeId") or signed.get("userId") or signed.get("id"),
        "name": signed.get("name"),
        "nameHindi": signed.get("nameHindi"),
        "designation": signed.get("designation"),
        "designationHindi": signed.get("designationHindi")
    }

    roster_id = roster_master_collection.insert_one({
        "startDate": start_date,
        "endDate": end_date,
        "data": data.get("data", []),
        "groupDetails": group_snapshot,
        "instructions": instructions,
        "header": roster_header(data.get("header")),
        "signedBy": signed_snapshot,
        "leaveAuthority": leave_authority_snapshot,   # âœ… FIXED
        "signedOn": datetime.utcnow() if is_final else None,
        "isFinal": is_final,
        "createdOn": datetime.utcnow(),
        "calendarPushed": False,
        "distribution": data.get("distribution"),
    }).inserted_id

    return {
        "message": "Roster saved",
        "rosterId": str(roster_id)
    }

# =====================================================
# HISTORY
# =====================================================

@router.get("/rosterhistory")
def history():

    data = roster_master_collection.find().sort("createdOn", -1)

    return [
        {
            "id": str(r["_id"]),
            "startDate": r["startDate"],
            "endDate": r["endDate"],
            "isFinal": r.get("isFinal", False),
            "calendarPushed": r.get("calendarPushed", False)
        }
        for r in data
    ]


# =====================================================
# LOAD
# =====================================================

@router.get("/loadroster/{roster_id}")
def load_roster(roster_id: str):

    roster = roster_master_collection.find_one({"_id": ObjectId(roster_id)})

    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")

    return {
        "startDate": roster["startDate"],
        "endDate": roster["endDate"],
        "data": roster["data"],
        "groupDetails": roster.get("groupDetails", []),
        "instructions": roster.get("instructions"),
        "header": roster_header(roster.get("header")),
        "distribution": roster.get("distribution", ""),
        "signedBy": enrich_authority_snapshot(roster.get("signedBy")),
        "leaveAuthority": enrich_authority_snapshot(roster.get("leaveAuthority")),
        "signedOn": roster.get("signedOn"),
        "isFinal": roster.get("isFinal", False),
        "calendarPushed": roster.get("calendarPushed", False)
    }



# =========================================================
# Download PDF Roster (UPDATED PROFESSIONAL FORMAT)
# =========================================================

@router.post("/downloadpdf")
def download_roster_pdf(data: dict):


    import os
    import subprocess
    from jinja2 import Environment, FileSystemLoader
    from fastapi.responses import FileResponse
    from datetime import datetime
    import logging

    print("Incoming PDF Data:", data)

    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    template_env = Environment(
        loader=FileSystemLoader(os.path.join(BASE_DIR, "templates"))
    )
    template = template_env.get_template("roster_template.html")

    roster_data = data.get("data")
    roster = roster_master_collection.find_one(
        {"_id": ObjectId(data.get("rosterId"))}
    ) if data.get("rosterId") else roster_master_collection.find_one(
        sort=[("createdOn", -1)]
    )

    group_details = roster.get("groupDetails", []) if roster else []
    group_details = sorted(
        group_details,
        key=lambda g: int(g.get("groupName", "Group-99").split("-")[-1])
    )

    signed_raw = data.get("signedBy")

    def lookup_employee_snapshot(source):
        if not source:
            return {}
        candidate_ids = [source.get("employeeId"), source.get("userId"), source.get("id")]
        candidate_ids = [str(value).strip() for value in candidate_ids if value]
        query = {"$or": []}
        for value in candidate_ids:
            query["$or"].append({"employeeId": value})
            query["$or"].append({"userId": value})
            query["$or"].append({"name": value})
        if not query["$or"] and source.get("name"):
            query["$or"].append({"name": source.get("name")})
        if not query["$or"]:
            return {}
        found = employee_collection.find_one(query)
        return found or {}

    # Default values
    sign_name_english = ""
    sign_name_hindi = ""
    sign_designation = ""
    sign_designation_hindi = ""
    sign_employee_id = ""

    # If signedBy is full object (new structure)
    if isinstance(signed_raw, dict):
        resolved = lookup_employee_snapshot(signed_raw)

        sign_name_english = signed_raw.get("name") or resolved.get("name", "")
        sign_name_hindi = signed_raw.get("nameHindi") or resolved.get("nameHindi", "")
        sign_designation = signed_raw.get("designation") or resolved.get("designation", "")
        sign_designation_hindi = signed_raw.get("designationHindi") or resolved.get("designationHindi", "")
        sign_employee_id = signed_raw.get("employeeId") or signed_raw.get("userId") or signed_raw.get("id") or resolved.get("employeeId") or resolved.get("userId") or ""

    # If signedBy is old string format (legacy support)
    elif isinstance(signed_raw, str):
        resolved = lookup_employee_snapshot({"name": signed_raw})
        sign_name_english = resolved.get("name") or signed_raw
        sign_name_hindi = resolved.get("nameHindi", "")
        sign_designation = resolved.get("designation", "")
        sign_designation_hindi = resolved.get("designationHindi", "")
        sign_employee_id = resolved.get("employeeId") or resolved.get("userId") or ""

    # If None or anything else -> keep default empty values

    if not roster_data:
        raise Exception("Roster data missing")

    dates = list(roster_data[0]["data"].keys())

    from datetime import datetime

    start_date_raw = data.get("startDate")
    end_date_raw = data.get("endDate")

    start_date = datetime.strptime(start_date_raw, "%Y-%m-%d").strftime("%d-%b-%Y").upper()
    end_date = datetime.strptime(end_date_raw, "%Y-%m-%d").strftime("%d-%b-%Y").upper()


    # sign_employee = next(
    #     (e for e in employees if e["name"] == data.get("signedBy")),
    #     {}
    # )

    # ==========================================
    # ðŸ”¥ BUILD GROUP-WISE MATRIX (REQUIRED FOR TEMPLATE)
    # ==========================================

    from collections import defaultdict

    group_map = defaultdict(dict)

    # ==========================================
    # ðŸ”¥ CORRECT GROUP-WISE MATRIX BUILD
    # ==========================================

    group_map = {}

    for rec in roster.get("data", []):

        group_name = rec.get("groupName")
        group_dates = rec.get("data", {})   # âœ… THIS IS KEY

        if not group_name:
            continue

        group_map[group_name] = group_dates


    # Convert to template format
    roster_data = [
        {
            "groupName": g,
            "data": group_map[g]
        }
        for g in group_map
    ]

    roster_data = sorted(
        roster_data,
        key=lambda x: int(x["groupName"].split("-")[-1])
    )

    html_content = template.render(
        roster_data=roster_data,
        group_details=group_details,
        start_date=start_date,
        end_date=end_date,
        instructions=data.get("instructions", "").replace("\n", "<br>"),
        distribution=data.get("distribution", "").replace("\n", "<br>"),
        dates=dates,
        generated_on=datetime.now().strftime("%d-%m-%Y %H:%M"),
        header=roster_header(data.get("header") or (roster or {}).get("header")),
        sign_name_english=sign_name_english,
        sign_name_hindi=sign_name_hindi,
        sign_designation=sign_designation,
        sign_designation_hindi=sign_designation_hindi,
        sign_employee_id=sign_employee_id
        # sign_designation = data.get("signedDesignation", "")
    )
    print(html_content, roster_data)

    temp_html = os.path.join(BASE_DIR, "temp_roster.html")
    with open(temp_html, "w", encoding="utf-8") as f:
        f.write(html_content)

    output_pdf = os.path.join(BASE_DIR, "Duty_Roster.pdf")

    # ðŸ”¥ Chrome path (adjust if needed)
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

    subprocess.run([
        chrome_path,
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        f"--print-to-pdf={output_pdf}",
        temp_html
    ], check=True)

    os.remove(temp_html)

    return FileResponse(
        output_pdf,
        media_type="application/pdf",
        filename=f"Duty_Roster_{start_date_raw}_to_{end_date_raw}.pdf"
    )


@router.get("/debug/groupdetails/latest")
def debug_latest_groupdetails():

    roster = roster_master_collection.find_one(
        sort=[("createdOn", -1)]
    )

    if not roster:
        return {"message": "No roster found in roster_master_collection"}

    return {
        "rosterId": str(roster["_id"]),
        "startDate": roster.get("startDate"),
        "endDate": roster.get("endDate"),
        "groupDetails_type": str(type(roster.get("groupDetails"))),
        "groupDetails_length": len(roster.get("groupDetails", [])),
        "groupDetails": roster.get("groupDetails"),
        "Signed by": roster.get("signedBy"),
    }


# =========================================================
# Push to calender (create separate daily employee dictionary)
# =========================================================


from datetime import datetime, timedelta

def update_shift_history(roster):

    from crew_legacy.database.database_mongo import employee_shift_history

    start_date = roster.get("startDate")
    end_date = roster.get("endDate")

    if not start_date:
        return

    # ==========================================
    # BUILD EMPLOYEE â†’ GROUP MAP FROM ROSTER
    # ==========================================
    roster_data = roster.get("data", [])
    group_details = roster.get("groupDetails", [])

    emp_group_map = {}

    for group in roster_data:

        group_name = group.get("groupName")

        group_info = next(
            (g for g in group_details if g["groupName"] == group_name),
            {}
        )

        members = group_info.get("members", [])
        sic = group_info.get("shiftInCharge")

        all_members = members.copy()
        if sic:
            all_members.append(sic)

        for m in all_members:

            emp_id = (m.get("employeeId") or "").strip()

            if not emp_id:
                continue

            emp_group_map[emp_id] = {
                "groupName": group_name,
                "name": m.get("name"),
                "designation": m.get("designation")
            }

    # ==========================================
    # GET ALL ACTIVE RECORDS
    # ==========================================
    active_records = list(employee_shift_history.find({
        "isActive": True
    }))

    active_map = {
        r["employeeId"]: r for r in active_records
    }

    new_start_dt = datetime.strptime(start_date, "%Y-%m-%d")

    # ==========================================
    # STEP 1: HANDLE EXISTING EMPLOYEES
    # ==========================================
    for emp_id, existing in active_map.items():

        existing_group = existing.get("groupName")
        existing_start = existing.get("startDate")

        # ðŸ”¥ SAFETY CHECK
        if not existing_start:
            # Option 1: skip bad record
            continue

        try:
            existing_start_dt = datetime.strptime(existing_start, "%Y-%m-%d")
        except Exception:
            # Option 2: skip invalid format
            continue

        new_data = emp_group_map.get(emp_id)

        # ------------------------------------------
        # CASE A: EMPLOYEE REMOVED FROM SHIFT
        # ------------------------------------------
        if not new_data:

            # close if overlapping
            if existing_start_dt < new_start_dt:

                employee_shift_history.update_one(
                    {"_id": existing["_id"]},
                    {
                        "$set": {
                            "endDate": (new_start_dt - timedelta(days=1)).strftime("%Y-%m-%d"),
                            "isActive": False,
                            "updatedOn": datetime.utcnow()
                        }
                    }
                )

            else:
                # future record â†’ delete
                employee_shift_history.delete_one({"_id": existing["_id"]})

            continue

        # ------------------------------------------
        # CASE B: SAME GROUP â†’ CONTINUE
        # ------------------------------------------
        if existing_group == new_data["groupName"]:
            continue

        # ------------------------------------------
        # CASE C: GROUP CHANGED
        # ------------------------------------------
        if existing_start_dt < new_start_dt:

            # close old properly
            employee_shift_history.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "endDate": (new_start_dt - timedelta(days=1)).strftime("%Y-%m-%d"),
                        "isActive": False,
                        "updatedOn": datetime.utcnow()
                    }
                }
            )

        else:
            # invalid future â†’ delete
            employee_shift_history.delete_one({"_id": existing["_id"]})

    # ==========================================
    # STEP 2: CREATE NEW RECORDS
    # ==========================================
    for emp_id, data in emp_group_map.items():

        existing = employee_shift_history.find_one({
            "employeeId": emp_id,
            "isActive": True
        })

        # already handled SAME GROUP
        if existing:
            continue

        employee_shift_history.insert_one({
            "employeeId": emp_id,
            "name": data.get("name"),
            "designation": data.get("designation"),

            "groupName": data.get("groupName"),

            "startDate": start_date,
            "endDate": None,

            "isActive": True,

            "createdOn": datetime.utcnow()
        })

@router.post("/push-to-calendar/{roster_id}")
def push_roster_to_calendar(roster_id: str):

    try:
        object_id = ObjectId(roster_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid roster ID")

    # ==========================================
    # FETCH ROSTER (FIXES YOUR ERROR)
    # ==========================================
    roster = roster_master_collection.find_one({"_id": object_id})
    print("ðŸ”¥ PUSH CALLED")
    print("Roster ID:", roster_id)
    print("Is Final:", roster.get("isFinal"))
    print("Data length:", len(roster.get("data", [])))

    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")

    is_final = roster.get("isFinal", False)

    start_date = roster.get("startDate")
    end_date = roster.get("endDate")

    roster_data_raw = roster.get("data", [])
    group_details = roster.get("groupDetails", [])
    DiC = roster.get("leaveAuthority", [])
    print("Start of data")
    print(roster)
    print("end of data")

    roster_data = []

    for group in roster_data_raw:

        group_name = group.get("groupName")
        group_dates = group.get("data", {})

        # find members from snapshot
        group_info = next(
            (g for g in group_details if g["groupName"] == group_name),
            {}
        )

        members = group_info.get("members", [])
        sic = group_info.get("shiftInCharge")

        all_members = members.copy()

        if sic:
            all_members.append(sic)

        for date_str, shift in group_dates.items():

            for m in all_members:

                emp_id = (m.get("employeeId") or "").strip()

                is_sic_flag = False

                if sic and emp_id == (sic.get("employeeId") or "").strip():
                    is_sic_flag = True

                roster_data.append({
                    "employeeId": emp_id,
                    "name": m.get("name"),
                    "designation": m.get("designation"),
                    "groupName": group_name,
                    "date": date_str,
                    "shift": shift,
                    "isSIC": is_sic_flag   # ðŸ”¥ FIX
                })

    # ==========================================
    # FINAL â†’ CLEAN OLD DATA
    # ==========================================
    if is_final:
        employee_daily_collection.delete_many({
            "date": {"$gte": start_date, "$lte": end_date},
            "dataSource": "Roster"
        })

    bulk_operations = []
    # print(roster_data)

    for rec in roster_data:

        employee_id = (rec.get("employeeId") or "").strip()
        name = rec.get("name")
        designation = rec.get("designation")
        group_name = rec.get("groupName")
        date_str = rec.get("date")
        shift = rec.get("shift")

        is_holiday = rec.get("isHoliday", "N")
        is_sic = rec.get("isSIC", False)

        sic_details = rec.get("sic")
        department_ic = DiC

        # ==========================================
        # SHIFT CONVERSION (CUSTOMIZE IF NEEDED)
        # ==========================================
        def map_shift(shift):
            if shift in ["M1", "M2"]:
                return "Morning"
            elif shift in ["E1", "E2"]:
                return "Evening"
            elif shift in ["N1", "N2"]:
                return "Night"
            elif shift in ["O1", "O2", "OFF"]:
                return "OFF"
            return shift  # fallback

        converted_shift = map_shift(shift)

        # ==========================================
        # CHECK EXISTING RECORD
        # ==========================================
        filter_query = {
            "employeeId": employee_id,
            "date": date_str
        }

        existing_record = employee_daily_collection.find_one(filter_query)

        has_leave = False
        has_training = False

        if existing_record:
            if existing_record.get("leaveStatus") in ["Approved", "Pending"]:
                has_leave = True

            if existing_record.get("trainingName"):
                has_training = True

        # ==========================================
        # BUILD SAFE UPDATE
        # ==========================================



        set_fields = {
            "name": name,
            "designation": designation,
            "groupName": group_name,
            "updatedOn": datetime.utcnow(),

            "isHoliday": is_holiday,
            "compensatoryOffEligible": "Yes" if is_holiday == "Y" else "No"
        }

        # âŒ DO NOT override leave/training
        if not has_leave and not has_training:
            set_fields.update({
                "assignedDuty": converted_shift,
                "actualStatus": converted_shift,
                "dutyAsPerLogbook": converted_shift
            })

        # âœ… FINAL vs DRAFT
        if is_final:
            set_fields.update({
                "attachedRosterId": str(object_id),
                "rosterVersion": str(object_id),
                "isFinalRoster": True,
                "rosterType": "FINAL"
            })
        else:
            set_fields.update({
                "isFinalRoster": False,
                "rosterType": "DRAFT"
            })

        update_doc = {
            "$set": set_fields,
            "$setOnInsert": {
                "employeeId": employee_id,
                "date": date_str,
                "year": int(date_str[:4]),
                "month": int(date_str[5:7]),
                "flag": "Duty",
                "isEditable": True,
                "dataSource": "Roster",

                "isSIC": is_sic,

                "sic": {
                    "employeeId": sic_details.get("employeeId") if sic_details else None,
                    "name": sic_details.get("name") if sic_details else None,
                    "designation": sic_details.get("designation") if sic_details else None,
                    "type": "permanent"
                } if sic_details else None,

                "departmentIC": department_ic,

                "trainingName": None,
                "trainingLocation": None,
                "leaveRequestId": None,
                "leaveStatus": None,
                "exchangeRequestId": None,
                "exchangeStatus": None,
                "remarks": None,

                "createdOn": datetime.utcnow()
            }
        }

        bulk_operations.append(
            UpdateOne(filter_query, update_doc, upsert=True)
        )

        # ==========================================
        # C-OFF ONLY FOR FINAL
        # ==========================================
        if is_final and is_holiday == "Y" and converted_shift not in ["OFF", None]:
            coff_doc = {
                "employeeId": employee_id,
                "date": date_str,
                "earnedDate": date_str,
                "expiryDate": f"{int(date_str[:4]) + 1}-03-31",
                "status": "Available",
                "reason": "Duty performed on roster holiday",
                "type": "C-OFF",
                "createdOn": datetime.utcnow(),
                "rosterId": str(object_id),
                "reference": {"type": "Roster", "rosterId": str(object_id)},
            }

            compensatory_off_collection.update_one(
                {
                    "employeeId": employee_id,
                    "date": date_str,
                    "type": "C-OFF"
                },
                {"$setOnInsert": coff_doc},
                upsert=True
            )
            compensatory_off_collection.update_one(
                {
                    "employeeId": employee_id,
                    "date": date_str,
                    "type": "C-OFF",
                    "status": {"$exists": False},
                },
                {
                    "$set": {
                        "earnedDate": date_str,
                        "expiryDate": f"{int(date_str[:4]) + 1}-03-31",
                        "status": "Available",
                        "reason": "Duty performed on roster holiday",
                        "reference": {"type": "Roster", "rosterId": str(object_id)},
                    }
                },
            )

    # ==========================================
    # EXECUTE BULK
    # ==========================================
    if bulk_operations:
        employee_daily_collection.bulk_write(bulk_operations)

    # ðŸ”¥ UPDATE SHIFT HISTORY (NEW ENGINE)

    if is_final:
        update_shift_history(roster)

    # ==========================================
    # MARK CALENDAR PUSHED
    # ==========================================
    roster_master_collection.update_one(
        {"_id": object_id},
        {"$set": {"calendarPushed": True}}
    )

    return {
        "message": "Roster pushed successfully",
        "type": "FINAL" if is_final else "DRAFT"
    }

# =========================================================
# calender View page
# =========================================================


from collections import defaultdict
from fastapi import APIRouter, Query
from crew_legacy.database.database_mongo import employee_daily_collection



from collections import defaultdict
from fastapi import Query


def normalize_members(members):
    normalized = []
    for m in members:
        emp_id = (m.get("employeeId") or m.get("id") or "").strip()

        if not emp_id:
            continue

        normalized.append({
            "employeeId": emp_id,
            "name": m.get("name"),
            "designation": m.get("designation")
        })
    return normalized

@router.get("/calendar-view")
def get_calendar_view(
    start_date: str = Query(...),
    end_date: str = Query(...)
):

    # ==========================================
    # 1ï¸âƒ£ GET MASTER ROSTER (SOURCE OF ROWS)
    # ==========================================
    roster = roster_master_collection.find_one(
        {"calendarPushed": True},
        sort=[("createdOn", -1)]
    )

    if not roster:
        raise HTTPException(404, "No active roster found")

    group_details = roster.get("groupDetails", [])

    group_members_map = {}

    for g in group_details:

        group_name = g.get("groupName")

        members = g.get("members", [])
        sic = g.get("shiftInCharge")

        all_members = []

        for m in members:
            all_members.append({
                "employeeId": get_emp_id(m),
                "name": m.get("name"),
                "designation": m.get("designation"),
                "IsSIC": False
            })

        # ðŸ”¥ Add permanent SIC
        if sic:
            all_members.append({
                "employeeId": (sic.get("employeeId") or "").strip(),
                "name": sic.get("name"),
                "designation": sic.get("designation"),
                "IsSIC": True
            })

        group_members_map[group_name] = all_members

    # ==========================================
    # 2ï¸âƒ£ FETCH DAILY RECORDS (ONLY FOR CELLS)
    # ==========================================
    records = list(employee_daily_collection.find({
        "date": {"$gte": start_date, "$lte": end_date},
        "employeeId": {"$exists": True, "$ne": None}
    }))

    # ==========================================
    # ðŸ”¥ STEP 1: BUILD REPLACEMENT MAP
    # ==========================================
    replacement_map = {}

    for rec in records:

        if rec.get("replacementDuty"):

            rep_for = rec.get("replacementFor")

            if not rep_for:
                continue

            leave_emp_id = (rep_for.get("employeeId") or "").strip()
            date = rec.get("date")

            if leave_emp_id and date:
                replacement_map[(leave_emp_id, date)] = {
                    "employeeId": (rec.get("employeeId") or "").strip(),
                    "name": rec.get("name")
                }

    # ==========================================
    # 3ï¸âƒ£ CREATE LOOKUP MAP
    # ==========================================
    daily_map = defaultdict(dict)

    for rec in records:

        emp_id = (rec.get("employeeId") or "").strip()
        date = rec.get("date")

        if not emp_id or not date:
            continue

        # ðŸ”¥ TEMP SIC DETECTION
        temp_sic_flag = False
        sic_data = rec.get("sic")

        if sic_data and sic_data.get("type") == "temporary":
            if sic_data.get("employeeId") == emp_id:
                temp_sic_flag = True



        # ðŸ”¥ GET REPLACEMENT FOR THIS EMPLOYEE (IF ANY)
        replacement = replacement_map.get((emp_id, date))

        daily_map[(emp_id, date)] = {
            "shift": rec.get("assignedDuty") or "-",
            "leaveType": rec.get("leaveType"),
            "leaveStatus": rec.get("leaveStatus"),

            # ðŸ”¥ FIX: Inject correct replacement
            "replacementEmployee": replacement,

            "tempSIC": temp_sic_flag
        }

    # ==========================================
    # 4ï¸âƒ£ BUILD FINAL RESPONSE (ROW FROM ROSTER)
    # ==========================================
    final_output = []

    # generate all dates in range
    from datetime import datetime, timedelta

    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d")

    date_list = []
    curr = start_dt
    while curr <= end_dt:
        date_list.append(curr.strftime("%Y-%m-%d"))
        curr += timedelta(days=1)

    # build group-wise output
    def group_sort_key(g):
        try:
            return int(g.split("-")[1])
        except:
            return 999
    for group_name in sorted(group_members_map.keys(), key=group_sort_key):

        members = group_members_map[group_name]

        emp_list = []

        for emp in members:

            emp_id = emp["employeeId"]

            duties = {}

            for d in date_list:

                duty = daily_map.get((emp_id, d))

                if duty:
                    duties[d] = duty
                else:
                    duties[d] = {
                        "shift": "-",
                        "leaveType": None,
                        "leaveStatus": None,
                        "replacementEmployee": None,
                        "tempSIC": False
                    }

            emp_list.append({
                "employeeId": emp_id,
                "name": emp.get("name"),
                "designation": emp.get("designation"),
                "IsSIC": emp.get("IsSIC"),
                "duties": duties
            })

        # ðŸ”¥ SIC always on top
        emp_list.sort(key=lambda x: x["IsSIC"], reverse=True)

        final_output.append({
            "groupName": group_name,
            "employees": emp_list
        })

    return final_output


################# Departmental


def _org_list(value):
    if isinstance(value, list):
        items = value
    elif value in [None, ""]:
        return []
    else:
        items = str(value).split(",")
    return list(dict.fromkeys(
        str(item).strip() for item in items if str(item).strip()
    ))


def _employee_verticals(employee):
    return _org_list(employee.get("verticals") or employee.get("vertical")) or ["Others"]


def _employee_reporting_ids(employee):
    return _org_list(
        employee.get("reportingOfficerIds") or employee.get("reportingOfficerId")
    )


@router.get("/employees/org-structure")
def get_org_structure():

    employees = list(employee_collection.find({}))

    structure = {}

    # Helper map for name lookup
    emp_map = {e.get("userId"): e for e in employees if e.get("userId")}

    for emp in employees:

        dept = emp.get("department") or "General"
        reporting_ids = _employee_reporting_ids(emp)

        officer_names = [
            emp_map[officer_id].get("name")
            for officer_id in reporting_ids
            if officer_id in emp_map
        ] or ["Direct"]

        for vertical in _employee_verticals(emp):
            vertical_group = structure.setdefault(vertical, {})
            for officer_name in officer_names:
                department_group = vertical_group.setdefault(officer_name, {})
                department_group.setdefault(dept, []).append({
                    "name": emp.get("name"),
                    "designation": emp.get("designation"),
                    "userId": emp.get("userId"),
                    "reportingOfficerIds": reporting_ids,
                })

    return structure


@router.get("/employees/org-tree")
def get_org_tree(vertical: str | None = Query(default=None)):

    employees = list(employee_collection.find({}))
    employees = [employee for employee in employees if employee.get("userId")]
    available_verticals = sorted({
        name for employee in employees for name in _employee_verticals(employee)
    })
    selected_verticals = [vertical] if vertical else available_verticals

    def person_node(employee, children_map, path):
        employee_id = employee.get("userId")
        if employee_id in path:
            return None
        child_path = {*path, employee_id}
        children = [
            person_node(child, children_map, child_path)
            for child in children_map.get(employee_id, [])
        ]
        return {
            "expanded": True,
            "type": "person",
            "data": {
                "userId": employee_id,
                "name": employee.get("name") or employee_id,
                "title": employee.get("designation") or "",
                "department": employee.get("department") or "General",
                "verticals": _employee_verticals(employee),
                "reportingOfficerIds": _employee_reporting_ids(employee),
                "image": employee.get("profilePhoto"),
            },
            "children": [child for child in children if child],
        }

    result = []
    for vertical_name in selected_verticals:
        members = [
            employee for employee in employees
            if vertical_name in _employee_verticals(employee)
        ]
        member_ids = {employee.get("userId") for employee in members}
        children_map = defaultdict(list)
        roots = []

        for employee in members:
            applicable_parents = [
                officer_id for officer_id in _employee_reporting_ids(employee)
                if officer_id in member_ids and officer_id != employee.get("userId")
            ]
            if applicable_parents:
                for officer_id in applicable_parents:
                    children_map[officer_id].append(employee)
            else:
                roots.append(employee)

        # Bad legacy data can contain a closed reporting cycle. Keep the chart
        # usable and let the recursive path guard stop the loop.
        if members and not roots:
            roots = members

        roots.sort(key=lambda item: (item.get("name") or "").lower())
        result.append({
            "expanded": True,
            "type": "vertical",
            "data": {
                "name": vertical_name,
                "title": f"{len(members)} employee{'s' if len(members) != 1 else ''}",
            },
            "children": [person_node(root, children_map, set()) for root in roots],
        })

    return result



######## Previous published roster
@router.get("/previous-final")
def get_previous_final_roster():

    roster = roster_master_collection.find_one(
        {"isFinal": True, "calendarPushed": True},
        sort=[("createdOn", -1)]
    )

    # Older final rosters may pre-date the explicit publish flag.
    if not roster:
        roster = roster_master_collection.find_one(
            {"isFinal": True},
            sort=[("createdOn", -1)]
        )

    if not roster:
        return {}

    return {
        "instructions": roster.get("instructions", ""),
        "header": roster_header(roster.get("header")),
        "distribution": roster.get("distribution", ""),
        "signedBy": enrich_authority_snapshot(roster.get("signedBy")),
        "leaveAuthority": enrich_authority_snapshot(roster.get("leaveAuthority"))
    }


@router.delete("/{roster_id}")
def delete_roster(roster_id: str):

    roster = roster_master_collection.find_one({"_id": ObjectId(roster_id)})

    if not roster:
        raise HTTPException(404, "Roster not found")

    if roster.get("isFinal"):
        raise HTTPException(400, "Final roster cannot be deleted")

    roster_master_collection.delete_one({"_id": ObjectId(roster_id)})

    return {"message": "Draft roster deleted"}


############### Shift person history #####################

from typing import List
from fastapi import Body

@router.post("/shift-history/upload")
def upload_shift_history(data: List[dict] = Body(...)):

    from crew_legacy.database.database_mongo import employee_shift_history
    from datetime import datetime

    bulk = []

    for row in data:

        emp_id = (row.get("employeeId") or "").strip()
        if not emp_id or not row.get("startDate"):
            continue

        bulk.append({
            "employeeId": emp_id,
            "name": row.get("name"),
            "designation": row.get("designation"),
            "groupName": row.get("groupName"),

            "startDate": row.get("startDate"),
            "endDate": row.get("endDate"),

            "isActive": True if not row.get("endDate") else False,

            "createdOn": datetime.utcnow()
        })

    if bulk:
        employee_shift_history.insert_many(bulk)

    return {"message": "Uploaded", "count": len(bulk)}


@router.post("/shift-history/upload-excel")
def upload_shift_history_excel(file: UploadFile = File(...)):

    import pandas as pd
    from datetime import datetime

    import math

    def clean_value(val):
        if val is None:
            return None
        if isinstance(val, float) and math.isnan(val):
            return None
        return val

    contents = ensure_upload_allowed(
        file,
        allowed_content_types={
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        },
        allowed_extensions={"xlsx", "xls"},
        max_bytes=5 * 1024 * 1024,
    )

    df = pd.read_excel(contents)

    records = []

    last_emp = None
    last_name = None

    for _, row in df.iterrows():

        emp_id = str(row.get("emp_id") or "")
        name = row.get("name")

        # Handle merged rows
        if emp_id:
            last_emp = emp_id
            last_name = name

        emp_id = last_emp
        name = name or last_name

        if not emp_id:
            continue

        # ðŸ”¥ DATE CONVERSION
        def format_date(val):
            if pd.isna(val):
                return None
            if isinstance(val, datetime):
                return val.strftime("%Y-%m-%d")

            try:
                return datetime.strptime(str(val), "%d-%m-%Y").strftime("%Y-%m-%d")
            except:
                return str(val)

        start_date = format_date(row.get("startDate"))
        end_date = format_date(row.get("endDate"))

        group_name = str(row.get("groupName")).replace(" ", "-")

        records.append({
            "employeeId": str(clean_value(emp_id)),
            "name": clean_value(name),
            "groupName": clean_value(group_name),
            "startDate": clean_value(start_date),
            "endDate": clean_value(end_date),
            "isActive": False if end_date else True,
            "createdOn": datetime.utcnow()
        })

    if records:
        employee_shift_history.insert_many(records)

    return {
        "message": "Excel uploaded successfully",
        "count": len(records)
    }



@router.get("/shift-history/current")
def get_current_shift():


    return list(employee_shift_history.find({
        "isActive": True
    }))

@router.get("/shift-history/all")
def get_all_shift_history():

    data = list(employee_shift_history.find())

    cleaned = []

    import math

    for d in data:
        d["_id"] = str(d["_id"])

        for k, v in d.items():
            if isinstance(v, float) and math.isnan(v):
                d[k] = None

        cleaned.append(d)

    return cleaned


@router.get("/shift-history/{employee_id}")
def get_employee_shift_history(employee_id: str):

    from crew_legacy.database.database_mongo import employee_shift_history

    records = list(employee_shift_history.find({
        "employeeId": employee_id
    }).sort("startDate", 1))

    for r in records:
        r["_id"] = str(r["_id"])

    return records


@router.delete("/shift-history/{record_id}")
def delete_shift_record(record_id: str):

    from bson import ObjectId

    result = employee_shift_history.delete_one({
        "_id": ObjectId(record_id)
    })

    if result.deleted_count == 0:
        raise HTTPException(404, "Record not found")

    return {"message": "Deleted successfully"}

@router.put("/shift-history/{record_id}")
def update_shift_record(record_id: str, data: dict):

    from bson import ObjectId

    update_fields = {
        "employeeId": data.get("employeeId"),
        "name": data.get("name"),
        "groupName": data.get("groupName"),
        "startDate": data.get("startDate"),
        "endDate": data.get("endDate"),
        "isActive": data.get("isActive"),
        "updatedOn": datetime.utcnow()
    }

    employee_shift_history.update_one(
        {"_id": ObjectId(record_id)},
        {"$set": update_fields}
    )

    return {"message": "Updated successfully"}


