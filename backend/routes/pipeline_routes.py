from fastapi import APIRouter

from services.pipeline_runner import (
    PipelineRunner
)

router = APIRouter(
    prefix="/api/pipeline",
    tags=["Pipeline"]
)

# =========================================
# MANUAL SCHEDULE TRIGGER
# =========================================

@router.post("/run/schedule")
async def run_schedule():

    PipelineRunner.run_schedule_pipeline()

    return {

        "success": True,

        "message":
            "Schedule pipeline triggered"
    }

# =========================================
# MANUAL OUTAGE TRIGGER
# =========================================

@router.post("/run/outage")
async def run_outage():

    PipelineRunner.run_outage_pipeline()

    return {

        "success": True,

        "message":
            "Outage pipeline triggered"
    }

from services.db_handler import (
    MongoService
)



@router.get("/logs/{pipeline_type}/{revision_id}")
async def get_logs(

    pipeline_type: str,

    revision_id: str
):

    db = MongoService()

    logs = list(

        db.pipeline_log_collection.find(

            {

                "revision_id":
                    revision_id,

                "pipeline_type":
                    pipeline_type.upper()
            },

            {"_id": 0}
        )
    )

    return {

        "success": True,

        "logs": logs
    }