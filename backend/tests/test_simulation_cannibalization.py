"""The Simulation Studio's cannibalization figure -- scope resolution.

WHAT WENT WRONG. Cannibalization is measured over a row set that has to carry
two things the plain selection does not: the promoted SKU's Brand Form
neighbours, and the NON-PROMOTED rows every baseline is derived from. The
second one used to be resolved only when the first was -- `family_rows` was
built when a Product filter existed and left empty otherwise -- so a scope
naming a promotion and nothing else fell back to the selection, which under an
Offer filter holds no non-promoted row at all. `_sku_baselines` then found no
baseline for any SKU and every candidate event was excluded with "promoted SKU
has no non-promoted row in this selection". That is the Simulation Studio's
normal scope, so the studio could never show a rate.

WHAT THESE TESTS GUARD. That the studio reads the ONE validated implementation
(`aggregate.cannibalization_detail`) over a row set resolved with BOTH
widenings, that the widening stays inside the Brand Form, that a genuine
absence of evidence still reports null rather than zero, and that no scenario
fabricates a cannibalization response to a discount.

Nothing here reimplements the metric. Every expected value comes from the
engine or from `service.kpis`.

Run with:

    ../venv/Scripts/python.exe -m pytest tests/ -q
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.tpo import aggregate as A
from app.tpo import execution, response, service
from app.tpo.filters import FilterState, baseline_rows_for, rows_for

YEAR = 2025

#: The scope shape the studio actually opens with: one promotion, no Product
#: filter. This is precisely the shape that used to return "—".
OFFER_SCOPE = {"year": YEAR, "promotion": ["PR003"]}

#: A Product-filtered scope, which is what makes the Brand-Form widening bite.
PRODUCT_SCOPE = {"year": YEAR, "product": ["P11-250ml"]}

#: Evidence genuinely absent: one SKU in one channel whose Brand Form siblings
#: did not trade there in the promoted week, so no adjacent pack exists to
#: measure a loss against. Distinct from the starved scope above -- this one
#: stays null however wide the row set is made, and must never become 0%.
NO_EVIDENCE_SCOPE = {
    "year": YEAR, "promotion": ["PBDU25"], "product": ["P13-240ct"], "channel": ["CH003"],
}


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


def _run(client, filters):
    r = client.post("/api/simulation/run", json={"filters": filters})
    assert r.status_code == 200, r.text
    return r.json()


def _simulate(client, filters, discount_pct):
    r = client.post(
        "/api/simulation/simulate",
        json={"filters": filters, "scenario_id": "optimized-plan", "discount_pct": discount_pct},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _cannibalization_rows(state: FilterState):
    """The row set the metric is measured over, resolved as the service does.

    Rebuilt here rather than imported so the test fails if `service._bundle`
    ever stops resolving it this way.
    """
    return baseline_rows_for(state.widened_to_brand_form())


def _promoted_products(state: FilterState):
    return frozenset(state.product) if state.product else None


def _detail(state: FilterState):
    return A.cannibalization_detail(_cannibalization_rows(state), _promoted_products(state))


# --- 1. the regression itself ----------------------------------------------


def test_an_offer_scope_reports_a_rate(client):
    """1. The studio's own scope shape produces a number.

    Guards the defect directly: an Offer filter with no Product filter used to
    fall back to the selection, which carries no non-promoted row, and every
    candidate event was excluded for want of a baseline.
    """
    kpi = _run(client, OFFER_SCOPE)["kpis"]["cannibalization"]
    assert kpi["available"] is True, kpi["unavailable_reason"]
    assert kpi["value"] is not None and kpi["value"] > 0
    assert kpi["display_value"].endswith("%")


def test_the_offer_scope_has_a_baseline_to_measure_against(client):
    """1b. WHY it now works, stated as data rather than as a rate.

    The selection holds no non-promoted row under an Offer filter; the resolved
    cannibalization set holds thousands, which is what `_sku_baselines` needs.
    """
    state = FilterState.build(**OFFER_SCOPE)
    selection = rows_for(state)
    resolved = _cannibalization_rows(state)

    assert selection, "the scope must select rows for the test to mean anything"
    assert not any(not r.is_promoted for r in selection), (
        "an Offer filter is expected to exclude non-promoted rows from the selection"
    )
    assert sum(1 for r in resolved if not r.is_promoted) > 0
    assert A._sku_baselines(resolved), "the resolved set must supply baselines"
    assert not A._sku_baselines(selection), "the selection alone cannot"


# --- 2-3. the widening ------------------------------------------------------


def test_the_scope_is_widened_to_the_whole_brand_form():
    """2. A Product filter is lifted to the SKU's siblings.

    The Product filter still travels separately as `promoted_products`, so a
    sibling can be measured as a victim but can never act as the promoter.
    """
    state = FilterState.build(**PRODUCT_SCOPE)
    selection = {r.product_id for r in rows_for(state)}
    resolved = {r.product_id for r in _cannibalization_rows(state)}

    assert selection == set(PRODUCT_SCOPE["product"])
    assert selection < resolved, "the widening must add the SKU's siblings"
    assert _promoted_products(state) == frozenset(PRODUCT_SCOPE["product"])


def test_the_widening_never_leaves_the_brand_form():
    """3. Unrelated Brand Forms are not pulled in."""
    state = FilterState.build(**PRODUCT_SCOPE)
    own = {r.brand_form for r in rows_for(state)}
    resolved = {r.brand_form for r in _cannibalization_rows(state)}
    assert resolved == own, f"widened past the Brand Form: {resolved - own}"


# --- 4-6. the SKU relationships the engine uses -----------------------------


def test_rank_one_is_a_victim_and_never_a_promoter(client):
    """4. The smallest pack is never treated as the promoted SKU."""
    detail = _detail(FilterState.build(**OFFER_SCOPE))
    assert detail["events"], "no comparable events to inspect"
    assert all(e["promoted_rank"] != 1 for e in detail["events"])
    assert A._adjacent_ranks(2) == (1, 3), "rank 1 must remain reachable as a neighbour"


@pytest.mark.parametrize("rank,expected", [(2, {1, 3}), (3, {2, 4}), (4, {3})])
def test_neighbours_are_the_adjacent_pack_sizes(rank, expected):
    """5-6. rank2 <-> rank3 and rank3 <-> rank4, from the engine's own rule."""
    assert set(A._adjacent_ranks(rank)) == expected

    detail = _detail(FilterState.build(**OFFER_SCOPE))
    for event in detail["events"]:
        if event["promoted_rank"] != rank:
            continue
        assert {n["rank"] for n in event["neighbours"]} <= expected


