"""Validation for the risk and governance assessment -- B6.

Three claims to defend.

IT REPORTS EVIDENCE, NOT VERDICTS. Where the project has approved no boundary
-- a budget ceiling, a margin floor, a cannibalization limit -- the metric is
reported as a measurement with the gap named. A test asserts no such threshold
was smuggled in.

IT DOES NOT DECIDE. B4.3 chose a scenario; B6 carries that answer through
untouched and cannot change it. There is no risk score, no weighting, no
probability and no risk-adjusted winner.

IT DOES NOT RECOMPUTE. Every figure is read off results the simulation,
comparison and recommendation already produced, and asserting `/simulate` and
`/recommend` are byte-identical afterwards proves it.

Run with:

    ../venv/Scripts/python.exe -m pytest tests/ -q
"""

from __future__ import annotations

import copy
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.tpo import config, response
from app.tpo.risk import RISK_POLICY, UNDEFINED_THRESHOLDS, assess

YEAR = 2025
SCOPE = {"year": YEAR, "channel": ["CH002"]}
OFFER_SCOPE = {"year": YEAR, "channel": ["CH002"], "promotion": ["PBDU25"]}


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


def _simulate(client, discount_pct=20, scenario_id="scenario-c", filters=None):
    r = client.post(
        "/api/simulation/simulate",
        json={"filters": filters or SCOPE, "scenario_id": scenario_id, "discount_pct": discount_pct},
    )
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def clear_scenario(client):
    """PS001 at 20% -- 14.6pp of break-even headroom."""
    return _simulate(client, 20)


@pytest.fixture(scope="session")
def narrow_scenario(client):
    """PB001 at 25% -- the project's 0.4pp knife-edge."""
    return _simulate(client, 25, "pb001")


@pytest.fixture(scope="session")
def recommendation(client, clear_scenario):
    run = client.post("/api/simulation/run", json={"filters": SCOPE}).json()
    return client.post(
        "/api/simulation/recommend",
        json={
            "filters": SCOPE,
            "entries": [
                {"scenario_id": "current-plan", "name": "Current Plan",
                 "measured": run["kpis"], "scope": run["scope"]["filters_applied"]},
                {"scenario_id": "scenario-c", "name": "Scenario C", "simulated": clear_scenario},
            ],
        },
    ).json()


def _finding(assessment, finding_id):
    return next(f for f in assessment["findings"] if f["id"] == finding_id)


def _keys(node, acc=None):
    acc = acc if acc is not None else set()
    if isinstance(node, dict):
        for key, value in node.items():
            acc.add(str(key).lower())
            _keys(value, acc)
    elif isinstance(node, list):
        for item in node:
            _keys(item, acc)
    return acc


# --- 1-5: break-even and headroom -------------------------------------------


def test_a_clear_scenario(clear_scenario):
    """1, 4. PS001 clears break-even comfortably."""
    assessment = assess(clear_scenario)
    finding = _finding(assessment, "breakeven")
    assert finding["status"] == "clear"
    assert finding["severity"] == "low"
    assert finding["evidence"]["headroom_low_pp"] > RISK_POLICY.narrow_headroom_pp
    assert assessment["overall_status"] == "clear"


@pytest.mark.parametrize("offset", [-0.01, 0.0])
def test_uplift_at_or_below_breakeven_is_high_attention(clear_scenario, offset):
    """2, 3. At break-even is not clearing it."""
    scenario = copy.deepcopy(clear_scenario)
    scenario["uplift"]["low"] = scenario["breakeven_uplift"] + offset

    assessment = assess(scenario)
    finding = _finding(assessment, "breakeven")
    assert finding["status"] == "attention"
    assert finding["severity"] == "high"
    assert "does not clear" in finding["title"]
    assert assessment["overall_status"] == "attention"


