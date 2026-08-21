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
from app.tpo import formatting as F
from app.tpo.filters import FilterState, baseline_rows_for, rows_for
from app.tpo.loader import get_store

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


# ===========================================================================
# The evidence floor and the measurement ladder
# ===========================================================================
#
# TWO REPORTING RULES sitting on top of the one validated implementation.
# Neither touches the arithmetic: `cannibalization_detail` still produces every
# number, and these tests assert that what is SHOWN is that number, measured
# somewhere the evidence supports.
#
#   * THE FLOOR. Under three comparable events the rate is not reported. A
#     share computed over one event is a coincidence with a percent sign.
#   * THE LADDER. When the selection cannot clear the floor, the narrowest
#     WIDER scope that can is offered beside the gap, carrying the scope it
#     belongs to. It never overwrites `value`.

#: Real scopes, by how many comparable events the engine finds in each. The
#: dataset carries no single-SKU scope with exactly three, so the boundary
#: itself is asserted against the rule rather than hunted for in the data.
EVENTS_0 = {"year": YEAR, "promotion": ["PBNY25"], "product": ["P11-800ml"], "channel": ["CH001"]}
EVENTS_1 = {"year": YEAR, "promotion": ["PBNY25"], "product": ["P21-84ct"], "channel": ["CH001"]}
EVENTS_2 = {"year": YEAR, "month": 1, "promotion": ["PR001"], "product": ["P11-100ml"], "channel": ["CH003"]}
EVENTS_4 = {"year": YEAR, "promotion": ["PR001"], "product": ["P11-250ml"], "channel": ["CH002"]}

#: Resolved by lifting the CHANNEL -- same promotion, same SKU.
LADDER_RUNG_CHANNEL = {
    "year": YEAR, "promotion": ["PBIN25"], "product": ["P13-240ct"], "channel": ["CH003"],
}
#: Resolved only by lifting the OFFER -- same SKU, same channel.
LADDER_RUNG_PROMOTION = {
    "year": YEAR, "promotion": ["PBNY25"], "product": ["P13-240ct"], "channel": ["CH005"],
}
#: No rung clears the floor. Must stay unavailable.
LADDER_EXHAUSTED = {
    "year": YEAR, "promotion": ["PBNY25"], "product": ["P13-240ct"], "channel": ["CH003"],
}


def _card(scope):
    return service.kpis(FilterState.build(**scope))["kpis"]["cannibalization_rate"]


# --- the floor --------------------------------------------------------------


@pytest.mark.parametrize(
    "comparable,reported",
    [(0, False), (1, False), (2, False), (3, True), (4, True), (50, True)],
)
def test_the_floor_is_three_comparable_events(comparable, reported):
    """0, 1 and 2 events report nothing; 3 is the first count that does."""
    detail = {"overall": None if comparable == 0 else 5.0, "comparable_events": comparable}
    assert service._clears_the_floor(detail) is reported
    assert service.CANNIBALIZATION_MIN_EVENTS == 3


@pytest.mark.parametrize(
    "name,scope,events",
    [("zero", EVENTS_0, 0), ("one", EVENTS_1, 1), ("two", EVENTS_2, 2)],
)
def test_thin_evidence_is_not_reported(name, scope, events):
    """The floor, on real scopes.

    The ENGINE still computes a rate for one and two events -- proof the floor
    is a reporting rule and not a formula change -- and the card declines to
    show it, with a reason that says which it is.
    """
    state = FilterState.build(**scope)
    detail = _detail(state)
    assert detail["comparable_events"] == events

    card = _card(scope)
    assert card["value"] is None
    assert card["available"] is False
    assert card["comparable_events"] == events
    assert card["value"] != 0
    if events:
        assert detail["overall"] is not None, "the engine itself still produces a rate"
        assert str(events) in card["unavailable_reason"]
    # Suppressing the value drops everything derived from it.
    for derived in ("previous_value", "delta", "delta_display", "difference", "trend"):
        assert card[derived] is None


def test_sufficient_evidence_is_reported_with_its_count():
    """3+ events: the engine's own value, and the count beside it."""
    state = FilterState.build(**EVENTS_4)
    detail = _detail(state)
    assert detail["comparable_events"] >= service.CANNIBALIZATION_MIN_EVENTS

    card = _card(EVENTS_4)
    assert card["value"] == detail["overall"]
    assert card["available"] is True
    assert card["comparable_events"] == detail["comparable_events"]
    assert card["measured_at"] is None, "a scope that stands needs no fallback"


