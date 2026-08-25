"""
Minimal auth store — real password hashing and real server-side sessions,
still backed by JSON files (matching this app's "JSON stands in for a
database" approach for Phase 1). Separate from data_loader.load() for the
same reason investigation_history.py is: that function's contract is
"immutable, cached at import time," and auth records are the opposite.

Accounts are created implicitly on first login, preserving the vanilla
app's frictionless "just type an email and you're in" demo UX — the real
change is that the SAME email now needs the SAME password on every
subsequent login (previously *anything* worked, every time), and the
session handed back is a real one: a random, server-issued, httpOnly
cookie token looked up against a server-side store, not a client-side
localStorage guess.
"""
import hashlib
import hmac
import json
import secrets
import threading
import time
from pathlib import Path
from typing import Any

from app.data_loader import DATA_DIR

USERS_PATH = DATA_DIR / "auth-users.json"
SESSIONS_PATH = DATA_DIR / "auth-sessions.json"
SESSION_COOKIE = "tiq_session"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 14  # 14 days — matches the "Keep me signed in" default-checked UI

_lock = threading.Lock()


def _read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _hash_password(password: str, salt: str) -> str:
    # Stdlib-only (no passlib/bcrypt dependency) — PBKDF2-HMAC-SHA256 with a
    # per-user salt and a cost high enough to be a real deterrent, low
    # enough not to make local dev logins noticeably slow.
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()


def _derive_name(email: str) -> str:
    # Ported from the frontend's former usePortalUserStore.signIn.
    local = email.split("@")[0]
    words = [w for w in local.replace(".", " ").replace("_", " ").split() if w]
    name = " ".join(w.capitalize() for w in words)
    return name or "Member"


def _initials(name: str) -> str:
    parts = name.split()[:2]
    letters = "".join(p[0].upper() for p in parts if p)
    return letters or "U"


def verify_or_create_user(email: str, password: str) -> tuple[dict[str, Any], bool]:
    """Returns (user_record, is_new_account). Raises ValueError with a
    user-facing message if the account exists and the password is wrong."""
    display_email = email.strip()
    key = display_email.lower()
    with _lock:
        users = _read_json(USERS_PATH)
        record = users.get(key)
        if record is not None:
            if not hmac.compare_digest(record["password_hash"], _hash_password(password, record["salt"])):
                raise ValueError("Incorrect password for this email.")
            return record, False

        salt = secrets.token_hex(16)
        name = _derive_name(display_email)
        record = {
            "email": display_email,
            "email_key": key,
            "name": name,
            "initials": _initials(name),
            "role": "Commercial Analyst",
            "salt": salt,
            "password_hash": _hash_password(password, salt),
            "created_at": int(time.time() * 1000),
        }
        users[key] = record
        _write_json(USERS_PATH, users)
        return record, True


def create_session(email_key: str) -> str:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    with _lock:
        sessions = _read_json(SESSIONS_PATH)
        sessions[token] = {"email_key": email_key, "created_at": now, "expires_at": now + SESSION_TTL_SECONDS}
        _write_json(SESSIONS_PATH, sessions)
    return token


def get_session_user(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    with _lock:
        sessions = _read_json(SESSIONS_PATH)
        session = sessions.get(token)
        if not session or session["expires_at"] < time.time():
            return None
        users = _read_json(USERS_PATH)
        return users.get(session["email_key"])


def destroy_session(token: str | None) -> None:
    if not token:
        return
    with _lock:
        sessions = _read_json(SESSIONS_PATH)
        if token in sessions:
            del sessions[token]
            _write_json(SESSIONS_PATH, sessions)
