from fastapi import APIRouter

from services.db_handler import MongoService

router = APIRouter()

@router.get("/logs")
async def get_logs():

    db = MongoService().db

    data = list(

        db.pipeline_logs.find(
            {},
            {"_id": 0}
        ).sort("timestamp", -1).limit(500)
    )

    return {

        "success": True,

        "data": data
    }


@router.get("/pipeline/status")
async def pipeline_status():

    db = MongoService().db

    pipelines = [
        "SCHEDULE",
        "OUTAGE"
    ]

    result = []

    for pipeline in pipelines:

        success_count = 0
        failed_count = 0
        success_percentage = 0

        last_log = db.pipeline_logs.find_one(

            {
                "pipeline_type":
                    pipeline,

                "process_name":
                    "RTG_PUSH"
            },

            sort=[("timestamp", -1)]
        )

        extra_data = (
            last_log.get("extra_data", {})
            if last_log
            else {}
        )

        success_count = (
            extra_data.get(
                "success_count",
                0
            )
        )

        failed_count = (
            extra_data.get(
                "failure_count",
                extra_data.get(
                    "failed_count",
                    0
                )
            )
        )

        success_percentage = (
            extra_data.get(
                "success_percent",
                0
            )
        )

        total = (
            success_count
            + failed_count
        )

        if total > 0 and not success_percentage:

            success_percentage = round(

                (
                    success_count
                    / total
                ) * 100,

                2
            )

        result.append({

            "pipeline":
                pipeline,

            "last_status":
                (
                    last_log.get("status")
                    if last_log
                    else "UNKNOWN"
                ),

            "last_process":
                (
                    last_log.get(
                        "process_name"
                    )
                    if last_log
                    else "-"
                ),

            "last_message":
                (
                    last_log.get(
                        "message"
                    )
                    if last_log
                    else "-"
                ),

            "last_trigger":
                (
                    last_log.get(
                        "timestamp"
                    )
                    if last_log
                    else None
                ),

            "revision_id":
                (
                    last_log.get(
                        "revision_id"
                    )
                    if last_log
                    else "-"
                ),

            "success_count":
                success_count,

            "failed_count":
                failed_count,

            "success_percentage":
                success_percentage,

            "response_data":
                (
                    last_log.get(
                        "response_data",
                        {}
                    )
                    if last_log
                    else {}
                ),

            "extra_data":
                extra_data,
        })

    return {
        "success": True,
        "data": result
    }
