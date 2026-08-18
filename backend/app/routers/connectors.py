"""Data-connector proxy routes — Databricks, SAP, Power BI, generic REST (NielsenIQ),
OpenAI. Ported from connector_proxy.py (the standalone stdlib-only local proxy the
portal used pre-migration) onto FastAPI/httpx.

Why this exists at all: Databricks' REST API and most SAP Gateway/OData services don't
send Access-Control-Allow-Origin headers, so a browser calling them directly gets
blocked by CORS regardless of how correct the credentials are (unlike Azure Blob
Storage, which supports CORS natively and so is never routed through here — see
lib/portalConnectors.ts on the frontend). Forwarding server-to-server, where CORS
doesn't apply, is the only fix. Since this now lives inside the same FastAPI process
that serves the frontend, the browser talks to one same-origin backend for everything
— no separate proxy process to start, no PROXY_BASE pointed at a different port.

Nothing here talks to Claude or any third party. Credentials submitted through the
portal's connector modals are forwarded straight to Databricks/SAP/Power BI/etc. and
back; nothing is persisted to disk or logged.
"""
from typing import Any, Literal

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/proxy", tags=["connectors"])

TIMEOUT = 45.0


class UpstreamError(Exception):
    """Raised for network-level failures reaching the upstream host (mirrors the
    original proxy's ConnectionError → HTTP 502 behavior)."""


async def http_json(
    client: httpx.AsyncClient, method: str, url: str, *, headers: dict[str, str] | None = None, json: Any = None
) -> tuple[int, Any]:
    """Make an outbound call and return (status, parsed_json_or_text) — same contract
    as connector_proxy.py's http_json()."""
    try:
        res = await client.request(method, url, headers=headers, json=json, timeout=TIMEOUT)
    except httpx.RequestError as e:
        host = url.split("/")[2] if "/" in url else url
        raise UpstreamError(
            f"Couldn't reach {host} — check the URL, and that this machine actually has "
            f"network access to it (VPN etc.). Detail: {e}"
        ) from e
    try:
        return res.status_code, res.json()
    except ValueError:
        return res.status_code, res.text


def upstream_error(data: Any) -> str:
    """Extract a human-readable message from an upstream error body — same heuristics
    as connector_proxy.py's _upstream_error()."""
    if isinstance(data, dict):
        err = data.get("error")
        if isinstance(err, dict):  # Microsoft-style {"error": {"code", "message"}}
            return err.get("message") or err.get("code") or str(data)[:300]
        text = data.get("message") or err or str(data)[:300]
        return str(text).strip() or "(server returned an error with no detail)"
    text = str(data).strip()
    return text[:300] if text else "(server returned an error with no detail — check the URL and credentials)"


def fail(status: int, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail=message)


# ================================================================ Databricks ======
class DatabricksWarehousesReq(BaseModel):
    workspace_url: str = ""
    token: str = ""


class DatabricksQueryReq(BaseModel):
    workspace_url: str = ""
    token: str = ""
    warehouse_id: str = ""
    statement: str = "SELECT 1"


def _databricks_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@router.post("/databricks/warehouses")
async def databricks_warehouses(req: DatabricksWarehousesReq) -> dict[str, Any]:
    workspace = req.workspace_url.rstrip("/")
    if not workspace or not req.token:
        raise fail(400, "workspace_url and token are required.")
    url = f"{workspace}/api/2.0/sql/warehouses"
    async with httpx.AsyncClient() as client:
        try:
            status, data = await http_json(client, "GET", url, headers=_databricks_headers(req.token))
        except UpstreamError as e:
            raise fail(502, str(e)) from e
    if status >= 400:
        raise fail(status, upstream_error(data))
    if not isinstance(data, dict):
        # Databricks' front door resolves almost any *.azuredatabricks.net /
        # *.cloud.databricks.com subdomain and, on bad auth/workspace, serves an HTML
        # sign-in page with a 200 instead of a clean 401/404 — catch that here instead
        # of silently reporting "0 warehouses".
        raise fail(502, "Databricks didn't return warehouse data — this usually means the workspace URL or token is wrong (got a login page back, not JSON).")
    warehouses = data.get("warehouses") or []
    return {"warehouses": [{"id": w.get("id"), "name": w.get("name"), "state": w.get("state")} for w in warehouses]}