def test_pb001_narrow_headroom_is_surfaced(narrow_scenario):
    """5. The project's own 0.4pp observation, preserved."""
    finding = _finding(assess(narrow_scenario), "breakeven")
    assert finding["title"] == "Near break-even at the low end"
    assert finding["status"] == "attention"
    assert finding["severity"] == "medium"
    assert finding["evidence"]["headroom_low_pp"] == pytest.approx(0.43, abs=0.02)
    assert "audit_roi_realism.py" in finding["source"]


def test_the_narrow_headroom_boundary_is_cited_not_invented():
    """The one boundary B6 uses comes from the project's own audit."""
    assert RISK_POLICY.narrow_headroom_pp == 2.0
    assert "audit_roi_realism.py" in RISK_POLICY.narrow_headroom_source
    assert "NO MARGIN" in RISK_POLICY.narrow_headroom_source


def test_a_clear_summary_still_names_medium_attention_findings(narrow_scenario):
    """The overall status is severity-gated, so `clear` can coexist with a
    medium attention finding. The summary must say so rather than claim there
    are none -- status and sentence agree with the same evidence."""
    assessment = assess(narrow_scenario)
    assert assessment["overall_status"] == "clear"
    assert any(f["status"] == "attention" for f in assessment["findings"])
    assert "warrant attention" in assessment["summary"]
    assert "No attention-level findings" not in assessment["summary"]


# --- 6-9: metrics with no approved boundary ---------------------------------


def test_cannibalization_available_is_reported_without_a_verdict(clear_scenario):
    """6. A value, and the stated absence of a limit."""
    finding = _finding(assess(clear_scenario), "cannibalization")
    assert finding["status"] == "clear"
    assert finding["severity"] == "unknown"
    assert finding["evidence"]["approved_limit"] is None
    assert "No approved maximum cannibalization is defined" in finding["reason"]


def test_cannibalization_unavailable_keeps_the_engines_reason(client):
    """7. Never zero-filled."""
    finding = _finding(assess(_simulate(client, 10, "x", OFFER_SCOPE)), "cannibalization")
    assert finding["status"] == "unknown"
    assert finding["severity"] == "unknown"
    assert finding["evidence"]["available"] is False
    assert "No comparable promotion event" in finding["evidence"]["unavailable_reason"]


def test_trade_spend_is_measured_but_not_judged(clear_scenario):
    """8."""
    finding = _finding(assess(clear_scenario), "trade_spend")
    assert finding["status"] == "clear"
    assert finding["evidence"]["approved_limit"] is None
    assert "No approved maximum Trade Spend is defined" in finding["reason"]
    assert "budget" in finding["recommended_action"].lower()


def test_margin_is_measured_but_not_judged(clear_scenario):
    """9."""
    finding = _finding(assess(clear_scenario), "margin")
    assert finding["status"] == "clear"
    assert finding["evidence"]["approved_limit"] is None
    assert "No approved minimum Margin is defined" in finding["reason"]


def test_no_business_threshold_is_invented(clear_scenario, narrow_scenario):
    """THE rule of this phase. Every governance gap is reported as absent, and
    no numeric limit appears anywhere in the payload."""
    for scenario in (clear_scenario, narrow_scenario):
        assessment = assess(scenario)
        gaps = {g["key"] for g in assessment["governance_gaps"]}
        assert gaps == {g.key for g in UNDEFINED_THRESHOLDS}
        for gap in assessment["governance_gaps"]:
            assert "No approved" in gap["statement"]
        for key in _keys(assessment):
            assert not any(
                w in key for w in ("max_spend", "min_margin", "ceiling_value", "limit_value")
            ), key


# --- 10-12: availability, scope, excluded rows ------------------------------


def test_a_missing_kpi_is_surfaced(clear_scenario):
    """10."""
    scenario = copy.deepcopy(clear_scenario)
    for end in ("low", "high"):
        scenario["result"][end]["kpis"]["pei"] = {
            "key": "pei", "value": None, "display_value": "—",
            "available": False, "unavailable_reason": "Nothing promoted.",
        }
    finding = _finding(assess(scenario), "required_kpis")
    assert finding["status"] == "attention"
    assert any(m["metric"] == "pei" for m in finding["evidence"]["unavailable"])


