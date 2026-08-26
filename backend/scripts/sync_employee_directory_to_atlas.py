"""Run the sanitized local-to-Atlas employee-directory mirror on demand."""

import json
import sys
from datetime import date, datetime
from pathlib import Path

from bson import ObjectId

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from crew_legacy.admin_logic.atlas_sync import sync_employee_directory_to_atlas


def json_default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    return str(value)


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    print(json.dumps(sync_employee_directory_to_atlas(dry_run=dry_run), default=json_default, indent=2))
