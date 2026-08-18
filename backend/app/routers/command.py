from typing import Any

from fastapi import APIRouter

from app.data_loader import load

router = APIRouter(prefix="/api", tags=["command"])


@router.get("/command")
def get_command() -> dict[str, Any]:
    return load("command")
