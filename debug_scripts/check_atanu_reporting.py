"""
Diagnostic script to verify Atanu Mandal (00203) reporting hierarchy
and notification visibility for his Reporting Officer, HOD, and Intermediary.
"""
import sys
import os
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.abspath("backend"))

from crew_legacy.database.database_mongo import employee_collection, duty_notification_collection
from crew_legacy.api.replacement import controlling_officer_ids

print("=== 1. Employee Atanu Mandal ===")
atanu = employee_collection.find_one({"$or": [{"userId": "00203"}, {"name": {"$regex": "Atanu", "$options": "i"}}]})
if not atanu:
    print("Atanu Mandal not found!")
    sys.exit(1)

print(f"Name: {atanu.get('name')}")
print(f"UserId: {atanu.get('userId')} | EmployeeId: {atanu.get('employeeId')}")
print(f"Designation: {atanu.get('designation')}")
print(f"Reporting Officer ID: {atanu.get('reportingOfficerId')} | IDs: {atanu.get('reportingOfficerIds')}")
print(f"Intermediary Reporting ID: {atanu.get('intermediaryReportingId')}")
print(f"HOD ID: {atanu.get('hodId')}")

print("\n=== 2. Controlling Officers Computed ===")
ctrls = controlling_officer_ids(atanu.get("userId"), "2026-11-08", "Group-4")
print(f"Computed Controlling Officer IDs: {ctrls}")
for cid in ctrls:
    c_emp = employee_collection.find_one({"$or": [{"userId": cid}, {"employeeId": cid}]})
    cname = c_emp.get("name") if c_emp else "Unknown"
    crole = c_emp.get("role") if c_emp else "user"
    print(f" - ID: {cid} | Name: {cname} | Role: {crole}")

print("\n=== 3. Duty Notifications for Atanu ===")
notifs = list(duty_notification_collection.find({
    "$or": [
        {"employeeId": "00203"},
        {"employeeId": "203"},
        {"date": "2026-11-08", "assignedDuty": "Evening"},
    ]
}).sort("createdAt", -1).limit(5))

print(f"Found {len(notifs)} recent notification(s):")
for n in notifs:
    print(f" - ID: {n.get('_id')} | Date: {n.get('date')} | Shift: {n.get('assignedDuty')} | Status: {n.get('status')} | ControllerIDs: {n.get('controllerIds')}")