# --- the ladder -------------------------------------------------------------


def test_the_ladder_stops_at_the_first_rung_that_clears_the_floor():
    """Lifting the channel is enough here, so the offer is never lifted."""
    card = _card(LADDER_RUNG_CHANNEL)
    assert card["value"] is None
    assert card["measured_at"]["lifted"] == ["channel"]
    assert card["measured_at"]["comparable_events"] >= service.CANNIBALIZATION_MIN_EVENTS

    # The rung it stopped before would also have resolved -- so "first wins" is
    # a real choice here, not an accident of there being only one option.
    state = FilterState.build(**LADDER_RUNG_CHANNEL)
    later = _detail(state.replace(promotion=None, promotion_type=None))
    assert later["overall"] is not None
    assert card["measured_at"]["value"] != later["overall"], (
        "the two rungs happen to agree; pick a scope where they differ"
    )


def test_a_later_rung_is_used_when_the_first_cannot_clear_the_floor():
    """Lifting the channel is not enough, so the offer is lifted instead."""
    card = _card(LADDER_RUNG_PROMOTION)
    assert card["value"] is None
    assert card["measured_at"]["lifted"] == ["promotion", "promotion_type"]

    state = FilterState.build(**LADDER_RUNG_PROMOTION)
    skipped = _detail(state.replace(channel=None))
    assert not service._clears_the_floor(skipped), "the first rung should have failed"


@pytest.mark.parametrize(
    "name,scope", [("channel", LADDER_RUNG_CHANNEL), ("promotion", LADDER_RUNG_PROMOTION)]
)
def test_the_fallback_equals_a_direct_engine_call_at_that_scope(name, scope):
    """The reported figure IS `cannibalization_detail` at the resolved scope --
    no second computation anywhere in the ladder."""
    state = FilterState.build(**scope)
    fallback = _card(scope)["measured_at"]
    resolved = state.replace(**{dimension: None for dimension in fallback["lifted"]})
    detail = _detail(resolved)
    assert fallback["value"] == detail["overall"]
    assert fallback["comparable_events"] == detail["comparable_events"]


@pytest.mark.parametrize(
    "name,scope", [("channel", LADDER_RUNG_CHANNEL), ("promotion", LADDER_RUNG_PROMOTION)]
)
def test_a_fallback_never_becomes_the_selections_own_value(name, scope):
    """`value` means "this selection" everywhere else in the payload, so a
    wider figure is never written into it -- it travels beside it, labelled."""
    card = _card(scope)
    assert card["value"] is None
    assert card["available"] is False
    assert card["display_value"] == F.percent(None)
    assert card["measured_at"]["value"] is not None
    assert card["measured_at"]["scope_label"], "a wider figure must name its scope"


def test_the_pinned_scope_is_never_dressed_up_as_wider():
    """The ladder does not run at all when the selection stands on its own."""
    for scope in ({"year": YEAR}, EVENTS_4, PRODUCT_SCOPE, OFFER_SCOPE):
        card = _card(scope)
        assert card["available"] is True
        assert card["measured_at"] is None


def test_a_scope_no_rung_can_resolve_stays_unavailable():
    """Absence of evidence survives the ladder. Never zero, never borrowed."""
    card = _card(LADDER_EXHAUSTED)
    assert card["value"] is None
    assert card["value"] != 0
    assert card["available"] is False
    assert card["measured_at"] is None
    assert card["unavailable_reason"]

    state = FilterState.build(**LADDER_EXHAUSTED)
    for lifted in service._CANNIBALIZATION_LADDER:
        wider = state.replace(**{dimension: None for dimension in lifted})
        assert not service._clears_the_floor(_detail(wider)), f"{lifted} should not resolve"


def test_the_product_pin_is_never_lifted():
    """Every rung keeps the answer about the SKU on screen."""
    for lifted in service._CANNIBALIZATION_LADDER:
        assert "product" not in lifted
        assert "brand" not in lifted


# --- parity, and the scenario boundary --------------------------------------


@pytest.mark.parametrize(
    "name,scope",
    [
        ("offer", OFFER_SCOPE), ("product", PRODUCT_SCOPE),
        ("rung channel", LADDER_RUNG_CHANNEL), ("rung promotion", LADDER_RUNG_PROMOTION),
        ("exhausted", LADDER_EXHAUSTED), ("thin", EVENTS_1),
    ],
)
def test_command_center_and_simulation_resolve_identically(client, name, scope):
    """ONE resolution path. The floor and the ladder live in the shared
    cannibalization code, so neither surface can drift from the other."""
    card = _card(scope)
    kpi = _run(client, scope)["kpis"]["cannibalization"]
    assert kpi["value"] == card["value"]
    assert kpi["available"] == card["available"]
    assert kpi["unavailable_reason"] == card["unavailable_reason"]
    assert kpi["comparable_events"] == card["comparable_events"]
    assert kpi.get("measured_at") == card["measured_at"]


