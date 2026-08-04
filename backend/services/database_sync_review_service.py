from __future__ import annotations

import math
import os
import re
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any
from uuid import uuid4

import pandas as pd
import requests
import urllib3

from services.db_handler import MongoService
from services.rtg_push_service import RTGPushService
from services.token_service import TokenService
from utils.processor import DataProcessor


urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

RTG_MASTER_URL = (
    "https://rtgapi.grid-india.in/sendData/generator/filtered_details/"
    "?region_name=ERLDC"
)
REPORTING_STAGE_COLLECTION = "unit_sync_staging"
RTG_STAGE_COLLECTION = "rtg_master_staging"
REVIEW_COLLECTION = "unit_mapping_review"
REFERENCE_COLLECTION = "unit_mapping_reference"
HISTORY_COLLECTION = "unit_mapping_review_history"
PUSH_AUDIT_COLLECTION = "rtg_generator_push_audit"


def _text(value: Any) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def _number(value: Any) -> float | None:
    try:
        if value is None or value == "" or pd.isna(value):
            return None
        return round(float(value), 3)
    except (TypeError, ValueError):
        return None


def _clean_document(document: dict) -> dict:
    cleaned = {}
    for key, value in document.items():
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            cleaned[key] = None
        elif hasattr(value, "item"):
            cleaned[key] = value.item()
        else:
            cleaned[key] = value
    return cleaned


def _normalize_name(value: Any) -> str:
    text = _text(value).upper().replace("&", " AND ")
    text = re.sub(r"\b(POWER STATION|POWER PROJECT|THERMAL POWER STATION|HYDRO POWER STATION)\b", " ", text)
    return re.sub(r"[^A-Z0-9]+", "", text)


def _legacy_plant_id(reporting_stage_id: Any) -> str:
    value = _text(reporting_stage_id).replace(".0", "")
    return f"RTG_ER{value.zfill(5)}" if value else ""


def _rtg_config_and_token(db: MongoService) -> tuple[dict, str]:
    config = db.pipeline_config_collection.find_one({"config_type": "RTG"}) or {}
    required = ("rtg_token_url", "rtg_username", "rtg_password")
    if not all(config.get(field) for field in required):
        raise RuntimeError("RTG authentication is not configured in pipeline_config.")
    token = TokenService.get_token(
        config["rtg_token_url"],
        config["rtg_username"],
        config["rtg_password"],
    )
    return config, token