def test_excluded_rows_are_surfaced(clear_scenario):
    """11."""
    scenario = copy.deepcopy(clear_scenario)
    scenario["scope"]["excluded_rows"] = 12
    scenario["scope"]["excluded_reason"] = "Could not be re-based."

    finding = _finding(assess(scenario), "excluded_rows")
    assert finding["status"] == "attention"
    assert finding["severity"] == "medium"
    assert finding["evidence"]["excluded_rows"] == 12


def test_zero_excluded_rows_creates_no_finding(clear_scenario):
    """12. The panel is not padded."""
    assessment = assess(clear_scenario)
    assert clear_scenario["scope"]["excluded_rows"] == 0
    assert all(f["id"] != "excluded_rows" for f in assessment["findings"])


def test_scope_context_is_factual(clear_scenario):
    """18, 19. Counts, not a judgement -- no minimum sample size is asserted."""
    finding = _finding(assess(clear_scenario), "scope")
    assert finding["status"] == "clear"
    assert finding["evidence"]["minimum_scope_policy"] is None
    assert finding["evidence"]["promoted_row_count"] > 0
    flat = json.dumps(finding).lower()
    for phrase in ("statistically weak", "insufficient sample", "too small", "unreliable"):
        assert phrase not in flat


# --- 13-14: provenance and treatment ----------------------------------------


@pytest.mark.parametrize(
    "field,value",
    [("kpi_engine", "somewhere/else"), ("response_rule", "made up"),
     ("promotion_cost_rate", 0.5), ("treatment", None)],
)
def test_invalid_provenance_is_high_attention(clear_scenario, field, value):
    """13."""
    scenario = copy.deepcopy(clear_scenario)
    scenario["provenance"][field] = value

    assessment = assess(scenario)
    finding = _finding(assessment, "provenance")
    assert finding["status"] == "attention"
    assert finding["severity"] == "high"
    assert assessment["overall_status"] == "attention"
    assert "cannot be described as fully governed" in finding["impact"]


def test_valid_provenance_is_clear(clear_scenario):
    finding = _finding(assess(clear_scenario), "provenance")
    assert finding["status"] == "clear"
    assert finding["evidence"]["basis_matches"] is True
    assert finding["evidence"]["provenance"]["promotion_cost_rate"] == config.PROMOTION_COST_RATE


def test_an_unapproved_treatment_is_high_attention(clear_scenario):
    """14. Validated again here even though /simulate rejects it."""
    scenario = copy.deepcopy(clear_scenario)
    scenario["treatment"] = "PR999"

    assessment = assess(scenario)
    finding = _finding(assessment, "approved_treatment")
    assert finding["status"] == "attention"
    assert finding["severity"] == "high"
    assert assessment["overall_status"] == "attention"


def test_an_approved_treatment_is_clear(clear_scenario):
    finding = _finding(assess(clear_scenario), "approved_treatment")
    assert finding["status"] == "clear"
    assert finding["evidence"]["provenance"] == response.PROVENANCE


# --- 15-17: standing limitations --------------------------------------------


def test_unmodelled_levers_are_surfaced(clear_scenario):
    """15."""
    limitations = {l["id"]: l for l in assess(clear_scenario)["limitations"]}
    assert "not modelled" in limitations["unmodelled_duration"]["statement"].lower()
    assert "changing duration alone" in limitations["unmodelled_duration"]["implication"]
    assert "derived" in limitations["derived_spend"]["statement"].lower()


def test_the_weekly_limitation_appears_only_with_the_weekly_view(clear_scenario):
    """16."""
    without = {l["id"] for l in assess(clear_scenario)["limitations"]}
    assert "weekly_decomposition" not in without

    with_weekly = {l["id"]: l for l in assess(clear_scenario, weekly_included=True)["limitations"]}
    assert "not a forecast" in with_weekly["weekly_decomposition"]["statement"]


def test_the_range_limitation_is_stated(clear_scenario):
    """17."""
    limitation = next(
        l for l in assess(clear_scenario)["limitations"] if l["id"] == "range_interpretation"
    )
    assert "not a confidence interval" in limitation["statement"]
    assert "no expected value" in limitation["implication"]


