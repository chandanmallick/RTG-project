from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, Response
import json
import logging
from services.power_map_service import PowerMapService

logger = logging.getLogger("power_map_routes")

router = APIRouter(prefix="/api/power-map", tags=["Power Grid Map"])
service = PowerMapService()


@router.get("/data")
async def get_grid_data():
    """Retrieve the current active power grid GeoJSON dataset."""
    try:
        data = service.get_power_grid_data()
        return data
    except Exception as e:
        logger.error(f"Error fetching power grid data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch power grid data: {str(e)}")


@router.get("/status")
async def get_sync_status():
    """Get the current grid dataset status and metadata."""
    try:
        return service.get_status()
    except Exception as e:
        logger.error(f"Error getting power map status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch status: {str(e)}")


@router.post("/sync-live")
async def sync_live():
    """
    Attempt to sync latest power infrastructure from live OpenStreetMap / OpenInfra.
    Gracefully handles offline/intranet environments with comprehensive feedback.
    """
    try:
        result = service.sync_live_from_osm()
        return result
    except Exception as e:
        logger.error(f"Error in sync_live: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@router.post("/import")
async def import_grid_dataset(payload: dict):
    """
    Import or update grid dataset via GeoJSON payload.
    Enables manual update in air-gapped intranet environments.
    """
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise HTTPException(status_code=400, detail="Invalid GeoJSON. Must be a FeatureCollection.")

    try:
        meta = service.save_grid_dataset(payload, source="user_imported_geojson")
        return {
            "success": True,
            "message": f"Successfully imported grid dataset with {len(payload.get('features', []))} features.",
            "metadata": meta,
        }
    except Exception as e:
        logger.error(f"Error importing GeoJSON dataset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")


@router.post("/import-file")
async def import_grid_file(file: UploadFile = File(...)):
    """Upload a .geojson or .json file to update the power grid map data."""
    try:
        content = await file.read()
        parsed = json.loads(content.decode("utf-8"))
        if not isinstance(parsed, dict) or parsed.get("type") != "FeatureCollection":
            raise HTTPException(status_code=400, detail="Invalid GeoJSON format. Must be a FeatureCollection.")

        meta = service.save_grid_dataset(parsed, source=f"uploaded_file_{file.filename}")
        return {
            "success": True,
            "message": f"Successfully loaded {len(parsed.get('features', []))} features from {file.filename}.",
            "metadata": meta,
        }
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid JSON document.")
    except Exception as e:
        logger.error(f"Error processing uploaded file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Upload processing failed: {str(e)}")


@router.post("/reset")
async def reset_dataset():
    """Reset the grid dataset to the curated master West Bengal dataset."""
    try:
        return service.reset_to_default()
    except Exception as e:
        logger.error(f"Error resetting power map data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Reset failed: {str(e)}")


@router.get("/export")
async def export_grid_dataset():
    """Export current active GeoJSON dataset as a downloadable file."""
    try:
        data = service.get_power_grid_data()
        content = json.dumps(data, indent=2)
        filename = f"West_Bengal_Power_Grid_{data.get('metadata', {}).get('last_updated', 'export').replace(' ', '_').replace(':', '-')}.geojson"
        return Response(
            content=content,
            media_type="application/geo+json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.error(f"Error exporting GeoJSON dataset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

