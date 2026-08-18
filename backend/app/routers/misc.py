from typing import Any

from fastapi import APIRouter

from app.data_loader import load

router = APIRouter(prefix="/api", tags=["misc"])


@router.get("/calendar")
def get_calendar() -> dict[str, Any]:
    return load("calendar")


@router.get("/reports")
def get_reports() -> list[dict[str, Any]]:
    return load("reports")


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
