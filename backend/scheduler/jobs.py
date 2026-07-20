from apscheduler.schedulers.background import (
    BackgroundScheduler
)

from datetime import date, datetime, timedelta

from services.pipeline_runner import (
    PipelineRunner
)

from services.rtg_dashboard_service import (
    RTGDashboardService
)

from services.pipeline_logger import (
    PipelineLogger
)

from services.psp_service import PSPService
from services.db_handler import MongoService
from crew_legacy.api.replacement import auto_accept_pending_duty_notifications

scheduler = BackgroundScheduler()

scheduler.add_job(
    auto_accept_pending_duty_notifications,
    trigger="interval",
    minutes=1,
    id="crew_replacement_auto_accept",
    max_instances=1,
    coalesce=True,
    misfire_grace_time=120,
    replace_existing=True,
)

PSP_DAILY_SOURCE_STATUS_COLLECTION = "psp_daily_source_sync_status"

PSP_DAILY_DEMAND_SOURCES = {
    "nldc_demand": {
        "label": "NLDC Demand",
        "fetch": PSPService.fetch_and_save_nldc_demand_date
    },
    "india_15_min_demand": {
        "label": "15 Min Data",
        "fetch": PSPService.fetch_and_save_india_15_min_demand_date
    },
    "all_state_demand": {
        "label": "State Demand",
        "fetch": PSPService.fetch_and_save_all_state_demand_date
    }
}


def run_rtg_dashboard_snapshot_job():

    try:

        count = (
            RTGDashboardService
            .fetch_snapshot()
        )

        PipelineLogger().log(
            revision_id=None,
            pipeline_type="RTG_DASHBOARD",
            process_name="RTG_DASHBOARD_SNAPSHOT",
            status="SUCCESS",
            message=(
                f"{count} records inserted "
                "into rtg_dashboard_snapshot"
            ),
            extra_data={
                "interval_minutes": 15
            }
        )

    except Exception as e:

        PipelineLogger().log(
            revision_id=None,
            pipeline_type="RTG_DASHBOARD",
            process_name="RTG_DASHBOARD_SNAPSHOT",
            status="FAILED",
            message=str(e),
            extra_data={
                "interval_minutes": 15
            }
        )

scheduler.add_job(

    PipelineRunner.run_schedule_pipeline,

    trigger="interval",

    minutes=5,

    max_instances=1,

    coalesce=True,

    misfire_grace_time=60
)

scheduler.add_job(

    PipelineRunner.run_outage_pipeline,

    trigger="interval",

    minutes=15,

    id="outage_pipeline_15min",

    max_instances=1,

    coalesce=True,
    
    misfire_grace_time=300,

    replace_existing=True
)

scheduler.add_job(

    run_rtg_dashboard_snapshot_job,

    trigger="interval",

    minutes=15,

    id="rtg_dashboard_snapshot_15min",

    max_instances=1,

    coalesce=True,

    misfire_grace_time=300,

    next_run_time=datetime.now(),

    replace_existing=True
)


def run_psp_daily_job():
    logger = PipelineLogger()
    revision_id = (
        "PSP_DAILY_"
        + datetime.now().strftime("%Y%m%d_%H%M%S")
    )

    try:
        from datetime import date
        yesterday = date.today() - timedelta(days=1)
        from routes.psp_routes import refresh_psp_operational_sources
        results = refresh_psp_operational_sources(yesterday)
        failed = {
            key: value
            for key, value in results.items()
            if not value.get("success")
        }
        logger.log(
            revision_id=revision_id,
            pipeline_type="PSP",
            process_name="PSP_DAILY_REFRESH",
            status="FAILED" if failed else "SUCCESS",
            message=(
                "PSP daily refresh completed with failures"
                if failed
                else "PSP daily refresh completed"
            ),
            extra_data={
                "date": yesterday.isoformat(),
                "results": results,
                "failed": failed,
            }
        )
    except Exception as e:
        logger.log(
            revision_id=revision_id,
            pipeline_type="PSP",
            process_name="PSP_DAILY_REFRESH",
            status="FAILED",
            message=str(e),
            extra_data={
                "error_type": type(e).__name__,
            }
        )
        raise


def run_single_psp_daily_source(source_key: str, target_date: date):
    source = PSP_DAILY_DEMAND_SOURCES[source_key]

    try:
        result = source["fetch"](target_date)
        success = bool(result.get("success"))
        return {
            "success": success,
            "label": source["label"],
            "records": result.get("records"),
            "message": result.get("message") or (
                f"{source['label']} synced"
                if success
                else f"{source['label']} sync failed"
            )
        }
    except Exception as exc:
        return {
            "success": False,
            "label": source["label"],
            "message": str(exc),
            "error_type": type(exc).__name__
        }


