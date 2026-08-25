"""Strategy and Scenario Comparison on the decision record.

Two sections were added so Decision Center can answer two questions it could
not: WHAT WOULD CHANGE (the levers, measured against selected against
recommended) and HOW DOES IT COMPARE (the scenarios side by side, with the
measured baseline beside them).

Both are ASSEMBLIES. Neither computes a KPI, a lever value, a delta or a
ranking; every figure is carried through from `/api/simulation/run` and
`/api/simulation/compare`, which produced it. So these tests are about four
properties, and none of them is arithmetic.

  1. VERBATIM. Each value equals the payload it came from.
  2. ADDITIVE. A record assembled WITHOUT the two new sources still assembles,
     still stores, still renders a briefing -- and each section says which
     source it is missing rather than showing a hole or a zero.
  3. NO INVENTED LEVER. Retailer Incentive, Inventory Allocation and Budget
     Allocation were three of the authored rows the old page showed. No dataset
     in this project backs any of them, and none may reappear.
  4. MEASURED IS NOT SIMULATED. The measured baseline and the simulated bands
     live in different fields, and no band is ever collapsed to a midpoint.

Run with:

    ../venv/Scripts/python.exe -m pytest tests/ -q
"""

from __future__ import annotations

import copy

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.tpo import decision, simulation

YEAR = 2025
SCOPE = {"year": YEAR, "channel": ["CH002"]}
OTHER_SCOPE = {"year": YEAR, "channel": ["CH001"]}
QUESTION = "Which approved treatment recovers the most incremental sales in Modern Trade?"

#: Levers the old static page showed and no dataset here supports.
INVENTED_LEVERS = ("retailer incentive", "inventory allocation", "budget allocation")


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


def _post(client, path, body, expect=200):
    r = client.post(path, json=body)
    assert r.status_code == expect, r.text
    return r.json()


@pytest.fixture(scope="session")
def journey(client):
    """One full pass through the workflow the page walks."""
    context = _post(
        client, "/api/simulation/context",
        {"filters": SCOPE, "question": QUESTION, "investigation_started": True,
         "investigation_type": "diagnostic"},
    )
    run = _post(client, "/api/simulation/run", {"filters": SCOPE})
    scenario_a = _post(
        client, "/api/simulation/simulate",
        {"filters": SCOPE, "scenario_id": "scenario-a", "discount_pct": 10},
    )
    scenario_b = _post(
        client, "/api/simulation/simulate",
        {"filters": SCOPE, "scenario_id": "scenario-b", "discount_pct": 15},
    )
    entries = [
        {"scenario_id": "current-plan", "name": "Current Plan",
         "measured": run["kpis"], "scope": run["scope"]["filters_applied"]},
        {"scenario_id": "scenario-a", "name": "Scenario A", "simulated": scenario_a},
        {"scenario_id": "scenario-b", "name": "Scenario B", "simulated": scenario_b},
    ]
    compare_request = {"filters": SCOPE, "entries": entries}
    comparison = _post(client, "/api/simulation/compare", compare_request)
    recommendation = _post(client, "/api/simulation/recommend", compare_request)
    risk = _post(
        client, "/api/simulation/risk",
        {"scenario": scenario_b, "recommendation": recommendation, "weekly_included": False},
    )
    return {
        "run": run, "comparison": comparison, "scenario_b": scenario_b,
        "recommendation": recommendation,
        "request": {
            "context": context, "simulation": scenario_b,
            "recommendation": recommendation, "risk": risk,
            "comparison": comparison, "baseline": run,
        },
    }


@pytest.fixture(scope="session")
def record(client, journey):
    return _post(client, "/api/decision/record", journey["request"])


@pytest.fixture(scope="session")
def lean_record(client, journey):
    """The same decision, assembled WITHOUT the comparison and the baseline."""
    body = {k: v for k, v in journey["request"].items()
            if k not in ("comparison", "baseline")}
    return _post(client, "/api/decision/record", body)


# --- strategy ----------------------------------------------------------------


def test_the_strategy_rows_are_the_levers_the_engine_records(record, journey):
    """Not a curated list. Whatever `/simulate` wrote is what appears."""
    engine_levers = set(journey["scenario_b"]["levers"])
    shown = {lever["key"] for lever in record["strategy"]["levers"]}
    assert shown == engine_levers
    assert shown <= set(simulation.LEVER_KEYS)


def test_no_lever_the_project_cannot_support_appears(record):
    """Three of the authored rows the old page showed. None may come back."""
    for lever in record["strategy"]["levers"]:
        label = str(lever["label"]).lower()
        for invented in INVENTED_LEVERS:
            assert invented not in label, f"{lever['label']} has no dataset behind it"


