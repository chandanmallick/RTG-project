import json
from pathlib import Path
import sys

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Standard voltage color map requested by user:
# 765 kV: Dark Yellow (#CA8A04)
# 400 kV: Red (#DC2626)
# 220 kV: Green (#16A34A)
# 132 kV: Blue (#0284C7)
# Power Plants / Generating Stations: Amber (#F59E0B)

COLOR_DARK_YELLOW_765 = "#CA8A04"
COLOR_RED_400 = "#DC2626"
COLOR_GREEN_220 = "#16A34A"
COLOR_BLUE_132 = "#0284C7"
COLOR_AMBER_PLANT = "#F59E0B"

def get_entity_color(category: str, voltage_class: int) -> str:
    if category == "power_plant":
        return COLOR_AMBER_PLANT
    vc = int(voltage_class or 0)
    if vc >= 700:
        return COLOR_DARK_YELLOW_765
    elif vc >= 380:
        return COLOR_RED_400
    elif vc >= 200:
        return COLOR_GREEN_220
    else:
        return COLOR_BLUE_132

def update_geojson_file(file_path: Path):
    if not file_path.exists():
        print(f"Skipping non-existent file: {file_path}")
        return None
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    updated_count = 0
    features = data.get("features", [])
    for feat in features:
        props = feat.setdefault("properties", {})
        cat = props.get("category", "")
        vc = props.get("voltage_class", 0)
        old_color = props.get("color")
        new_color = get_entity_color(cat, vc)
        if old_color != new_color:
            props["color"] = new_color
            updated_count += 1

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"Updated {file_path.name}: {updated_count}/{len(features)} feature colors updated.")
    return data

def main():
    root = Path(__file__).resolve().parent.parent.parent
    files = [
        root / "frontend" / "src" / "data" / "power_map" / "eastern_region_power_grid.json",
        root / "backend" / "data" / "power_map" / "eastern_region_power_grid.geojson",
        root / "backend" / "data" / "power_map" / "west_bengal_power_grid.geojson",
        root / "backend" / "data" / "power_map" / "eastern_region_live_cache.geojson",
    ]

    last_data = None
    for fp in files:
        res = update_geojson_file(fp)
        if res:
            last_data = res

    # Update MongoDB if accessible
    try:
        from services.db_handler import MongoService
        db = MongoService().db
        col = db["power_map_datasets"]
        if last_data:
            doc = col.find_one({"doc_key": "active_grid_dataset"})
            if doc:
                features = doc.get("geojson", {}).get("features", [])
                doc_updated = 0
                for feat in features:
                    props = feat.setdefault("properties", {})
                    cat = props.get("category", "")
                    vc = props.get("voltage_class", 0)
                    new_color = get_entity_color(cat, vc)
                    if props.get("color") != new_color:
                        props["color"] = new_color
                        doc_updated += 1
                col.update_one(
                    {"doc_key": "active_grid_dataset"},
                    {"$set": {"geojson.features": features}}
                )
                print(f"Updated MongoDB active_grid_dataset: {doc_updated} feature colors updated.")
            else:
                col.update_one(
                    {"doc_key": "active_grid_dataset"},
                    {"$set": {"doc_key": "active_grid_dataset", "geojson": last_data}},
                    upsert=True
                )
                print("Seeded updated active_grid_dataset into MongoDB.")
    except Exception as e:
        print(f"MongoDB update note: {e}")

if __name__ == "__main__":
    main()
