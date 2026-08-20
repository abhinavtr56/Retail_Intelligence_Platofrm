"""Shared FastAPI dependencies."""
from typing import Any

from fastapi import Depends, HTTPException, Request

from app.auth_store import SESSION_COOKIE, get_session_user


def current_user(request: Request) -> dict[str, Any]:
    """401s unless the request carries a valid session cookie. Use as a
    dependency on any route that owns or exposes per-user data."""
    record = get_session_user(request.cookies.get(SESSION_COOKIE))
    if not record:
        raise HTTPException(401, "Not signed in")
    return record


CurrentUser = Depends(current_user)