# --- 7-9. the quantities ----------------------------------------------------


def test_neighbour_growth_is_floored_and_losses_are_counted():
    """7-8. Every loss is >= 0, and a neighbour that GREW contributes zero.

    A neighbour selling more than its baseline has not been cannibalized;
    admitting the negative would net real losses away against unrelated growth.
    """
    detail = _detail(FilterState.build(**OFFER_SCOPE))
    neighbours = [n for e in detail["events"] for n in e["neighbours"]]
    assert neighbours, "no neighbours measured"

    assert all(n["loss"] >= 0 for n in neighbours)
    assert any(n["loss"] > 0 for n in neighbours), "no loss counted anywhere"

    grew = [n for n in neighbours if n["actual"] > n["expected"]]
    assert grew, "no growing neighbour in this scope to check the floor with"
    assert all(n["loss"] == 0 for n in grew)


def test_the_denominator_is_a_positive_promotional_increment():
    """9. Every counted event has real uplift behind it."""
    detail = _detail(FilterState.build(**OFFER_SCOPE))
    assert all(e["increment"] > 0 for e in detail["events"])
    assert detail["incremental_quantity"] > 0


def test_the_rate_is_a_ratio_of_sums_not_a_mean_of_rates():
    """9b. Total loss over total increment, divided once at the end."""
    detail = _detail(FilterState.build(**OFFER_SCOPE))
    expected = detail["cannibalized_quantity"] / detail["incremental_quantity"] * 100
    assert detail["overall"] == pytest.approx(expected, abs=0.05)

    mean_of_events = sum(
        e["cannibalized"] / e["increment"] for e in detail["events"]
    ) / len(detail["events"]) * 100
    assert detail["overall"] != pytest.approx(mean_of_events, abs=0.05), (
        "the ratio of sums has collapsed onto the mean of event rates"
    )


# --- 10-11. one implementation, one number ----------------------------------


@pytest.mark.parametrize("name,scope", [("offer", OFFER_SCOPE), ("product", PRODUCT_SCOPE)])
def test_the_studio_returns_the_engines_own_rate(client, name, scope):
    """10. The endpoint's value IS `calculate_cannibalization`."""
    state = FilterState.build(**scope)
    expected = A.calculate_cannibalization(
        _cannibalization_rows(state), _promoted_products(state)
    )
    assert _run(client, scope)["kpis"]["cannibalization"]["value"] == expected