# --- 20-21: recommendation independence -------------------------------------


def test_the_recommendation_is_carried_through_unchanged(clear_scenario, recommendation):
    """20, 21."""
    assessment = assess(clear_scenario, recommendation=recommendation)
    context = assessment["recommendation_context"]

    assert context["recommended_scenario_id"] == recommendation["recommended_scenario_id"]
    assert context["recommendation_policy_version"] == recommendation["policy"]["version"]
    assert context["is_recommended"] is True
    assert "does not change which scenario was recommended" in context["note"]


def test_an_attention_assessment_does_not_change_the_recommendation(clear_scenario, recommendation):
    """21. THE independence property: high-severity risk, same winner."""
    scenario = copy.deepcopy(clear_scenario)
    scenario["provenance"]["kpi_engine"] = "somewhere/else"

    assessment = assess(scenario, recommendation=recommendation)
    assert assessment["overall_status"] == "attention"
    assert assessment["recommendation_context"]["recommended_scenario_id"] == (
        recommendation["recommended_scenario_id"]
    )


def test_no_risk_adjusted_recommendation_is_produced(clear_scenario, recommendation):
    assessment = assess(clear_scenario, recommendation=recommendation)
    for key in _keys(assessment):
        assert not any(
            w in key for w in ("risk_adjusted", "risk_score", "winner", "rank")
        ), key


# --- 22-27: no score, no probability, no forecast ---------------------------


def test_no_score_weight_probability_or_confidence(clear_scenario, narrow_scenario):
    """22, 23, 24, 25."""
    for scenario in (clear_scenario, narrow_scenario):
        assessment = assess(scenario, weekly_included=True)
        for key in _keys(assessment):
            assert not any(
                w in key
                for w in ("score", "weight", "probability", "confidence", "likelihood")
            ), key


def test_no_forecast_or_midpoint_language(clear_scenario):
    """26, 27."""
    assessment = assess(clear_scenario, weekly_included=True)
    for key in _keys(assessment):
        assert not any(w in key for w in ("midpoint", "average", "forecast", "predicted")), key
    # The one mention of forecasting is the weekly limitation DENYING it.
    flat = json.dumps(assessment, ensure_ascii=False).lower()
    assert flat.count("forecast") == 1
    assert "not a forecast" in flat


def test_severity_is_only_ever_a_named_level(clear_scenario, narrow_scenario):
    for scenario in (clear_scenario, narrow_scenario):
        for finding in assess(scenario)["findings"]:
            assert finding["severity"] in {"low", "medium", "high", "unknown"}
            assert finding["status"] in {"clear", "attention", "unknown"}


# --- 28-33: determinism, provenance, wording --------------------------------


def test_repeated_execution_is_deterministic(clear_scenario, recommendation):
    """28."""
    results = [assess(clear_scenario, recommendation=recommendation) for _ in range(5)]
    assert all(r == results[0] for r in results)


def test_no_value_is_fabricated(clear_scenario, narrow_scenario):
    """29. Every finding carries its evidence and its source."""
    for scenario in (clear_scenario, narrow_scenario):
        for finding in assess(scenario)["findings"]:
            assert finding["title"] and finding["reason"] and finding["source"]
            assert isinstance(finding["evidence"], dict) and finding["evidence"]
            assert finding["impact"]


def test_provenance_is_complete(clear_scenario):
    """30."""
    provenance = assess(clear_scenario)["provenance"]
    assert provenance["assessed_by"] == "app/tpo/risk.RISK_POLICY"
    assert provenance["policy_version"] == RISK_POLICY.version
    assert provenance["scenario_provenance"] == clear_scenario["provenance"]
    assert "no threshold is invented" in provenance["method"]


