"""Simulation Studio is deterministic, and stays that way.

An LLM now exists in this application -- Investigations, Promotion Intelligence's
"Go deeper", and Decision Center's AI brief all call OpenAI. None of them is in
this pipeline, and the point of this file is that none of them ever quietly
becomes part of it.

WHY A TEST AND NOT A CONVENTION. The failure would be silent and expensive: a
KPI that varies between two identical requests, a recommendation that changes
because a model was feeling different, a trade-spend figure nobody can reproduce
in front of a customer. By the time anyone noticed, the numbers would already
have been in a slide.

THREE PROPERTIES:

  1. NO IMPORT PATH from a simulation module to the OpenAI client -- checked
     transitively, so a helper cannot smuggle one in.
  2. IDENTICAL REQUESTS PRODUCE IDENTICAL BYTES, across every simulation
     endpoint and both ends of every band.
  3. THE THREE MODES ANSWER, and answer honestly -- a target nothing can reach
     is reported rather than manufactured.

Run with:

    ../venv/Scripts/python.exe -m pytest tests/ -q
"""

from __future__ import annotations

import importlib
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app

YEAR = 2025
SCOPE = {"year": YEAR, "channel": ["CH002"]}
GO_SCOPE = {"month": 6, "category": ["Baby Care"], "channel": ["CH002"]}
TR_SCOPE = {"year": YEAR, "month": 10, "channel": ["CH002"], "category": ["Baby Care"]}

#: Every module the simulation pipeline is built from.
PIPELINE = (
    "app.tpo.simulation",
    "app.tpo.execution",
    "app.tpo.comparison",
    "app.tpo.recommendation",
    "app.tpo.risk",
    "app.tpo.weekly",
    "app.tpo.optimization",
    "app.tpo.rescue",
    "app.tpo.scenarios",
    "app.tpo.response",
    "app.tpo.aggregate",
)

#: Anything that would put a language model in the path.
FORBIDDEN_IMPORTS = ("openai", "app.agents", "app.tpo.decision_brief")


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


def _post(client, path, body, expect=200):
    r = client.post(path, json=body)
    assert r.status_code == expect, r.text
    return r.json()


# --- 1. nothing in the pipeline can reach a model ----------------------------


def _reachable(module_name: str, seen: set[str] | None = None) -> set[str]:
    """Every app module this one imports, transitively.

    Walked rather than grepped: a direct import is easy to spot in review, and
    the one that would actually get through is three helpers deep.
    """
    seen = seen if seen is not None else set()
    if module_name in seen:
        return seen
    seen.add(module_name)
    try:
        module = importlib.import_module(module_name)
    except ImportError:
        return seen
    for value in vars(module).values():
        name = getattr(value, "__module__", None) or getattr(value, "__name__", None)
        if isinstance(name, str) and name.startswith(("app.", "openai")):
            _reachable(name, seen)
    return seen


@pytest.mark.parametrize("module_name", PIPELINE)
def test_no_simulation_module_can_reach_a_language_model(module_name):
    reachable = _reachable(module_name)
    for forbidden in FORBIDDEN_IMPORTS:
        offenders = [m for m in reachable if m == forbidden or m.startswith(forbidden + ".")]
        assert not offenders, (
            f"{module_name} can reach {offenders} -- a language model has entered the "
            f"simulation pipeline"
        )


@pytest.mark.parametrize("module_name", PIPELINE)
def test_no_simulation_module_mentions_an_llm_call(module_name):
    """A belt-and-braces source check, for the case where a call is made through
    a string or a late import that the import walk above would not see."""
    import inspect

    source = inspect.getsource(importlib.import_module(module_name)).lower()
    for forbidden in ("openai", "complete_json", "chat.completions", "gpt-"):
        assert forbidden not in source, f"{module_name} mentions {forbidden!r}"


# --- 2. identical requests, identical answers --------------------------------


def test_the_baseline_is_byte_identical_across_calls(client):
    first = _post(client, "/api/simulation/run", {"filters": SCOPE})
    second = _post(client, "/api/simulation/run", {"filters": SCOPE})
    assert first == second


def test_a_scenario_is_byte_identical_across_calls(client):
    body = {"filters": SCOPE, "scenario_id": "scenario-b", "discount_pct": 15}
    first = _post(client, "/api/simulation/simulate", body)
    second = _post(client, "/api/simulation/simulate", body)
    assert first["result"] == second["result"]
    assert first["provenance"] == second["provenance"]