def test_the_selected_value_is_the_scenarios_own(record, journey):
    levers = journey["scenario_b"]["levers"]
    for row in record["strategy"]["levers"]:
        assert row["selected_value"] == levers[row["key"]]["value"], row["key"]
        assert row["modelled"] is bool(levers[row["key"]].get("modelled"))


def test_the_current_value_is_the_measured_one_with_its_derivation(record, journey):
    """MEASURED, and traceable. The current column is an observation from
    /simulation/run's current plan, carried whole -- value, display string and
    the derivation that produced it."""
    measured = {f["key"]: f for f in journey["run"]["current_plan"]["fields"]}
    for row in record["strategy"]["levers"]:
        observed = measured.get(row["key"])
        if observed is None:
            continue
        assert row["current_value"] == observed["value"], row["key"]
        assert row["current_display"] == observed["display_value"], row["key"]
        assert row["current_available"] is observed["available"], row["key"]
        if observed["available"]:
            assert row["current_derivation"] == observed["derivation"]
        else:
            # Never zero-filled: an unmeasurable lever keeps the engine's reason.
            assert row["current_value"] is None
            assert row["current_unavailable_reason"] == observed["unavailable_reason"]


def test_the_measured_depth_is_not_silently_replaced_by_the_selected_one(record):
    """The whole point of the column. The scope's blended depth and the
    scenario's approved treatment are different numbers and must stay so."""
    discount = next(r for r in record["strategy"]["levers"] if r["key"] == "discount_pct")
    assert discount["current_available"] is True
    assert discount["current_value"] != discount["selected_value"]


def test_only_the_discount_carries_a_recommended_value(record, journey):
    """The decision policy chooses a SCENARIO. The only lever a scenario varies
    is its treatment depth, so claiming a recommended duration or spend would
    invent a preference nothing expressed."""
    recommended_id = journey["recommendation"]["recommended_scenario_id"]
    entry = next(
        s for s in journey["comparison"]["scenarios"]
        if s["scenario_id"] == recommended_id
    )
    for row in record["strategy"]["levers"]:
        if row["key"] == "discount_pct":
            assert row["recommended_value"] == entry["discount_pct"]
            assert row["recommended_treatment"] == entry["treatment"]
        else:
            assert row["recommended_value"] is None
            assert "chooses a scenario" in row["recommended_unavailable_reason"]


def test_without_a_baseline_the_current_column_says_why(lean_record):
    """No stand-in, no zero, no borrowed figure from somewhere else."""
    strategy = lean_record["strategy"]
    assert strategy["baseline_available"] is False
    assert strategy["baseline_unavailable_reason"] == decision.NO_BASELINE_CARRIED
    for row in strategy["levers"]:
        assert row["current_available"] is False
        assert row["current_value"] is None
        assert row["current_unavailable_reason"] == decision.NO_BASELINE_CARRIED


# --- comparison --------------------------------------------------------------


def test_the_comparison_is_carried_through_untouched(record, journey):
    """Same metrics, same values, same exclusion reasons. Nothing re-run."""
    source, carried = journey["comparison"], record["comparison"]
    assert carried["available"] is True
    assert carried["status"] == source["comparison_status"]
    assert carried["metrics"] == source["metrics"]
    assert carried["economic_basis"] == source["economic_basis"]
    assert [s["scenario_id"] for s in carried["scenarios"]] == [
        s["scenario_id"] for s in source["scenarios"]
    ]


def test_exactly_one_scenario_is_marked_selected_and_it_is_this_one(record):
    selected = [s for s in record["comparison"]["scenarios"] if s["is_selected"]]
    assert len(selected) == 1
    assert selected[0]["scenario_id"] == record["scenario"]["scenario_id"]


def test_the_recommended_mark_follows_the_recommendation_and_not_the_selection(
    record, journey
):
    """Selecting a scenario the policy did not choose does not move the mark."""
    recommended_id = journey["recommendation"]["recommended_scenario_id"]
    marked = [s["scenario_id"] for s in record["comparison"]["scenarios"] if s["is_recommended"]]
    assert marked == ([recommended_id] if recommended_id else [])


def test_the_measured_baseline_survives_as_a_separate_field(record):
    """MEASURED IS NOT SIMULATED. The baseline is its own field on every metric;
    a renderer cannot mistake it for one of the simulated bands."""
    metrics = record["comparison"]["metrics"]
    assert metrics, "no metrics carried"
    assert any((m.get("baseline") or {}).get("available") for m in metrics)
    for metric in metrics:
        for entry in metric["scenarios"]:
            assert "low" in entry and "high" in entry
            assert "midpoint" not in entry and "average" not in entry