@router.post("/databricks/query")
async def databricks_query(req: DatabricksQueryReq) -> dict[str, Any]:
    workspace = req.workspace_url.rstrip("/")
    if not workspace or not req.token or not req.warehouse_id:
        raise fail(400, "workspace_url, token and warehouse_id are required.")
    url = f"{workspace}/api/2.0/sql/statements"
    payload = {"warehouse_id": req.warehouse_id, "statement": req.statement, "wait_timeout": "30s"}
    async with httpx.AsyncClient() as client:
        try:
            status, data = await http_json(client, "POST", url, headers=_databricks_headers(req.token), json=payload)
        except UpstreamError as e:
            raise fail(502, str(e)) from e
    if status >= 400:
        raise fail(status, upstream_error(data))
    if not isinstance(data, dict):
        raise fail(502, "Databricks didn't return query data — this usually means the workspace URL or token is wrong (got a login page back, not JSON).")
    state = (data.get("status") or {}).get("state")
    if state in ("PENDING", "RUNNING"):
        raise fail(202, f"Query still {state.lower()} after 30s — simplify the query or try again.")
    if state != "SUCCEEDED":
        err = (data.get("status") or {}).get("error", {})
        raise fail(400, err.get("message") or f"Query state: {state}")
    cols = [c.get("name") for c in (((data.get("manifest") or {}).get("schema") or {}).get("columns") or [])]
    rows = (data.get("result") or {}).get("data_array") or []
    return {"columns": cols, "rows": rows[:50], "row_count": len(rows)}


# ==================================================================== SAP =========
class SapODataReq(BaseModel):
    base_url: str = ""
    username: str = ""
    password: str = ""
    path: str = ""


@router.post("/sap/odata")
async def sap_odata(req: SapODataReq) -> dict[str, Any]:
    import base64

    base_url = req.base_url.rstrip("/")
    if not base_url or not req.path:
        raise fail(400, "base_url and path (the OData entity set) are required.")
    path = req.path if req.path.startswith("/") else f"/{req.path}"
    sep = "&" if "?" in path else "?"
    url = f"{base_url}{path}{sep}$format=json"
    headers = {"Accept": "application/json"}
    if req.username:
        token = base64.b64encode(f"{req.username}:{req.password}".encode()).decode("ascii")
        headers["Authorization"] = f"Basic {token}"
    async with httpx.AsyncClient() as client:
        try:
            status, data = await http_json(client, "GET", url, headers=headers)
        except UpstreamError as e:
            raise fail(502, str(e)) from e
    if status >= 400:
        raise fail(status, upstream_error(data))
    if not isinstance(data, dict):
        raise fail(502, "SAP didn't return OData JSON — check the base URL and entity-set path are correct (got HTML back, likely a login or error page).")
    records: list[Any] = []
    d = data.get("d")
    if isinstance(d, dict) and "results" in d:
        records = d["results"]
    elif isinstance(d, list):
        records = d
    elif "value" in data:  # OData v4 shape
        records = data["value"]
    return {"records": records[:50], "record_count": len(records)}


# ================================================================= Power BI =======
# The sign-in itself (MSAL popup) happens in the browser — that's an interactive user
# step and has to be. Once we have an access token, the actual data calls are routed
# through here too, so it doesn't matter whether api.powerbi.com's CORS policy would
# have allowed a direct browser call or not.
class PowerBiWorkspacesReq(BaseModel):
    token: str = ""


class PowerBiReportsReq(BaseModel):
    token: str = ""
    workspace_id: str = ""


