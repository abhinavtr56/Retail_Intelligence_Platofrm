"""The saved-decision label -- B12 cleanup.

`decisions.scenario_name` used to come from `record.scenario.name`, which is
B7's own fallback: the /simulate payload carries no name, so B7 lands on the
session id and the history list showed "scenario-b" instead of the name the
user actually typed. The store already holds that name.

A LABEL CHOICE AND NOTHING ELSE. No stored payload changes, no persistence
behaviour changes, and a decision saved without a linked scenario keeps B7's
fallback exactly as before.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store import db

SCOPE = {"year": 2025, "channel": ["CH002"]}
FRIENDLY = "Festive Push @ 15%"


@pytest.fixture(scope="module", autouse=True)
def store(tmp_path_factory):
    db.use_path(tmp_path_factory.mktemp("b12") / "b12.db")
    yield
    db.close()


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def _post(client, path, body):
    r = client.post(path, json=body)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def journey(client):
    context = _post(client, "/api/simulation/context",
                    {"filters": SCOPE, "question": "Does the deal recover its giveaway?",
                     "investigation_started": True, "investigation_type": "diagnostic"})
    run = _post(client, "/api/simulation/run", {"filters": SCOPE})
    fifteen = _post(client, "/api/simulation/simulate",
                    {"filters": SCOPE, "scenario_id": "scenario-b", "discount_pct": 15})
    entries = [
        {"scenario_id": "current-plan", "name": "Current Plan",
         "measured": run["kpis"], "scope": run["scope"]["filters_applied"]},
        {"scenario_id": "scenario-b", "name": "Scenario B", "simulated": fifteen},
    ]
    recommendation = _post(client, "/api/simulation/recommend",
                           {"filters": SCOPE, "entries": entries})
    risk = _post(client, "/api/simulation/risk",
                 {"scenario": fifteen, "recommendation": recommendation})
    record = _post(client, "/api/decision/record",
                   {"context": context, "simulation": fifteen,
                    "recommendation": recommendation, "risk": risk})
    return {"context": context, "simulation": fifteen, "record": record}


def test_the_stored_scenario_name_wins(client, journey):
    """The name the user typed, not the session id B7 fell back to."""
    scenario = _post(client, "/api/store/scenarios",
                     {"context": journey["context"], "simulation": journey["simulation"],
                      "name": FRIENDLY})
    # B7's own fallback is still the session id -- that contract is untouched.
    assert journey["record"]["scenario"]["name"] == "scenario-b"

    stored = _post(client, "/api/store/decisions",
                   {"record": journey["record"], "scenario_id": scenario["scenario_id"]})
    assert stored["scenario_name"] == FRIENDLY

    row = next(d for d in client.get("/api/store/decisions").json()["decisions"]
               if d["decision_id"] == stored["decision_id"])
    assert row["scenario_name"] == FRIENDLY


def test_an_unlinked_decision_keeps_b7s_fallback(client, journey):
    """Without a stored scenario there is no better name, and none is invented."""
    stored = _post(client, "/api/store/decisions", {"record": journey["record"]})
    assert stored["scenario_name"] == journey["record"]["scenario"]["name"]


def test_the_stored_record_is_untouched_by_the_label(client, journey):
    """The label lives on the envelope; the B7 payload is not rewritten."""
    scenario = _post(client, "/api/store/scenarios",
                     {"context": journey["context"], "simulation": journey["simulation"],
                      "name": FRIENDLY})
    stored = _post(client, "/api/store/decisions",
                   {"record": journey["record"], "scenario_id": scenario["scenario_id"]})

    assert stored["record"] == journey["record"]
    assert stored["record"]["scenario"]["name"] == "scenario-b"
    assert stored["record"]["decision_id"] is None
    assert stored["record"]["meta"]["persisted"] is False
    # …and it still exports, so B8 is unaffected.
    assert client.post("/api/decision/briefing",
                       json={"record": stored["record"]}).status_code == 200
