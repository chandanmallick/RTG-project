"""
Verification script for replacement duty permissions:
- Employee cannot deny duty (canDeny = False)
- Reporting Officer / HOD can deny duty (canDeny = True)
- Reporting Officer cannot reallocate / revert (canRevert = False)
- Administrator can reallocate / revert (canRevert = True)
"""
import sys
import os
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.abspath("backend"))

from crew_legacy.api.replacement import get_notifications
from crew_legacy.database.database_mongo import employee_collection, duty_notification_collection
from bson import ObjectId

# Find a duty notification or mock one
sample_notif = duty_notification_collection.find_one({"status": {"$in": ["Pending", "Accepted", "Cancelled"]}})
if not sample_notif:
    print("No duty notifications found to test.")
    sys.exit(0)

print(f"Testing with sample notification ID: {sample_notif.get('_id')}")
print(f"Assignee: {sample_notif.get('employeeId')} | Controllers: {sample_notif.get('controllerIds')}")

test_roles = [
    ("Assignee (Employee)", "00203"),
    ("Reporting Officer", "50027"),
    ("HOD", "20020"),
    ("Administrator", "50041"),
]

for label, uid in test_roles:
    emp = employee_collection.find_one({"$or": [{"userId": uid}, {"employeeId": uid}]}) or {}
    user_context = {
        "userId": uid,
        "employeeId": uid,
        "role": emp.get("role") or ("admin" if uid == "50041" else "user"),
        "name": emp.get("name") or uid,
    }
    notifs = get_notifications(user=user_context)
    match = [n for n in notifs if str(n.get("_id")) == str(sample_notif.get("_id"))]
    if match:
        m = match[0]
        print(f"[{label} - {uid} ({user_context['name']})]")
        print(f"   canAccept: {m.get('canAccept')} | canDeny: {m.get('canDeny')} | canRevert: {m.get('canRevert')}")
    else:
        print(f"[{label} - {uid}] notification not in user's query scope.")
