from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app import azure_blob, star_dataset
from app.azure_blob import AzureError, BlobRef, ContainerScopedSas
from app.dataset_store import delete_dataset, get_dataset, list_datasets
from app.deps import current_user
from app.star_dataset import StarDatasetError

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

# The fact table alone is ~21 MB, and a replacement covering more channels or
# a longer period is legitimately bigger. It goes straight to disk rather than
# through pandas profiling, so it can afford a generous ceiling.
MAX_STAR_UPLOAD_BYTES = 512 * 1024 * 1024  # 512 MB per star-schema file
#: Enough of a CSV to be certain of capturing its header row.
HEADER_PREVIEW_BYTES = 256 * 1024


@router.post("")
async def upload_datasets(
    files: list[UploadFile] = File(...),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Ingest the six star-schema tables, and only those.

    Each file is matched to one of the six roles by `star_dataset.classify`,
    which reads COLUMN HEADERS — filenames are never consulted, since an Excel
    export called `Book1.xlsx` says nothing about which table it holds. The set
    is written into the Data/ folder the TPO loader reads and the in-memory
    store is reloaded from it, which is what makes an upload actually change the
    dashboards.

    Exactly six files, one per table. A file matching none of them is rejected
    by name rather than profiled elsewhere, and the whole route is refused once
    a complete set is installed — the user resets first. Both rules exist for
    the same reason the install is atomic: a star schema is only consistent as a
    set, so every path that could leave a mixed one is closed.
    """
    if not files:
        raise HTTPException(400, "No files received.")

    # Uploading replaces the whole schema, so it is only allowed from the empty
    # state. Checked up front rather than after reading the bodies — refusing a
    # 21 MB fact table only once it has been streamed to the server is a slow
    # way to say no.
    if star_dataset.is_locked():
        raise HTTPException(
            409,
            "A complete dataset is already loaded. Use Reset to clear all 6 files "
            "before uploading a new set.",
        )

    star_items: list[star_dataset.Classified] = []
    saved: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    unrecognised: list[str] = []

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

        # Not one of the six. This used to be profiled as a standalone dataset
        # for the investigation agents; it is now refused, because the connector
        # accepts the six standard tables and nothing else — a stray file here is
        # a wrong-file-picked slip, and profiling it quietly hid that behind a
        # success message.
        unrecognised.append(name)

    star_result: dict[str, Any] | None = None
    if star_items or unrecognised:
        try:
            star_result = star_dataset.install(star_items, unrecognised)
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


@router.delete("/star")
def reset_star(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """Clear all six star-schema files from the Data/ folder.

    This is the only way back to the upload prompt once a dataset is installed:
    uploading over a complete set is refused (see `upload_datasets`), so a reset
    is the explicit, deliberate discard that precedes loading a new dataset.
    Destructive and not recoverable — there is no backup by design, since a
    half-old/half-new star schema is exactly the silently-wrong state the
    installer exists to prevent.
    """
    try:
        return star_dataset.reset()
    except StarDatasetError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/star/preview/{role}")
def preview_star_file(
    role: str,
    limit: int = star_dataset.PREVIEW_LIMIT,
    offset: int = 0,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """A window of rows from one installed table, for the connector's View button.

    Paged rather than whole-file: the fact table is ~21 MB / 205,920 rows, and
    serialising that to JSON to fill a preview panel would cost orders of
    magnitude more than the user is asking to see.
    """
    try:
        return star_dataset.preview(role, limit=limit, offset=offset)
    except StarDatasetError as e:
        raise HTTPException(404, str(e)) from e


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


# ======================================================== Azure Blob Storage ====
# The same six-table contract as the Excel upload above, reached from a storage
# account instead of a file dialog. Everything about WHAT is acceptable — header
# identification, all-six-or-nothing, the lock, the reset — is star_dataset's and
# is not restated here; these routes only get the bytes out of Azure.
#
# Credentials arrive per request and are never stored. See app/azure_blob.py.
class AzureCredsReq(BaseModel):
    account: str = ""
    sas: str = ""


class AzureListBlobsReq(AzureCredsReq):
    container: str = ""
    #: Virtual-folder path within the container, "" for its root.
    prefix: str = ""


class AzureBlobSel(BaseModel):
    container: str
    name: str


class AzureSelectionReq(AzureCredsReq):
    blobs: list[AzureBlobSel] = []


def _refs(req: AzureSelectionReq) -> list[BlobRef]:
    if not req.blobs:
        raise HTTPException(400, "Select the 6 files to load.")
    return [BlobRef(container=b.container, name=b.name) for b in req.blobs]


@router.post("/azure/containers")
async def azure_containers(
    req: AzureCredsReq, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    """List the containers a SAS token can see — the picker's first screen.

    A container-scoped token is answered with an empty list and
    `container_scoped: true` rather than an error: being handed a SAS for one
    container is normal (often it is the only kind a user can get), and the
    picker's response is to ask for the container name, not to report a
    failure. The token's own parameters say so, so this costs no round trip.
    """
    try:
        containers = await azure_blob.list_containers(req.account, req.sas)
    except ContainerScopedSas:
        return {"containers": [], "container_scoped": True}
    except AzureError as e:
        raise HTTPException(400, str(e)) from e
    return {"containers": containers, "container_scoped": False}


@router.post("/azure/blobs")
async def azure_blobs(
    req: AzureListBlobsReq, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    """One level of a container: its subfolders and the CSV/Excel blobs in it."""
    if not req.container:
        raise HTTPException(400, "container is required.")
    try:
        return await azure_blob.list_blobs(req.account, req.sas, req.container, req.prefix)
    except AzureError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/azure/inspect")
async def azure_inspect(
    req: AzureSelectionReq, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    """Identify the selected blobs by their headers, WITHOUT installing.

    Only a 256 KB range of each blob is fetched, so telling the user which table
    each file is — and what is still missing — never downloads the 21 MB fact
    table. Same rules as the install, so the two cannot disagree.
    """
    try:
        uploads = await azure_blob.inspect_blobs(req.account, req.sas, _refs(req))
    except AzureError as e:
        raise HTTPException(400, str(e)) from e
    return star_dataset.inspect(uploads)


@router.post("/azure/install")
async def azure_install(
    req: AzureSelectionReq, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    """Download the selected blobs and install them as the star schema.

    Refused while a complete set is already loaded, exactly as the Excel upload
    is: the user resets first. Checked before anything is downloaded, so a
    locked account doesn't pay for 21 MB of transfer to be told no.
    """
    if star_dataset.is_locked():
        raise HTTPException(
            409,
            "A complete dataset is already loaded. Use Reset to clear all 6 files "
            "before loading a new set.",
        )
    refs = _refs(req)
    try:
        downloaded = await azure_blob.fetch_all(req.account, req.sas, refs)
    except AzureError as e:
        raise HTTPException(400, str(e)) from e

    items: list[star_dataset.Classified] = []
    unrecognised: list[str] = []
    for name, content in downloaded:
        classified = star_dataset.classify(name, content)
        if classified is None:
            unrecognised.append(name)
        else:
            items.append(classified)

    try:
        return star_dataset.install(items, unrecognised)
    except StarDatasetError as e:
        raise HTTPException(400, str(e)) from e


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