def _fetch_rtg_master(db: MongoService) -> list[dict]:
    _, token = _rtg_config_and_token(db)
    response = requests.get(
        RTG_MASTER_URL,
        headers={"Authorization": f"Token {token}", "Content-Type": "application/json"},
        timeout=45,
        verify=False,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise RuntimeError("RTG generator master returned an unexpected response.")
    return [_clean_document(row) for row in payload if isinstance(row, dict)]


def _generator_push_url(config: dict) -> str:
    return _text(
        config.get("rtg_generator_push_url")
        or config.get("rtg_master_push_url")
        or config.get("rtg_static_data_post_url")
        or config.get("rtg_static_post_url")
        or config.get("rtg_generator_post_url")
        or os.getenv("RTG_GENERATOR_PUSH_URL")
    )


def _build_generator_payload(review: dict, staged_units: list[dict]) -> dict:
    installed = round(sum(_number(row.get("installed_capacity")) or 0 for row in staged_units), 3)
    derated_values = [_number(row.get("Derated_Capacity")) for row in staged_units]
    effective = round(sum(value or 0 for value in derated_values), 3) if any(
        value is not None and value > 0 for value in derated_values
    ) else installed
    auxiliary_values = [_number(row.get("AUXILARY_CONSUMPTION")) for row in staged_units]
    auxiliary = round(sum(value or 0 for value in auxiliary_values), 3)
    first = staged_units[0] if staged_units else {}
    return {
        "plant_name": _text(review.get("reporting_plant_name")),
        "fuel_type": _text(review.get("reporting_fuel_type") or first.get("fuel_type")),
        "region_name": _text(first.get("region_name")) or "ERLDC",
        "state_name": _text(review.get("reporting_state_name") or first.get("state_name")),
        "utility_type": _text(review.get("reporting_utility_type") or first.get("utility_type")),
        "wbes_acronym": _text(first.get("wbes_acronym")) or "Not Available",
        "owner_name": _text(review.get("reporting_owner_name") or first.get("owner_name")),
        "installed_capacity": installed,
        "effective_capacity": effective,
        "scada_point": _text(first.get("scada_point")) or "NA",
        "auxilary_consumption": auxiliary,
    }


def _exact_created_match(payload: dict, rows: list[dict]) -> dict:
    name = _normalize_name(payload.get("plant_name"))
    state = _normalize_name(payload.get("state_name"))
    capacity = _number(payload.get("installed_capacity"))
    matches = []
    for row in rows:
        if _normalize_name(row.get("plant_name")) != name:
            continue
        row_state = _normalize_name(row.get("state_name"))
        if state and row_state and row_state != state:
            continue
        row_capacity = _number(row.get("installed_capacity"))
        if capacity is not None and row_capacity is not None and abs(capacity - row_capacity) > 0.01:
            continue
        matches.append(row)
    return matches[0] if len(matches) == 1 else {}


def _response_records(payload: Any) -> list[dict]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []
    records = []
    for key in ("data", "result", "results", "generator", "generators"):
        value = payload.get(key)
        if isinstance(value, dict):
            records.append(value)
        elif isinstance(value, list):
            records.extend(row for row in value if isinstance(row, dict))
    if payload.get("plant_id"):
        records.append(payload)
    return records


def _post_generator_static(
    db: MongoService,
    review: dict,
    generator: dict,
    user_id: str,
    action: str,
) -> Any:
    config, token = _rtg_config_and_token(db)
    push_url = _generator_push_url(config)
    if not push_url:
        raise RuntimeError(
            "RTG generator push API is not configured. Add rtg_generator_push_url to the RTG pipeline configuration."
        )

    response = RTGPushService.push_data(push_url, token, [generator])
    try:
        response_payload = response.json()
    except ValueError:
        response_payload = {"raw": (response.text or "")[:1000]}

    db.db[PUSH_AUDIT_COLLECTION].insert_one({
        "review_id": _text(review.get("review_id")),
        "reporting_stage_id": _text(review.get("reporting_stage_id")),
        "request_payload": generator,
        "action": action,
        "http_status": response.status_code,
        "response": response_payload,
        "requested_by": user_id,
        "requested_at": datetime.now(timezone.utc),
    })
    if not response.ok:
        raise RuntimeError(f"RTG generator static-data POST failed ({response.status_code}).")
    return response_payload


def _push_new_generator(db: MongoService, review: dict, staged_units: list[dict], user_id: str) -> dict:
    generator = _build_generator_payload(review, staged_units)
    # A previous remote success may not have reached the local commit. Reconcile
    # first so retrying acceptance never creates a duplicate RTG plant.
    existing = _exact_created_match(generator, _fetch_rtg_master(db))
    if existing:
        return existing

    response_payload = _post_generator_static(db, review, generator, user_id, "CREATE")

    records = _response_records(response_payload)
    created = next((row for row in records if _text(row.get("plant_id"))), {})
    if not created:
        created = _exact_created_match(generator, _fetch_rtg_master(db))
    if not created or not _text(created.get("plant_id")):
        raise RuntimeError(
            "RTG accepted the generator push, but a verifiable RTG plant ID was not returned. Refresh staging before retrying."
        )
    return _clean_document({**generator, **created})


def update_rtg_static_from_reporting(review_ids: list[str], user_id: str) -> dict:
    db = MongoService()
    review_collection = db.db[REVIEW_COLLECTION]
    reporting_collection = db.db[REPORTING_STAGE_COLLECTION]
    rtg_collection = db.db[RTG_STAGE_COLLECTION]
    reference_collection = db.db[REFERENCE_COLLECTION]
    updated = 0
    errors = []

    for raw_review_id in review_ids:
        review_id = _text(raw_review_id)
        review = review_collection.find_one({"review_id": review_id}) or {}
        if not review:
            errors.append(f"{review_id}: review row is no longer available")
            continue
        reporting_stage_id = _text(review.get("reporting_stage_id"))
        reference = reference_collection.find_one({"reporting_stage_id": reporting_stage_id}) or {}
        plant_id = _text(reference.get("rtg_plant_id") or review.get("selected_rtg_plant_id"))
        rtg = rtg_collection.find_one({"plant_id": plant_id}, {"_id": 0}) or {}
        staged_units = list(reporting_collection.find(
            {"reporting_stage_id": reporting_stage_id}, {"_id": 0}
        ))
        if not plant_id or not rtg:
            errors.append(f"{review_id}: accept and lock an RTG mapping before updating static data")
            continue
        if not staged_units:
            errors.append(f"{review_id}: reporting unit data is no longer available")
            continue

        reporting_payload = _build_generator_payload(review, staged_units)
        # The accepted RTG identity and portal naming are sacrosanct. Reporting
        # is authoritative for capacity and classification metadata.
        update_payload = {
            **reporting_payload,
            "plant_id": plant_id,
            "plant_name": _text(rtg.get("plant_name")) or reporting_payload["plant_name"],
            "wbes_acronym": _text(rtg.get("wbes_acronym")) or reporting_payload["wbes_acronym"],
            "scada_point": _text(rtg.get("scada_point")) or reporting_payload["scada_point"],
        }
        try:
            _post_generator_static(db, review, update_payload, user_id, "UPDATE")
            refreshed_rows = _fetch_rtg_master(db)
            refreshed = next(
                (row for row in refreshed_rows if _text(row.get("plant_id")) == plant_id),
                {},
            )
            expected_capacity = _number(update_payload.get("installed_capacity"))
            actual_capacity = _number(refreshed.get("installed_capacity"))
            if not refreshed:
                raise RuntimeError("updated RTG plant could not be verified in the master API")
            if expected_capacity is not None and actual_capacity != expected_capacity:
                raise RuntimeError(
                    f"RTG returned {actual_capacity} MW after update; expected {expected_capacity} MW"
                )
        except Exception as exc:
            errors.append(f"{review_id}: {exc}")
            continue

        now = datetime.now(timezone.utc)
        refreshed.update({"sync_run_id": review.get("sync_run_id"), "staged_at": now})
        rtg_collection.update_one({"plant_id": plant_id}, {"$set": refreshed}, upsert=True)
        reference_collection.update_one(
            {"reporting_stage_id": reporting_stage_id},
            {"$set": {
                "rtg_snapshot": {
                    key: refreshed.get(key)
                    for key in (
                        "plant_id", "plant_name", "state_name", "owner_name", "fuel_type",
                        "utility_type", "installed_capacity", "effective_capacity", "wbes_acronym",
                    )
                },
                "last_static_sync_at": now,
                "last_static_sync_by": user_id,
                "last_validated_at": now,
            }},
        )
        review_collection.update_one(
            {"review_id": review_id},
            {"$set": {
                "rtg_plant_name": _text(refreshed.get("plant_name")),
                "rtg_state_name": _text(refreshed.get("state_name")),
                "rtg_owner_name": _text(refreshed.get("owner_name")),
                "rtg_fuel_type": _text(refreshed.get("fuel_type")),
                "rtg_utility_type": _text(refreshed.get("utility_type")),
                "rtg_capacity_mw": actual_capacity,
                "status": "MATCHED",
                "match_method": "accepted_reference_static_sync",
                "confidence": 100,
                "last_static_sync_at": now,
                "last_static_sync_by": user_id,
            }},
        )
        updated += 1

    return {"success": not errors, "updated_rtg_plants": updated, "errors": errors}


def _stage_reporting_rows(dataframe: pd.DataFrame, run_id: str, staged_at: datetime) -> list[dict]:
    rows = []
    for record in dataframe.to_dict("records"):
        document = _clean_document(record)
        generated_id = _text(document.pop("plant_id", ""))
        reporting_stage_id = _text(document.get("FK_REPORTING_STAGE") or document.get("STAGE_ID"))
        document.update({
            "source_unit_id": _text(document.get("Id")),
            "reporting_stage_id": reporting_stage_id,
            "legacy_generated_plant_id": generated_id or _legacy_plant_id(reporting_stage_id),
            "sync_run_id": run_id,
            "staged_at": staged_at,
            "stage_status": "PENDING_REVIEW",
        })
        rows.append(document)
    return rows


def _group_reporting_rows(rows: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = {}
    for row in rows:
        key = _text(row.get("reporting_stage_id")) or f"unit:{_text(row.get('source_unit_id'))}"
        groups.setdefault(key, []).append(row)

    output = []
    for stage_id, units in groups.items():
        first = units[0]
        stage_names = list(dict.fromkeys(_text(row.get("STAGE_NAME")) for row in units if _text(row.get("STAGE_NAME"))))
        output.append({
            "review_id": f"reporting:{stage_id}",
            "reporting_stage_id": stage_id,
            "legacy_generated_plant_id": _text(first.get("legacy_generated_plant_id")),
            "reporting_plant_name": _text(first.get("Generating_Station_Name")),
            "reporting_stage_name": ", ".join(stage_names),
            "reporting_state_name": _text(first.get("state_name") or first.get("Location")),
            "reporting_owner_name": _text(first.get("owner_name")),
            "reporting_fuel_type": _text(first.get("fuel_type") or first.get("FuelName")),
            "reporting_utility_type": _text(first.get("utility_type")),
            "reporting_capacity_mw": round(sum(_number(row.get("installed_capacity")) or 0 for row in units), 3),
            "unit_count": len(units),
        })
    return output


def _candidate_score(source: dict, target: dict) -> float:
    source_name = _normalize_name(source.get("reporting_plant_name"))
    target_name = _normalize_name(target.get("plant_name"))
    name_score = SequenceMatcher(None, source_name, target_name).ratio() if source_name and target_name else 0
    score = name_score * 70
    if source_name == target_name and source_name:
        score += 15

    source_capacity = _number(source.get("reporting_capacity_mw"))
    target_capacity = _number(target.get("installed_capacity"))
    if source_capacity is not None and target_capacity is not None:
        denominator = max(abs(source_capacity), abs(target_capacity), 1)
        score += max(0, 15 * (1 - abs(source_capacity - target_capacity) / denominator))
    if _normalize_name(source.get("reporting_state_name")) == _normalize_name(target.get("state_name")):
        score += 5
    if _normalize_name(source.get("reporting_owner_name")) == _normalize_name(target.get("owner_name")):
        score += 3
    if _normalize_name(source.get("reporting_fuel_type")) == _normalize_name(target.get("fuel_type")):
        score += 2
    return round(min(score, 100), 1)


def _candidate_is_credible(source: dict, target: dict) -> bool:
    source_name = _normalize_name(source.get("reporting_plant_name"))
    target_name = _normalize_name(target.get("plant_name"))
    names_related = bool(source_name and target_name and (
        source_name in target_name
        or target_name in source_name
        or SequenceMatcher(None, source_name, target_name).ratio() >= 0.72
    ))
    source_capacity = _number(source.get("reporting_capacity_mw"))
    target_capacity = _number(target.get("installed_capacity"))
    if source_capacity is None or target_capacity is None:
        capacity_close = True
    else:
        capacity_close = abs(source_capacity - target_capacity) / max(abs(source_capacity), abs(target_capacity), 1) <= 0.2
    return names_related and capacity_close


def _build_review_rows(
    reporting_rows: list[dict],
    rtg_rows: list[dict],
    existing_maps: list[dict],
    saved_references: list[dict],
) -> list[dict]:
    grouped = _group_reporting_rows(reporting_rows)
    rtg_by_id = {_text(row.get("plant_id")): row for row in rtg_rows if _text(row.get("plant_id"))}
    existing_by_stage = {
        _text(row.get("reporting_stage_id") or row.get("STAGE_ID")): row
        for row in existing_maps
        if _text(row.get("reporting_stage_id") or row.get("STAGE_ID"))
    }
    existing_by_legacy_id = {
        _text(row.get("plant_id")): row
        for row in existing_maps
        if _text(row.get("plant_id"))
    }
    reference_by_stage = {
        _text(row.get("reporting_stage_id")): row
        for row in saved_references
        if _text(row.get("reporting_stage_id"))
    }
    matched_rtg_ids: set[str] = set()
    reviews = []

    for source in grouped:
        legacy_id = source.get("legacy_generated_plant_id") or ""
        current = existing_by_stage.get(source["reporting_stage_id"]) or existing_by_legacy_id.get(legacy_id) or {}
        current_id = _text(current.get("rtg_plant_id") or current.get("plant_id"))
        saved_reference = reference_by_stage.get(source["reporting_stage_id"]) or {}
        locked_id = _text(saved_reference.get("rtg_plant_id"))
        scored = sorted(
            (
                (_candidate_score(source, target), target)
                for target in rtg_rows
                if _text(target.get("plant_id"))
            ),
            key=lambda item: (-item[0], _text(item[1].get("plant_name"))),
        )
        match_method = "fuzzy"
        selected_id = ""
        confidence = scored[0][0] if scored else 0
        current_score = _candidate_score(source, rtg_by_id[current_id]) if current_id in rtg_by_id else 0
        legacy_score = _candidate_score(source, rtg_by_id[legacy_id]) if legacy_id in rtg_by_id else 0
        if locked_id:
            selected_id = locked_id
            confidence = 100
            match_method = "saved_reference"
        elif current_id in rtg_by_id and current_score >= 70 and _candidate_is_credible(source, rtg_by_id[current_id]):
            selected_id = current_id
            confidence = current_score
            match_method = "existing_mapping"
        elif legacy_id in rtg_by_id and legacy_score >= 60 and _candidate_is_credible(source, rtg_by_id[legacy_id]):
            selected_id = legacy_id
            confidence = legacy_score
            match_method = "reporting_stage_id"
        elif scored and scored[0][0] >= 72 and _candidate_is_credible(source, scored[0][1]):
            selected_id = _text(scored[0][1].get("plant_id"))
            confidence = scored[0][0]
            match_method = "name_capacity"

        selected = rtg_by_id.get(selected_id) or saved_reference.get("rtg_snapshot") or {}
        if selected_id:
            matched_rtg_ids.add(selected_id)
        if locked_id and locked_id not in rtg_by_id:
            status = "UNMATCHED"
        else:
            status = "MATCHED" if selected_id and confidence >= 85 else ("REVIEW" if selected_id else "UNMATCHED")
        reviews.append({
            **source,
            "current_rtg_plant_id": current_id if current_id in rtg_by_id else "",
            "current_mapping_score": current_score,
            "selected_rtg_plant_id": selected_id,
            "rtg_plant_name": _text(selected.get("plant_name")),
            "rtg_state_name": _text(selected.get("state_name")),
            "rtg_owner_name": _text(selected.get("owner_name")),
            "rtg_fuel_type": _text(selected.get("fuel_type")),
            "rtg_utility_type": _text(selected.get("utility_type")),
            "rtg_capacity_mw": _number(selected.get("installed_capacity")),
            "match_method": match_method,
            "confidence": confidence,
            "status": status,
            "mapping_locked": bool(locked_id),
            "locked_rtg_plant_id": locked_id,
            "reference_saved_at": saved_reference.get("saved_at"),
            "reference_saved_by": _text(saved_reference.get("saved_by")),
            "candidates": [
                {
                    "plant_id": _text(target.get("plant_id")),
                    "plant_name": _text(target.get("plant_name")),
                    "installed_capacity": _number(target.get("installed_capacity")),
                    "state_name": _text(target.get("state_name")),
                    "score": score,
                }
                for score, target in scored[:5]
            ],
        })

    for target in rtg_rows:
        target_id = _text(target.get("plant_id"))
        if not target_id or target_id in matched_rtg_ids:
            continue
        reviews.append({
            "review_id": f"rtg:{target_id}",
            "reporting_stage_id": "",
            "legacy_generated_plant_id": "",
            "reporting_plant_name": "",
            "reporting_stage_name": "",
            "reporting_state_name": "",
            "reporting_owner_name": "",
            "reporting_fuel_type": "",
            "reporting_utility_type": "",
            "reporting_capacity_mw": None,
            "unit_count": 0,
            "current_rtg_plant_id": target_id if target_id in existing_by_legacy_id else "",
            "selected_rtg_plant_id": target_id,
            "rtg_plant_name": _text(target.get("plant_name")),
            "rtg_state_name": _text(target.get("state_name")),
            "rtg_owner_name": _text(target.get("owner_name")),
            "rtg_fuel_type": _text(target.get("fuel_type")),
            "rtg_utility_type": _text(target.get("utility_type")),
            "rtg_capacity_mw": _number(target.get("installed_capacity")),
            "match_method": "rtg_master_only",
            "confidence": 0,
            "status": "RTG_ONLY",
            "candidates": [],
        })
    return sorted(reviews, key=lambda row: (row.get("status") == "RTG_ONLY", row.get("reporting_plant_name") or row.get("rtg_plant_name")))


def refresh_staging_and_review() -> dict:
    db = MongoService()
    run_id = uuid4().hex
    staged_at = datetime.now(timezone.utc)
    # Reporting data is deliberately staged without creating an RTG plant ID.
    # The ID is assigned only after comparison with the RTG master API.
    reporting_df = DataProcessor.run_pipeline(assign_legacy_plant_ids=False)
    reporting_rows = _stage_reporting_rows(reporting_df, run_id, staged_at)
    rtg_rows = _fetch_rtg_master(db)
    for row in rtg_rows:
        row.update({"sync_run_id": run_id, "staged_at": staged_at})

    reporting_collection = db.db[REPORTING_STAGE_COLLECTION]
    rtg_collection = db.db[RTG_STAGE_COLLECTION]
    review_collection = db.db[REVIEW_COLLECTION]
    reporting_collection.delete_many({})
    rtg_collection.delete_many({})
    review_collection.delete_many({})
    if reporting_rows:
        reporting_collection.insert_many(reporting_rows)
    if rtg_rows:
        rtg_collection.insert_many(rtg_rows)

    reviews = _build_review_rows(
        reporting_rows,
        rtg_rows,
        list(db.map_collection.find({}, {"_id": 0})),
        list(db.db[REFERENCE_COLLECTION].find({}, {"_id": 0})),
    )
    for row in reviews:
        row.update({
            "sync_run_id": run_id,
            "staged_at": staged_at,
            "review_status": "PENDING",
        })
    if reviews:
        review_collection.insert_many(reviews)
    return review_snapshot(db)


def review_snapshot(db: MongoService | None = None) -> dict:
    db = db or MongoService()
    rtg_config = db.pipeline_config_collection.find_one({"config_type": "RTG"}, {"_id": 0}) or {}
    reviews = list(db.db[REVIEW_COLLECTION].find({}, {"_id": 0}).sort([
        ("status", 1), ("reporting_plant_name", 1), ("rtg_plant_name", 1),
    ]))
    for row in reviews:
        if row.get("review_status") == "ACCEPTED" and row.get("mapping_locked"):
            row["status"] = "MATCHED"
            row["confidence"] = 100
            if row.get("match_method") not in {"accepted_reference_static_sync"}:
                row["match_method"] = "accepted_reference"
    rtg_master = list(db.db[RTG_STAGE_COLLECTION].find({}, {"_id": 0, "sync_run_id": 0, "staged_at": 0}).sort("plant_name", 1))
    counts = {status: sum(1 for row in reviews if row.get("status") == status) for status in ("MATCHED", "REVIEW", "UNMATCHED", "RTG_ONLY")}
    staged_at = max((row.get("staged_at") for row in reviews), default=None)
    return {
        "success": True,
        "rows": reviews,
        "rtg_master": rtg_master,
        "summary": {
            "reporting_units": db.db[REPORTING_STAGE_COLLECTION].count_documents({}),
            "reporting_stages": sum(1 for row in reviews if row.get("reporting_stage_id")),
            "rtg_master_records": len(rtg_master),
            **{key.lower(): value for key, value in counts.items()},
            "staged_at": staged_at,
            "generator_push_configured": bool(_generator_push_url(rtg_config)),
        },
    }


def _mapping_core(review: dict, rtg: dict) -> dict:
    return {
        "plant_id": _text(rtg.get("plant_id")),
        "rtg_plant_id": _text(rtg.get("plant_id")),
        "reporting_stage_id": _text(review.get("reporting_stage_id")),
        "STAGE_ID": _text(review.get("reporting_stage_id")),
        "STAGE_NAME": _text(review.get("reporting_stage_name")),
        "plant_name": _text(rtg.get("plant_name")) or _text(review.get("reporting_plant_name")),
        "owner_name": _text(rtg.get("owner_name")),
        "state_name": _text(rtg.get("state_name")),
        "fuel_type": _text(rtg.get("fuel_type")),
        "utility_type": _text(rtg.get("utility_type")),
        "stage_installed_capacity": _number(rtg.get("installed_capacity")),
        "mapping_source": "reporting_stage_to_rtg_master",
        "mapping_updated_at": datetime.now(timezone.utc),
    }


def commit_review_rows(items: list[dict], user_id: str) -> dict:
    db = MongoService()
    review_collection = db.db[REVIEW_COLLECTION]
    reporting_collection = db.db[REPORTING_STAGE_COLLECTION]
    rtg_collection = db.db[RTG_STAGE_COLLECTION]
    reference_collection = db.db[REFERENCE_COLLECTION]
    history_collection = db.db[HISTORY_COLLECTION]
    reference_collection.create_index("reporting_stage_id", unique=True)
    reference_collection.create_index("rtg_plant_id", unique=True)
    committed = 0
    units_committed = 0
    created_rtg_plants = 0
    errors = []

    for item in items:
        review_id = _text(item.get("review_id"))
        selected_id = _text(item.get("selected_rtg_plant_id"))
        create_in_rtg = bool(item.get("create_in_rtg"))
        review = review_collection.find_one({"review_id": review_id}) or {}
        if not review:
            errors.append(f"{review_id}: review row is no longer available")
            continue
        reporting_stage_id = _text(review.get("reporting_stage_id"))
        staged_units = list(reporting_collection.find(
            {"reporting_stage_id": reporting_stage_id}, {"_id": 0}
        )) if reporting_stage_id else []
        if create_in_rtg:
            if selected_id:
                errors.append(f"{review_id}: choose either an existing RTG plant or create a new one")
                continue
            if not reporting_stage_id or not staged_units:
                errors.append(f"{review_id}: no reporting unit data is available for RTG creation")
                continue
            try:
                rtg = _push_new_generator(db, review, staged_units, user_id)
                selected_id = _text(rtg.get("plant_id"))
                rtg.update({"sync_run_id": review.get("sync_run_id"), "staged_at": datetime.now(timezone.utc)})
                rtg_collection.update_one({"plant_id": selected_id}, {"$set": rtg}, upsert=True)
                created_rtg_plants += 1
            except Exception as exc:
                errors.append(f"{review_id}: {exc}")
                continue
        else:
            rtg = rtg_collection.find_one({"plant_id": selected_id}) or {}
        if not rtg:
            errors.append(f"{review_id}: select a valid RTG master plant")
            continue

        saved_reference = reference_collection.find_one({"reporting_stage_id": reporting_stage_id}) if reporting_stage_id else None
        if saved_reference and _text(saved_reference.get("rtg_plant_id")) != selected_id:
            errors.append(
                f"{review_id}: RTG ID {_text(saved_reference.get('rtg_plant_id'))} is already saved and is sacrosanct"
            )
            continue
        used_reference = reference_collection.find_one({
            "rtg_plant_id": selected_id,
            "reporting_stage_id": {"$ne": reporting_stage_id},
        }) if reporting_stage_id else None
        if used_reference:
            errors.append(
                f"{review_id}: RTG ID {selected_id} is already locked to reporting stage {_text(used_reference.get('reporting_stage_id'))}"
            )
            continue

        core = _mapping_core(review, rtg)
        if reporting_stage_id:
            for staged in staged_units:
                staged.pop("sync_run_id", None)
                staged.pop("staged_at", None)
                staged.pop("stage_status", None)
                staged["legacy_generated_plant_id"] = _text(staged.get("legacy_generated_plant_id"))
                staged.update({
                    "plant_id": selected_id,
                    "rtg_plant_id": selected_id,
                    "rtg_plant_name": _text(rtg.get("plant_name")),
                    "rtg_master_matched_at": datetime.now(timezone.utc),
                })
                source_unit_id = _text(staged.get("source_unit_id") or staged.get("Id"))
                db.unit_collection.update_one(
                    {"Id": staged.get("Id")} if staged.get("Id") is not None else {"source_unit_id": source_unit_id},
                    {"$set": staged},
                    upsert=True,
                )
                units_committed += 1

        legacy_id = _text(review.get("legacy_generated_plant_id"))
        existing = db.map_collection.find_one({
            "$or": [
                {"reporting_stage_id": reporting_stage_id},
                {"STAGE_ID": reporting_stage_id},
                {"plant_id": legacy_id},
                {"plant_id": selected_id},
            ]
        }) if reporting_stage_id or legacy_id else db.map_collection.find_one({"plant_id": selected_id})
        query = {"_id": existing["_id"]} if existing else {"plant_id": selected_id}
        db.map_collection.update_one(query, {"$set": core}, upsert=True)
        saved_at = datetime.now(timezone.utc)
        if reporting_stage_id:
            reference_document = {
                "reporting_stage_id": reporting_stage_id,
                "rtg_plant_id": selected_id,
                "reporting_snapshot": {
                    key: review.get(key)
                    for key in (
                        "reporting_plant_name", "reporting_stage_name", "reporting_state_name",
                        "reporting_owner_name", "reporting_fuel_type", "reporting_utility_type",
                        "reporting_capacity_mw", "unit_count",
                    )
                },
                "rtg_snapshot": {
                    key: rtg.get(key)
                    for key in (
                        "plant_id", "plant_name", "state_name", "owner_name", "fuel_type",
                        "utility_type", "installed_capacity", "effective_capacity", "wbes_acronym",
                    )
                },
                "saved_by": user_id,
                "saved_at": saved_reference.get("saved_at") if saved_reference else saved_at,
                "last_validated_at": saved_at,
                "active": True,
            }
            reference_collection.update_one(
                {"reporting_stage_id": reporting_stage_id},
                {"$set": reference_document},
                upsert=True,
            )
            history_collection.insert_one({
                **reference_document,
                "review_id": review_id,
                "action": "RECONFIRMED" if saved_reference else "ACCEPTED",
                "rtg_generator_created": create_in_rtg,
                "recorded_at": saved_at,
            })
        review_collection.update_one(
            {"review_id": review_id},
            {"$set": {
                "selected_rtg_plant_id": selected_id,
                "review_status": "ACCEPTED",
                "accepted_by": user_id,
                "accepted_at": saved_at,
                "mapping_locked": bool(reporting_stage_id),
                "locked_rtg_plant_id": selected_id if reporting_stage_id else "",
                "status": "MATCHED",
                "match_method": "accepted_reference",
                "confidence": 100,
                "rtg_plant_name": _text(rtg.get("plant_name")),
                "rtg_state_name": _text(rtg.get("state_name")),
                "rtg_owner_name": _text(rtg.get("owner_name")),
                "rtg_fuel_type": _text(rtg.get("fuel_type")),
                "rtg_utility_type": _text(rtg.get("utility_type")),
                "rtg_capacity_mw": _number(rtg.get("installed_capacity")),
            }},
        )
        committed += 1

    return {
        "success": not errors,
        "committed_mappings": committed,
        "committed_units": units_committed,
        "created_rtg_plants": created_rtg_plants,
        "errors": errors,
    }
