from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from app.auth_store import (
    SESSION_COOKIE,
    SESSION_TTL_SECONDS,
    create_session,
    destroy_session,
    get_session_user,
    verify_or_create_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_MAX_AGE = SESSION_TTL_SECONDS


def _public(record: dict[str, Any]) -> dict[str, Any]:
    """Never hand back salt/password_hash."""
    return {"name": record["name"], "initials": record["initials"], "email": record["email"], "role": record.get("role", "")}


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    user: dict[str, Any]
    isNewAccount: bool


@router.post("/login")
def login(body: LoginRequest, response: Response) -> LoginResponse:
    """Real login: same email always needs the same password from here on.
    First time an email is seen, the account is created on the spot
    (frictionless demo signup) — every time after that, the password is
    actually checked."""
    email = body.email.strip()
    if not email or not body.password:
        raise HTTPException(400, "Enter both an email and a password.")
    try:
        record, is_new = verify_or_create_user(email, body.password)
    except ValueError as e:
        raise HTTPException(401, str(e)) from e

    token = create_session(record["email_key"])
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
    )
    return LoginResponse(user=_public(record), isNewAccount=is_new)


@router.post("/logout")
def logout(request: Request, response: Response) -> dict[str, bool]:
    destroy_session(request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@router.get("/me")
def me(request: Request) -> dict[str, Any]:
    """Who the current session cookie belongs to. 401 (not a bare `null`)
    when signed out, so callers can't mistake "loading" for "logged out" —
    the frontend's useCurrentUser() treats this error as the signal to
    redirect to /login."""
    record = get_session_user(request.cookies.get(SESSION_COOKIE))
    if not record:
        raise HTTPException(401, "Not signed in")
    return _public(record)
