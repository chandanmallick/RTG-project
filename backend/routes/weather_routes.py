from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel
from typing import List, Optional
import json
import logging
from services.weather_service import WeatherService

logger = logging.getLogger("weather_routes")

router = APIRouter(prefix="/api/weather", tags=["NASA POWER Weather Analytics"])
weather_service = WeatherService()


class LocationItem(BaseModel):
    latitude: float
    longitude: float
    name: Optional[str] = None


class BatchWeatherRequest(BaseModel):
    locations: List[LocationItem]
    start: Optional[str] = "20240101"
    end: Optional[str] = "20241231"
    parameters: Optional[str] = "T2M,T2MDEW,T2MWET,TS,T2M_RANGE,T2M_MAX,T2M_MIN"


@router.get("/cities")
async def get_weather_cities():
    """Retrieve pre-configured list of Eastern Region cities with latitude and longitude coordinates."""
    try:
        cities = weather_service.get_cities()
        return {
            "success": True,
            "count": len(cities),
            "cities": cities,
        }
    except Exception as e:
        logger.error(f"Error fetching weather cities: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nasa-power/point")
async def get_nasa_power_point(
    latitude: float = Query(..., description="Latitude of the location (e.g. 22.5726 for Kolkata)"),
    longitude: float = Query(..., description="Longitude of the location (e.g. 88.3639 for Kolkata)"),
    start: str = Query("20240101", description="Start date YYYYMMDD"),
    end: str = Query("20241231", description="End date YYYYMMDD"),
    parameters: str = Query("T2M,T2MDEW,T2MWET,TS,T2M_RANGE,T2M_MAX,T2M_MIN", description="NASA POWER parameters"),
    city_name: Optional[str] = Query(None, description="Optional city or substation name"),
    refresh: bool = Query(False, description="Force refresh from live NASA API bypassing cache"),
):
    """
    Query NASA POWER API for daily temperature and meteorological metrics at a specific latitude & longitude.
    Parameters include:
      - T2M: Temperature at 2m (°C)
      - T2M_MAX: Maximum Temperature at 2m (°C)
      - T2M_MIN: Minimum Temperature at 2m (°C)
      - T2MDEW: Dew Point Temperature at 2m (°C)
      - T2MWET: Wet Bulb Temperature at 2m (°C)
      - TS: Earth Skin Temperature (°C)
      - T2M_RANGE: Daily Temperature Range (°C)
    """
    try:
        data = weather_service.fetch_nasa_power_data(
            latitude=latitude,
            longitude=longitude,
            start=start,
            end=end,
            parameters=parameters,
            city_name=city_name,
            force_refresh=refresh,
        )
        return data
    except Exception as e:
        logger.error(f"Error fetching NASA POWER point data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch weather data: {str(e)}")


@router.post("/nasa-power/batch")
async def get_nasa_power_batch(req: BatchWeatherRequest):
    """
    Batch query NASA POWER API for multiple geographic locations (e.g. [(32.929, -95.770), (5, 10)]).
    Returns temperature snapshots and series for each location.
    """
    try:
        results = []
        for loc in req.locations:
            try:
                res = weather_service.fetch_nasa_power_data(
                    latitude=loc.latitude,
                    longitude=loc.longitude,
                    start=req.start,
                    end=req.end,
                    parameters=req.parameters,
                    city_name=loc.name,
                )
                results.append(res)
            except Exception as item_err:
                logger.warning(f"Failed to fetch for loc ({loc.latitude}, {loc.longitude}): {item_err}")
                results.append({
                    "success": False,
                    "location": {"latitude": loc.latitude, "longitude": loc.longitude, "name": loc.name},
                    "error": str(item_err),
                })
        return {
            "success": True,
            "count": len(results),
            "results": results,
        }
    except Exception as e:
        logger.error(f"Error in batch weather request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch query failed: {str(e)}")


@router.get("/nasa-power/export")
async def export_nasa_power_json(
    latitude: float = Query(...),
    longitude: float = Query(...),
    start: str = Query("20240101"),
    end: str = Query("20241231"),
    parameters: str = Query("T2M,T2MDEW,T2MWET,TS,T2M_RANGE,T2M_MAX,T2M_MIN"),
):
    """Export weather data in downloadable JSON format matching the NASA POWER payload."""
    try:
        data = weather_service.fetch_nasa_power_data(
            latitude=latitude,
            longitude=longitude,
            start=start,
            end=end,
            parameters=parameters,
        )
        content = json.dumps(data, indent=2)
        filename = f"POWER_Point_Daily_{start}_{end}_{latitude:.4f}_{longitude:.4f}_RE.json"
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        logger.error(f"Error exporting weather data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

