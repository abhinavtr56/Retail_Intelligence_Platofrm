"""Reading the star-schema tables out of a Databricks Unity Catalog.

WHAT THIS IS. The third source for the same six tables, after the Excel upload
and Azure Blob Storage. A Databricks table is not a file, so the obvious reading
of "load the six files" does not apply — but the contract can still be honoured
exactly, because the SQL Statement Execution API will hand back a table AS CSV,
header row and all. That is the whole trick here: `export_table` produces the
same (filename, bytes) pair the other two connectors produce, and everything
downstream — `star_dataset.classify`, `validate`, `install` — is reused
untouched. The six-table rule lives in one place and gains a third caller.

IDENTIFICATION IS STILL BY COLUMNS, NOT BY NAME. A user's tables are called
`sales`, `store`, `date_2425` — nothing that says which star role they play, and
the same problem the Excel connector solved for `Book1.xlsx`. Unity Catalog
hands us the column list for free when browsing, so `columns_for` reads roles
straight off the catalog metadata with no query and no download at all. That is
what makes the "Check tables" step instant here, where the Azure connector had
to fetch 256 KB per blob.

TWO API SURFACES, DELIBERATELY.
  * Unity Catalog REST (`/api/2.1/unity-catalog/...`) for browsing catalogs,
    schemas and tables, and for the columns used to identify them. Cheap
    metadata calls, no compute involved, so a user can explore without a
    warehouse running at all.
  * SQL Statement Execution (`/api/2.0/sql/statements`) for the actual data,
    and ONLY at install time. This needs a running SQL warehouse and is the
    expensive half, so nothing calls it until the user has committed.

EXTERNAL_LINKS, NOT INLINE. A statement can return rows inline as JSON, but the
fact table is 205,920 rows / ~21 MB and the inline disposition caps out long
before that. EXTERNAL_LINKS instead returns pre-signed URLs to CSV chunks held
in cloud storage, which is both the only way to get the whole table and far
cheaper — the bytes never pass through the Databricks control plane or get
re-encoded as JSON. The chunks are concatenated with the header kept only from
the first, which is exactly a CSV file.

CREDENTIALS ARE NEVER PERSISTED. The workspace URL and PAT arrive on each
request and are dropped; nothing is written to disk or logged. `_redact` keeps
the token out of any error text, since a `dapi...` string in a log is a live
credential.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

#: Metadata calls are small; the SQL API needs long enough for a warehouse to
#: wake from auto-stop, which routinely takes 30-60s on a serverless endpoint.
META_TIMEOUT = 45.0
STATEMENT_TIMEOUT = 300.0
#: Downloading one CSV chunk from cloud storage. Chunks are ~20 MB.
CHUNK_TIMEOUT = 300.0

#: How long to keep polling a statement that comes back PENDING/RUNNING. The
#: API's own `wait_timeout` maxes out at 50s, so anything slower than that has
#: to be polled, and a cold serverless warehouse plus a 200k-row scan can
#: comfortably exceed one wait.
POLL_ATTEMPTS = 40
POLL_INTERVAL = 5.0

#: Unity Catalog schemas that hold platform metadata rather than user data.
#: Hidden from the browser: `information_schema` alone is 29 views of catalog
#: plumbing, which buries the handful of tables a user is actually looking for.
SYSTEM_SCHEMAS = frozenset({"information_schema"})


class DatabricksError(Exception):
    """Raised with a user-facing message when Databricks refuses or is unreachable."""


@dataclass(frozen=True)
class TableRef:
    """One table the user picked, fully qualified within the workspace."""

    catalog: str
    schema: str
    name: str

    @property
    def full_name(self) -> str:
        return f"{self.catalog}.{self.schema}.{self.name}"

    @property
    def quoted(self) -> str:
        """Backtick-quoted for SQL, so a name that collides with a keyword or
        carries a hyphen still parses. A literal backtick doubles."""
        parts = (self.catalog, self.schema, self.name)
        return ".".join("`" + p.replace("`", "``") + "`" for p in parts)

    @property
    def csv_name(self) -> str:
        """The filename the installer sees. Only its extension matters — it
        picks the CSV reader — but the stem shows up in error messages, so it
        names the source table rather than something anonymous."""
        return f"{self.name}.csv"


def _clean_workspace(url: str) -> str:
    """The workspace origin, from whatever the user pasted.

    Accepts a bare host, a full URL, or one with a path still attached (people
    copy the address bar, which carries /explore/data or similar).
    """
    text = (url or "").strip().rstrip("/")
    if not text:
        raise DatabricksError("Workspace URL is required.")
    if not text.startswith(("http://", "https://")):
        text = f"https://{text}"
    # Keep scheme + host only; a pasted deep link would otherwise become part
    # of every API path.
    parts = text.split("/", 3)
    return "/".join(parts[:3])


def _redact(text: str, token: str) -> str:
    """Keep the PAT out of anything shown to the user or logged."""
    out = re.sub(r"dapi[0-9a-fA-F]{16,}", "dapi***", text)
    if token:
        out = out.replace(token, "***")
    return out


def _headers(token: str) -> dict[str, str]:
    if not (token or "").strip():
        raise DatabricksError("Personal access token is required.")
    return {"Authorization": f"Bearer {token.strip()}", "Content-Type": "application/json"}


def _explain(status: int, body: Any, token: str) -> str:
    """Turn a Databricks error into something actionable.

    The 403/404 pair is worth special handling: Unity Catalog answers "not
    found" for objects the token merely cannot see, so a bare 404 sends the user
    hunting for a typo when the real problem is a missing GRANT.
    """
    message = ""
    if isinstance(body, dict):
        message = str(body.get("message") or body.get("error_code") or "")
    elif body:
        message = str(body)[:300]
    message = _redact(message.strip(), token)

    # A bad token comes back as 403, not 401, and only the message says so —
    # reporting every 403 as "valid but lacks permission" would confidently tell
    # a user with a mistyped token to go fix their grants instead.
    bad_token = "invalid access token" in message.lower() or "expired" in message.lower()
    if status == 401 or (status == 403 and bad_token):
        return (
            "Databricks rejected the token. It may be mistyped, expired, revoked, or "
            "belong to a different workspace than the URL entered."
        )
    if status == 403:
        base = "Databricks refused this request (403) — the token is valid but lacks permission."
        return f"{base} {message}" if message else base
    if status == 404:
        return (
            "Not found (404). In Unity Catalog this also means 'not visible to this "
            f"token', so check the object exists AND that the token has USE and SELECT on it. {message}"
        )
    return f"Databricks returned an error ({status})." + (f" {message}" if message else "")


async def _request(
    client: httpx.AsyncClient, method: str, url: str, token: str, *, json_body: Any = None
) -> Any:
    try:
        res = await client.request(method, url, headers=_headers(token), json=json_body)
    except httpx.RequestError as e:
        host = url.split("/")[2] if "//" in url else url
        raise DatabricksError(
            f"Couldn't reach {host} — check the workspace URL and this machine's "
            f"network access to it. Detail: {_redact(str(e), token)}"
        ) from e
    try:
        payload = res.json()
    except ValueError:
        payload = res.text
    if res.status_code >= 400:
        raise DatabricksError(_explain(res.status_code, payload, token))
    if not isinstance(payload, dict):
        raise DatabricksError(
            "Databricks didn't return JSON — the workspace URL is probably wrong "
            "(a sign-in page came back instead of the API)."
        )
    return payload


# ============================================================ browsing ========
async def list_catalogs(workspace: str, token: str) -> list[dict[str, Any]]:
    """Catalogs visible to the token — the picker's first screen."""
    base = _clean_workspace(workspace)
    async with httpx.AsyncClient(timeout=META_TIMEOUT, follow_redirects=True) as client:
        data = await _request(client, "GET", f"{base}/api/2.1/unity-catalog/catalogs", token)
    return [
        {"name": c.get("name", ""), "comment": c.get("comment") or ""}
        for c in (data.get("catalogs") or [])
        if c.get("name")
    ]


