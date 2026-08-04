import csv
import io
import json
import math
import re
import uuid
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pymongo import UpdateOne
from pydantic import BaseModel, Field

from crew_legacy.admin_logic.auth_utils import get_authenticated_user, require_page_write
from routes.old_logbook_routes import (
    COLLECTION_CONFIG,
    OLD_LOGBOOK_DB,
    clean_text,
    normalize_record,
)
from services.db_handler import MongoService


router = APIRouter(prefix="/api/outage-ml", tags=["Outage ML Training Centre"])
TAXONOMY_COLLECTION = "outage_ml_taxonomy"
TRAINING_COLLECTION = "outage_ml_training_records"
MODEL_COLLECTION = "outage_ml_model_versions"
ARCHIVE_COLLECTION = "outage_ml_training_archives"
DEFAULT_TYPES = ("Shutdown", "Tripping", "Outage")
TOKEN_PATTERN = re.compile(r"[a-z0-9]+")


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:
        raise HTTPException(400, "Invalid record identifier") from exc


def jsonable(value: Any):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [jsonable(item) for item in value]
    return value


def collections():
    service = MongoService()
    db = service.db
    taxonomy = db[TAXONOMY_COLLECTION]
    training = db[TRAINING_COLLECTION]
    models = db[MODEL_COLLECTION]
    taxonomy.create_index([("level", 1), ("name_key", 1), ("parent_key", 1)], unique=True)
    training.create_index([("source", 1), ("source_kind", 1), ("source_id", 1)], unique=True)
    training.create_index([("type", 1), ("category", 1), ("subcategory", 1)])
    training.create_index("outage_at")
    models.create_index("version_id", unique=True)
    return service, taxonomy, training, models


def portable_record(item: dict) -> dict:
    fields = (
        "source", "source_kind", "source_id", "element_name", "element_type", "reason",
        "raw_reason_category", "outage_at", "restored_at", "duration_hours", "restored",
        "type", "category", "subcategory", "secondary_shutdown", "shutdown_category",
        "shutdown_subcategory", "use", "excluded", "reviewed",
    )
    return {field: jsonable(item.get(field)) for field in fields}


def require_write(user: dict):
    require_page_write(user, "outage_analysis")
    return user


def actor(user: dict) -> dict:
    return {
        "employee_id": str(user.get("employeeId") or user.get("userId") or ""),
        "name": clean_text(user.get("name")),
    }


def key(value: Any) -> str:
    return " ".join(clean_text(value).lower().split())


def ensure_defaults(taxonomy):
    now = utcnow()
    for item in DEFAULT_TYPES:
        taxonomy.update_one(
            {"level": "type", "name_key": key(item), "parent_key": ""},
            {"$setOnInsert": {
                "level": "type", "name": item, "name_key": key(item),
                "parent_id": None, "parent_key": "", "active": True,
                "created_at": now, "updated_at": now,
            }},
            upsert=True,
        )


def parse_dt(value: Any) -> Optional[datetime]:
    text = clean_text(value).replace("T", " ").strip()
    if not text:
        return None
    for fmt in (
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
        "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%d-%m-%Y",
        "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y",
        "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M",
    ):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def tokens(text: str) -> list[str]:
    base = TOKEN_PATTERN.findall(clean_text(text).lower())
    result = list(base)
    result.extend(f"{base[index]}_{base[index + 1]}" for index in range(len(base) - 1))
    return result


def record_text(row: dict) -> str:
    return " ".join(clean_text(row.get(field)) for field in (
        "reason", "element_name", "element_type", "raw_reason_category",
    ))


