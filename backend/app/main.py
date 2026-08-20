"""
TIQ backend — FastAPI.

Dev: the React app runs on Vite (:5173, or the next free port — see DEV.md)
and proxies /api/* here (:8100). Prod: this same process serves the built
frontend too (see the static mount at the bottom) — one process, one
deploy, no separate proxy. See DEV.md at the project root for exact run
commands and the full phase-by-phase migration notes.
"""
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="TIQ API", version="0.1.0")

# Vite dev server origins. Only exercised when something calls the API directly
# instead of through Vite's /api proxy (which makes requests same-origin already);
# harmless in prod, where the frontend is served by this same process (see below)
# and CORS isn't in play at all. Vite falls back to the next free port if 5173 is
# taken (this machine lands on 5175 — see DEV.md), so both are allow-listed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:5175", "http://localhost:5175"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "tiq-api"}


# ---------------------------------------------------------------------------
# Domain routers
# ---------------------------------------------------------------------------
from app.routers import (  # noqa: E402
    command,
    command_center,
    connectors,
    investigations,
    misc,
    nav,
    pages,
    promotion_calendar,
    simulation,
)

for r in (nav, command, command_center, investigations, pages, misc, connectors, promotion_calendar, simulation):
    app.include_router(r.router)


# ---------------------------------------------------------------------------
# Prod static mount — serves frontend/dist (run `npm run build` in frontend/
# first). Guarded on the folder existing so `uvicorn app.main:app` still
# works during frontend-only development, before a build has ever been run.
# ---------------------------------------------------------------------------
_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
