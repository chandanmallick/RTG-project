from datetime import datetime

from fastapi import APIRouter, Body, Depends

from crew_legacy.admin_logic.auth_utils import get_authenticated_user, require_page_view, require_page_write
from services.database_sync_review_service import (
    commit_review_rows,
    refresh_staging_and_review,
    review_snapshot,
    update_rtg_static_from_reporting,
)

router = APIRouter()


def require_database_sync_view(user=Depends(get_authenticated_user)):
    return require_page_view(user, "database_sync")


def require_database_sync_write(user=Depends(get_authenticated_user)):
    return require_page_write(user, "database_sync")


@router.post("/db-sync/review/refresh")
async def refresh_database_sync_review(user=Depends(require_database_sync_write)):
    try:
        return refresh_staging_and_review()
    except Exception as exc:
        print("DATABASE SYNC STAGING ERROR:", str(exc))
        return {
            "success": False,
            "rows": [],
            "rtg_master": [],
            "summary": {},
            "message": str(exc),
        }


@router.get("/db-sync/review")
async def get_database_sync_review(user=Depends(require_database_sync_view)):
    try:
        return review_snapshot()
    except Exception as exc:
        return {
            "success": False,
            "rows": [],
            "rtg_master": [],
            "summary": {},
            "message": str(exc),
        }


@router.post("/db-sync/review/commit")
async def commit_database_sync_review(
    payload: list = Body(...),
    user=Depends(require_database_sync_write),
):
    return commit_review_rows(payload, str(user.get("employeeId") or user.get("userId") or ""))


@router.post("/db-sync/review/update-rtg-static")
async def update_database_sync_rtg_static(
    payload: list = Body(...),
    user=Depends(require_database_sync_write),
):
    review_ids = [
        str(item.get("review_id") or "") if isinstance(item, dict) else str(item or "")
        for item in payload
    ]
    return update_rtg_static_from_reporting(
        [review_id for review_id in review_ids if review_id],
        str(user.get("employeeId") or user.get("userId") or ""),
    )


def get_sync_dependencies():
    import pandas as pd
    from services.db_handler import MongoService
    from utils.processor import DataProcessor

    globals()["pd"] = pd
    return pd, MongoService, DataProcessor


# ======================================================
# SAFE NORMALIZER
# ======================================================

def normalize(val):

    if val is None:
        return None

    try:
        if pd.isna(val):
            return None
    except:
        pass

    if isinstance(val, (list, tuple, set)):
        return ",".join(map(str, val))

    if isinstance(val, dict):
        return str(sorted(val.items()))

    return str(val).strip()


# ======================================================
# COMPARE FUNCTION
# ======================================================

def compare_and_detect_changes(live_df, mongo_df):

    changes = []

    # FIRST TIME LOAD
    if mongo_df.empty:

        for _, row in live_df.iterrows():

            item = row.to_dict()

            item["change_type"] = "NEW"

            item["changed_fields"] = list(live_df.columns)

            changes.append(item)

        return changes

    # EXISTING DB MAP
    mongo_map = {
        str(row["Id"]): row
        for _, row in mongo_df.iterrows()
    }

    IGNORE_FIELDS = [
        "change_type",
        "changed_fields"
    ]

    for _, row in live_df.iterrows():

        unit_id = str(row["Id"])

        # NEW RECORD
        if unit_id not in mongo_map:

            item = row.to_dict()

            item["change_type"] = "NEW"

            item["changed_fields"] = [
                col for col in live_df.columns
                if col not in IGNORE_FIELDS
            ]

            changes.append(item)

            continue

        # MODIFIED RECORD
        old = mongo_map[unit_id]

        changed_fields = []

        for col in live_df.columns:

            if col in IGNORE_FIELDS:
                continue

            new_val = normalize(row.get(col))

            old_val = normalize(old.get(col))

            if new_val != old_val:
                changed_fields.append(col)

        if changed_fields:

            item = row.to_dict()

            item["change_type"] = "MODIFIED"

            item["changed_fields"] = changed_fields

            changes.append(item)

    return changes


# ======================================================
# PREVIEW API
# ======================================================