def train_nb(rows: list[dict], label_field: str, context_fields: tuple[str, ...] = ()) -> Optional[dict]:
    usable = [row for row in rows if clean_text(row.get(label_field))]
    if not usable:
        return None
    labels = Counter(clean_text(row[label_field]) for row in usable)
    vocab_counts = Counter()
    per_label = defaultdict(Counter)
    token_totals = Counter()
    for row in usable:
        context = " ".join(f"ctx_{field}_{key(row.get(field))}" for field in context_fields)
        counts = Counter(tokens(f"{record_text(row)} {context}"))
        per_label[clean_text(row[label_field])].update(counts)
        token_totals[clean_text(row[label_field])] += sum(counts.values())
        vocab_counts.update(counts)
    vocabulary = {word for word, _ in vocab_counts.most_common(3500)}
    class_data = {}
    vocab_size = max(1, len(vocabulary))
    total = sum(labels.values())
    for label, count in labels.items():
        kept = {word: amount for word, amount in per_label[label].items() if word in vocabulary}
        denominator = sum(kept.values()) + vocab_size
        class_data[label] = {
            "prior": math.log((count + 1) / (total + len(labels))),
            "denominator": denominator,
            "token_counts": kept,
        }
    return {
        "algorithm": "multinomial_naive_bayes",
        "label_field": label_field,
        "context_fields": list(context_fields),
        "record_count": len(usable),
        "vocabulary_size": vocab_size,
        "classes": class_data,
    }


def predict_nb(model: Optional[dict], row: dict) -> dict:
    if not model or not model.get("classes"):
        return {"label": "", "confidence": 0.0, "alternatives": []}
    context = " ".join(
        f"ctx_{field}_{key(row.get(field))}" for field in model.get("context_fields", [])
    )
    counts = Counter(tokens(f"{record_text(row)} {context}"))
    vocab_size = max(1, int(model.get("vocabulary_size") or 1))
    scores = {}
    for label, data in model["classes"].items():
        denominator = max(vocab_size, data["denominator"])
        score = data["prior"]
        label_tokens = data.get("token_counts", {})
        for word, amount in counts.items():
            score += amount * math.log((label_tokens.get(word, 0) + 1) / denominator)
        scores[label] = score
    peak = max(scores.values())
    weights = {label: math.exp(score - peak) for label, score in scores.items()}
    scale = sum(weights.values()) or 1
    ranked = sorted(
        ({"label": label, "confidence": round(weight / scale, 4)} for label, weight in weights.items()),
        key=lambda item: item["confidence"],
        reverse=True,
    )
    return {**ranked[0], "alternatives": ranked[:3]}


def build_km(samples: list[tuple[float, bool]]) -> dict:
    if not samples:
        return {"samples": 0, "events": 0, "curve": [{"hours": 0, "survival": 1.0}]}
    grouped = defaultdict(lambda: {"events": 0, "censored": 0})
    for hours, observed in samples:
        grouped[round(max(0.0, hours), 3)]["events" if observed else "censored"] += 1
    at_risk = len(samples)
    survival = 1.0
    curve = [{"hours": 0, "survival": 1.0}]
    for hours in sorted(grouped):
        events = grouped[hours]["events"]
        censored = grouped[hours]["censored"]
        if at_risk and events:
            survival *= 1 - (events / at_risk)
            curve.append({"hours": hours, "survival": round(survival, 6)})
        at_risk -= events + censored
    return {
        "samples": len(samples),
        "events": sum(1 for _, observed in samples if observed),
        "curve": curve,
    }


def survival_at(curve: list[dict], hours: float) -> float:
    value = 1.0
    for point in curve:
        if point["hours"] > hours:
            break
        value = point["survival"]
    return value


def restoration_prediction(restoration: dict, labels: dict, elapsed: float) -> dict:
    candidates = [
        f"{key(labels.get('type'))}|{key(labels.get('category'))}|{key(labels.get('subcategory'))}",
        f"{key(labels.get('type'))}|{key(labels.get('category'))}|*",
        f"{key(labels.get('type'))}|*|*",
        "*|*|*",
    ]
    selected_key = next((item for item in candidates if (restoration.get("groups") or {}).get(item)), "")
    group = (restoration.get("groups") or {}).get(selected_key)
    if not group:
        return {"available": False, "message": "No restoration history is available for this classification."}
    curve = group["curve"]
    current_survival = max(0.000001, survival_at(curve, elapsed))
    probabilities = {}
    for horizon in (1, 2, 4, 8, 12, 24, 48, 72):
        future = survival_at(curve, elapsed + horizon)
        probabilities[str(horizon)] = round(max(0.0, min(1.0, 1 - future / current_survival)), 4)
    median_remaining = None
    for point in curve:
        if point["hours"] >= elapsed and point["survival"] / current_survival <= 0.5:
            median_remaining = round(point["hours"] - elapsed, 2)
            break
    return {
        "available": True,
        "matched_group": selected_key,
        "samples": group["samples"],
        "events": group["events"],
        "elapsed_hours": round(elapsed, 2),
        "median_remaining_hours": median_remaining,
        "restoration_probability": probabilities,
    }


