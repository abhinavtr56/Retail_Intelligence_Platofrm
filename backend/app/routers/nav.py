from typing import Any

from fastapi import APIRouter

from app.data_loader import load

router = APIRouter(prefix="/api", tags=["nav"])


@router.get("/nav")
def get_nav() -> dict[str, Any]:
    return load("nav")


@router.get("/user")
def get_user() -> dict[str, Any]:
    return load("user")


@router.get("/focus")
def get_focus() -> dict[str, Any]:
    return load("focus")
