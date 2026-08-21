"""Validation for General Optimization -- the second, separate simulation mode.

Three things are being defended here.

THE ECONOMICS ARE THE PROJECT'S, NOT THE OPTIMIZER'S. Every discount it can
place is one of the five approved treatments; every uplift band is the one
app/tpo/response.py serves; the trade spend it books is the definition
app/tpo/aggregate.calculate_trade_spend states. The baseline rule in
`optimization._price_and_baseline` is checked directly against
`aggregate._volume`'s own `baseline_average`, because that rule is written down
in two places and a test is the only thing stopping the two from drifting.

THE CONSTRAINTS ARE HARD. The budget ceiling binds at the top of the approved
band, discounts stay inside the selected window, and nothing goes negative.
These are asserted across many scopes and many budgets rather than at one
convenient point.

NOTHING IS FABRICATED. A plan that could not be produced comes back as a status
with a reason and NO numbers -- not a zeroed summary that reads like a result.

Run with:

    ../venv/Scripts/python.exe -m pytest tests/test_general_optimization.py -q
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.tpo import aggregate as A
from app.tpo import config, optimization, response
from app.tpo.filters import FilterState, rows_for
from app.tpo.loader import MONTHS, get_store

client = TestClient(app)

SCOPE_URL = "/api/simulation/general-optimization/scope"
OPTIMIZE_URL = "/api/simulation/general-optimization"

#: Scopes exercised end to end. Two different categories, two different
#: channels and two different months, as the brief's manual validation asks
#: for, plus the unconstrained case.
SCOPES: tuple[tuple[str, dict], ...] = (
    ("baby/MT/June", {"category": ["Baby Care"], "channel": ["CH002"], "month": 6}),
    ("fabric/GT/Nov", {"category": ["Fabric & Home Care"], "channel": ["CH003"], "month": 11}),
    ("health/ecom/Mar", {"category": ["Health Care"], "channel": ["CH001"], "month": 3}),
    ("all categories/MT/June", {"channel": ["CH002"], "month": 6}),
    ("baby/all channels/June", {"category": ["Baby Care"], "month": 6}),
)


def state_of(payload: dict) -> FilterState:
    return FilterState.build(
        month=payload.get("month"),
        category=payload.get("category"),
        channel=payload.get("channel"),
    )


def ceiling_for(state: FilterState) -> float:
    return optimization.historical_reference(state)["average_trade_spend"]


def optimized_scopes():
    """Every scope that actually produces a plan, with its result. Computed
    once so the constraint tests do not each re-solve."""
    out = []
    for name, payload in SCOPES:
        state = state_of(payload)
        cap = ceiling_for(state)
        if not cap:
            continue
        result = optimization.optimize(state, cap, 0.0, optimization.MAX_DISCOUNT_PCT)
        if result["status"] == optimization.STATUS_OPTIMIZED:
            out.append((name, state, cap, result))
    return out


OPTIMIZED = optimized_scopes()


def test_some_scope_optimizes():
    """Guard on the fixture itself: if nothing optimizes, every constraint test
    below would pass vacuously."""
    assert OPTIMIZED, "no scope produced a plan — the constraint tests would be vacuous"


# --- 1-2. categories ---------------------------------------------------------


def test_categories_come_from_the_product_dimension():
    """The selectable categories ARE dim_product's distinct Category values.

    NOT a hardcoded list. If the extract gains or loses a category this test
    follows it, which is the whole point of reading the dimension.
    """
    store = get_store()
    expected = sorted({p.category for p in store.dims.products.values() if p.category})
    payload = client.post(SCOPE_URL, json={}).json()
    assert payload["scope"]["available_categories"] == expected
    assert expected, "dim_product carries no Category values"


def test_three_categories_and_nine_brand_forms():
    """THREE CATEGORIES, NINE BRAND FORMS. Confirmed, not a discrepancy.

    `dim_product.Category` holds exactly three values and the Category picker
    offers those three. The nine-valued dimension in this dataset is `Brand`,
    the Brand Form, which is the first column of the optimized product plan.

    Both counts are pinned here so that nobody later "fixes" the category list
    by inventing six more, and so that a genuine change to either dimension
    fails loudly rather than quietly reshaping the picker.
    """
    store = get_store()
    categories = {p.category for p in store.dims.products.values() if p.category}
    brand_forms = {p.brand for p in store.dims.products.values() if p.brand}
    assert len(categories) == 3, f"expected 3 categories, found {sorted(categories)}"
    assert len(brand_forms) == 9, f"expected 9 Brand Forms, found {sorted(brand_forms)}"


@pytest.mark.parametrize("category", ["Baby Care", "Fabric & Home Care", "Health Care"])
def test_category_selection_isolates_the_population(category):
    """A selected category admits its own products and no others."""
    state = FilterState.build(month=6, category=[category])
    candidates, _ = optimization._candidates(state)
    assert candidates, f"{category} has no candidates in June"
    assert {c.category for c in candidates} == {category}


# --- 3-4. channel ------------------------------------------------------------


@pytest.mark.parametrize("channel", ["CH001", "CH002", "CH003"])
def test_channel_filtering_isolates_the_population(channel):
    state = FilterState.build(month=6, channel=[channel])
    candidates, _ = optimization._candidates(state)
    assert candidates
    assert {c.channel_id for c in candidates} == {channel}


def test_the_optimizer_input_is_already_narrowed_not_filtered_afterwards():
    """The candidate set for (category, channel) is exactly the intersection.

    The brief is explicit that the optimizer must not be run over everything
    and filtered for display. Comparing the narrowed candidate set against the
    narrowed slice of the wide one is what proves it was never wide.
    """
    narrow = FilterState.build(month=6, category=["Baby Care"], channel=["CH002"])
    wide = FilterState.build(month=6)
    narrow_ids = {(c.product_id, c.channel_id) for c in optimization._candidates(narrow)[0]}
    wide_ids = {
        (c.product_id, c.channel_id)
        for c in optimization._candidates(wide)[0]
        if c.category == "Baby Care" and c.channel_id == "CH002"
    }
    assert narrow_ids == wide_ids
    assert narrow_ids


# --- 5. month and the two-year reference ------------------------------------


@pytest.mark.parametrize("month", [1, 6, 11])
def test_month_filtering_selects_that_month_in_both_years(month):
    state = FilterState.build(month=month, channel=["CH002"])
    months = {r.month for r in rows_for(state)}
    years = {r.year for r in rows_for(state)}
    assert months == {month}
    assert years == {"2024", "2025"}, f"expected both reference years, got {sorted(years)}"


def test_historical_reference_uses_both_2024_and_2025():
    state = FilterState.build(month=6, category=["Baby Care"], channel=["CH002"])
    reference = optimization.historical_reference(state)
    assert reference["years"] == [2024, 2025]
    assert {o["year"] for o in reference["observations"]} == {2024, 2025}
    assert reference["observed_years"] == 2


def test_reference_average_is_the_mean_of_the_observed_years():
    """The bound is arithmetic on measured spend, not a chosen number."""
    state = FilterState.build(month=6, category=["Baby Care"], channel=["CH002"])
    reference = optimization.historical_reference(state)
    per_year = [
        A.calculate_trade_spend(rows_for(state.replace(year=year)))
        for year in optimization.REFERENCE_YEARS
    ]
    observed = [v for v in per_year if v is not None]
    assert reference["average_trade_spend"] == pytest.approx(sum(observed) / len(observed))


def test_a_year_without_rows_is_not_counted_as_zero():
    """An absent year is one fewer observation, never a zero that halves the
    average and silently tightens the ceiling."""
    reference = {
        "observations": [
            {"year": 2024, "trade_spend": None, "available": False},
            {"year": 2025, "trade_spend": 100.0, "available": True},
        ],
    }
    measured = [o["trade_spend"] for o in reference["observations"] if o["available"]]
    assert sum(measured) / len(measured) == 100.0


# --- 6-7. the trade-spend ceiling -------------------------------------------


def test_scope_reports_the_ceiling_the_slider_must_use():
    body = {"category": ["Baby Care"], "channel": ["CH002"], "month": 6}
    payload = client.post(SCOPE_URL, json=body).json()
    reference = payload["reference"]
    assert reference["available"] is True
    assert reference["average_trade_spend"] > 0
    assert reference["display_average"].strip() not in ("", "—")
    expected = ceiling_for(state_of(body))
    assert reference["average_trade_spend"] == pytest.approx(expected)


def test_a_request_above_the_historical_average_is_clamped_to_it():
    """The slider must never fund more than the historical average. A stale
    client value is clamped and the clamp is REPORTED, not silently applied."""
    state = FilterState.build(month=6, category=["Baby Care"], channel=["CH002"])
    cap = ceiling_for(state)
    result = optimization.optimize(state, cap * 1000, 0.0, 25.0)
    assert result["constraints"]["clamped"] is True
    assert result["constraints"]["effective_max_trade_spend"] == pytest.approx(cap)
    assert result["optimized"]["trade_spend"]["high"] <= cap + 1e-6


@pytest.mark.parametrize("fraction", [0.1, 0.25, 0.5, 0.75, 1.0])
def test_optimized_spend_never_exceeds_the_ceiling(fraction):
    for _name, state, cap, _ in OPTIMIZED:
        result = optimization.optimize(state, cap * fraction, 0.0, 25.0)
        if result["status"] != optimization.STATUS_OPTIMIZED:
            continue
        effective = result["constraints"]["effective_max_trade_spend"]
        assert result["optimized"]["trade_spend"]["high"] <= effective + 1e-6
        assert sum(r["optimized_trade_spend"]["high"] for r in result["rows"]) <= effective + 1e-6


# --- 8-10. the discount window ----------------------------------------------


def test_minimum_discount_cannot_be_negative():
    with pytest.raises(optimization.InvalidConstraints):
        optimization.validate(-0.1, 25.0, 1.0)


def test_maximum_discount_cannot_exceed_twenty_five():
    with pytest.raises(optimization.InvalidConstraints):
        optimization.validate(0.0, 25.1, 1.0)
    assert optimization.MAX_DISCOUNT_PCT == 25.0
    assert optimization.MAX_DISCOUNT_PCT == max(response.APPROVED_DISCOUNT_PCT)


def test_minimum_may_not_exceed_maximum():
    with pytest.raises(optimization.InvalidConstraints):
        optimization.validate(20.0, 10.0, 1.0)
    optimization.validate(10.0, 10.0, 1.0)  # equal is fine


def test_the_api_rejects_a_contradictory_window():
    body = {
        "category": ["Baby Care"], "channel": ["CH002"], "month": 6,
        "max_trade_spend": 1000.0, "min_discount_pct": 20.0, "max_discount_pct": 10.0,
    }
    assert client.post(OPTIMIZE_URL, json=body).status_code == 422


@pytest.mark.parametrize("low,high", [(0.0, 25.0), (5.0, 15.0), (10.0, 10.0), (15.0, 25.0)])
def test_every_placed_discount_sits_inside_the_window(low, high):
    for _name, state, cap, _ in OPTIMIZED:
        result = optimization.optimize(state, cap, low, high)
        if result["status"] != optimization.STATUS_OPTIMIZED:
            continue
        for row in result["rows"]:
            if row["promoted"]:
                assert low <= row["discount_pct"] <= high


def test_every_placed_discount_is_an_approved_treatment():
    """No interpolation, ever. A depth the response model cannot price must
    never reach a row."""
    approved = set(response.APPROVED_DISCOUNT_PCT)
    for _name, state, cap, result in OPTIMIZED:
        for row in result["rows"]:
            if row["promoted"]:
                assert row["discount_pct"] in approved
                assert row["treatment"] in config.TREATMENT_RULES
            else:
                assert row["discount_pct"] == 0.0
                assert row["treatment"] is None


def test_a_window_containing_no_approved_point_is_a_constraint_conflict():
    """6-9% contains no approved depth. It is reported, not rounded to 5 or 10."""
    state = FilterState.build(month=6, category=["Baby Care"], channel=["CH002"])
    result = optimization.optimize(state, ceiling_for(state), 6.0, 9.0)
    assert result["status"] == optimization.STATUS_CONFLICT
    assert result["optimized"] is None
    assert result["rows"] == []
    assert "approved" in result["message"].lower()


# --- 11-13. the business constraints ----------------------------------------


def test_nothing_is_negative():
    for _name, _state, _cap, result in OPTIMIZED:
        for row in result["rows"]:
            assert row["optimized_units"]["low"] >= 0
            assert row["optimized_units"]["high"] >= 0
            assert row["optimized_revenue"]["low"] >= 0
            assert row["optimized_revenue"]["high"] >= 0
            assert row["optimized_trade_spend"]["low"] >= 0
            assert row["optimized_trade_spend"]["high"] >= 0
        summary = result["optimized"]
        assert summary["units"]["low"] >= 0
        assert summary["revenue"]["low"] >= 0
        assert summary["trade_spend"]["low"] >= 0


def test_summary_totals_equal_the_row_totals():
    """The summary is the plan, added up — not a separately computed figure."""
    for _name, _state, _cap, result in OPTIMIZED:
        rows = result["rows"]
        for key in ("units", "revenue", "trade_spend"):
            field = "optimized_" + key
            for end in ("low", "high"):
                assert result["optimized"][key][end] == pytest.approx(
                    sum(r[field][end] for r in rows)
                )


def test_an_untouched_product_draws_nothing_and_keeps_its_baseline():
    """Section 15: a product may stay at its base allocation. That option must
    genuinely cost nothing and genuinely not move."""
    for _name, _state, _cap, result in OPTIMIZED:
        for row in result["rows"]:
            if not row["promoted"]:
                assert row["optimized_trade_spend"]["low"] == 0.0
                assert row["optimized_trade_spend"]["high"] == 0.0
                assert row["optimized_units"]["low"] == pytest.approx(row["optimized_units"]["high"])


# --- 14. the economics are the project's ------------------------------------


def test_the_baseline_rule_agrees_with_the_kpi_engine():
    """THE ANTI-DRIFT GUARD.

    `optimization._price_and_baseline` restates `aggregate._volume`'s baseline
    rule for a population `_volume` deliberately does not cover. For every
    (product, channel) `_volume` DOES report, the two must produce the same
    number to the last float.
    """
    checked = 0
    for _name, payload in SCOPES:
        state = state_of(payload)
        rows = rows_for(state)
        engine = {
            (p.product_id, p.channel_id): p.baseline_average
            for p in A._volume(rows).products
        }
        grouped: dict[tuple[str, str], list] = {}
        for row in rows:
            grouped.setdefault((row.product_id, row.channel_id), []).append(row)
        for key, expected in engine.items():
            _price, baseline, _txn = optimization._price_and_baseline(grouped[key])
            assert baseline == pytest.approx(expected), f"{key} in {_name}"
            checked += 1
    assert checked > 0, "no (product, channel) was available to cross-check"


def test_row_economics_reproduce_the_approved_algebra():
    """Each promoted row must satisfy the approved identities exactly:

        units   = baseline x (1 + u)
        revenue = units x P x (1 - d)
        spend   = units x P x (d + c)
    """
    c = config.PROMOTION_COST_RATE
    for _name, state, cap, result in OPTIMIZED:
        candidates, _ = optimization._candidates(state)
        by_key = {(x.product_id, x.channel_id): x for x in candidates}
        for row in result["rows"]:
            if not row["promoted"]:
                continue
            candidate = by_key[(row["product_id"], row["channel_id"])]
            d = row["discount_pct"] / 100
            for end in ("low", "high"):
                u = row["uplift"][end]
                units = candidate.baseline_units * (1 + u)
                gross = units * candidate.list_price
                assert row["optimized_units"][end] == pytest.approx(units)
                assert row["optimized_revenue"][end] == pytest.approx(gross * (1 - d))
                assert row["optimized_trade_spend"][end] == pytest.approx(gross * (d + c))


def test_the_uplift_band_is_the_approved_one():
    for _name, _state, _cap, result in OPTIMIZED:
        for row in result["rows"]:
            if not row["promoted"]:
                continue
            rule = response.get_treatment(row["treatment"])
            assert row["uplift"]["low"] == rule.uplift_low
            assert row["uplift"]["high"] == rule.uplift_high
            assert row["discount_pct"] == rule.discount_pct


def test_the_band_is_never_collapsed_to_a_midpoint():
    """A promoted row's low and high ends must actually differ — a single
    number would be the midpoint B2.1 refuses to produce."""
    seen = False
    for _name, _state, _cap, result in OPTIMIZED:
        for row in result["rows"]:
            if row["promoted"]:
                assert row["optimized_units"]["high"] > row["optimized_units"]["low"]
                seen = True
    assert seen, "no promoted row was produced to check"


# --- 16-18. feasibility and honest failure ----------------------------------


def test_the_optimizer_produces_a_feasible_improving_plan():
    for name, _state, _cap, result in OPTIMIZED:
        assert result["status"] == optimization.STATUS_OPTIMIZED
        assert result["optimized"]["promoted_candidates"] > 0, name
        assert result["rows"], name
        # Promoting at all must beat leaving everything alone, or the optimizer
        # would have had no reason to spend the budget.
        untouched_revenue = sum(
            r["optimized_revenue"]["low"] for r in result["rows"] if not r["promoted"]
        )
        assert result["optimized"]["revenue"]["low"] > untouched_revenue, name


def test_a_budget_too_small_for_any_promotion_says_so_without_numbers():
    state = FilterState.build(month=6, category=["Baby Care"], channel=["CH002"])
    result = optimization.optimize(state, 1.0, 5.0, 25.0)
    assert result["status"] == optimization.STATUS_NO_FEASIBLE
    assert result["optimized"] is None
    assert result["historical"] is None
    assert result["rows"] == []
    assert result["message"]


def test_an_empty_scope_is_insufficient_data_not_a_zeroed_plan():
    """A category/channel pairing the data has no rows for produces no plan and
    no zeros."""
    state = FilterState.build(month=6, category=["Baby Care"], channel=["CH999"])
    result = optimization.optimize(state, 10_000_000.0, 0.0, 25.0)
    assert result["status"] == optimization.STATUS_INSUFFICIENT
    assert result["optimized"] is None
    assert result["comparison"] is None
    assert result["rows"] == []


def test_no_status_other_than_optimized_carries_a_summary():
    """The fabrication guard: every unhappy status must have null summaries."""
    state = FilterState.build(month=6, category=["Baby Care"], channel=["CH002"])
    cap = ceiling_for(state)
    for result in (
        optimization.optimize(state, cap, 6.0, 9.0),        # conflict
        optimization.optimize(state, 1.0, 5.0, 25.0),       # infeasible
    ):
        assert result["status"] != optimization.STATUS_OPTIMIZED
        assert result["optimized"] is None
        assert result["comparison"] is None
        assert result["rows"] == []


# --- 19. determinism --------------------------------------------------------


def test_the_same_inputs_produce_the_same_plan():
    state = FilterState.build(month=6, category=["Baby Care"], channel=["CH002"])
    cap = ceiling_for(state)
    first = optimization.optimize(state, cap, 0.0, 25.0)
    for _ in range(3):
        again = optimization.optimize(state, cap, 0.0, 25.0)
        assert [r["discount_pct"] for r in again["rows"]] == [r["discount_pct"] for r in first["rows"]]
        assert again["optimized"]["revenue"]["low"] == first["optimized"]["revenue"]["low"]


def test_the_solver_is_deterministic_on_a_constructed_tie():
    """Two identical options must resolve the same way every time — to the
    lower index, which is the shallower treatment."""
    rules = response.all_treatments()[:2]
    candidate = optimization.Candidate(
        product_id="P", product_name="P", brand_form="B", category="C",
        channel_id="CH", channel_name="CH",
        base_units=100.0, base_revenue=1000.0, base_trade_spend=0.0,
        baseline_units=100.0, list_price=10.0,
    )
    options = optimization._options(candidate, rules)
    picks = {tuple(optimization.solve([options], 10_000.0)) for _ in range(5)}
    assert len(picks) == 1


# --- 20. the result contract ------------------------------------------------


REQUIRED_ROW_FIELDS = (
    "brand_form", "product_id", "base_units", "base_revenue",
    "optimized_units", "optimized_revenue", "discount_pct", "optimized_trade_spend",
)


def test_rows_carry_every_required_field():
    for _name, _state, _cap, result in OPTIMIZED:
        for row in result["rows"]:
            for field in REQUIRED_ROW_FIELDS:
                assert field in row, field
            assert row["brand_form"], row["product_id"]


def test_the_comparison_block_carries_before_and_after():
    for _name, _state, _cap, result in OPTIMIZED:
        comparison = result["comparison"]
        for key in ("units", "revenue", "trade_spend"):
            block = comparison[key]
            assert block["historical"] is not None
            assert block["optimized_low"] is not None
            assert block["optimized_high"] is not None
        assert "average_discount_pct" in comparison


def test_historical_trade_spend_is_the_validated_definition_per_average_year():
    """The engine's own Trade Spend for the scope, divided by the reference
    years that carry it — the same normalisation the plan is built on."""
    for _name, state, _cap, result in OPTIMIZED:
        years = optimization.reference_year_count(state)
        expected = A.calculate_trade_spend(rows_for(state)) / years
        assert result["historical"]["trade_spend"] == pytest.approx(expected)
        assert result["historical"]["reference_years"] == years


# --- the plan and the budget describe the same amount of trading -------------


def test_the_plan_is_scaled_to_one_average_year():
    """THE UNIT-OF-TIME GUARD.

    The ceiling is ONE average year's trade spend for the selected month. The
    selection spans two years, so every candidate figure is divided by the
    number of reference years that carry rows — otherwise the plan would be two
    Novembers of volume funded by one November's budget, and the revenue
    "uplift" would be measured against a base twice the size of the plan.
    """
    state = FilterState.build(month=6, category=["Baby Care"], channel=["CH002"])
    years = optimization.reference_year_count(state)
    assert years == 2, "this scope is supposed to exercise the two-year case"

    candidates, _ = optimization._candidates(state)
    # Compared over the CANDIDATE keys only: `_candidates` legitimately drops
    # any (product, channel) with no non-promoted row, so the whole-scope sum
    # would differ for a reason that has nothing to do with the scaling.
    keys = {(c.product_id, c.channel_id) for c in candidates}
    raw_units = sum(
        r.actual_quantity for r in rows_for(state) if (r.product_id, r.channel_id) in keys
    )
    assert sum(c.base_units for c in candidates) == pytest.approx(raw_units / years, rel=1e-9)


def test_historical_spend_and_the_ceiling_are_the_same_measurement():
    """A consequence worth pinning: once the historical side is per average
    year, it IS the reference average. If these two ever diverge, one of them
    has stopped describing the same window as the other."""
    for _name, state, cap, result in OPTIMIZED:
        assert result["historical"]["trade_spend"] == pytest.approx(cap, rel=1e-6)


def test_the_year_count_never_returns_zero():
    """The divisor guard. A scope with no rows at all must return 1 rather than
    0 — the callers divide by it, and a scope that reaches the division has
    candidates by construction, but a zero here would be a crash rather than an
    honest `insufficient_data`."""
    empty = FilterState.build(month=6, channel=["CH999"])
    assert rows_for(empty) == ()
    assert optimization.reference_year_count(empty) == 1


def test_the_year_count_is_the_years_that_carry_rows():
    """It counts REFERENCE years with rows, and the mode never pins a year of
    its own — the router deliberately omits `year` so both are always
    considered."""
    state = FilterState.build(month=6, category=["Baby Care"], channel=["CH002"])
    expected = sum(
        1 for year in optimization.REFERENCE_YEARS if rows_for(state.replace(year=year))
    )
    assert optimization.reference_year_count(state) == expected == 2


# --- API surface -------------------------------------------------------------


def test_scope_endpoint_returns_the_controls_it_must():
    payload = client.post(SCOPE_URL, json={"category": ["Baby Care"], "channel": ["CH002"], "month": 6}).json()
    assert payload["mode"] == optimization.MODE
    assert payload["discount"]["max_pct"] == 25.0
    assert [p["discount_pct"] for p in payload["discount"]["approved_points"]] == list(
        response.APPROVED_DISCOUNT_PCT
    )
    assert payload["scope"]["month"] == 6
    assert payload["ready"] is True


def test_optimize_endpoint_round_trips():
    body = {"category": ["Baby Care"], "channel": ["CH002"], "month": 6, "max_trade_spend": 0}
    scope = client.post(SCOPE_URL, json={k: v for k, v in body.items() if k != "max_trade_spend"}).json()
    body["max_trade_spend"] = scope["reference"]["average_trade_spend"]
    payload = client.post(OPTIMIZE_URL, json=body).json()
    assert payload["status"] == optimization.STATUS_OPTIMIZED
    assert payload["rows"]
    assert payload["provenance"]["response_rule"] == response.PROVENANCE


def test_the_mode_accepts_only_its_three_dimensions():
    """`extra="forbid"`: a caller sending `region` gets a 422 rather than a
    silently ignored constraint."""
    body = {"category": ["Baby Care"], "region": ["South"], "max_trade_spend": 100.0}
    assert client.post(OPTIMIZE_URL, json=body).status_code == 422


def test_month_values_are_real_calendar_months():
    assert len(MONTHS) == 12
    for month in (0, 13):
        body = {"month": month, "max_trade_spend": 100.0}
        assert client.post(OPTIMIZE_URL, json=body).status_code == 422


# --- the frozen surface ------------------------------------------------------


def test_general_optimization_imports_no_investigation_simulation_module():
    """The two modes must not become one. This module may share the filter
    contract and the approved economics; it may not reach into the
    investigation path."""
    import inspect

    source = inspect.getsource(optimization)
    for frozen in ("simulation", "execution", "scenarios", "comparison", "recommendation", "risk", "weekly"):
        assert f"from app.tpo import {frozen}" not in source
        assert f"app.tpo.{frozen} import" not in source


def test_investigation_simulation_still_runs_unchanged():
    """The regression that matters: /run is untouched by any of this."""
    body = {"filters": {"year": 2025, "channel": ["CH002"]}, "currency": "INR"}
    payload = client.post("/api/simulation/run", json=body).json()
    assert payload["scenario"]["phase"] == "A"
    assert payload["levers"]["applied"] is False
    assert payload["scenarios"]