def test_a_scenario_never_widens_its_own_population(client):
    """THE BOUNDARY.

    The ladder is a MEASUREMENT device; a scenario re-bases rows, and re-basing
    rows the user did not select would be modelling a response Phase A does not
    have. So a simulated scenario carries no `measured_at` of its own, and the
    studio shows the resolved MEASURED figure beside those cells instead.
    """
    payload = _simulate(client, LADDER_RUNG_CHANNEL, 10)
    for end in ("low", "high"):
        kpi = payload["result"][end]["kpis"]["cannibalization"]
        assert "measured_at" not in kpi, "a scenario resolved a wider scope of its own"
        assert kpi["value"] is None
        assert kpi["comparable_events"] < service.CANNIBALIZATION_MIN_EVENTS

    # The figure those cells defer to is the measured one, and it exists.
    measured = _run(client, LADDER_RUNG_CHANNEL)["kpis"]["cannibalization"]
    assert measured["measured_at"]["value"] is not None


def test_a_scenario_applies_the_floor_but_not_the_ladder(client):
    """The same evidence rule as a measurement, from the scenario's own rows."""
    state = FilterState.build(**LADDER_RUNG_CHANNEL)
    rows, volume = rows_for(state), baseline_rows_for(state)
    family = _cannibalization_rows(state)
    targets = execution._target_keys(rows)
    baselines = execution._baselines(volume)
    rule = response.get_treatment_response(10)
    counterfactual = execution.synthesize(
        family, targets, baselines, rule.uplift_low, rule.discount_pct / 100
    ).rows
    detail = A.cannibalization_detail(counterfactual, _promoted_products(state))

    kpi = _simulate(client, LADDER_RUNG_CHANNEL, 10)["result"]["low"]["kpis"]["cannibalization"]
    assert kpi["comparable_events"] == detail["comparable_events"]
    if detail["comparable_events"] >= service.CANNIBALIZATION_MIN_EVENTS:
        assert kpi["value"] == detail["overall"]
    else:
        assert kpi["value"] is None


# --- what must not have changed ---------------------------------------------


def test_the_engine_still_reports_thin_evidence_unfiltered():
    """The floor is OURS, not the engine's. `cannibalization_detail` is
    unchanged and still returns a rate for a single comparable event."""
    detail = _detail(FilterState.build(**EVENTS_1))
    assert detail["comparable_events"] == 1
    assert detail["overall"] is not None
    assert not hasattr(A, "CANNIBALIZATION_MIN_EVENTS")
    assert not hasattr(A, "cannibalization_resolution")


@pytest.mark.parametrize("name,scope", [("offer", OFFER_SCOPE), ("thin", EVENTS_1)])
def test_no_other_kpi_is_touched_by_the_floor_or_the_ladder(name, scope):
    """Every other card is still a direct engine call over the same rows."""
    state = FilterState.build(**scope)
    rows, volume = rows_for(state), baseline_rows_for(state)
    cards = service.kpis(state)["kpis"]
    assert cards["trade_spend"]["value"] == A.calculate_trade_spend(rows)
    assert cards["incremental_sales"]["value"] == A.calculate_incremental_sales(volume)
    assert cards["promotion_roi"]["value"] == A.calculate_roi(rows, volume)
    assert cards["margin_impact"]["value"] == A.calculate_margin(rows)
    assert cards["pei"]["value"] == A.calculate_pei(rows, volume)


def test_the_dataset_is_untouched():
    """Structural guard on fact_sales and the dimensions the metric reads.

    Shape rather than frozen totals, matching this suite's convention -- but
    enough that a swapped extract or a re-ranked catalogue fails here.
    """
    store = get_store()
    assert store.row_count > 0
    ranks = {p.rank for p in store.dims.products.values()}
    assert ranks <= {1, 2, 3, 4}, "SKU rank is the neighbour rule's whole basis"
    assert all(p.brand for p in store.dims.products.values()), "every SKU needs a Brand Form"
    rows = rows_for(FilterState.build(year=YEAR))
    assert any(r.is_promoted for r in rows) and any(not r.is_promoted for r in rows)