async def list_schemas(workspace: str, token: str, catalog: str) -> list[dict[str, Any]]:
    """Schemas in one catalog, minus the metadata ones nobody is looking for."""
    if not catalog:
        raise DatabricksError("catalog is required.")
    base = _clean_workspace(workspace)
    url = f"{base}/api/2.1/unity-catalog/schemas?catalog_name={quote(catalog, safe='')}"
    async with httpx.AsyncClient(timeout=META_TIMEOUT, follow_redirects=True) as client:
        data = await _request(client, "GET", url, token)
    return [
        {"name": s.get("name", ""), "comment": s.get("comment") or ""}
        for s in (data.get("schemas") or [])
        if s.get("name") and s.get("name") not in SYSTEM_SCHEMAS
    ]


async def list_tables(
    workspace: str, token: str, catalog: str, schema: str
) -> list[dict[str, Any]]:
    """Tables in one schema, WITH their column names.

    The columns come back on this same call, which is what lets the connector
    identify a table's star role with no query and no data transfer — the
    equivalent step in the Azure connector has to fetch 256 KB per blob.
    """
    if not catalog or not schema:
        raise DatabricksError("catalog and schema are required.")
    base = _clean_workspace(workspace)
    url = (
        f"{base}/api/2.1/unity-catalog/tables"
        f"?catalog_name={quote(catalog, safe='')}&schema_name={quote(schema, safe='')}"
    )
    async with httpx.AsyncClient(timeout=META_TIMEOUT, follow_redirects=True) as client:
        data = await _request(client, "GET", url, token)
    out: list[dict[str, Any]] = []
    for t in data.get("tables") or []:
        name = t.get("name")
        if not name:
            continue
        out.append(
            {
                "name": name,
                "table_type": t.get("table_type") or "",
                "comment": t.get("comment") or "",
                "columns": [c.get("name", "") for c in (t.get("columns") or []) if c.get("name")],
            }
        )
    return out