@pytest.mark.parametrize("name,scope", [("offer", OFFER_SCOPE), ("product", PRODUCT_SCOPE)])
def test_the_studio_and_the_command_center_agree(client, name, scope):
    """11. Same scope, same card, same number -- no second implementation."""
    card = service.kpis(FilterState.build(**scope))["kpis"]["cannibalization_rate"]
    kpi = _run(client, scope)["kpis"]["cannibalization"]
    assert kpi["value"] == card["value"]
    assert kpi["available"] == card["available"]
    assert kpi["unavailable_reason"] == card["unavailable_reason"]


# --- 12, 14-15. scenarios invent nothing ------------------------------------


def test_a_treatment_never_moves_a_neighbours_measured_loss():
    """12. No fabricated cannibalization response to discount depth.

    The numerator -- what the neighbours actually lost -- is identical at every
    approved treatment, because a scenario re-bases only its own promoted rows.
    The RATE does move, and only arithmetically: the denominator is this
    scenario's promotional increment, which the approved uplift changes. That
    is the engine dividing, not a modelled response, and
    `execution.CANNIBALIZATION_NOTE` says so on every scenario result.
    """
    state = FilterState.build(**OFFER_SCOPE)
    rows, volume = rows_for(state), baseline_rows_for(state)
    family = _cannibalization_rows(state)
    targets = execution._target_keys(rows)
    baselines = execution._baselines(volume)

    losses, increments = set(), set()
    for discount in (5, 10, 15, 20, 25):
        rule = response.get_treatment_response(discount)
        counterfactual = execution.synthesize(
            family, targets, baselines, rule.uplift_low, rule.discount_pct / 100
        ).rows
        detail = A.cannibalization_detail(counterfactual, _promoted_products(state))
        losses.add(detail["cannibalized_quantity"])
        increments.add(detail["incremental_quantity"])

    assert len(losses) == 1, f"a treatment changed the neighbours' losses: {losses}"
    assert len(increments) == 5, "the promoted SKU's own increment should track the uplift"


def test_the_scenario_figure_is_labelled_engine_derived(client):
    """12b. And says, on the payload, that no response is modelled."""
    kpi = _simulate(client, OFFER_SCOPE, 15)["result"]["low"]["kpis"]["cannibalization"]
    assert kpi["value"] is not None
    assert "Engine-derived" in kpi["note"]
    assert "no cannibalization response" in kpi["note"]


def test_an_unsimulated_scenario_carries_no_cannibalization(client):
    """14. Optimized Plan and Aggressive Growth invent nothing before they run.

    Phase A models no scenario response, so a hypothetical holds no result at
    all until an execution actually produces one -- rather than a copy of the
    measured rate wearing a scenario's name.
    """
    payload = _run(client, OFFER_SCOPE)
    measured = [s for s in payload["scenarios"] if s["kind"] == "measured"]
    hypothetical = [s for s in payload["scenarios"] if s["kind"] == "hypothetical"]

    assert measured and hypothetical
    assert measured[0]["result"]["cannibalization"]["value"] == payload["kpis"]["cannibalization"]["value"]
    for scenario in hypothetical:
        assert scenario["status"] == "not_simulated"
        assert scenario["result"] is None


# --- 13. absence of evidence is not zero ------------------------------------


def test_genuinely_absent_evidence_stays_null(client):
    """13. Null with the engine's own reason -- never 0%."""
    kpi = _run(client, NO_EVIDENCE_SCOPE)["kpis"]["cannibalization"]
    assert kpi["value"] is None
    assert kpi["available"] is False
    assert kpi["value"] != 0
    assert "No comparable promotion event" in kpi["unavailable_reason"]

    # And it is absent for want of EVIDENCE, not for want of a baseline: the
    # resolved row set does supply one, the Brand Form simply has no adjacent
    # pack trading in that channel and week.
    state = FilterState.build(**NO_EVIDENCE_SCOPE)
    assert A._sku_baselines(_cannibalization_rows(state)), "a baseline was available"
    detail = _detail(state)
    assert detail["comparable_events"] == 0
    assert any(
        "no adjacent SKU" in e.get("reason", "") for e in detail["excluded"]
    ), [e.get("reason") for e in detail["excluded"]]
