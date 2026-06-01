from apscheduler.schedulers.background import (
    BackgroundScheduler
)

from datetime import datetime

from services.pipeline_runner import (
    PipelineRunner
)

from services.rtg_dashboard_service import (
    RTGDashboardService
)

from services.pipeline_logger import (
    PipelineLogger
)

scheduler = BackgroundScheduler()


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

        raise

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