async def columns_for(
    workspace: str, token: str, tables: list[TableRef]
) -> list[tuple[TableRef, list[str]]]:
    """Column names for specific tables, fetched one at a time.

    Used by the inspect step, where the user has picked tables that may span
    several schemas and the listing that first showed them is long gone.
    """
    base = _clean_workspace(workspace)
    out: list[tuple[TableRef, list[str]]] = []
    async with httpx.AsyncClient(timeout=META_TIMEOUT, follow_redirects=True) as client:
        for ref in tables:
            url = f"{base}/api/2.1/unity-catalog/tables/{quote(ref.full_name, safe='')}"
            data = await _request(client, "GET", url, token)
            cols = [c.get("name", "") for c in (data.get("columns") or []) if c.get("name")]
            out.append((ref, cols))
    return out


# =========================================================== warehouses =======
async def list_warehouses(workspace: str, token: str) -> list[dict[str, Any]]:
    """SQL warehouses, needed to actually read data (not to browse)."""
    base = _clean_workspace(workspace)
    async with httpx.AsyncClient(timeout=META_TIMEOUT, follow_redirects=True) as client:
        data = await _request(client, "GET", f"{base}/api/2.0/sql/warehouses", token)
    return [
        {"id": w.get("id"), "name": w.get("name"), "state": w.get("state") or ""}
        for w in (data.get("warehouses") or [])
        if w.get("id")
    ]


async def pick_warehouse(workspace: str, token: str) -> str:
    """A warehouse id to run the export on, preferring one already awake.

    Chosen for the user rather than asked about: which warehouse serves the
    export makes no difference to the result, and a RUNNING one avoids a
    30-60 second cold start. Only if none is running does it fall back to the
    first available, which will auto-resume.
    """
    warehouses = await list_warehouses(workspace, token)
    if not warehouses:
        raise DatabricksError(
            "No SQL warehouse is visible to this token, and one is needed to read "
            "table data. Create or share a SQL warehouse, then try again."
        )
    for w in warehouses:
        if str(w.get("state", "")).upper() == "RUNNING":
            return str(w["id"])
    return str(warehouses[0]["id"])


