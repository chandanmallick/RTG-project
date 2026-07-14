from fastapi import APIRouter, Body

router = APIRouter()


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

    for row in payload:

        db.map_collection.update_one(

            {
                "plant_id": row["plant_id"],
                "STAGE_ID": row["STAGE_ID"]
            },

            {
                "$set": {

                    "wbes_name":
                        row.get("wbes_name", ""),

                    "scada_key":
                        row.get("scada_key", ""),

                    "scada_header":
                        row.get("scada_header", ""),

                    "outage_key":
                        row.get("outage_key", ""),

                    "schedule_source":
                        row.get("schedule_source", "RTG"),

                    "dc_source":
                        row.get("dc_source", "RTG"),

                    "wbes_acronym":
                        row.get("wbes_acronym", ""),

                    "rtg_plant_id":
                        row.get("rtg_plant_id", ""),

                    "scada_schedule_key":
                        row.get("scada_schedule_key", ""),

                    "scada_dc_key":
                        row.get("scada_dc_key", ""),

                    "actual_source":
                        row.get("actual_source", "RTG"),

                    "type":
                        row.get("type", "IPP")
                }
            }
        )

        updated += 1

    return {
        "success": True,
        "updated": updated
    }