def test_a_comparison_from_another_scope_is_refused_rather_than_merged(client, journey):
    """It would put this scenario beside numbers that never described the same
    selection, and it would look authoritative."""
    body = copy.deepcopy(journey["request"])
    body["comparison"]["scope"] = OTHER_SCOPE
    detail = _post(client, "/api/decision/record", body, expect=422)["detail"]
    assert "scope" in detail.lower()


def test_a_comparison_the_selected_scenario_is_absent_from_is_refused(client, journey):
    body = copy.deepcopy(journey["request"])
    body["comparison"]["scenarios"] = [
        s for s in body["comparison"]["scenarios"] if s["scenario_id"] != "scenario-b"
    ]
    detail = _post(client, "/api/decision/record", body, expect=422)["detail"]
    assert "scenario-b" in detail


def test_a_baseline_from_another_scope_is_refused(client, journey):
    body = copy.deepcopy(journey["request"])
    body["baseline"]["scope"]["filters_applied"] = OTHER_SCOPE
    detail = _post(client, "/api/decision/record", body, expect=422)["detail"]
    assert "scope" in detail.lower()


def test_without_a_comparison_the_section_says_why(lean_record):
    """A section that cannot be filled states its reason. It does not render an
    empty grid, and it does not borrow another scope's scenarios."""
    assert lean_record["comparison"]["available"] is False
    assert lean_record["comparison"]["reason"] == decision.NO_COMPARISON_CARRIED
    assert "scenarios" not in lean_record["comparison"]


# --- the sections changed nothing around them --------------------------------


def test_the_impact_section_is_unchanged_by_the_new_sources(client, journey, record,
                                                            lean_record):
    """The two new inputs are additive. Adding them must not move a single KPI."""
    assert record["expected_impact"] == lean_record["expected_impact"]
    assert record["governance"] == lean_record["governance"]
    assert record["readiness"] == lean_record["readiness"]
    assert record["scope"] == lean_record["scope"]

    # ONE FIELD LEGITIMATELY DIFFERS, AND IT IS A LABEL.
    #
    # `recommended_scenario_name` is resolved FROM the comparison -- that is the
    # only payload carrying the name a person gave a scenario, because
    # /simulate is keyed by id and has no `name`. Without a comparison the
    # resolver falls back to the id, exactly as it must. Nothing numeric moves:
    # every other key in the section is asserted equal.
    business = {k: v for k, v in record["recommendation"].items()
                if k != "recommended_scenario_name"}
    lean_business = {k: v for k, v in lean_record["recommendation"].items()
                     if k != "recommended_scenario_name"}
    assert business == lean_business
    assert lean_record["recommendation"]["recommended_scenario_name"] ==         lean_record["recommendation"]["recommended_scenario_id"]


def test_the_record_still_persists_and_still_renders_a_briefing(client, record):
    """The store and the briefing both check a record's SECTIONS. Two more of
    them must not make a valid record unstorable or unrenderable."""
    assert record["decision_id"] is None
    assert record["status"] == "draft"
    assert record["meta"]["persisted"] is False

    saved = _post(client, "/api/store/decisions", {"record": record})
    assert saved["decision_id"].startswith("dec_")
    # Stored whole: the new sections are in the bytes that come back out.
    assert saved["record"]["strategy"] == record["strategy"]
    assert saved["record"]["comparison"] == record["comparison"]

    read_back = client.get(f"/api/store/decisions/{saved['decision_id']}")
    assert read_back.status_code == 200
    assert read_back.json()["record"] == record

    brief = _post(client, "/api/decision/briefing", {"record": read_back.json()["record"]})
    assert brief["html"]


def test_the_new_sources_are_named_in_the_provenance(record):
    """A reader must be able to see that a comparison and a baseline went in."""
    sources = record["provenance"]["assembled_from"]
    assert any("compare" in s for s in sources)
    assert any("run" in s for s in sources)


# --- the report reflects the real record -------------------------------------


def test_a_report_can_be_generated_from_a_stored_record_without_reassembling_it(
    client, record
):
    """A REOPENED DECISION EXPORTS ITS STORED BYTES. Re-assembling one from live
    payloads would republish a historical decision at today's numbers, which is
    exactly what the dataset fingerprint exists to prevent."""
    r = client.post("/api/reports", json={
        "module": "decision-center",
        "scope": SCOPE,
        "options": {"decision_record": record},
    })
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "ready"


def test_a_report_with_neither_a_record_nor_payloads_is_still_refused(client):
    """Never a blank-looking report. The reader is told what to do."""
    r = client.post("/api/reports", json={
        "module": "decision-center", "scope": SCOPE, "options": {},
    })
    assert r.status_code == 422
    assert "decision record" in str(r.json()["detail"]).lower()