def build_restoration(rows: list[dict]) -> dict:
    samples = defaultdict(list)
    for row in rows:
        duration = row.get("duration_hours")
        if duration is None:
            continue
        type_name = key(row.get("type"))
        category = key(row.get("category"))
        subcategory = key(row.get("subcategory"))
        observed = bool(row.get("restored"))
        for group_key in (
            f"{type_name}|{category}|{subcategory}",
            f"{type_name}|{category}|*",
            f"{type_name}|*|*",
            "*|*|*",
        ):
            samples[group_key].append((float(duration), observed))
    return {
        "algorithm": "kaplan_meier",
        "supports_right_censoring": True,
        "groups": {group_key: build_km(values) for group_key, values in samples.items()},
    }


def evaluate(model: Optional[dict], rows: list[dict], label: str) -> dict:
    usable = [row for row in rows if clean_text(row.get(label))]
    if not usable or not model:
        return {"records": 0, "accuracy": None}
    correct = sum(predict_nb(model, row)["label"] == clean_text(row[label]) for row in usable)
    return {"records": len(usable), "training_accuracy": round(correct / len(usable), 4)}


class TaxonomyInput(BaseModel):
    level: str
    name: str
    parent_id: Optional[str] = None


class TrainingUpdate(BaseModel):
    type: str
    category: str = ""
    subcategory: str = ""
    secondary_shutdown: bool = False
    shutdown_category: str = ""
    shutdown_subcategory: str = ""
    use: bool = False
    excluded: bool = False


class BulkTrainingUpdate(TrainingUpdate):
    ids: list[str] = Field(default_factory=list)


class TrainInput(BaseModel):
    name: str = ""
    activate: bool = True


class PredictInput(BaseModel):
    reason: str
    element_name: str = ""
    element_type: str = ""
    elapsed_hours: float = 0
    version_id: Optional[str] = None


@router.get("/overview")
def overview(user=Depends(get_authenticated_user)):
    service, taxonomy, training, models = collections()
    ensure_defaults(taxonomy)
    return {
        "success": True,
        "training_records": training.count_documents({}),
        "labelled_records": training.count_documents({"use": True, "category": {"$nin": ["", None]}}),
        "use_records": training.count_documents({"use": True}),
        "excluded_records": training.count_documents({"excluded": True}),
        "model_versions": models.count_documents({}),
        "active_version": jsonable(models.find_one({"status": "active"}, {"model": 0, "restoration": 0})),
    }


@router.get("/taxonomy")
def get_taxonomy(user=Depends(get_authenticated_user)):
    _, taxonomy, _, _ = collections()
    ensure_defaults(taxonomy)
    return {"success": True, "items": [jsonable(item) for item in taxonomy.find({}).sort([("level", 1), ("name", 1)])]}


@router.post("/taxonomy")
def create_taxonomy(data: TaxonomyInput, user=Depends(get_authenticated_user)):
    require_write(user)
    _, taxonomy, _, _ = collections()
    level = key(data.level)
    if level not in {"type", "category", "subcategory"}:
        raise HTTPException(400, "Level must be Type, Category or Subcategory")
    name = clean_text(data.name)
    if not name:
        raise HTTPException(400, "Name is required")
    parent = None
    if level != "type":
        if not data.parent_id:
            raise HTTPException(400, "A parent is required")
        parent = taxonomy.find_one({"_id": oid(data.parent_id), "active": {"$ne": False}})
        expected = "type" if level == "category" else "category"
        if not parent or parent.get("level") != expected:
            raise HTTPException(400, f"{expected.title()} parent is required")
    document = {
        "level": level, "name": name, "name_key": key(name),
        "parent_id": parent["_id"] if parent else None,
        "parent_key": str(parent["_id"]) if parent else "",
        "active": True, "created_at": utcnow(), "updated_at": utcnow(),
        "created_by": actor(user),
    }
    existing = taxonomy.find_one({
        "level": level, "name_key": document["name_key"], "parent_key": document["parent_key"],
    })
    if existing:
        if existing.get("active") is False:
            taxonomy.update_one({"_id": existing["_id"]}, {"$set": {
                "active": True, "name": name, "updated_at": utcnow(), "updated_by": actor(user),
            }})
            existing.update({"active": True, "name": name})
            return {"success": True, "item": jsonable(existing)}
        raise HTTPException(409, "This taxonomy item already exists under the selected parent")
    try:
        result = taxonomy.insert_one(document)
    except Exception as exc:
        raise HTTPException(409, "This taxonomy item already exists under the selected parent") from exc
    document["_id"] = result.inserted_id
    return {"success": True, "item": jsonable(document)}


