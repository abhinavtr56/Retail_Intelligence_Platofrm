from typing import Any

from fastapi import APIRouter

from app.data_loader import load

router = APIRouter(prefix="/api", tags=["misc"])


@router.get("/calendar")
def get_calendar() -> dict[str, Any]:
    return load("calendar")


# GET /api/reports WAS HERE, and it served app/data/reports.json -- six authored
# rows ("Sanjay Kumar", "4.2 MB", "Just now") with no artifact behind any of
# them. It is removed rather than left dead beside the real one, for two reasons:
# a fake-data endpoint on the same path would SHADOW the Report Center's own
# listing (this router is registered first), and the Report Center's whole
# contract is that every row corresponds to a stored artifact. See
# app/routers/reports.py. `app/data/reports.json` is left on disk; nothing reads
# it.


@router.get("/connections")
def get_connections() -> list[dict[str, Any]]:
    return load("connections")


@router.get("/ai-watch")
def get_ai_watch() -> list[dict[str, Any]]:
    return load("ai-watch")


@router.get("/recommendations")
def get_recommendations() -> list[dict[str, Any]]:
    return load("recommendations")


@router.get("/settings")
def get_settings() -> dict[str, Any]:
    return load("settings")
