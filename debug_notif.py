import sys
import os
sys.path.insert(0, os.path.abspath("backend"))

from crew_legacy.database.database_mongo import duty_notification_collection
from bson import ObjectId

n = duty_notification_collection.find_one({"_id": ObjectId("6ae48cbc901b1592c539a0ca")})
print("Notif:")
for k, v in n.items():
    print(f"  {k}: {repr(v)}")
