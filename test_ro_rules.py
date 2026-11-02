import sys
import os
sys.path.insert(0, os.path.abspath("backend"))

from crew_legacy.api.replacement import get_notifications

for uid, role, label in [
    ("00203", "user", "Employee (Atanu Mandal)"),
    ("50027", "user", "Reporting Officer (Rakesh Pradhan)"),
    ("50041", "admin", "Admin (Chandan Mallick)"),
]:
    user = {"userId": uid, "employeeId": uid, "role": role}
    notifs = get_notifications(user=user)
    nov8_notif = next((n for n in notifs if n.get("date") == "2026-11-08" and n.get("employeeId") == "00203"), None)
    if nov8_notif:
        print(f"{label} [UID {uid}]:")
        print(f"  - Notification: {nov8_notif['_id']} | date: {nov8_notif['date']} | duty: {nov8_notif['assignedDuty']}")
        print(f"  - canAccept: {nov8_notif['canAccept']}")
        print(f"  - canDeny:   {nov8_notif['canDeny']}")
        print(f"  - canRevert: {nov8_notif['canRevert']}")
    else:
        print(f"{label} [UID {uid}]: NOT FOUND")