@router.get("/db-sync/preview")
async def preview_db_sync():

    try:

        pd, MongoService, DataProcessor = get_sync_dependencies()

        db = MongoService()

        # LIVE DATA
        live_df = DataProcessor.run_pipeline()

        # EXISTING DB
        mongo_data = list(
            db.collection.find({}, {"_id": 0})
        )

        db_df = pd.DataFrame(mongo_data)

        # DETECT CHANGES
        changes = compare_and_detect_changes(
            live_df,
            db_df
        )

        return {
            "success": True,
            "count": len(changes),
            "changes": changes
        }

    except Exception as e:

        print("PREVIEW ERROR:", str(e))

        return {
            "success": False,
            "changes": [],
            "error": str(e)
        }


# ======================================================
# COMMIT API
# ======================================================

@router.post("/db-sync/commit")
async def commit_db_sync(payload: list = Body(...)):

    try:

        pd, MongoService, _ = get_sync_dependencies()

        db = MongoService()

        df = pd.DataFrame(payload)

        result = db.upsert_data(df)

        return {
            "success": True,
            "message": "Commit Complete",
            "result": result
        }

    except Exception as e:

        print("COMMIT ERROR:", str(e))

        return {
            "success": False,
            "message": str(e)
        }
    

# =====================================================
# PREVIEW MAP / STAGE CHANGES
# =====================================================

@router.get("/db-sync/map-preview")
async def preview_map_changes():

    try:

        _, MongoService, _ = get_sync_dependencies()

        db = MongoService()

        # BUILD CONSOLIDATED STAGE DATA

        grouped_df = db.build_stage_mapping_df()

        # COMPARE WITH station_mapping

        changes = db.compare_stage_mapping(grouped_df)

        return {

            "success": True,

            "count": len(changes),

            "changes": changes
        }

    except Exception as e:

        print("MAP PREVIEW ERROR:", str(e))

        return {

            "success": False,

            "changes": [],

            "message": str(e)
        }
    

# =====================================================
# COMMIT MAP TABLE
# =====================================================

@router.post("/db-sync/map-commit")
async def commit_map_changes():

    try:

        _, MongoService, _ = get_sync_dependencies()

        db = MongoService()

        grouped_df = db.build_stage_mapping_df()

        result = db.commit_stage_mapping(
            grouped_df
        )

        return {

            "success": True,

            "message":
                "Station Mapping Updated",

            "result": result
        }

    except Exception as e:

        print("MAP COMMIT ERROR:", str(e))

        return {

            "success": False,

            "message": str(e)
        }

@router.get("/db-sync/stage-preview")
async def stage_preview():

    try:

        db = MongoService()

        grouped_df = db.build_stage_mapping_df()

        changes = db.compare_stage_mapping(
            grouped_df
        )

        return {
            "success": True,
            "changes": changes
        }

    except Exception as e:

        return {
            "success": False,
            "changes": [],
            "message": str(e)
        }
    
@router.post("/db-sync/stage-commit")
async def stage_commit():

    try:

        db = MongoService()

        grouped_df = db.build_stage_mapping_df()

        result = db.commit_stage_mapping(
            grouped_df
        )

        return {
            "success": True,
            "message": "Stage Mapping Updated",
            "result": result
        }

    except Exception as e:

        return {
            "success": False,
            "message": str(e)
        }
    

@router.get("/map-table")
async def get_map_table():

    db = MongoService()

    data = list(
        db.map_collection.find({}, {"_id": 0})
    )

    return {
        "success": True,
        "data": data
    }


@router.post("/map-table/update")
async def update_map_table(
    payload: list = Body(...)
):

    db = MongoService()

    updated = 0

    editable_fields = {
        "wbes_name", "wbes_acronym", "crms_utility_name",
        "scada_key", "scada_header",
        "scada_schedule_key", "scada_schedule_header",
        "scada_dc_key", "scada_dc_header",
        "outage_key", "schedule_source", "dc_source", "actual_source",
        "type", "is_state", "is_frequency",
    }

    for row in payload:

        plant_id = str(row.get("plant_id") or "").strip()
        stage_id = str(row.get("STAGE_ID") or "").strip()
        if not plant_id:
            continue

        values = {
            field: row.get(field)
            for field in editable_fields
            if field in row
        }
        values["mapping_updated_at"] = datetime.utcnow()

        db.map_collection.update_one(

            {
                "plant_id": plant_id,
                "STAGE_ID": stage_id,
            },

            {"$set": values},
        )

        updated += 1

    return {
        "success": True,
        "updated": updated
    }