@router.put("/taxonomy/{item_id}")
def update_taxonomy(item_id: str, data: TaxonomyInput, user=Depends(get_authenticated_user)):
    require_write(user)
    _, taxonomy, training, _ = collections()
    current = taxonomy.find_one({"_id": oid(item_id)})
    if not current:
        raise HTTPException(404, "Taxonomy item not found")
    old_name = current["name"]
    name = clean_text(data.name)
    if not name:
        raise HTTPException(400, "Name is required")
    taxonomy.update_one({"_id": current["_id"]}, {"$set": {
        "name": name, "name_key": key(name), "updated_at": utcnow(), "updated_by": actor(user),
    }})
    field = {"type": "type", "category": "category", "subcategory": "subcategory"}[current["level"]]
    training.update_many({field: old_name}, {"$set": {field: name, "updated_at": utcnow()}})
    return {"success": True}


@router.delete("/taxonomy/{item_id}")
def archive_taxonomy(item_id: str, user=Depends(get_authenticated_user)):
    require_write(user)
    _, taxonomy, _, _ = collections()
    item = taxonomy.find_one({"_id": oid(item_id)})
    if not item:
        raise HTTPException(404, "Taxonomy item not found")
    descendants = [item["_id"]]
    cursor = 0
    while cursor < len(descendants):
        parent_id = descendants[cursor]
        descendants.extend(child["_id"] for child in taxonomy.find({"parent_id": parent_id}, {"_id": 1}))
        cursor += 1
    taxonomy.update_many({"_id": {"$in": descendants}}, {"$set": {
        "active": False, "updated_at": utcnow(), "updated_by": actor(user),
    }})
    return {"success": True}


@router.post("/import-old-logbook")
def import_old_logbook(user=Depends(get_authenticated_user)):
    require_write(user)
    service, taxonomy, training, _ = collections()
    ensure_defaults(taxonomy)
    old_db = service.client[OLD_LOGBOOK_DB]
    now = utcnow()
    imported = updated = 0
    for kind, config in COLLECTION_CONFIG.items():
        default_type = config["label"]
        operations = []
        for doc in old_db[config["collection"]].find({}):
            row = normalize_record(doc, kind)
            outage_at = parse_dt(row.get("outage_time"))
            restored_at = parse_dt(row.get("revival_time"))
            end_at = restored_at or now
            duration = max(0.0, (end_at - outage_at).total_seconds() / 3600) if outage_at else None
            source_id = str(doc["_id"])
            payload = {
                "source": "old_logbook", "source_kind": kind, "source_id": source_id,
                "element_name": row.get("element_name", ""),
                "element_type": row.get("element_type", ""),
                "reason": row.get("reason", ""),
                "raw_reason_category": row.get("sub_category", ""),
                "outage_at": outage_at, "restored_at": restored_at,
                "duration_hours": round(duration, 4) if duration is not None else None,
                "restored": bool(restored_at),
                "updated_at": now,
            }
            operations.append(UpdateOne(
                {"source": "old_logbook", "source_kind": kind, "source_id": source_id},
                {
                    "$set": payload,
                    "$setOnInsert": {
                    "type": default_type,
                    "category": "",
                    "subcategory": row.get("sub_category", ""),
                    "excluded": False,
                    "use": False,
                    "secondary_shutdown": False,
                    "shutdown_category": "",
                    "shutdown_subcategory": "",
                    "reviewed": False,
                    "created_at": now,
                    },
                },
                upsert=True,
            ))
            if len(operations) >= 1000:
                result = training.bulk_write(operations, ordered=False)
                imported += result.upserted_count
                updated += result.matched_count
                operations = []
        if operations:
            result = training.bulk_write(operations, ordered=False)
            imported += result.upserted_count
            updated += result.matched_count
    return {"success": True, "imported": imported, "updated": updated, "total": imported + updated}


