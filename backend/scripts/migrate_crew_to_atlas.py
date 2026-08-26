"""Migrate operational Crew data to Atlas without copying authentication data."""

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bson import ObjectId
from gridfs import GridFS
from pymongo import ReplaceOne

from crew_legacy.admin_logic.atlas_sync import sync_employee_directory_to_atlas
from crew_legacy.database.database_mongo import (
    ATLAS_DATABASE_NAME,
    ATLAS_PRIMARY_COLLECTIONS,
    atlas_client,
    atlas_db,
    local_client,
    local_db,
)


def json_default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    return str(value)


def copy_indexes(source, target):
    copied = 0
    for name, definition in source.index_information().items():
        if name == "_id_":
            continue
        options = {
            key: definition[key]
            for key in ("unique", "sparse", "expireAfterSeconds", "partialFilterExpression")
            if key in definition
        }
        target.create_index(definition["key"], name=name, **options)
        copied += 1
    return copied


def migrate_collection(name: str, *, dry_run: bool) -> dict:
    source = local_db[name]
    target = atlas_db[name]
    source_count = source.count_documents({})
    target_before = target.count_documents({})
    result = {
        "collection": name,
        "sourceCount": source_count,
        "targetCountBefore": target_before,
        "status": "dry-run" if dry_run else "migrated",
    }
    if dry_run:
        return result
    operations = []
    processed = 0
    for document in source.find({}):
        operations.append(ReplaceOne({"_id": document["_id"]}, document, upsert=True))
        if len(operations) >= 500:
            target.bulk_write(operations, ordered=False)
            processed += len(operations)
            operations = []
    if operations:
        target.bulk_write(operations, ordered=False)
        processed += len(operations)
    result["processed"] = processed
    result["indexesCopied"] = copy_indexes(source, target)
    result["targetCountAfter"] = target.count_documents({})
    result["countVerified"] = result["targetCountAfter"] >= source_count
    return result


def migrate_crew_thread_attachments(*, dry_run: bool) -> dict:
    upload_root = Path(__file__).resolve().parents[1] / "uploads" / "crew_threads"
    target_messages = atlas_db["crew_thread_messages"]
    file_store = GridFS(atlas_db, collection="crew_thread_files")
    report = {"status": "dry-run" if dry_run else "migrated", "found": 0, "uploaded": 0, "missing": []}
    for source_message in local_db["crew_thread_messages"].find({"attachments.0": {"$exists": True}}):
        attachments = source_message.get("attachments") or []
        changed = False
        for attachment in attachments:
            relative_path = str(attachment.get("relativePath") or "")
            candidate = (upload_root / relative_path).resolve()
            if upload_root.resolve() not in candidate.parents or not candidate.is_file():
                report["missing"].append(relative_path)
                continue
            report["found"] += 1
            if dry_run:
                continue
            existing_id = attachment.get("gridFsId")
            if existing_id and file_store.exists(existing_id):
                continue
            existing = atlas_db["crew_thread_files.files"].find_one({
                "messageId": source_message["_id"],
                "attachmentId": attachment.get("id"),
                "sha256": attachment.get("sha256"),
            })
            gridfs_id = existing["_id"] if existing else file_store.put(
                candidate.read_bytes(),
                filename=attachment.get("name") or candidate.name,
                contentType=attachment.get("contentType") or "application/octet-stream",
                messageId=source_message["_id"],
                attachmentId=attachment.get("id"),
                sha256=attachment.get("sha256"),
            )
            attachment["gridFsId"] = gridfs_id
            report["uploaded"] += 0 if existing else 1
            changed = True
        if changed:
            target_messages.update_one({"_id": source_message["_id"]}, {"$set": {"attachments": attachments}})
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="Write to Atlas; otherwise perform a dry run")
    parser.add_argument("--skip-employee-sync", action="store_true", help="Do not create the sanitized employee-directory mirror")
    args = parser.parse_args()
    if atlas_client is None or atlas_db is None:
        raise SystemExit("CREW_ATLAS_MONGO_URI is not configured")

    local_client.admin.command("ping")
    atlas_client.admin.command("ping")
    dry_run = not args.execute
    report = {
        "mode": "dry-run" if dry_run else "execute",
        "targetDatabase": ATLAS_DATABASE_NAME,
        "startedAt": datetime.utcnow(),
        "collections": [],
    }
    for name in sorted(ATLAS_PRIMARY_COLLECTIONS):
        report["collections"].append(migrate_collection(name, dry_run=dry_run))
    report["crewThreadAttachments"] = migrate_crew_thread_attachments(dry_run=dry_run)
    if not args.skip_employee_sync:
        report["employeeDirectorySync"] = sync_employee_directory_to_atlas(dry_run=dry_run)
    report["completedAt"] = datetime.utcnow()
    print(json.dumps(report, default=json_default, indent=2))


if __name__ == "__main__":
    main()
