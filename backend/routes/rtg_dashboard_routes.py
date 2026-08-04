import io
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from typing import Optional

from services.db_handler import MongoService

from services.rtg_dashboard_service import (
    RTGDashboardService
)

router = APIRouter(
    prefix="/api/rtg-dashboard",
    tags=["RTG Dashboard"]
)


@router.get("/historical/options")
async def get_historical_options():
    return {"success": True, **RTGDashboardService.historical_options()}


@router.get("/historical/matrix")
async def get_historical_matrix(
    start_date: str,
    end_date: str,
    metrics: list[str] = Query(default=[]),
    selections: list[str] = Query(default=[]),
    plant_wise: bool = False,
    interval_minutes: int = 15,
):
    try:
        data = RTGDashboardService.fetch_historical_matrix(
            start_date, end_date, metrics, selections, plant_wise, interval_minutes
        )
        return {"success": True, **data}
    except Exception as exc:
        return {"success": False, "message": str(exc)}


@router.get("/historical/download")
async def download_historical_matrix(
    start_date: str,
    end_date: str,
    metrics: list[str] = Query(default=[]),
    selections: list[str] = Query(default=[]),
    plant_wise: bool = False,
    interval_minutes: int = 15,
):
    data = RTGDashboardService.fetch_historical_matrix(
        start_date, end_date, metrics, selections, plant_wise, interval_minutes
    )
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "RTG Historical Data"
    headers = ["Date", "Time", *[column["label"] for column in data["columns"]]]
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="0057B7")
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for row in data["rows"]:
        sheet.append([
            row["date"], row["time"],
            *[row.get(column["key"]) for column in data["columns"]],
        ])
    sheet.freeze_panes = "C2"
    sheet.auto_filter.ref = sheet.dimensions
    sheet.column_dimensions["A"].width = 14
    sheet.column_dimensions["B"].width = 10
    for index in range(3, len(headers) + 1):
        sheet.column_dimensions[sheet.cell(1, index).column_letter].width = 26
    metadata = workbook.create_sheet("Selection")
    metadata.append(["Setting", "Value"])
    metadata.append(["Date range", f'{start_date} to {end_date}'])
    metadata.append(["Interval", f'{data["interval_minutes"]} minutes'])
    metadata.append(["View", "Plant-wise" if plant_wise else "Entity-wise"])
    metadata.append(["Entities", ", ".join(data["selections"])])
    metadata.append(["Data fields", ", ".join(data["metrics"])])
    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)
    filename = f"RTG_Historical_{start_date}_to_{end_date}_{interval_minutes}min.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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


@router.get("/trend/snapshot")
async def get_snapshot_trend(
    date_str: Optional[str] = None
):

    print(
        f"RTG snapshot trend API date_str={date_str!r}",
        flush=True
    )

    try:

        data = (
            RTGDashboardService
            .fetch_snapshot_trend(date_str)
        )

        return {
            "success": True,
            **data
        }

    except Exception as e:

        return {
            "success": False,
            "message": str(e)
        }