@router.get("/records")
def list_records(
    search: str = "", type: str = "", category: str = "", subcategory: str = "",
    review: str = "all", page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=250),
    use_filter: str = Query("all", pattern="^(all|use|not_use)$"),
    secondary_filter: str = Query("all", pattern="^(all|breakdown|on_demand|none)$"),
    sort_by: str = Query("outage_at", pattern="^(outage_at|duration_hours|type|category|subcategory|reviewed|use)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    user=Depends(get_authenticated_user),
):
    _, _, training, _ = collections()
    query: dict[str, Any] = {}
    if search:
        query["$or"] = [
            {field: {"$regex": search, "$options": "i"}}
            for field in ("reason", "element_name", "element_type", "category", "subcategory")
        ]
    if type:
        query["type"] = type
    if category:
        query["category"] = category
    if subcategory:
        query["subcategory"] = subcategory
    if review == "reviewed":
        query["reviewed"] = True
    elif review == "unreviewed":
        query["reviewed"] = {"$ne": True}
    elif review == "excluded":
        query["excluded"] = True
    if use_filter == "use":
        query["use"] = True
    elif use_filter == "not_use":
        query["use"] = {"$ne": True}
    if secondary_filter == "breakdown":
        query.update({"type": "Tripping", "secondary_shutdown": True})
    elif secondary_filter == "on_demand":
        query.update({"type": "Outage", "secondary_shutdown": True})
    elif secondary_filter == "none":
        query["secondary_shutdown"] = {"$ne": True}
    total = training.count_documents(query)
    direction = 1 if sort_dir == "asc" else -1
    rows = training.find(query).sort([(sort_by, direction), ("_id", -1)]).skip((page - 1) * limit).limit(limit)
    return {"success": True, "total": total, "page": page, "limit": limit, "rows": [jsonable(row) for row in rows]}


@router.put("/records/{record_id}")
def update_record(record_id: str, data: TrainingUpdate, user=Depends(get_authenticated_user)):
    require_write(user)
    _, _, training, _ = collections()
    result = training.update_one({"_id": oid(record_id)}, {"$set": {
        "type": clean_text(data.type), "category": clean_text(data.category),
        "subcategory": clean_text(data.subcategory),
        "secondary_shutdown": data.secondary_shutdown,
        "shutdown_category": clean_text(data.shutdown_category) if data.secondary_shutdown else "",
        "shutdown_subcategory": clean_text(data.shutdown_subcategory) if data.secondary_shutdown else "",
        "use": data.use, "excluded": data.excluded,
        "reviewed": True, "reviewed_by": actor(user), "updated_at": utcnow(),
    }})
    if not result.matched_count:
        raise HTTPException(404, "Training record not found")
    return {"success": True}


@router.put("/records")
def update_records(data: BulkTrainingUpdate, user=Depends(get_authenticated_user)):
    require_write(user)
    _, _, training, _ = collections()
    ids = [oid(item) for item in data.ids]
    result = training.update_many({"_id": {"$in": ids}}, {"$set": {
        "type": clean_text(data.type), "category": clean_text(data.category),
        "subcategory": clean_text(data.subcategory),
        "secondary_shutdown": data.secondary_shutdown,
        "shutdown_category": clean_text(data.shutdown_category) if data.secondary_shutdown else "",
        "shutdown_subcategory": clean_text(data.shutdown_subcategory) if data.secondary_shutdown else "",
        "use": data.use, "excluded": data.excluded,
        "reviewed": True, "reviewed_by": actor(user), "updated_at": utcnow(),
    }})
    return {"success": True, "updated": result.modified_count}


