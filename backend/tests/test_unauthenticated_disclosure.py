"""The unauthenticated surface, disclosed -- B11, and the auth that followed.

B11 was DEFERRED: at the time this project had no identity provider, and
authorization built on a self-asserted email would have been an enforcement
claim with nothing behind it. So nothing was guarded, and what was done instead
was disclosure -- the API docs and the README say plainly that the /api/store
routes are open, including the two that write.

REAL AUTHENTICATION NOW EXISTS for the session surface (app/auth_store.py,
app/routers/auth.py, app/deps.py): PBKDF2-SHA256 password hashing, constant-time
comparison, and an httpOnly session cookie. Per B11's own instruction --
"if authentication is ever implemented, these tests should be REPLACED by tests
of the real thing, not deleted" -- the assertion that NO auth existed has been
replaced by the assertions below that the real thing behaves correctly.

THE /api/store ROUTES ARE STILL UNGUARDED, so the disclosure tests still stand
and still pass. The failure they exist to prevent is a quiet one: the exposure
staying while the honest warning disappears -- or, now, the reverse, the
disclosure going stale because a guard was added and never documented.

Run with:

    ../venv/Scripts/python.exe -m pytest tests/ -q
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import store as store_router

#: The endpoints that change durable state. Every one is reachable by anyone.
WRITE_ENDPOINTS = (
    ("post", "/api/store/scenarios"),
    ("post", "/api/store/decisions"),
)

READ_ENDPOINTS = (
    ("get", "/api/store/scenarios/{scenario_id}"),
    ("get", "/api/store/decisions"),
    ("get", "/api/store/decisions/{decision_id}"),
)


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def openapi(client):
    return client.get("/openapi.json").json()


def test_every_store_endpoint_declares_that_it_is_unauthenticated(openapi):
    """A reader of the API docs cannot miss it."""
    for verb, path in WRITE_ENDPOINTS + READ_ENDPOINTS:
        operation = openapi["paths"][path][verb]
        assert "UNAUTHENTICATED" in operation["description"], (verb, path)
        assert "unauthenticated" in operation["summary"].lower(), (verb, path)


def test_the_write_endpoints_are_named_as_writes(openapi):
    """"Unauthenticated read" and "unauthenticated write" are different risks."""
    for verb, path in WRITE_ENDPOINTS:
        assert "write" in openapi["paths"][path][verb]["summary"].lower(), path


def test_the_disclosure_says_records_are_unattributed(openapi):
    description = openapi["paths"]["/api/store/scenarios"]["post"]["description"]
    assert "owner: null" in description
    assert "not attributed" in description


def test_the_module_states_the_deployment_boundary():
    """Where this is safe, and where it is not, in the file that owns the routes."""
    source = Path(store_router.__file__).read_text(encoding="utf-8")
    assert "B11 was DEFERRED" in source
    assert "NOT safe" in source
    assert "localhost" in source


def test_the_readme_warns_before_anyone_hosts_this():
    readme = Path(__file__).resolve().parents[2] / "README.md"
    text = readme.read_text(encoding="utf-8")
    assert "Deployment safety" in text
    assert "Every API route is unauthenticated" in text
    assert "/api/store/scenarios" in text and "/api/store/decisions" in text
    assert "owner: null" in text


# --- nothing fake crept in ----------------------------------------------------


def test_authentication_rejects_an_anonymous_caller():
    """The real thing, asserted where B11 used to assert its absence.

    /auth/me is the session surface. Without a cookie it must be a 401 -- not a
    bare null, and not a default persona -- because the frontend reads that
    error as "signed out" and redirects to /login.
    """
    from app.main import app as fresh_app

    with TestClient(fresh_app) as anonymous:
        response = anonymous.get("/api/auth/me")
    assert response.status_code == 401, response.text


def test_passwords_are_hashed_with_a_salt_and_compared_in_constant_time():
    """Asserted on the source, so a later refactor cannot quietly downgrade it
    to a plain hash, a bare == comparison, or a stored plaintext password."""
    source = (Path("app") / "auth_store.py").read_text(encoding="utf-8")
    assert "pbkdf2_hmac" in source
    assert "hmac.compare_digest" in source
    assert "secrets.token" in source
    # The password itself is never persisted -- only its derivation.
    assert '"password"' not in source


def test_the_store_routes_are_still_open_so_the_disclosure_stays_true():
    """The disclosure above is only honest while it matches reality.

    Auth exists now, so the new quiet failure is the opposite of B11's: a guard
    lands on /api/store, the README keeps saying the routes are open, and a
    reader trusts a warning that no longer describes the system. These endpoints
    must therefore answer an anonymous caller with anything EXCEPT 401.
    """
    from app.main import app as fresh_app

    with TestClient(fresh_app) as anonymous:
        for _, path in WRITE_ENDPOINTS:
            assert anonymous.post(path, json={}).status_code != 401, path
        assert anonymous.get("/api/store/decisions").status_code != 401


def test_requirements_gained_no_auth_dependency():
    requirements = (Path(__file__).resolve().parents[1] / "requirements.txt").read_text(
        encoding="utf-8"
    ).lower()
    for package in ("jose", "pyjwt", "authlib", "msal", "passlib", "bcrypt",
                    "itsdangerous", "fastapi-users"):
        assert package not in requirements, package


def test_no_route_accepts_an_identity(client):
    """The write endpoints still refuse an owner, an author or a user.

    The point of B11 was to avoid inventing identity. Sending one must stay a
    422 rather than quietly becoming attribution.
    """
    for _, path in WRITE_ENDPOINTS:
        for field in ("owner", "author", "user", "user_id", "created_by",
                      "email", "actor"):
            response = client.post(path, json={field: "sanjay.k@company.com"})
            assert response.status_code == 422, (path, field)


def test_the_store_still_reports_unverified_ownership(client):
    """B10's honest messaging is intact -- B11 changed no persistence behaviour."""
    listing = client.get("/api/store/decisions").json()
    assert listing["owner"] is None if "owner" in listing else True
    assert "unverified" in listing["owner_note"].lower()
    assert "no authentication" in listing["owner_note"].lower()
    for entry in listing["decisions"]:
        assert entry["owner"] is None


def test_no_persona_appears_in_any_store_response(client):
    flat = json.dumps(client.get("/api/store/decisions").json(), ensure_ascii=False).lower()
    for persona in ("sanjay", "commercial analyst", "@company.com"):
        assert persona not in flat, persona
