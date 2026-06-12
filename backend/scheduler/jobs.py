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

from services.psp_service import PSPService
from datetime import timedelta

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
    try:
        from datetime import date
        yesterday = date.today() - timedelta(days=1)
        PSPService.fetch_and_save_date(yesterday)
        try:
            from routes.psp_routes import check_and_update_highest_portfolio
            check_and_update_highest_portfolio(yesterday)
        except Exception as ex:
            print(f"Error checking highest records for daily job: {ex}")
    except Exception:
        pass


scheduler.add_job(
    run_psp_daily_job,

    trigger="cron",

    hour=9,

    minute=0,

    id="psp_daily_9am",

    replace_existing=True
)