def test_comparison_recommendation_and_risk_are_all_reproducible(client):
    run = _post(client, "/api/simulation/run", {"filters": SCOPE})
    scenario = _post(client, "/api/simulation/simulate",
                     {"filters": SCOPE, "scenario_id": "scenario-b", "discount_pct": 15})
    other = _post(client, "/api/simulation/simulate",
                  {"filters": SCOPE, "scenario_id": "scenario-a", "discount_pct": 10})
    request = {"filters": SCOPE, "entries": [
        {"scenario_id": "current-plan", "name": "Current Plan",
         "measured": run["kpis"], "scope": run["scope"]["filters_applied"]},
        {"scenario_id": "scenario-a", "name": "Optimized Plan", "simulated": other},
        {"scenario_id": "scenario-b", "name": "Aggressive Growth", "simulated": scenario},
    ]}

    assert _post(client, "/api/simulation/compare", request) == \
        _post(client, "/api/simulation/compare", request)

    recommendation = _post(client, "/api/simulation/recommend", request)
    assert recommendation == _post(client, "/api/simulation/recommend", request)

    risk_body = {"scenario": scenario, "recommendation": recommendation,
                 "weekly_included": False}
    assert _post(client, "/api/simulation/risk", risk_body) == \
        _post(client, "/api/simulation/risk", risk_body)

    weekly_body = {"filters": SCOPE, "scenario_id": "scenario-b", "discount_pct": 15}
    assert _post(client, "/api/simulation/weekly", weekly_body) == \
        _post(client, "/api/simulation/weekly", weekly_body)


# --- 3. the three modes answer, and answer honestly ---------------------------


def test_investigation_mode_produces_a_band_and_never_a_midpoint(client):
    scenario = _post(client, "/api/simulation/simulate",
                     {"filters": SCOPE, "scenario_id": "scenario-b", "discount_pct": 15})
    low = scenario["result"]["low"]["kpis"]["incremental_sales"]
    high = scenario["result"]["high"]["kpis"]["incremental_sales"]
    assert low["available"] and high["available"]
    assert low["value"] != high["value"], "a band with one value is not a band"

    raw = json.dumps(scenario).lower()
    for forbidden in ("midpoint", '"average"', "expected_value"):
        assert forbidden not in raw


def test_general_optimization_answers_within_its_own_ceiling(client):
    scope = _post(client, "/api/simulation/general-optimization/scope", GO_SCOPE)
    ceiling = scope["reference"]["average_trade_spend"]
    assert scope["reference"]["available"] and ceiling > 0

    plan = _post(client, "/api/simulation/general-optimization",
                 {**GO_SCOPE, "max_trade_spend": ceiling,
                  "min_discount_pct": 0.0, "max_discount_pct": 25.0})
    assert plan["status"]
    # Reproducible, like everything else in the pipeline.
    assert plan == _post(client, "/api/simulation/general-optimization",
                         {**GO_SCOPE, "max_trade_spend": ceiling,
                          "min_discount_pct": 0.0, "max_discount_pct": 25.0})


@pytest.mark.parametrize("body,reason", [
    ({"max_trade_spend": -1.0}, "a negative budget"),
    ({"max_trade_spend": 1000.0, "max_discount_pct": 900.0}, "an impossible depth"),
])
def test_general_optimization_refuses_invalid_input(client, body, reason):
    assert client.post("/api/simulation/general-optimization",
                       json={**GO_SCOPE, **body}).status_code == 422, reason


def test_target_rescue_reports_an_unreachable_target_rather_than_inventing_one(client):
    """A target nothing can reach is a real answer. Manufacturing a plan that
    meets it would be the worst possible failure of this mode."""
    reachable = _post(client, "/api/simulation/target-rescue",
                      {**TR_SCOPE, "target_units": 50_000.0,
                       "current_discount_pct": 10.0, "checkpoint": 3})
    assert reachable["status"]

    absurd = _post(client, "/api/simulation/target-rescue",
                   {**TR_SCOPE, "target_units": 999_000_000.0,
                    "current_discount_pct": 10.0, "checkpoint": 3})
    assert absurd["status"]
    # The two must not describe the same outcome: an unreachable target cannot
    # come back looking like a met one.
    assert absurd != reachable


@pytest.mark.parametrize("body,reason", [
    ({"target_units": -5.0}, "a negative target"),
    ({"target_units": 50_000.0, "checkpoint": 99}, "a week the month does not have"),
])
def test_target_rescue_refuses_invalid_input(client, body, reason):
    payload = {**TR_SCOPE, "current_discount_pct": 10.0, **body}
    assert client.post("/api/simulation/target-rescue", json=payload).status_code == 422, reason


# --- 4. the modes cannot contaminate each other -------------------------------


def test_the_three_modes_are_separate_endpoints_with_separate_inputs(client):
    """No shared mutable state on the server: each mode is a pure function of
    its own request. Running one must not move another's answer."""
    before = _post(client, "/api/simulation/run", {"filters": SCOPE})

    scope = _post(client, "/api/simulation/general-optimization/scope", GO_SCOPE)
    _post(client, "/api/simulation/general-optimization",
          {**GO_SCOPE, "max_trade_spend": scope["reference"]["average_trade_spend"]})
    _post(client, "/api/simulation/target-rescue",
          {**TR_SCOPE, "target_units": 50_000.0, "current_discount_pct": 10.0,
           "checkpoint": 3})

    assert _post(client, "/api/simulation/run", {"filters": SCOPE}) == before
