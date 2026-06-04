from fastapi import APIRouter

from services.db_handler import MongoService

from services.rtg_dashboard_service import (
    RTGDashboardService
)

router = APIRouter(
    prefix="/api/rtg-dashboard",
    tags=["RTG Dashboard"]
)


@router.get("/summary")
async def get_summary():

    db = MongoService()

    latest = db.rtg_dashboard_collection.find_one(

        {},

        sort=[("snapshot_time",-1)]
    )

    if not latest:

        return {
            "success": False
        }

    data = latest["data"]

    installed = sum(
        x.get("installed_capacity",0)
        for x in data
    )

    actual = sum(
        x.get("actual_gen",0)
        for x in data
    )

    outage = sum(

        x.get("planned_outage",0)
        +
        x.get("forced_outage",0)
        +
        x.get("fuel_shortage",0)
        +
        x.get("rsd",0)
        +
        x.get("commercial_issues",0)

        for x in data
    )

    return {

        "success": True,

        "snapshot_time":
            latest["snapshot_time"],

        "total_plants":
            len(data),

        "installed_capacity":
            installed,

        "actual_generation":
            actual,

        "outage_capacity":
            outage,

        "data":
            data
    }


@router.post("/refresh")
async def refresh_dashboard():

    try:

        count = (
            RTGDashboardService
            .fetch_snapshot()
        )

        return {

            "success": True,

            "message":
                f"{count} records fetched"
        }

    except Exception as e:

        return {

            "success": False,

            "message":
                str(e)
        }
    


@router.get("/live")
async def get_live_dashboard():

    try:

        data = (
            RTGDashboardService
            .fetch_live_data()
        )

        return {
            "success": True,
            "data": data
        }

    except Exception as e:

        try:
            db = MongoService()
            latest = db.rtg_dashboard_collection.find_one(
                {},
                sort=[("snapshot_time", -1)]
            )
            if latest and "data" in latest:
                return {
                    "success": True,
                    "data": latest["data"],
                    "is_cached": True,
                    "snapshot_time": latest["snapshot_time"],
                    "message": f"Live fetch failed ({str(e)}). Loaded cached data from snapshot."
                }
        except Exception as db_err:
            pass

        return {
            "success": False,
            "message": str(e)
        }


@router.get("/trend/today")
async def get_today_trend():

    try:

        data = (
            RTGDashboardService
            .fetch_today_trend()
        )

        return {
            "success": True,
            "data": data
        }

    except Exception as e:

        return {
            "success": False,
            "message": str(e)
        }
