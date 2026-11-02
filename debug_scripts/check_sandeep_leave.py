"""
Diagnostic script to verify Sandeep Kumar Maurya (00137) records across:
- employee_collection
- leave_request_collection
- employee_daily_collection
"""
import sys
import os
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.abspath("backend"))

from crew_legacy.database.database_mongo import (
    employee_collection,
    leave_request_collection,
    employee_daily_collection,
    roster_group_collection,
)

print("=== 1. Employee Record ===")
emp = employee_collection.find_one({"$or": [{"userId": "00137"}, {"employeeId": "00137"}]})
if emp:
    print(f"Name: {emp.get('name')}")
    print(f"UserId: {emp.get('userId')} | EmployeeId: {emp.get('employeeId')}")
    print(f"Designation: {emp.get('designation')}")
    print(f"isSIC: {emp.get('isSIC')} | Category: {emp.get('category')}")
else:
    print("Employee 00137 not found in employee_collection")

print("\n=== 2. Leave Record on 2026-11-08 ===")
leave = leave_request_collection.find_one({
    "date": "2026-11-08",
    "$or": [{"employeeId": "00137"}, {"name": {"$regex": "Sandeep", "$options": "i"}}],
})
if leave:
    print(f"Leave ID: {leave.get('_id')}")
    print(f"Employee: {leave.get('name')} ({leave.get('employeeId')})")
    print(f"Group: {leave.get('groupName')}")
    print(f"isSIC flag in leave: {leave.get('isSIC')}")
    print(f"Leave Type: {leave.get('leaveType')}")
    print(f"Final Status: {leave.get('finalStatus')}")
    print(f"Replacement Required: {leave.get('replacementRequired')}")
else:
    print("No leave found for Sandeep on 2026-11-08")

print("\n=== 3. Daily Roster Record on 2026-11-08 ===")
daily = employee_daily_collection.find_one({
    "date": "2026-11-08",
    "$or": [{"employeeId": "00137"}, {"name": {"$regex": "Sandeep", "$options": "i"}}],
})
if daily:
    print(f"Daily ID: {daily.get('_id')}")
    print(f"Assigned Duty: {daily.get('assignedDuty')}")
    print(f"Group: {daily.get('groupName')}")
    print(f"isSIC flag in daily: {daily.get('isSIC')}")
    print(f"isActingSIC: {daily.get('isActingSIC')}")
    print(f"Leave Status: {daily.get('leaveStatus')}")
else:
    print("No daily record found for Sandeep on 2026-11-08")

print("\n=== 4. Group-1 Shift In-Charge Configuration ===")
g1 = roster_group_collection.find_one({"groupName": "Group-1"})
if g1:
    sic = g1.get("shiftInCharge") or {}
    print(f"Group-1 Designated SIC: {sic.get('name')} (ID: {sic.get('employeeId')})")