# =============================================================== export =======
async def _statement(
    client: httpx.AsyncClient, base: str, token: str, warehouse_id: str, sql: str
) -> dict[str, Any]:
    """Run one statement and return the finished response, polling if needed."""
    payload = {
        "warehouse_id": warehouse_id,
        "statement": sql,
        "wait_timeout": "50s",
        # CSV chunks in cloud storage: the only disposition that can return a
        # 21 MB table, and the one that hands back bytes already in the shape
        # star_dataset expects.
        "disposition": "EXTERNAL_LINKS",
        "format": "CSV",
    }
    data = await _request(client, "POST", f"{base}/api/2.0/sql/statements", token, json_body=payload)

    statement_id = data.get("statement_id")
    for _ in range(POLL_ATTEMPTS):
        state = str(((data.get("status") or {}).get("state") or "")).upper()
        if state == "SUCCEEDED":
            return data
        if state in ("FAILED", "CANCELED", "CLOSED"):
            err = (data.get("status") or {}).get("error") or {}
            detail = _redact(str(err.get("message") or state), token)
            raise DatabricksError(f"The query failed on Databricks: {detail}")
        if not statement_id:
            raise DatabricksError(f"Databricks returned an unusable response (state {state or 'unknown'}).")
        # PENDING/RUNNING — a cold serverless warehouse is the usual reason.
        await asyncio.sleep(POLL_INTERVAL)
        data = await _request(
            client, "GET", f"{base}/api/2.0/sql/statements/{quote(statement_id, safe='')}", token
        )

    raise DatabricksError(
        "The query is still running after several minutes. The SQL warehouse may be "
        "starting up or overloaded — wait for it to be RUNNING and try again."
    )


async def _select_sql(
    client: httpx.AsyncClient, base: str, token: str, ref: TableRef
) -> str:
    """The SELECT to export this table with, dates rendered as DD-MM-YYYY.

    WHY THIS IS NOT `SELECT *`. `app/tpo/loader.py:_parse_date` reads every date
    in the star schema as DD-MM-YYYY, which is how the project's CSVs have
    always been written. A Databricks DATE column exports as ISO YYYY-MM-DD, so
    a straight `SELECT *` produces files the loader rejects with "day is out of
    range for month" — 2024 read as a day number.

    Formatting in SQL rather than rewriting the CSV afterwards keeps the fix
    where the mismatch is, costs nothing (the warehouse is already projecting
    every column), and avoids parsing 21 MB of text a second time just to
    rewrite one field. Only DATE/TIMESTAMP columns are touched; everything else
    passes through untouched, so a table with no dates yields plain `SELECT *`.
    """
    url = f"{base}/api/2.1/unity-catalog/tables/{quote(ref.full_name, safe='')}"
    data = await _request(client, "GET", url, token)

    projections: list[str] = []
    for column in data.get("columns") or []:
        name = column.get("name")
        if not name:
            continue
        quoted = "`" + name.replace("`", "``") + "`"
        kind = str(column.get("type_name") or "").upper()
        if kind in ("DATE", "TIMESTAMP", "TIMESTAMP_NTZ"):
            # date_format keeps the column name, so headers are unchanged and
            # star_dataset still identifies the table by exactly the same names.
            projections.append(f"date_format({quoted}, 'dd-MM-yyyy') AS {quoted}")
        else:
            projections.append(quoted)

    if not projections:
        return f"SELECT * FROM {ref.quoted}"
    return f"SELECT {', '.join(projections)} FROM {ref.quoted}"


