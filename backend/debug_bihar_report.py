import sys
from datetime import datetime, timedelta
from routes.frequency_routes import get_aligned_schedule_dc, parse_scada_file, match_scada_columns
from services.db_handler import MongoService
import json

db = MongoService()
entities = list(db.map_collection.find({}, {"_id": 0}))

print("Total entities loaded:", len(entities))

st = datetime.fromisoformat("2026-06-02T20:00:00")
et = datetime.fromisoformat("2026-06-03T02:00:00")

unique_dates = []
curr = st.date()
while curr <= et.date():
    unique_dates.append(curr.isoformat())
    curr += timedelta(days=1)

print("Unique dates in range:", unique_dates)

# Check RTG status
status_by_date = {}
all_available = True
for d in unique_dates:
    doc = db.rtg_dashboard_collection.find_one(
        {"snapshot_date": d},
        sort=[("snapshot_time", -1)]
    )
    if doc and doc.get("record_count", 0) > 0:
        records = doc.get("data", [])
        has_actuals = any(float(r.get("actual_gen") or r.get("actual_gen_derived") or 0) > 0 for r in records)
        status_by_date[d] = has_actuals
        if not has_actuals:
            all_available = False
    else:
        status_by_date[d] = False
        all_available = False

print("RTG availability status by date:", status_by_date)
print("RTG all_available:", all_available)

# Aligned schedule DC
dt_index, aligned, rtg_stats, wbes_stats = get_aligned_schedule_dc(entities, st, et)
print("Aligned schedule/dc data keys:", list(aligned.keys()))

bihar_data = aligned.get("STATE_BIHAR", {})
print("BIHAR schedule series length:", len(bihar_data.get("schedule", [])))
print("BIHAR schedule sum:", sum(bihar_data.get("schedule", [])))
print("BIHAR dc sum:", sum(bihar_data.get("dc", [])))