def test_the_overall_status_rule_is_stated_and_followed(clear_scenario):
    """31."""
    assessment = assess(clear_scenario)
    assert assessment["overall_status_rule"] == RISK_POLICY.overall_status_rule
    assert "No score is computed" in assessment["overall_status_rule"]

    high = copy.deepcopy(clear_scenario)
    high["treatment"] = "NOPE"
    assert assess(high)["overall_status"] == "attention"

    unknown = copy.deepcopy(clear_scenario)
    unknown["breakeven_uplift"] = None
    unknown["provenance"]["kpi_engine"] = None
    assert assess(unknown)["overall_status"] == "attention"


def test_governance_gaps_are_always_reported(clear_scenario):
    """32."""
    gaps = assess(clear_scenario)["governance_gaps"]
    assert len(gaps) == len(UNDEFINED_THRESHOLDS)
    for gap in gaps:
        assert gap["label"] and gap["statement"]


def test_recommended_actions_are_governance_steps_not_scenario_changes(clear_scenario, narrow_scenario):
    """33. An action tells the user what to VERIFY, never which scenario to pick."""
    for scenario in (clear_scenario, narrow_scenario):
        for finding in assess(scenario)["findings"]:
            action = finding["recommended_action"]
            if action is None:
                continue
            lowered = action.lower()
            for word in ("choose", "instead", "switch to", "prefer", "pr00", "ps001", "pb001"):
                assert word not in lowered, f"action recommends a scenario: {action}"


# --- 34-35: nothing upstream moved ------------------------------------------


def test_the_simulate_and_recommend_results_are_untouched(client, clear_scenario, recommendation):
    """34, 35."""
    body = {"filters": SCOPE, "scenario_id": "scenario-c", "discount_pct": 20}
    before_sim = client.post("/api/simulation/simulate", json=body).json()

    client.post(
        "/api/simulation/risk",
        json={"scenario": clear_scenario, "recommendation": recommendation, "weekly_included": True},
    )

    assert client.post("/api/simulation/simulate", json=body).json() == before_sim
    run = client.post("/api/simulation/run", json={"filters": SCOPE}).json()
    after_rec = client.post(
        "/api/simulation/recommend",
        json={
            "filters": SCOPE,
            "entries": [
                {"scenario_id": "current-plan", "name": "Current Plan",
                 "measured": run["kpis"], "scope": run["scope"]["filters_applied"]},
                {"scenario_id": "scenario-c", "name": "Scenario C", "simulated": clear_scenario},
            ],
        },
    ).json()
    assert after_rec == recommendation


def test_the_risk_module_recomputes_nothing():
    """It reads results. No engine call, no simulation, no comparison.

    Checked as CALL SYNTAX, not as bare names: the module legitimately names
    `app/tpo/aggregate.calculate_kpis` in its provenance strings, so scanning
    for the identifier alone flags the citation rather than a call.
    """
    import inspect

    from app.tpo import risk

    source = inspect.getsource(risk)
    for call in ("calculate_kpis(", "rows_for(", "baseline_rows_for(",
                 "execution.synthesize(", "comparison.compare(",
                 "recommendation.recommend(", "TREATMENT_RULES"):
        assert call not in source, call
    # And it imports no row-level machinery at all.
    assert "from app.tpo.filters import" not in source
    assert "import aggregate" not in source


# --- the endpoint -----------------------------------------------------------


def test_the_endpoint_answers(client, clear_scenario, recommendation):
    r = client.post(
        "/api/simulation/risk",
        json={"scenario": clear_scenario, "recommendation": recommendation, "weekly_included": True},
    )
    assert r.status_code == 200
    payload = r.json()
    assert payload["overall_status"] in {"clear", "attention", "unknown"}
    assert payload["meta"]["phase"] == "B6"
    assert payload["recommendation_context"]["recommended_scenario_id"] == "scenario-c"


@pytest.mark.parametrize(
    "body",
    [
        {"scenario": {}},
        {"scenario": {"treatment": "PR002"}},
        {},
        {"scenario": {"scenario_id": "a"}, "unknown_field": 1},
    ],
)
def test_malformed_risk_requests_are_rejected(client, body):
    assert client.post("/api/simulation/risk", json=body).status_code == 422
