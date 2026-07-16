"""Backfill multi-value organization fields without removing legacy aliases."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from crew_legacy.database.database_mongo import employee_collection


def clean_label(value):
    return " ".join(str(value or "").split())


def migrate():
    dropdowns = employee_collection.database["dropdown_master"]
    verticals_migrated = 0
    reporting_migrated = 0
    function_fields_added = 0
    legacy_verticals = set()

    projection = {
        "vertical": 1,
        "verticals": 1,
        "reportingOfficerId": 1,
        "reportingOfficerIds": 1,
        "functionIds": 1,
    }
    for employee in employee_collection.find({}, projection):
        changes = {}
        vertical = clean_label(employee.get("vertical"))
        reporting_officer_id = clean_label(employee.get("reportingOfficerId"))

        if vertical:
            legacy_verticals.add(vertical)
            if not employee.get("verticals"):
                changes["verticals"] = [vertical]
                verticals_migrated += 1

        if reporting_officer_id and not employee.get("reportingOfficerIds"):
            changes["reportingOfficerIds"] = [reporting_officer_id]
            reporting_migrated += 1

        if "functionIds" not in employee:
            changes["functionIds"] = []
            function_fields_added += 1

        if changes:
            employee_collection.update_one(
                {"_id": employee["_id"]},
                {"$set": changes},
            )

    existing_verticals = {
        item.get("value")
        for item in dropdowns.find({"type": "vertical"}, {"value": 1})
    }
    added_verticals = sorted(legacy_verticals - existing_verticals)
    if added_verticals:
        dropdowns.insert_many([
            {"type": "vertical", "value": vertical}
            for vertical in added_verticals
        ])

    return {
        "employeeVerticalsMigrated": verticals_migrated,
        "reportingRelationshipsMigrated": reporting_migrated,
        "functionFieldsAdded": function_fields_added,
        "legacyVerticalOptionsAdded": len(added_verticals),
    }


if __name__ == "__main__":
    print(migrate())
