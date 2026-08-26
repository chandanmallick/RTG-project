from datetime import datetime

from pymongo import ReplaceOne

from crew_legacy.database.database_mongo import (
    ATLAS_DATABASE_NAME,
    EMPLOYEE_DIRECTORY_MIRROR_COLLECTIONS,
    atlas_db,
    local_db,
)


SENSITIVE_EMPLOYEE_KEYS = {
    "password", "passwordhash", "passwordsalt", "temporarypassword",
    "resettoken", "passwordresettoken", "otp", "otpcode", "otpsecret",
    "twofactorsecret", "accesstoken", "refreshtoken", "sessiontoken",
    "secret", "credentials",
}


def _normalized_key(value) -> str:
    return "".join(character for character in str(value).lower() if character.isalnum())


def sanitize_employee_document(value):
    if isinstance(value, dict):
        return {
            key: sanitize_employee_document(item)
            for key, item in value.items()
            if _normalized_key(key) not in SENSITIVE_EMPLOYEE_KEYS
        }
    if isinstance(value, list):
        return [sanitize_employee_document(item) for item in value]
    return value


def _mirror_collection(name: str, *, dry_run: bool = False) -> dict:
    if atlas_db is None:
        return {"collection": name, "status": "skipped", "reason": "Atlas is not configured"}
    source = local_db[name]
    target = atlas_db[name]
    documents = list(source.find({}))
    if name == "employees":
        documents = [sanitize_employee_document(document) for document in documents]
    result = {
        "collection": name,
        "sourceCount": len(documents),
        "targetCountBefore": target.count_documents({}),
        "upsertedOrReplaced": 0,
        "removed": 0,
        "status": "dry-run" if dry_run else "synced",
    }
    if dry_run:
        return result
    if documents:
        operations = [ReplaceOne({"_id": document["_id"]}, document, upsert=True) for document in documents]
        write_result = target.bulk_write(operations, ordered=False)
        result["upsertedOrReplaced"] = write_result.upserted_count + write_result.modified_count + write_result.matched_count
        source_ids = [document["_id"] for document in documents]
        result["removed"] = target.delete_many({"_id": {"$nin": source_ids}}).deleted_count
    else:
        result["removed"] = target.delete_many({}).deleted_count
    result["targetCountAfter"] = target.count_documents({})
    return result


def sync_employee_directory_to_atlas(*, dry_run: bool = False) -> dict:
    """One-way sanitized mirror from the local employee master into Atlas."""
    started = datetime.utcnow()
    collections = [
        _mirror_collection(name, dry_run=dry_run)
        for name in sorted(EMPLOYEE_DIRECTORY_MIRROR_COLLECTIONS)
    ]
    return {
        "status": "dry-run" if dry_run else "complete",
        "database": ATLAS_DATABASE_NAME,
        "startedAt": started,
        "completedAt": datetime.utcnow(),
        "collections": collections,
    }