async def export_table(workspace: str, token: str, warehouse_id: str, ref: TableRef) -> bytes:
    """One whole table, as CSV bytes with a single header row.

    The result arrives as N chunks, each its own CSV complete with a header.
    Concatenating them naively would leave a header line in the middle of the
    data, which the installer would then read as a row — so the header is kept
    from the first chunk only. Chunk order is by `chunk_index`, not by the order
    the links happen to appear in.
    """
    base = _clean_workspace(workspace)
    async with httpx.AsyncClient(timeout=STATEMENT_TIMEOUT, follow_redirects=True) as client:
        sql = await _select_sql(client, base, token, ref)
        data = await _statement(client, base, token, warehouse_id, sql)

        links = (data.get("result") or {}).get("external_links") or []
        if not links:
            raise DatabricksError(
                f"Databricks returned no data for {ref.full_name} — the table may be empty."
            )

        # Follow next_chunk_internal_link until every chunk is collected: the
        # first response carries only the first link for a multi-chunk result.
        collected: dict[int, str] = {}
        pending = list(links)
        statement_id = data.get("statement_id")
        while pending:
            link = pending.pop(0)
            index = int(link.get("chunk_index") or 0)
            url = link.get("external_link")
            if url:
                collected[index] = url
            nxt = link.get("next_chunk_internal_link")
            if nxt and statement_id:
                more = await _request(client, "GET", f"{base}{nxt}", token)
                pending.extend((more.get("external_links") or []))

        if not collected:
            raise DatabricksError(f"Databricks returned no downloadable data for {ref.full_name}.")

        parts: list[bytes] = []
        #: The header line as it appeared in chunk 0, used to recognise (and
        #: only then strip) a repeated header in any later chunk.
        header = b""
        # The pre-signed URLs are already authenticated; sending the PAT to
        # cloud storage would be both useless and a credential leak.
        async with httpx.AsyncClient(timeout=CHUNK_TIMEOUT, follow_redirects=True) as raw:
            for position, index in enumerate(sorted(collected)):
                try:
                    res = await raw.get(collected[index])
                except httpx.RequestError as e:
                    raise DatabricksError(
                        f"Couldn't download {ref.full_name} from cloud storage: "
                        f"{_redact(str(e), token)}"
                    ) from e
                if res.status_code >= 400:
                    raise DatabricksError(
                        f"Couldn't download {ref.full_name} from cloud storage "
                        f"(HTTP {res.status_code}). The download link may have expired — try again."
                    )
                body = res.content
                if position:
                    body = _drop_repeated_header(body, header)
                else:
                    header = body.split(b"\n", 1)[0].strip()
                parts.append(body)

    return b"".join(parts)


def _drop_repeated_header(chunk: bytes, header: bytes) -> bytes:
    """Strip a continuation chunk's header line, but ONLY if it has one.

    Databricks does not repeat the header in later chunks — chunk 0 carries it
    and the rest begin immediately with data. Stripping the first line
    unconditionally therefore deleted one real row per continuation chunk,
    which on the 205,920-row fact table showed up as an off-by-one that a row
    count catches and nothing else would: the file still parsed, every field
    still lined up, one sale had simply vanished.

    Comparing against the actual header keeps it correct either way, so a
    future API change that starts repeating it cannot reintroduce a duplicate
    header row into the middle of the data.
    """
    if not header:
        return chunk
    first, _, rest = chunk.partition(b"\n")
    return rest if first.strip() == header else chunk


async def export_all(
    workspace: str, token: str, warehouse_id: str, refs: list[TableRef]
) -> list[tuple[str, bytes]]:
    """Every selected table as (filename, csv_bytes), for `star_dataset.install`.

    Sequential: this is dominated by one ~21 MB table, so running six exports at
    once would multiply peak memory without meaningfully shortening the wait.
    """
    out: list[tuple[str, bytes]] = []
    for ref in refs:
        content = await export_table(workspace, token, warehouse_id, ref)
        if not content.strip():
            raise DatabricksError(f"{ref.full_name} came back empty.")
        out.append((ref.csv_name, content))
    return out
