from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.dataset_store import DatasetError, delete_dataset, get_dataset, list_datasets, save_dataset
from app.deps import current_user

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB per file


@router.post("")
async def upload_datasets(
    files: list[UploadFile] = File(...),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Ingest one or more CSV/Excel files. Each becomes a dataset with a
    cached profile (schema + distributions) — that profile, not the raw
    rows, is what the investigation agents read."""
    if not files:
        raise HTTPException(400, "No files received.")

    saved: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for upload in files:
        content = await upload.read()
        if len(content) > MAX_UPLOAD_BYTES:
            errors.append({"filename": upload.filename or "?", "error": "File is larger than the 50 MB limit."})
            continue
        if not content:
            errors.append({"filename": upload.filename or "?", "error": "File is empty."})
            continue
        try:
            saved.append(save_dataset(upload.filename or "upload.csv", content, user["email_key"]))
        except DatasetError as e:
            errors.append({"filename": upload.filename or "?", "error": str(e)})
        except Exception as e:  # unexpected parse/IO failure — still report per-file
            errors.append({"filename": upload.filename or "?", "error": f"Couldn't process this file: {e}"})

    if not saved and errors:
        raise HTTPException(400, "; ".join(f"{e['filename']}: {e['error']}" for e in errors))

    return {"datasets": saved, "errors": errors}


@router.get("")
def get_datasets(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    return list_datasets(owner=user["email_key"])


@router.get("/{dataset_id}")
def get_dataset_detail(dataset_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """Full profile for one dataset — schema, per-column stats, sample rows."""
    record = get_dataset(dataset_id)
    if not record or record.get("owner") != user["email_key"]:
        raise HTTPException(404, "Dataset not found.")
    return record


@router.delete("/{dataset_id}")
def remove_dataset(dataset_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, bool]:
    record = get_dataset(dataset_id)
    if not record or record.get("owner") != user["email_key"]:
        raise HTTPException(404, "Dataset not found.")
    return {"ok": delete_dataset(dataset_id)}
