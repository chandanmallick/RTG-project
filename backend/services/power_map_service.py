import json
import logging
import re
from datetime import datetime
from pathlib import Path
import urllib.request
import urllib.error
from services.db_handler import MongoService

logger = logging.getLogger("power_map_service")

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "power_map"
ER_GEOJSON_PATH = DATA_DIR / "eastern_region_power_grid.geojson"
WB_GEOJSON_PATH = DATA_DIR / "west_bengal_power_grid.geojson"
LIVE_CACHE_PATH = DATA_DIR / "eastern_region_live_cache.geojson"
CRMS_ELEMENTS_PATH = DATA_DIR / "crms_codebook_elements.json"
CRMS_MAPPINGS_PATH = DATA_DIR / "crms_mappings.json"

COLLECTION_NAME = "power_map_datasets"
CRMS_MAPPINGS_COLLECTION = "power_map_crms_mappings"
DOC_KEY = "active_grid_dataset"

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

CRMS_CODEBOOK_URL = (
    "https://crms.erldc.in/Codebook/getElementNamesbyType?elementType=AC_TRANSMISSION_LINE_CIRCUIT"
)


class PowerMapService:
    def __init__(self):
        try:
            self.db = MongoService().db
            self.collection = self.db[COLLECTION_NAME]
            self.crms_collection = self.db[CRMS_MAPPINGS_COLLECTION]
        except Exception as e:
            logger.warning(f"Failed to connect to MongoDB in PowerMapService: {e}")
            self.collection = None
            self.crms_collection = None

    def _load_default_geojson(self) -> dict:
        for p in [ER_GEOJSON_PATH, WB_GEOJSON_PATH]:
            if p.exists():
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if data.get("features"):
                            return data
                except Exception:
                    pass
        return {"type": "FeatureCollection", "features": [], "metadata": {}}

    def get_power_grid_data(self) -> dict:
        """Fetch active power grid dataset from DB, falling back to local file."""
        if self.collection is not None:
            try:
                doc = self.collection.find_one({"doc_key": DOC_KEY}, {"_id": 0})
                if doc and doc.get("geojson") and len(doc["geojson"].get("features", [])) > 0:
                    geojson = doc["geojson"]
                    # Enrich with saved CRMS mappings if any
                    self._enrich_with_crms_mappings(geojson)
                    return geojson
            except Exception as e:
                logger.error(f"Error querying power grid data from MongoDB: {e}")

        # Fallback to local live cache or default curated ER geojson
        if LIVE_CACHE_PATH.exists():
            try:
                with open(LIVE_CACHE_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data.get("features"):
                        self._enrich_with_crms_mappings(data)
                        return data
            except Exception:
                pass

        default_data = self._load_default_geojson()
        self._enrich_with_crms_mappings(default_data)

        # Seed to DB if collection is available
        if self.collection is not None:
            try:
                self.save_grid_dataset(default_data, source="curated_er_master")
            except Exception as e:
                logger.warning(f"Could not seed default grid data to MongoDB: {e}")

        return default_data

    def _enrich_with_crms_mappings(self, geojson: dict):
        """Annotate GeoJSON features with their saved CRMS codebook mapping."""
        mappings = self.get_crms_mappings()
        if not mappings:
            return
        mapping_dict = {m.get("map_entity_id"): m.get("crms_element_name") for m in mappings}
        for f in geojson.get("features", []):
            fid = f.get("id") or f.get("properties", {}).get("id")
            if fid in mapping_dict:
                f.setdefault("properties", {})["crms_codebook"] = mapping_dict[fid]
                f.setdefault("properties", {})["crms_mapped"] = True

    def get_status(self) -> dict:
        """Return dataset status and synchronization metadata."""
        grid_data = self.get_power_grid_data()
        meta = grid_data.get("metadata", {})
        features = grid_data.get("features", [])

        total_lines = sum(1 for f in features if f.get("properties", {}).get("category") == "power_line")
        total_plants = sum(1 for f in features if f.get("properties", {}).get("category") == "power_plant")
        total_substations = sum(1 for f in features if f.get("properties", {}).get("category") == "power_substation")
        total_mw = sum(f.get("properties", {}).get("capacity_mw", 0) for f in features if f.get("properties", {}).get("category") == "power_plant")

        mappings = self.get_crms_mappings()

        return {
            "status": "ready",
            "last_updated": meta.get("last_updated") or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "source": meta.get("source", "erldc_master_grid_dataset"),
            "total_features": len(features),
            "total_power_lines": total_lines,
            "total_power_plants": total_plants,
            "total_substations": total_substations,
            "total_generation_capacity_mw": total_mw,
            "total_crms_mapped": len(mappings),
            "region": meta.get("region", "Eastern Region (West Bengal, Bihar, Jharkhand, Odisha, Sikkim)"),
            "version": meta.get("version", "3.0.0"),
            "states": ["West Bengal", "Bihar", "Jharkhand", "Odisha", "Sikkim"],
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
            "region": "Eastern Region (West Bengal, Bihar, Jharkhand, Odisha, Sikkim)",
            "states": ["West Bengal", "Bihar", "Jharkhand", "Odisha", "Sikkim"],
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
            with open(ER_GEOJSON_PATH, "w", encoding="utf-8") as f:
                json.dump(geojson_data, f, indent=2)
            with open(WB_GEOJSON_PATH, "w", encoding="utf-8") as f:
                json.dump(geojson_data, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not write grid files: {e}")

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

    def fetch_crms_elements(self, element_type: str = "AC_TRANSMISSION_LINE_CIRCUIT") -> dict:
        """
        Fetch CRMS Codebook elements from official API endpoint or cached fallback.
        Endpoint: https://crms.erldc.in/Codebook/getElementNamesbyType?elementType=...
        """
        url = f"https://crms.erldc.in/Codebook/getElementNamesbyType?elementType={element_type}"
        elements = []
        is_live = False

        # Attempt live query with 5s timeout
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RTG/1.0",
                    "Accept": "application/json, text/plain, */*",
                }
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    raw_text = resp.read().decode("utf-8")
                    data = json.loads(raw_text)
                    if isinstance(data, list):
                        elements = [str(x).strip() for x in data if str(x).strip()]
                    elif isinstance(data, dict):
                        items = data.get("elements") or data.get("elementNames") or data.get("data") or []
                        elements = [str(x).strip() for x in items if str(x).strip()]
                    if elements:
                        is_live = True
                        # Update local cache
                        try:
                            CRMS_ELEMENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
                            with open(CRMS_ELEMENTS_PATH, "w", encoding="utf-8") as f:
                                json.dump({
                                    "elementType": element_type,
                                    "source": url,
                                    "total_count": len(elements),
                                    "updated_at": datetime.now().isoformat(),
                                    "elements": sorted(elements)
                                }, f, indent=2)
                        except Exception as e:
                            logger.warning(f"Could not update local CRMS element cache: {e}")
        except Exception as e:
            logger.info(f"Could not connect live to CRMS endpoint ({e}); falling back to cached seed.")

        # If live fetch didn't return elements, load from local cached seed
        if not elements and CRMS_ELEMENTS_PATH.exists():
            try:
                with open(CRMS_ELEMENTS_PATH, "r", encoding="utf-8") as f:
                    cache_data = json.load(f)
                    elements = cache_data.get("elements", [])
            except Exception as e:
                logger.error(f"Error reading CRMS element cache: {e}")

        return {
            "success": True,
            "elementType": element_type,
            "is_live": is_live,
            "count": len(elements),
            "elements": elements,
            "source": "crms.erldc.in live API" if is_live else "Local CRMS master cache",
        }

    def get_crms_mappings(self) -> list:
        """Retrieve all entity mappings from DB or local file."""
        if self.crms_collection is not None:
            try:
                docs = list(self.crms_collection.find({}, {"_id": 0}))
                if docs:
                    return docs
            except Exception as e:
                logger.warning(f"Error querying CRMS mappings from MongoDB: {e}")

        if CRMS_MAPPINGS_PATH.exists():
            try:
                with open(CRMS_MAPPINGS_PATH, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

        return []

    def save_crms_mappings(self, mappings: list) -> dict:
        """Persist CRMS entity mappings to MongoDB and local JSON file."""
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        valid_items = []
        for m in mappings or []:
            entity_id = m.get("map_entity_id")
            crms_name = m.get("crms_element_name")
            if not entity_id or not crms_name:
                continue
            item = {
                "map_entity_id": str(entity_id),
                "map_entity_name": str(m.get("map_entity_name") or entity_id),
                "map_entity_type": str(m.get("map_entity_type") or "transmission_line"),
                "voltage_class": m.get("voltage_class"),
                "crms_element_name": str(crms_name).strip(),
                "crms_element_type": str(m.get("crms_element_type") or "AC_TRANSMISSION_LINE_CIRCUIT"),
                "mapped_at": now_str,
                "mapped_by": str(m.get("mapped_by") or "Operator"),
            }
            valid_items.append(item)

        # Save to local file
        try:
            CRMS_MAPPINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(CRMS_MAPPINGS_PATH, "w", encoding="utf-8") as f:
                json.dump(valid_items, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not write CRMS mappings file: {e}")

        # Save to MongoDB
        if self.crms_collection is not None:
            try:
                for item in valid_items:
                    self.crms_collection.update_one(
                        {"map_entity_id": item["map_entity_id"]},
                        {"$set": item},
                        upsert=True
                    )
            except Exception as e:
                logger.error(f"Error saving CRMS mappings to MongoDB: {e}")

        return {
            "success": True,
            "count": len(valid_items),
            "updated_at": now_str,
            "mappings": valid_items,
        }

    def auto_match_elements(self, element_type: str = "AC_TRANSMISSION_LINE_CIRCUIT") -> list:
        """
        Fuzzy match map transmission lines and substations to CRMS element names.
        Returns proposed match candidates with confidence score.
        """
        crms_res = self.fetch_crms_elements(element_type=element_type)
        crms_elements = crms_res.get("elements", [])
        grid_data = self.get_power_grid_data()
        features = grid_data.get("features", [])

        existing_mappings = {m["map_entity_id"]: m["crms_element_name"] for m in self.get_crms_mappings()}

        def tokenize(text):
            cleaned = re.sub(r"[^A-Za-z0-9]", " ", str(text).upper())
            return {w for w in cleaned.split() if len(w) > 1 and w not in {"KV", "CKT", "LINE", "S", "C", "D"}}

        matches = []
        for feat in features:
            props = feat.get("properties", {})
            f_id = feat.get("id") or props.get("id")
            f_name = props.get("name") or ""
            f_cat = props.get("category")
            v_class = props.get("voltage_class")

            # Check if already mapped
            already_mapped = existing_mappings.get(f_id)

            f_tokens = tokenize(f_name)
            if not f_tokens:
                continue

            best_crms = already_mapped
            best_score = 1.0 if already_mapped else 0.0

            if not already_mapped:
                for c_name in crms_elements:
                    c_tokens = tokenize(c_name)
                    if not c_tokens:
                        continue
                    # Check voltage match
                    c_volt_match = False
                    if v_class and str(v_class) in c_name:
                        c_volt_match = True

                    inter = f_tokens.intersection(c_tokens)
                    score = len(inter) / max(len(f_tokens), len(c_tokens))
                    if c_volt_match:
                        score += 0.25

                    if score > best_score:
                        best_score = score
                        best_crms = c_name

            matches.append({
                "map_entity_id": f_id,
                "map_entity_name": f_name,
                "category": f_cat,
                "state": props.get("state") or "Eastern Region",
                "voltage_class": v_class,
                "suggested_crms": best_crms if best_score >= 0.35 else None,
                "confidence": round(min(1.0, best_score), 2),
                "is_mapped": bool(already_mapped),
            })

        return matches

    def sync_live_from_osm(self) -> dict:
        """
        Query Overpass API for live Eastern Region infrastructure.
        Bounding box: min_lat: 17.8, min_lon: 81.3, max_lat: 28.1, max_lon: 89.9
        (Covers West Bengal, Odisha, Bihar, Jharkhand & Sikkim).
        """
        query = """
        [out:json][timeout:20];
        (
          node["power"="plant"](17.8,81.3,28.1,89.9);
          way["power"="plant"](17.8,81.3,28.1,89.9);
          node["power"="substation"](17.8,81.3,28.1,89.9);
          way["power"="substation"](17.8,81.3,28.1,89.9);
          way["power"="line"](17.8,81.3,28.1,89.9);
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
                        "User-Agent": "RTG-EasternRegionPowerMap/3.0 (Grid Operations)",
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
            current_status = self.get_status()
            return {
                "success": False,
                "intranet_detected": True,
                "message": (
                    f"Direct outbound connection to OpenStreetMap Overpass API timed out ({last_error or 'Connection timeout'}). "
                    f"The high-accuracy local Eastern Region grid dataset ({current_status['total_features']} features, "
                    f"{current_status['total_power_lines']} transmission lines, {current_status['total_power_plants']} generating stations across 5 states) "
                    "remains fully active. You can also import updated GeoJSON exports anytime."
                ),
                "status": current_status
            }

        # Parse OSM elements
        elements = raw_data.get("elements", [])
        current_master = self._load_default_geojson()
        features = list(current_master.get("features", []))

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
                "#F59E0B" if category == "power_plant" else
                "#CA8A04" if volt_class >= 765 else
                "#DC2626" if volt_class >= 400 else
                "#16A34A" if volt_class >= 220 else
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
                    "state": "Eastern Region",
                    "source": "OpenStreetMap Live",
                    "color": color,
                }
            })
            new_count += 1

        updated_geojson = {
            "type": "FeatureCollection",
            "metadata": {
                "title": "Eastern Region Power System Grid Map (Live OSM Synced)",
                "region": "Eastern Region (West Bengal, Bihar, Jharkhand, Odisha, Sikkim)",
                "version": "3.1.0",
                "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "source": "osm_live_sync",
            },
            "features": features
        }

        metadata = self.save_grid_dataset(updated_geojson, source="osm_live_sync")

        return {
            "success": True,
            "message": f"Successfully updated Eastern Region grid dataset! Synced {new_count} new infrastructure element(s).",
            "metadata": metadata,
            "features_count": len(features),
        }

    def reset_to_default(self) -> dict:
        """Reset grid dataset to curated master dataset."""
        default_data = self._load_default_geojson()
        meta = self.save_grid_dataset(default_data, source="curated_er_master")
        return {
            "success": True,
            "message": "Reset power map dataset to curated Eastern Region master grid data.",
            "metadata": meta,
        }
