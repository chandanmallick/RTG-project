from fastapi import HTTPException, UploadFile


def ensure_upload_allowed(
    file: UploadFile,
    *,
    allowed_content_types: set[str],
    allowed_extensions: set[str],
    max_bytes: int,
) -> bytes:
    filename = file.filename or ""
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Unsupported file extension")

    if file.content_type not in allowed_content_types:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    content = file.file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail="Uploaded file is too large")

    return content

