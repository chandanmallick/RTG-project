"""
General notification inspector script.
"""
import sys
import os
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.abspath("backend"))

from crew_legacy.database.database_mongo import duty_notification_collection

print("=== Recent 15 Duty Notifications ===")
notifs = list(duty_notification_collection.find().sort("createdAt", -1).limit(15))
for n in notifs:
    nid = n.get("_id")
    eid = n.get("employeeId")
    name = n.get("employeeName")
    duty = n.get("assignedDuty")
    dt = n.get("date")
    status = n.get("status")
    hist = n.get("decisionHistory") or []
    last_action = hist[-1].get("action") if hist else "None"
    print(f"ID: {nid} | {dt} | {duty} | {name} ({eid}) | Status: {status} | Last Action: {last_action}")
