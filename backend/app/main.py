"""
TIQ backend — FastAPI.

Dev: the React app runs on Vite (:5173, or the next free port — see DEV.md)
and proxies /api/* here (:8100). Prod: this same process serves the built
frontend too (see the static mount at the bottom) — one process, one
deploy, no separate proxy. See DEV.md at the project root for exact run
commands and the full phase-by-phase migration notes.
"""
import logging
import threading
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.tpo.loader import DatasetNotLoaded

log = logging.getLogger(__name__)

app = FastAPI(title="TIQ API", version="0.1.0")


@app.on_event("startup")
def _warm_caches() -> None:
    """Parse the 205,920-row fact table and precompute the default Promotion
    Intelligence scope in the background.

    Without this the first user to open the page pays for the CSV load plus a
    full set of KPI-engine passes — about 20 seconds of blank screen. Warming
    on a daemon thread keeps startup itself instant and makes that first page
    load land on a populated cache instead.
    """

    def warm() -> None:
        try:
            from app.intelligence_engine import build_intelligence_facts
            from app.tpo.loader import DatasetNotLoaded, get_store

            try:
                store = get_store()
            except DatasetNotLoaded:
                # The expected state of a fresh checkout: Data/ ships empty and
                # is filled by uploading the six CSVs through the Excel
                # connector. There is nothing to warm and nothing is wrong, so
                # this must not print a traceback — the upload will warm the
                # caches itself when it reloads the store.
                log.info("No dataset in the data folder yet — upload the star-schema CSVs to populate it.")
                return
            log.info("Warmed fact store: %s rows", store.row_count)
            build_intelligence_facts({"year": 2025}, ("core",))
            log.info("Warmed Promotion Intelligence core facts (F25)")
        except Exception:  # a warmup failure must never stop the server booting
            log.exception("Cache warmup failed; first request will be slow instead")

    threading.Thread(target=warm, name="tiq-warmup", daemon=True).start()

# Vite dev server origins. Only exercised when something calls the API directly
# instead of through Vite's /api proxy (which makes requests same-origin already);
# harmless in prod, where the frontend is served by this same process (see below)
# and CORS isn't in play at all. Vite falls back to the next free port if 5173 is
# taken (this machine lands on 5175 — see DEV.md), so both are allow-listed.
# allow_credentials matters now that /api/auth/* sets a session cookie — without
# it, a browser would silently refuse to send/accept that cookie on a direct
# (non-proxied) cross-origin call.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:5175", "http://localhost:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "tiq-api"}


@app.exception_handler(DatasetNotLoaded)
def _no_dataset(request: Request, exc: DatasetNotLoaded) -> JSONResponse:
    """Answer every data-backed endpoint with a clean, explicit 'no data yet'.

    The data folder ships empty and is filled by uploading the six star-schema
    CSVs through the Excel connector. Until then the KPI routes have nothing to
    return, and without this handler each one raises a bare FileNotFoundError —
    a 500 with a stack trace, which reads as a broken server rather than an
    empty one and gives the frontend nothing to distinguish the two.

    503 rather than 200-with-empty-body so a caller cannot mistake "not loaded
    yet" for "loaded, and genuinely zero"; `dataset_missing` is the flag the UI
    keys on to show the upload prompt.
    """
    return JSONResponse(
        status_code=503,
        content={
            "detail": str(exc),
            "dataset_missing": True,
            "action": "Upload the six star-schema CSVs via the Excel / Shared Drives connector.",
        },
    )


# ---------------------------------------------------------------------------
# Domain routers
# ---------------------------------------------------------------------------
from app.routers import (  # noqa: E402
    auth,
    briefing,
    command,
    command_center,
    connectors,
    datasets,
    decision,
    decision_brief,
    intelligence,
    investigations,
    misc,
    nav,
    pages,
    promotion_calendar,
    reports,
    simulation,
    store,
)

for r in (nav, command, command_center, investigations, pages, misc, connectors,
          promotion_calendar, simulation, decision, decision_brief, briefing, store, reports,
          auth, datasets, intelligence):
    app.include_router(r.router)


# ---------------------------------------------------------------------------
# Prod static mount — serves frontend/dist (run `npm run build` in frontend/
# first). Guarded on the folder existing so `uvicorn app.main:app` still
# works during frontend-only development, before a build has ever been run.
# ---------------------------------------------------------------------------
_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
