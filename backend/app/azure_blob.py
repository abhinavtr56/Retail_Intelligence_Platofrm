"""Reading the star-schema CSVs out of an Azure Blob Storage account.

WHY THIS IS SERVER-SIDE. The Excel connector's files arrive as a multipart
upload; these arrive as blob names, and the bytes have to be fetched from
somewhere. Doing that in the browser would mean pulling ~21 MB down from Azure
and immediately pushing the same 21 MB back up to this backend, and it would
only work at all with CORS configured on the storage account for this exact
origin — a setting most accounts do not have and many users cannot change.
Fetching server-to-server skips both problems: CORS does not apply outside a
browser, and the bytes travel Azure -> backend -> disk once.

The browse endpoints (containers, blobs) are also proxied here rather than left
to the browser's existing direct calls, so that a user who cannot enable CORS
still gets a working picker. `lib/portalConnectors.ts` keeps its direct-fetch
helpers for the standalone Azure browsing modal; this module is what the
dataset connector uses.

CREDENTIALS ARE NEVER PERSISTED. The account name and SAS token arrive on each
request, are used to build the URL for that request, and are dropped. Nothing
is written to disk or logged — a SAS token is a bearer credential, and the log
is the last place it should turn up. `_redact` scrubs it out of Azure's own
error bodies before they are shown to the user, since the failing URL that
Azure echoes back contains the signature.

INSTALLING IS THE EXCEL CONNECTOR'S INSTALL. Identification by column headers,
the all-six-or-nothing rule, the lock once complete, and the reset that clears
it are all `star_dataset`'s, unchanged. This module's only job is turning blob
names into (filename, bytes) pairs; every rule about what those bytes have to
be lives in one place, so the two connectors cannot drift apart.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote
from xml.etree import ElementTree

import httpx

#: Azure returns 5,000 blobs per page by default. The picker is for finding six
#: known files, not for browsing a data lake, so one page is plenty — the
#: response says whether more exist and the UI tells the user to use a prefix.
LIST_TIMEOUT = 30.0
#: The fact table is ~21 MB and a bigger replacement is legitimate. Generous,
#: because this is a server-to-server transfer with no browser in the middle.
DOWNLOAD_TIMEOUT = 300.0
#: Enough of a CSV to be sure of catching the header row, requested as an HTTP
#: Range so identifying six files does not download 21 MB of them.
HEADER_RANGE_BYTES = 256 * 1024


class AzureError(Exception):
    """Raised with a user-facing message when Azure cannot be reached or refuses."""


@dataclass(frozen=True)
class BlobRef:
    """One blob the user picked, addressed within the account."""

    container: str
    name: str


def _clean_sas(sas: str) -> str:
    """A SAS token, with or without its leading '?', as query-string text."""
    return sas.strip().lstrip("?")


def _redact(text: str, sas: str) -> str:
    """Remove the SAS signature from anything shown to the user or logged.

    Azure's error bodies quote the request URI, which carries the token. The
    `sig=` parameter is the secret part, so it is masked wherever it appears —
    including in a token the caller passed, which may be echoed verbatim.
    """
    out = re.sub(r"sig=[^&\s\"'<]+", "sig=***", text)
    token = _clean_sas(sas)
    if token:
        out = out.replace(token, "***")
    return out


def _account_host(account: str) -> str:
    name = account.strip().strip("/")
    if not name:
        raise AzureError("Storage account name is required.")
    # Accept either the bare name or a full endpoint pasted from the portal.
    if "." in name:
        return name.split("/")[0]
    return f"{name}.blob.core.windows.net"


def _url(account: str, sas: str, path: str = "", query: str = "") -> str:
    host = _account_host(account)
    token = _clean_sas(sas)
    if not token:
        raise AzureError("SAS token is required.")
    joined = f"{query}&{token}" if query else token
    return f"https://{host}/{path}?{joined}"


def _explain(status: int, body: str, sas: str) -> str:
    """Turn an Azure error response into something a user can act on.

    Azure's own <Message> is usually accurate but assumes you know the REST API,
    so the common causes get a plainer sentence. AuthenticationFailed in
    particular is almost always one of three fixable things.
    """
    code = ""
    try:
        root = ElementTree.fromstring(body)
        code = (root.findtext("Code") or "").strip()
        message = (root.findtext("Message") or "").strip().split("\n")[0]
    except ElementTree.ParseError:
        # Azure echoes the failing URI inside <Message>, and an unescaped '&'
        # from the SAS token makes the body invalid XML — exactly the case where
        # a useful <Code> is present. Recover it by hand rather than falling
        # through to the generic status-code text.
        match = re.search(r"<Code>([^<]+)</Code>", body)
        code = match.group(1).strip() if match else ""
        message = body.strip()[:300]

    hints = {
        "AuthenticationFailed": (
            "Azure rejected the SAS token. Check it has not expired, that it "
            "includes Read and List permission, and that it was copied whole "
            "(everything after the '?')."
        ),
        "AuthorizationPermissionMismatch": (
            "The SAS token is valid but lacks permission for this operation — "
            "it needs Read and List on blobs and containers."
        ),
        "ResourceNotFound": "No such container or blob in this storage account.",
        "ContainerNotFound": "That container does not exist in this storage account.",
        "BlobNotFound": "That file no longer exists in the container.",
        "InvalidQueryParameterValue": (
            "Azure did not accept part of the SAS token — it may be truncated, "
            "or built for a different service than Blob storage."
        ),
        "AccountIsDisabled": "This storage account is disabled.",
        "InsufficientAccountPermissions": (
            "The SAS token does not grant access at the level this needs — when "
            "creating it, tick both the Container and Object resource types."
        ),
    }
    if code in hints:
        return hints[code]
    if status == 403:
        return (
            "Azure refused the request (403). The SAS token is usually expired, "
            "missing Read/List permission, or restricted to a different IP."
        )
    if status == 404:
        return "Not found (404) — check the storage account name and container."
    detail = _redact(message, sas) if message else f"HTTP {status}"
    return f"Azure refused the request: {detail}"


async def _get(
    client: httpx.AsyncClient, url: str, sas: str, *, headers: dict[str, str] | None = None
) -> httpx.Response:
    try:
        res = await client.get(url, headers=headers)
    except httpx.RequestError as e:
        raise AzureError(
            "Couldn't reach Azure — check the storage account name and this "
            f"machine's network access. Detail: {_redact(str(e), sas)}"
        ) from e
    if res.status_code >= 400:
        raise AzureError(_explain(res.status_code, res.text, sas))
    return res


# Azure's list APIs are unnamespaced XML, so plain tag names work.
def _text(node: Any, tag: str, default: str = "") -> str:
    found = node.findtext(tag)
    return found if found is not None else default


async def list_containers(account: str, sas: str) -> list[dict[str, Any]]:
    """Every container the token can see. The first step of the picker."""
    url = _url(account, sas, "", "comp=list")
    async with httpx.AsyncClient(timeout=LIST_TIMEOUT, follow_redirects=True) as client:
        res = await _get(client, url, sas)
    try:
        root = ElementTree.fromstring(res.text)
    except ElementTree.ParseError as e:
        raise AzureError(
            "Azure returned something that isn't a container listing — check the "
            "storage account name is right."
        ) from e
    return [
        {"name": _text(el, "Name", "(unnamed)")}
        for el in root.findall("./Containers/Container")
    ]


async def list_blobs(
    account: str, sas: str, container: str, prefix: str = ""
) -> dict[str, Any]:
    """One level of a container: the CSV/Excel blobs in it, and its subfolders.

    Uses delimiter=/ so a container holding thousands of blobs comes back as a
    handful of folders rather than one enormous flat list — blob names contain
    '/' and Azure has no real directories, but this is what makes them navigable
    the way the user expects.

    Only files the star installer could actually accept are returned; a
    container full of parquet and JSON would otherwise bury the six CSVs.
    """
    query = "restype=container&comp=list&delimiter=%2F&maxresults=5000"
    if prefix:
        query += f"&prefix={quote(prefix, safe='')}"
    url = _url(account, sas, quote(container.strip("/"), safe=""), query)
    async with httpx.AsyncClient(timeout=LIST_TIMEOUT, follow_redirects=True) as client:
        res = await _get(client, url, sas)
    try:
        root = ElementTree.fromstring(res.text)
    except ElementTree.ParseError as e:
        raise AzureError("Azure returned an unreadable blob listing for this container.") from e

    folders = [
        _text(el, "Name")
        for el in root.findall("./Blobs/BlobPrefix")
        if _text(el, "Name")
    ]

    files: list[dict[str, Any]] = []
    for el in root.findall("./Blobs/Blob"):
        name = _text(el, "Name")
        if not name or not name.lower().endswith((".csv", ".xlsx", ".xls")):
            continue
        props = el.find("Properties")
        size = 0
        modified = ""
        if props is not None:
            try:
                size = int(_text(props, "Content-Length", "0") or 0)
            except ValueError:
                size = 0
            modified = _text(props, "Last-Modified")
        files.append(
            {
                "name": name,
                # What to show in the list — the part below the current folder.
                "display_name": name[len(prefix):] if prefix and name.startswith(prefix) else name,
                "size_bytes": size,
                "modified": modified,
            }
        )

    return {
        "container": container,
        "prefix": prefix,
        "folders": folders,
        "files": files,
        # NextMarker present means the listing was cut short; the picker says so
        # rather than pretending the container holds only what is shown.
        "truncated": bool(_text(root, "NextMarker")),
    }


def _blob_path(blob: BlobRef) -> str:
    """container/blob, percent-encoded but keeping '/' as the path separator —
    blob names routinely carry spaces, '#' and '+', which would otherwise be
    read as URL syntax rather than as part of the name."""
    return f"{quote(blob.container.strip('/'), safe='')}/{quote(blob.name, safe='/')}"


async def fetch_header(
    client: httpx.AsyncClient, account: str, sas: str, blob: BlobRef
) -> bytes:
    """The first chunk of a blob, for header identification.

    A ranged GET, so deciding which table a 21 MB fact table is costs 256 KB.
    Azure answers a Range request with 206 and the slice; a blob smaller than
    the range comes back whole, which is equally fine.

    An .xlsx is a zip whose central directory sits at the END of the file, so a
    prefix cannot be parsed — those are fetched whole, and are small enough in
    practice (a dimension table) for that to be reasonable.
    """
    url = _url(account, sas, _blob_path(blob))
    headers = None
    if not blob.name.lower().endswith((".xlsx", ".xls")):
        headers = {"Range": f"bytes=0-{HEADER_RANGE_BYTES - 1}"}
    res = await _get(client, url, sas, headers=headers)
    return res.content


async def fetch_blob(client: httpx.AsyncClient, account: str, sas: str, blob: BlobRef) -> bytes:
    """A whole blob. Used once identification has already succeeded."""
    url = _url(account, sas, _blob_path(blob))
    res = await _get(client, url, sas)
    return res.content


async def fetch_all(
    account: str, sas: str, blobs: list[BlobRef]
) -> list[tuple[str, bytes]]:
    """Download every selected blob, as (filename, bytes) for the installer.

    Sequential rather than concurrent: this is ~21 MB dominated by one large
    file, so parallelism would buy little while multiplying peak memory by six.
    """
    out: list[tuple[str, bytes]] = []
    async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT, follow_redirects=True) as client:
        for blob in blobs:
            content = await fetch_blob(client, account, sas, blob)
            if not content:
                raise AzureError(f"'{blob.name}' is empty in Azure.")
            # The installer keys off the extension to pick a reader, and writes
            # under its own canonical name, so the leaf name is all it needs.
            out.append((blob.name.rsplit("/", 1)[-1], content))
    return out


async def inspect_blobs(
    account: str, sas: str, blobs: list[BlobRef]
) -> list[tuple[str, bytes]]:
    """Header-sized reads of the selected blobs, for the pre-flight check."""
    out: list[tuple[str, bytes]] = []
    async with httpx.AsyncClient(timeout=LIST_TIMEOUT, follow_redirects=True) as client:
        for blob in blobs:
            content = await fetch_header(client, account, sas, blob)
            out.append((blob.name.rsplit("/", 1)[-1], content))
    return out