@router.post("/train")
def train_models(data: TrainInput, user=Depends(get_authenticated_user)):
    require_write(user)
    service, taxonomy, training, models = collections()
    rows = list(training.find({"use": True, "excluded": {"$ne": True}}))
    labelled = [row for row in rows if clean_text(row.get("type"))]
    if not labelled:
        raise HTTPException(400, "Review records and mark at least one record as Use before training")
    type_model = train_nb(labelled, "type")
    category_model = train_nb(labelled, "category", ("type",))
    subcategory_rows = [row for row in labelled if clean_text(row.get("category"))]
    subcategory_model = train_nb(subcategory_rows, "subcategory", ("type", "category"))
    model = {"type": type_model, "category": category_model, "subcategory": subcategory_model}
    restoration = build_restoration(labelled)
    version_id = f"OML-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"
    now = utcnow()
    if data.activate:
        models.update_many({"status": "active"}, {"$set": {"status": "trained", "updated_at": now}})
    document = {
        "version_id": version_id,
        "name": clean_text(data.name) or f"Outage model {now.strftime('%d %b %Y %H:%M')}",
        "status": "active" if data.activate else "trained",
        "algorithm": {
            "classification": "Hierarchical multinomial Naive Bayes",
            "restoration": "Kaplan-Meier conditional restoration probability",
        },
        "model": model,
        "restoration": restoration,
        "metrics": {
            "type": evaluate(type_model, labelled, "type"),
            "category": evaluate(category_model, labelled, "category"),
            "subcategory": evaluate(subcategory_model, subcategory_rows, "subcategory"),
            "restoration_records": sum(1 for row in labelled if row.get("duration_hours") is not None),
        },
        "record_count": len(labelled),
        "taxonomy": [jsonable(item) for item in taxonomy.find({"active": {"$ne": False}})],
        "created_at": now, "created_by": actor(user), "updated_at": now,
    }
    models.insert_one(document)
    archive = service.db[ARCHIVE_COLLECTION]
    archive.create_index(
        [("version_id", 1), ("record.source", 1), ("record.source_kind", 1), ("record.source_id", 1)],
        unique=True,
    )
    if labelled:
        archive.insert_many([
            {
                "version_id": version_id,
                "record": portable_record(row),
                "created_at": now,
            }
            for row in labelled
        ], ordered=False)
    document.pop("model")
    document.pop("restoration")
    return {"success": True, "version": jsonable(document)}


@router.get("/versions")
def list_versions(user=Depends(get_authenticated_user)):
    _, _, _, models = collections()
    projection = {"model": 0, "restoration": 0, "taxonomy": 0}
    return {"success": True, "versions": [jsonable(item) for item in models.find({}, projection).sort("created_at", -1)]}


@router.put("/versions/{version_id}/activate")
def activate_version(version_id: str, user=Depends(get_authenticated_user)):
    require_write(user)
    _, _, _, models = collections()
    if not models.find_one({"version_id": version_id}):
        raise HTTPException(404, "Model version not found")
    now = utcnow()
    models.update_many({"status": "active"}, {"$set": {"status": "trained", "updated_at": now}})
    models.update_one({"version_id": version_id}, {"$set": {"status": "active", "updated_at": now, "activated_by": actor(user)}})
    return {"success": True}


@router.put("/versions/{version_id}/archive")
def archive_version(version_id: str, user=Depends(get_authenticated_user)):
    require_write(user)
    _, _, _, models = collections()
    result = models.update_one({"version_id": version_id}, {"$set": {
        "status": "archived", "updated_at": utcnow(), "archived_by": actor(user),
    }})
    if not result.matched_count:
        raise HTTPException(404, "Model version not found")
    return {"success": True}


def exported_rows(training):
    fields = {
        "_id": 0, "source": 1, "source_kind": 1, "source_id": 1, "element_name": 1,
        "element_type": 1, "reason": 1, "raw_reason_category": 1, "outage_at": 1,
        "restored_at": 1, "duration_hours": 1, "restored": 1, "type": 1,
        "category": 1, "subcategory": 1, "secondary_shutdown": 1,
        "shutdown_category": 1, "shutdown_subcategory": 1, "use": 1,
        "excluded": 1, "reviewed": 1,
    }
    return [portable_record(item) for item in training.find({}, fields).sort("outage_at", 1)]


