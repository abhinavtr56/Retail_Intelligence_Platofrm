"""The unauthenticated surface, disclosed -- B11 (deferred).

B11 was DEFERRED: this project has no identity provider, and authorization
built on a self-asserted email would be an enforcement claim with nothing behind
it. So nothing was guarded. What WAS done is disclosure -- the API docs and the
README say plainly that every route is open, including the two that write.

THESE TESTS PIN THE DISCLOSURE, NOT A PERMISSION MODEL. They assert that the
warning is present and that no fake identity crept in behind it. They do not
assert that anything is protected, because nothing is.

The failure they exist to prevent is a quiet one: someone adds a guard, or a
future reader assumes there is one, and the honest warning disappears while the
exposure stays. If authentication is ever implemented, these tests should be
REPLACED by tests of the real thing -- not deleted.

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


def test_no_authentication_was_added(openapi):
    """B11 built no auth. This asserts the absence, so a later 'small helper'
    cannot quietly become a login."""
    assert "securitySchemes" not in openapi.get("components", {})
    assert not any("security" in operation
                   for path in openapi["paths"].values()
                   for operation in path.values()
                   if isinstance(operation, dict))

    # Matched on WORD BOUNDARIES, not substrings: "concentration" contains
    # "entra" and "central" does too, and B6's weekly_concentration gap would
    # otherwise read as an identity provider.
    import re

    for name in ("jwt", "jwks", "oauth", "oidc", "msal", "entra", "bearer_token",
                 "session_cookie", "get_current_user", "authenticate"):
        pattern = re.compile(rf"\b{name}\b", re.I)
        found = [
            path for path in Path("app").rglob("*.py")
            # connectors.py holds THIRD-PARTY credentials the user supplies for
            # Databricks/Power BI. They authenticate to those services, never
            # to this application.
            if "connectors" not in path.name
            and pattern.search(path.read_text(encoding="utf-8"))
            and "UNAUTHENTICATED" not in path.read_text(encoding="utf-8")
        ]
        assert not found, (name, [str(p) for p in found])


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
