from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app import star_dataset
from app.dataset_store import DatasetError, delete_dataset, get_dataset, list_datasets, save_dataset
from app.deps import current_user
from app.star_dataset import StarDatasetError

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB per file
# The fact table alone is ~21 MB, and a replacement covering more channels or
# a longer period is legitimately bigger. It goes straight to disk rather than
# through pandas profiling, so it gets its own, larger ceiling.
MAX_STAR_UPLOAD_BYTES = 512 * 1024 * 1024  # 512 MB per star-schema file
#: Enough of a CSV to be certain of capturing its header row.
HEADER_PREVIEW_BYTES = 256 * 1024


@router.post("")
async def upload_datasets(
    files: list[UploadFile] = File(...),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Ingest one or more CSV/Excel files.

    Two destinations, decided per file by `star_dataset.classify`:

      * One of the six star-schema tables (fact_sales + the five dimensions) is
        written into the Data/ folder the TPO loader reads, REPLACING the
        previous copy, and the in-memory store is reloaded from it. This is
        what makes an upload change the actual dashboards — writing it into a
        per-upload folder instead, as this route used to, left every KPI in the
        platform answering from the old CSVs.
      * Anything else becomes a standalone dataset with a cached profile
        (schema + distributions) — that profile, not the raw rows, is what the
        investigation agents read.

    The star files are installed as one set so a partially-written schema can
    never be loaded: if the new set does not parse, all of them roll back.
    """
    if not files:
        raise HTTPException(400, "No files received.")

    star_items: list[star_dataset.Classified] = []
    saved: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for upload in files:
        name = upload.filename or "upload.csv"
        content = await upload.read()
        if not content:
            errors.append({"filename": name, "error": "File is empty."})
            continue

        classified = star_dataset.classify(name, content)
        if classified is not None:
            if len(content) > MAX_STAR_UPLOAD_BYTES:
                errors.append({"filename": name, "error": "File is larger than the 512 MB limit."})
                continue
            star_items.append(classified)
            continue

        if len(content) > MAX_UPLOAD_BYTES:
            errors.append({"filename": name, "error": "File is larger than the 50 MB limit."})
            continue
        try:
            saved.append(save_dataset(name, content, user["email_key"]))
        except DatasetError as e:
            errors.append({"filename": name, "error": str(e)})
        except Exception as e:  # unexpected parse/IO failure — still report per-file
            errors.append({"filename": name, "error": f"Couldn't process this file: {e}"})

    star_result: dict[str, Any] | None = None
    if star_items:
        try:
            star_result = star_dataset.install(star_items)
        except StarDatasetError as e:
            # ONE error for the set, not one per file. The failure ("two files
            # claim to be the fact table", "three tables still missing") is a
            # property of the upload as a whole, and repeating it against each
            # filename made the modal show the same sentence six times.
            errors.append({"filename": "Star schema upload", "error": str(e)})
        except Exception as e:
            errors.append({"filename": "Star schema upload", "error": f"Couldn't install these files: {e}"})

    if not saved and not (star_result and star_result["installed"]) and errors:
        raise HTTPException(400, "; ".join(f"{e['filename']}: {e['error']}" for e in errors))

    return {"datasets": saved, "errors": errors, "star": star_result}


@router.get("/star")
def star_status(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """Which of the six star-schema files the Data/ folder currently holds, so
    the Excel connector can show what it is actually reading from."""
    return star_dataset.current_status()


@router.post("/star/inspect")
async def inspect_star_upload(
    files: list[UploadFile] = File(...),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Identify a set of files by their headers WITHOUT installing anything.

    Only the header row of each file is read, so the upload screen can name
    which table each file is and what is still missing before the user commits
    to sending a 21 MB fact table that might only be refused. Same rules as the
    real install, so the preview cannot disagree with it.
    """
    uploads: list[tuple[str, bytes]] = []
    for upload in files:
        name = upload.filename or "upload.csv"
        if Path(name).suffix.lower() in (".xlsx", ".xls"):
            # A workbook is a zip: its central directory sits at the END, so a
            # prefix cannot be opened at all and the whole file is needed.
            uploads.append((name, await upload.read()))
        else:
            # CSV headers live in the first line, so a slice is enough and a
            # 21 MB fact table never has to be held in memory to preview it.
            uploads.append((name, await upload.read(HEADER_PREVIEW_BYTES)))
    return star_dataset.inspect(uploads)


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