@router.post("/powerbi/workspaces")
async def powerbi_workspaces(req: PowerBiWorkspacesReq) -> dict[str, Any]:
    if not req.token:
        raise fail(400, "token is required (sign in first).")
    async with httpx.AsyncClient() as client:
        try:
            status, data = await http_json(
                client, "GET", "https://api.powerbi.com/v1.0/myorg/groups", headers={"Authorization": f"Bearer {req.token}"}
            )
        except UpstreamError as e:
            raise fail(502, str(e)) from e
    if status >= 400:
        raise fail(status, upstream_error(data))
    if not isinstance(data, dict):
        raise fail(502, "Power BI didn't return workspace data — the token may be invalid or expired.")
    groups = data.get("value") or []
    return {"workspaces": [{"id": g.get("id"), "name": g.get("name")} for g in groups]}


@router.post("/powerbi/reports")
async def powerbi_reports(req: PowerBiReportsReq) -> dict[str, Any]:
    if not req.token or not req.workspace_id:
        raise fail(400, "token and workspace_id are required.")
    url = f"https://api.powerbi.com/v1.0/myorg/groups/{req.workspace_id}/reports"
    async with httpx.AsyncClient() as client:
        try:
            status, data = await http_json(client, "GET", url, headers={"Authorization": f"Bearer {req.token}"})
        except UpstreamError as e:
            raise fail(502, str(e)) from e
    if status >= 400:
        raise fail(status, upstream_error(data))
    if not isinstance(data, dict):
        raise fail(502, "Power BI didn't return report data for this workspace.")
    reports = data.get("value") or []
    return {"reports": [{"id": r.get("id"), "name": r.get("name"), "webUrl": r.get("webUrl")} for r in reports]}


# ==================================================== Generic REST (NielsenIQ) ====
# No assumptions about the response shape — this is for APIs we don't have a known
# contract for. The caller supplies the endpoint, auth and path; this just forwards
# it and hands back whatever JSON comes back.
class GenericRestReq(BaseModel):
    base_url: str = ""
    path: str = ""
    auth_type: Literal["none", "basic", "bearer"] = "none"
    username: str = ""
    password: str = ""
    token: str = ""


@router.post("/generic/rest")
async def generic_rest(req: GenericRestReq) -> dict[str, Any]:
    import base64

    base_url = req.base_url.rstrip("/")
    if not base_url:
        raise fail(400, "base_url is required.")
    path = req.path
    if path and not path.startswith("/"):
        path = f"/{path}"
    url = f"{base_url}{path}"
    headers = {"Accept": "application/json"}
    if req.auth_type == "bearer" and req.token:
        headers["Authorization"] = f"Bearer {req.token}"
    elif req.auth_type == "basic" and req.username:
        tok = base64.b64encode(f"{req.username}:{req.password}".encode()).decode("ascii")
        headers["Authorization"] = f"Basic {tok}"
    async with httpx.AsyncClient() as client:
        try:
            status, data = await http_json(client, "GET", url, headers=headers)
        except UpstreamError as e:
            raise fail(502, str(e)) from e
    if status >= 400:
        raise fail(status, upstream_error(data))
    return {"data": data}


# ============================================== OpenAI (capability advisor chat) ==
class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class OpenAiChatReq(BaseModel):
    api_key: str = ""
    messages: list[ChatMessage] = []
    model: str = "gpt-4o-mini"


@router.post("/openai/chat")
async def openai_chat(req: OpenAiChatReq) -> dict[str, Any]:
    if not req.api_key or not req.messages:
        raise fail(400, "api_key and messages are required.")
    async with httpx.AsyncClient() as client:
        try:
            status, data = await http_json(
                client,
                "POST",
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {req.api_key}", "Content-Type": "application/json"},
                json={"model": req.model, "messages": [m.model_dump() for m in req.messages], "temperature": 0.4},
            )
        except UpstreamError as e:
            raise fail(502, str(e)) from e
    if status >= 400:
        raise fail(status, upstream_error(data))
    if not isinstance(data, dict):
        raise fail(502, "OpenAI didn't return a valid response.")
    choice = (data.get("choices") or [{}])[0]
    content = (choice.get("message") or {}).get("content", "")
    return {"reply": content}
