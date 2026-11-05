from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Body
from fastapi.responses import JSONResponse, Response
import json
import logging
from typing import Optional, List
from pydantic import BaseModel
from services.power_map_service import PowerMapService

logger = logging.getLogger("power_map_routes")

router = APIRouter(prefix="/api/power-map", tags=["Power Grid Map"])
service = PowerMapService()


class MappingItem(BaseModel):
    map_entity_id: str
    map_entity_name: Optional[str] = None
    map_entity_type: Optional[str] = "transmission_line"
    voltage_class: Optional[int] = None
    crms_element_name: str
    crms_element_type: Optional[str] = "AC_TRANSMISSION_LINE_CIRCUIT"
    mapped_by: Optional[str] = "Operator"


class SaveMappingsRequest(BaseModel):
    mappings: List[MappingItem]


@router.get("/data")
async def get_grid_data():
    """Retrieve the current active power grid GeoJSON dataset for Eastern Region."""
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
    """Attempt to sync latest Eastern Region power infrastructure from live OpenStreetMap."""
    try:
        result = service.sync_live_from_osm()
        return result
    except Exception as e:
        logger.error(f"Error in sync_live: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@router.post("/import")
async def import_grid_dataset(payload: dict):
    """Import or update grid dataset via GeoJSON payload."""
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
    """Reset the grid dataset to the curated master Eastern Region dataset."""
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
        filename = f"Eastern_Region_Power_Grid_{data.get('metadata', {}).get('last_updated', 'export').replace(' ', '_').replace(':', '-')}.geojson"
        return Response(
            content=content,
            media_type="application/geo+json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.error(f"Error exporting GeoJSON dataset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.get("/openinfra-tiles/{z}/{x}/{y}.pbf")
async def get_openinfra_tile(z: int, x: int, y: int):
    """
    Proxy OpenInfraMap MVT vector tiles with CORS headers and caching.
    Provides transparent access for MapLibre GL in constrained/CORS environments.
    """
    tile_url = f"https://openinframap.org/map/power/{z}/{x}/{y}.pbf"
    try:
        import urllib.request
        req = urllib.request.Request(
            tile_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RTG-PowerMap/3.0",
                "Accept": "*/*",
            }
        )
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            content = resp.read()
            return Response(
                content=content,
                media_type="application/x-protobuf",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=86400",
                }
            )
    except Exception as e:
        logger.warning("OpenInfra power tile %s/%s/%s unavailable: %s", z, x, y, e)
        raise HTTPException(status_code=502, detail="OpenInfra power tile unavailable")



# ─────────────────────────────────────────────────────────────
# CRMS CODEBOOK MASTER DATA MAPPING ENDPOINTS
# ─────────────────────────────────────────────────────────────

@router.get("/crms-elements")
async def get_crms_elements(elementType: str = Query("AC_TRANSMISSION_LINE_CIRCUIT")):
    """
    Fetch official CRMS elements by elementType (e.g. AC_TRANSMISSION_LINE_CIRCUIT).
    Uses live query to https://crms.erldc.in with offline fallback cache.
    """
    try:
        res = service.fetch_crms_elements(element_type=elementType)
        return res
    except Exception as e:
        logger.error(f"Error getting CRMS elements: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch CRMS elements: {str(e)}")


@router.get("/crms-mappings")
async def get_crms_mappings():
    """Get all saved map-to-CRMS element mappings."""
    try:
        mappings = service.get_crms_mappings()
        return {
            "success": True,
            "count": len(mappings),
            "mappings": mappings,
        }
    except Exception as e:
        logger.error(f"Error getting CRMS mappings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch CRMS mappings: {str(e)}")


@router.post("/crms-mappings")
async def save_crms_mappings(req: SaveMappingsRequest):
    """Save or update CRMS element mappings for map features."""
    try:
        payload = [m.model_dump() for m in req.mappings]
        result = service.save_crms_mappings(payload)
        return result
    except Exception as e:
        logger.error(f"Error saving CRMS mappings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to save CRMS mappings: {str(e)}")


@router.post("/crms-auto-match")
async def auto_match_crms_elements(elementType: str = Query("AC_TRANSMISSION_LINE_CIRCUIT")):
    """Perform fuzzy matching between map elements and CRMS codebook master elements."""
    try:
        matches = service.auto_match_elements(element_type=elementType)
        return {
            "success": True,
            "count": len(matches),
            "matches": matches,
        }
    except Exception as e:
        logger.error(f"Error performing auto-match: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Auto-match failed: {str(e)}")
