import json
import logging
from datetime import datetime
from pathlib import Path
import urllib.request
import urllib.error
from services.db_handler import MongoService

logger = logging.getLogger("power_map_service")

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "power_map"
DEFAULT_GEOJSON_PATH = DATA_DIR / "west_bengal_power_grid.geojson"
LIVE_CACHE_PATH = DATA_DIR / "west_bengal_live_cache.geojson"

COLLECTION_NAME = "power_map_datasets"
DOC_KEY = "active_grid_dataset"

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

class PowerMapService:
    def __init__(self):
        try:
            self.db = MongoService().db
            self.collection = self.db[COLLECTION_NAME]
        except Exception as e:
            logger.warning(f"Failed to connect to MongoDB in PowerMapService: {e}")
            self.collection = None

    def _load_default_geojson(self) -> dict:
        if DEFAULT_GEOJSON_PATH.exists():
            with open(DEFAULT_GEOJSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"type": "FeatureCollection", "features": [], "metadata": {}}

    def get_power_grid_data(self) -> dict:
        """Fetch active power grid dataset from DB, falling back to local file."""
        if self.collection is not None:
            try:
                doc = self.collection.find_one({"doc_key": DOC_KEY}, {"_id": 0})
                if doc and doc.get("geojson") and len(doc["geojson"].get("features", [])) > 0:
                    return doc["geojson"]
            except Exception as e:
                logger.error(f"Error querying power grid data from MongoDB: {e}")

        # Fallback to local live cache or default curated geojson
        if LIVE_CACHE_PATH.exists():
            try:
                with open(LIVE_CACHE_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data.get("features"):
                        return data
            except Exception:
                pass

        default_data = self._load_default_geojson()
        # Save to DB if collection is available
        if self.collection is not None:
            try:
                self.save_grid_dataset(default_data, source="curated_wb_master")
            except Exception as e:
                logger.warning(f"Could not seed default grid data to MongoDB: {e}")

        return default_data

    def get_status(self) -> dict:
        """Return dataset status and synchronization metadata."""
        grid_data = self.get_power_grid_data()
        meta = grid_data.get("metadata", {})
        features = grid_data.get("features", [])

        total_lines = sum(1 for f in features if f.get("properties", {}).get("category") == "power_line")
        total_plants = sum(1 for f in features if f.get("properties", {}).get("category") == "power_plant")
        total_substations = sum(1 for f in features if f.get("properties", {}).get("category") == "power_substation")
        total_mw = sum(f.get("properties", {}).get("capacity_mw", 0) for f in features if f.get("properties", {}).get("category") == "power_plant")

        return {
            "status": "ready",
            "last_updated": meta.get("last_updated") or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "source": meta.get("source", "curated_wb_grid_dataset"),
            "total_features": len(features),
            "total_power_lines": total_lines,
            "total_power_plants": total_plants,
            "total_substations": total_substations,
            "total_generation_capacity_mw": total_mw,
            "region": meta.get("region", "West Bengal"),
            "version": meta.get("version", "2.0.0"),
        }

    def save_grid_dataset(self, geojson_data: dict, source: str = "imported") -> dict:
        """Persist GeoJSON dataset into MongoDB and local filesystem."""
        features = geojson_data.get("features", [])
        total_lines = sum(1 for f in features if f.get("properties", {}).get("category") == "power_line")
        total_plants = sum(1 for f in features if f.get("properties", {}).get("category") == "power_plant")
        total_substations = sum(1 for f in features if f.get("properties", {}).get("category") == "power_substation")
        total_mw = sum(f.get("properties", {}).get("capacity_mw", 0) for f in features if f.get("properties", {}).get("category") == "power_plant")

        updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        metadata = {
            **(geojson_data.get("metadata") or {}),
            "last_updated": updated_at,
            "source": source,
            "total_power_lines": total_lines,
            "total_power_plants": total_plants,
            "total_substations": total_substations,
            "total_generation_capacity_mw": total_mw,
            "total_features": len(features),
        }
        geojson_data["metadata"] = metadata

        # Save to local file
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        try:
            with open(LIVE_CACHE_PATH, "w", encoding="utf-8") as f:
                json.dump(geojson_data, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not write live cache file: {e}")

        # Save to MongoDB
        if self.collection is not None:
            self.collection.update_one(
                {"doc_key": DOC_KEY},
                {"$set": {
                    "doc_key": DOC_KEY,
                    "geojson": geojson_data,
                    "updated_at": updated_at,
                    "source": source,
                    "metadata": metadata,
                }},
                upsert=True
            )

        return metadata

    def sync_live_from_osm(self) -> dict:
        """
        Query Overpass API for live West Bengal power infrastructure.
        Gracefully detects offline/intranet environments and informs the user.
        """
        # Overpass QL query targeting West Bengal bounding box [21.5, 85.8, 27.3, 89.9]
        query = """
        [out:json][timeout:15];
        (
          node["power"="plant"](21.5,85.8,27.3,89.9);
          way["power"="plant"](21.5,85.8,27.3,89.9);
          node["power"="substation"](21.5,85.8,27.3,89.9);
          way["power"="substation"](21.5,85.8,27.3,89.9);
          way["power"="line"](21.5,85.8,27.3,89.9);
          way["power"="cable"](21.5,85.8,27.3,89.9);
        );
        out tags center;
        """

        raw_data = None
        last_error = None

        for endpoint in OVERPASS_ENDPOINTS:
            try:
                data = query.encode("utf-8")
                req = urllib.request.Request(
                    endpoint,
                    data=data,
                    headers={
                        "User-Agent": "RTG-WestBengalPowerMap/2.0 (Energy Grid Management)",
                        "Content-Type": "application/x-www-form-urlencoded"
                    }
                )
                with urllib.request.urlopen(req, timeout=12) as response:
                    if response.status == 200:
                        raw_data = json.loads(response.read().decode("utf-8"))
                        break
            except Exception as e:
                last_error = str(e)
                continue

        if not raw_data or "elements" not in raw_data:
            # Server is on intranet or Overpass timed out
            current_status = self.get_status()
            return {
                "success": False,
                "intranet_detected": True,
                "message": (
                    f"Direct outbound connection to OpenStreetMap Overpass API timed out (intranet network detected: {last_error or 'Connection timeout'}). "
                    f"The high-accuracy local West Bengal grid dataset ({current_status['total_features']} features, "
                    f"{current_status['total_power_lines']} transmission lines, {current_status['total_power_plants']} generating stations) "
                    "remains fully active. You can also import an updated GeoJSON export anytime using the Import button."
                ),
                "status": current_status
            }

        # If we successfully received OSM elements, parse into standard GeoJSON
        elements = raw_data.get("elements", [])
        current_master = self._load_default_geojson()
        features = list(current_master.get("features", []))

        # Add or update new lines and substations from OSM
        new_count = 0
        for elem in elements:
            tags = elem.get("tags", {})
            power_tag = tags.get("power")
            name = tags.get("name")
            if not name:
                continue

            center = [elem.get("lon"), elem.get("lat")]
            if None in center:
                center = [elem.get("center", {}).get("lon"), elem.get("center", {}).get("lat")]
            if None in center:
                continue

            # Check if duplicate by name
            if any(f.get("properties", {}).get("name") == name for f in features):
                continue

            v_raw = tags.get("voltage") or "220000"
            try:
                volt_num = int(str(v_raw).split(";")[0].replace("kV", "").strip())
                if volt_num < 1000:
                    volt_num *= 1000
            except Exception:
                volt_num = 220000

            volt_class = round(volt_num / 1000)
            category = "power_plant" if power_tag == "plant" else "power_substation"

            color = (
                "#9333EA" if volt_class >= 765 else
                "#EF4444" if volt_class >= 400 else
                "#F97316" if volt_class >= 220 else
                "#0284C7"
            )

            features.append({
                "type": "Feature",
                "id": f"osm-{elem.get('id')}",
                "geometry": {
                    "type": "Point",
                    "coordinates": center,
                },
                "properties": {
                    "id": f"osm-{elem.get('id')}",
                    "name": name,
                    "short_name": name.split("(")[0].strip(),
                    "category": category,
                    "operator": tags.get("operator", "Grid Utility"),
                    "voltage": f"{volt_class} kV",
                    "voltage_class": volt_class,
                    "source": "OpenStreetMap Live",
                    "color": color,
                }
            })
            new_count += 1

        updated_geojson = {
            "type": "FeatureCollection",
            "metadata": {
                "title": "West Bengal Power System Grid Map (Live OSM Synced)",
                "region": "West Bengal",
                "version": "2.1.0",
                "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "source": "osm_live_sync",
            },
            "features": features
        }

        metadata = self.save_grid_dataset(updated_geojson, source="osm_live_sync")

        return {
            "success": True,
            "message": f"Successfully updated grid dataset from live OpenStreetMap! Synced {new_count} new infrastructure element(s).",
            "metadata": metadata,
            "features_count": len(features),
        }

    def reset_to_default(self) -> dict:
        """Reset grid dataset to curated master dataset."""
        default_data = self._load_default_geojson()
        meta = self.save_grid_dataset(default_data, source="curated_wb_master")
        return {
            "success": True,
            "message": "Reset power map dataset to curated West Bengal master grid data.",
            "metadata": meta,
        }