def save_psp_daily_source_status(
    target_date: date,
    revision_id: str,
    mode: str,
    results: dict,
    previous_results: dict = None
):
    merged_results = {
        **(previous_results or {}),
        **results
    }
    failed = {
        key: value
        for key, value in merged_results.items()
        if not value.get("success")
    }
    status = "FAILED" if failed else "SUCCESS"
    now_text = datetime.now().isoformat()
    db = MongoService()
    db.db[PSP_DAILY_SOURCE_STATUS_COLLECTION].update_one(
        {"_id": target_date.isoformat()},
        {
            "$set": {
                "date": target_date.isoformat(),
                "status": status,
                "results": merged_results,
                "failed": failed,
                "last_mode": mode,
                "last_revision_id": revision_id,
                "last_run_at": now_text
            },
            "$push": {
                "attempts": {
                    "mode": mode,
                    "revision_id": revision_id,
                    "run_at": now_text,
                    "results": results
                }
            }
        },
        upsert=True
    )
    return merged_results, failed, status


def run_psp_daily_demand_sources_job(retry_failed_only: bool = False):
    logger = PipelineLogger()
    target_date = date.today() - timedelta(days=1)
    mode = "RETRY_FAILED" if retry_failed_only else "DAILY_FULL"
    revision_id = (
        "PSP_DAILY_DEMAND_SOURCES_"
        + mode
        + "_"
        + datetime.now().strftime("%Y%m%d_%H%M%S")
    )

    previous_results = {}
    source_keys = list(PSP_DAILY_DEMAND_SOURCES.keys())

    if retry_failed_only:
        status_doc = MongoService().db[
            PSP_DAILY_SOURCE_STATUS_COLLECTION
        ].find_one(
            {"_id": target_date.isoformat()}
        )
        previous_results = (status_doc or {}).get("results") or {}
        failed = (status_doc or {}).get("failed") or {}
        source_keys = [
            key
            for key in failed.keys()
            if key in PSP_DAILY_DEMAND_SOURCES
        ]

        if not source_keys:
            logger.log(
                revision_id=revision_id,
                pipeline_type="PSP",
                process_name="PSP_DAILY_DEMAND_SOURCES_RETRY",
                status="SUCCESS",
                message="No failed PSP daily demand sources found for 11 AM retry.",
                extra_data={
                    "date": target_date.isoformat(),
                    "previous_status": (status_doc or {}).get("status")
                }
            )
            return {
                "success": True,
                "date": target_date.isoformat(),
                "message": "No failed sources to retry.",
                "retried": []
            }

    results = {}
    for source_key in source_keys:
        results[source_key] = run_single_psp_daily_source(
            source_key,
            target_date
        )

    merged_results, failed, status = save_psp_daily_source_status(
        target_date=target_date,
        revision_id=revision_id,
        mode=mode,
        results=results,
        previous_results=previous_results
    )

    logger.log(
        revision_id=revision_id,
        pipeline_type="PSP",
        process_name=(
            "PSP_DAILY_DEMAND_SOURCES_RETRY"
            if retry_failed_only
            else "PSP_DAILY_DEMAND_SOURCES"
        ),
        status=status,
        message=(
            "PSP daily demand source retry completed with failures"
            if retry_failed_only and failed
            else "PSP daily demand source retry completed"
            if retry_failed_only
            else "PSP daily demand source sync completed with failures"
            if failed
            else "PSP daily demand source sync completed"
        ),
        extra_data={
            "date": target_date.isoformat(),
            "mode": mode,
            "results": merged_results,
            "failed": failed,
            "source_keys": source_keys
        }
    )

    return {
        "success": status == "SUCCESS",
        "date": target_date.isoformat(),
        "mode": mode,
        "results": merged_results,
        "failed": failed
    }


scheduler.add_job(
    run_psp_daily_job,

    trigger="cron",

    hour=9,

    minute=0,

    id="psp_daily_9am",

    replace_existing=True
)

scheduler.add_job(
    run_psp_daily_demand_sources_job,

    trigger="cron",

    hour=9,

    minute=0,

    id="psp_daily_demand_sources_9am",

    max_instances=1,

    coalesce=True,

    misfire_grace_time=1800,

    replace_existing=True
)

scheduler.add_job(
    run_psp_daily_demand_sources_job,

    trigger="cron",

    hour=11,

    minute=0,

    id="psp_daily_demand_sources_11am_retry",

    kwargs={
        "retry_failed_only": True
    },

    max_instances=1,

    coalesce=True,

    misfire_grace_time=1800,

    replace_existing=True
)

scheduler.add_job(
    run_psp_daily_job,

    trigger="cron",

    hour=21,

    minute=0,

    id="psp_daily_9pm",

    replace_existing=True
)