@router.get("/dataset/export")
def export_dataset(format: str = Query("csv", pattern="^(csv|jsonl)$"), user=Depends(get_authenticated_user)):
    _, _, training, _ = collections()
    rows = exported_rows(training)
    output = io.StringIO()
    if format == "jsonl":
        for row in rows:
            output.write(json.dumps(row, ensure_ascii=False) + "\n")
        media = "application/x-ndjson"
    else:
        columns = list(rows[0].keys()) if rows else [
            "source", "source_kind", "source_id", "element_name", "element_type", "reason",
            "outage_at", "restored_at", "duration_hours", "restored", "type", "category", "subcategory",
            "secondary_shutdown", "shutdown_category", "shutdown_subcategory", "use",
        ]
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
        media = "text/csv"
    filename = f"outage_ml_training_data_{date.today().isoformat()}.{format}"
    return StreamingResponse(iter([output.getvalue()]), media_type=media, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/versions/{version_id}/download")
def download_version(version_id: str, user=Depends(get_authenticated_user)):
    service, _, training, models = collections()
    version = models.find_one({"version_id": version_id})
    if not version:
        raise HTTPException(404, "Model version not found")
    archive = service.db[ARCHIVE_COLLECTION]
    rows = [
        jsonable(item.get("record") or {})
        for item in archive.find({"version_id": version_id}, {"_id": 0, "record": 1})
    ]
    # Compatibility for versions created before immutable snapshots were introduced.
    if not rows:
        rows = exported_rows(training)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        manifest = {key: jsonable(value) for key, value in version.items() if key not in {"_id", "model", "restoration", "taxonomy"}}
        manifest["format_version"] = 1
        bundle.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        bundle.writestr("taxonomy.json", json.dumps(version.get("taxonomy", []), ensure_ascii=False, indent=2))
        bundle.writestr("reason_classifier.json", json.dumps(version.get("model", {}), ensure_ascii=False))
        bundle.writestr("restoration_model.json", json.dumps(version.get("restoration", {}), ensure_ascii=False))
        bundle.writestr("training_data.jsonl", "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))
        csv_output = io.StringIO()
        if rows:
            writer = csv.DictWriter(csv_output, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
        bundle.writestr("training_data.csv", csv_output.getvalue())
        bundle.writestr("README.txt", (
            "DRUPAd Outage ML portable archive\n\n"
            "reason_classifier.json contains a three-stage multinomial Naive Bayes model.\n"
            "restoration_model.json contains Kaplan-Meier survival curves and supports censored open outages.\n"
            "Probabilities and token weights are plain JSON and may be consumed by other software.\n"
        ))
    archive.seek(0)
    return StreamingResponse(archive, media_type="application/zip", headers={
        "Content-Disposition": f'attachment; filename="{version_id}.zip"',
    })


@router.post("/predict")
def predict(data: PredictInput, user=Depends(get_authenticated_user)):
    _, _, _, models = collections()
    query = {"version_id": data.version_id} if data.version_id else {"status": "active"}
    version = models.find_one(query)
    if not version:
        raise HTTPException(404, "No active model version is available")
    row = {
        "reason": data.reason, "element_name": data.element_name,
        "element_type": data.element_type, "source_kind": "",
    }
    type_result = predict_nb(version.get("model", {}).get("type"), row)
    row["type"] = type_result["label"]
    category_result = predict_nb(version.get("model", {}).get("category"), row)
    row["category"] = category_result["label"]
    subcategory_result = predict_nb(version.get("model", {}).get("subcategory"), row)
    labels = {
        "type": type_result["label"], "category": category_result["label"],
        "subcategory": subcategory_result["label"],
    }
    return {
        "success": True, "version_id": version["version_id"],
        "classification": {
            "labels": labels,
            "type": type_result, "category": category_result, "subcategory": subcategory_result,
        },
        "restoration": restoration_prediction(version.get("restoration", {}), labels, max(0, data.elapsed_hours)),
    }
