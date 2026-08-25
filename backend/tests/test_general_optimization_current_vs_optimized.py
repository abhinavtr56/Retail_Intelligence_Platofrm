"""The product plan's CURRENT side, and its reconciliation with the optimized one.

WHY THIS FILE EXISTS. The plan row used to carry one field called `discount_pct`,
which is the depth the OPTIMIZER PROPOSES, and a `base_trade_spend` nobody
rendered. A column headed "Discount" showing a proposal reads as the product's
own depth, and a recommendation whose "before" is invisible cannot be checked.
The row now carries both sides explicitly.

WHAT IS ASSERTED, and none of it is arithmetic this layer invented:

  1. THE CURRENT SIDE IS MEASURED, not inferred from the optimizer. Each row's
     `base_*` figures are re-derived here straight from the filtered fact rows
     and compared.
  2. THE CURRENT DEPTH USES THE MODULE'S OWN RULE -- given-away revenue over
     gross revenue, read from prices -- the same one `_historical` applies to
     the whole selection.
  3. NOT PROMOTED IS NOT 0%. A product nobody promoted is reported as such;
     `base_promoted` and `base_promotions` keep the two apart.
  4. THE OPTIMIZED SIDE STILL COMES FROM THE OPTIMIZER, is unchanged by this
     work, and still respects the ceiling and the discount window.

Run with:

    ../venv/Scripts/python.exe -m pytest tests/ -q
"""

from __future__ import annotations

from collections import defaultdict

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.tpo import optimization, response
from app.tpo.filters import FilterState

SCOPE_URL = "/api/simulation/general-optimization/scope"
OPTIMIZE_URL = "/api/simulation/general-optimization"

#: Two scopes with different shapes: one where the optimizer promotes almost
#: everything, and one that carries genuinely promoted history so the current
#: side is non-zero and a "leave it alone" recommendation appears.
SCOPES = [
    {"month": 6, "category": ["Baby Care"], "channel": ["CH002"]},
    {"month": 1, "category": ["Baby Care"], "channel": ["CH001"]},
]

client = TestClient(app)


def _plan(scope: dict) -> dict:
    ceiling = client.post(SCOPE_URL, json=scope).json()["reference"]["average_trade_spend"]
    r = client.post(OPTIMIZE_URL, json={
        **scope, "max_trade_spend": ceiling,
        "min_discount_pct": 0.0, "max_discount_pct": 25.0})
    assert r.status_code == 200, r.text
    return r.json()


def _rows_by_candidate(scope: dict):
    state = FilterState.build(**scope)
    grouped: dict[tuple[str, str], list] = defaultdict(list)
    for row in optimization.rows_for(state):
        grouped[(row.product_id, row.channel_id)].append(row)
    return grouped


@pytest.fixture(scope="module", params=SCOPES, ids=["baby-care-ch002-m6", "baby-care-ch001-m1"])
def case(request):
    scope = request.param
    plan = _plan(scope)
    assert plan["status"] == "optimized", plan.get("message")
    return {"scope": scope, "plan": plan, "grouped": _rows_by_candidate(scope)}


# --- 1. the current side is measured -----------------------------------------


def test_every_row_carries_both_sides(case):
    for row in case["plan"]["rows"]:
        for field in ("base_units", "base_revenue", "base_trade_spend",
                      "base_discount_pct", "base_promoted", "base_promotions",
                      "promoted", "discount_pct", "optimized_units",
                      "optimized_revenue", "optimized_trade_spend"):
            assert field in row, f"{row['product_id']} is missing {field}"


def test_current_units_revenue_and_trade_spend_are_the_measured_ones(case):
    """Re-derived from the fact rows, not read back from the optimizer."""
    for row in case["plan"]["rows"]:
        rows = case["grouped"][(row["product_id"], row["channel_id"])]
        years = len({r.year for r in rows}) or 1
        assert row["base_units"] == pytest.approx(
            sum(r.actual_quantity for r in rows) / years)
        assert row["base_revenue"] == pytest.approx(
            sum(r.actual_revenue for r in rows) / years)
        # Trade Spend is the project's own definition:
        # (Base Revenue - Actual Revenue) + Promotion Cost.
        assert row["base_trade_spend"] == pytest.approx(
            sum(r.discount_value + r.promotion_cost for r in rows) / years)


def test_the_current_depth_uses_the_modules_own_rule(case):
    """Given-away revenue over gross revenue, read from prices — the same
    expression `_historical` uses for the whole selection. A RATIO, so it is
    never divided by the reference-year count."""
    for row in case["plan"]["rows"]:
        rows = case["grouped"][(row["product_id"], row["channel_id"])]
        gross = sum(r.actual_revenue + r.discount_value for r in rows)
        given = sum(r.discount_value for r in rows)
        expected = (given / gross * 100) if gross else 0.0
        assert row["base_discount_pct"] == pytest.approx(round(expected, 1))


def test_the_current_depth_is_not_the_optimized_one(case):
    """The defect this fixes. At least one row must differ, or the two columns
    would be showing the same number under two headings."""
    differing = [r for r in case["plan"]["rows"]
                 if round(r["base_discount_pct"], 1) != round(r["discount_pct"], 1)]
    assert differing, "current and optimized depth are identical on every row"


# --- 2. not promoted is not 0% ------------------------------------------------


def test_a_product_nobody_promoted_is_reported_as_such(case):
    for row in case["plan"]["rows"]:
        rows = case["grouped"][(row["product_id"], row["channel_id"])]
        promoted = sorted({r.promotion_id for r in rows if r.is_promoted})
        assert row["base_promotions"] == promoted, row["product_id"]
        assert row["base_promoted"] is bool(promoted)
        if not promoted:
            # Never promoted -> no depth and no spend. Reported, not inferred.
            assert row["base_discount_pct"] == 0.0
            assert row["base_trade_spend"] == pytest.approx(0.0)


def test_a_promoted_product_carries_a_real_depth_and_a_real_spend(case):
    promoted_rows = [r for r in case["plan"]["rows"] if r["base_promoted"]]
    if not promoted_rows:
        pytest.skip("this scope carries no promoted history")
    for row in promoted_rows:
        assert row["base_discount_pct"] > 0, row["product_id"]
        assert row["base_trade_spend"] > 0, row["product_id"]


def test_every_current_promotion_is_real_master_data(case):
    """No invented promotion ids: each one must exist in dim_promotion."""
    from app.tpo.loader import get_store
    known = set(get_store().dims.promotions)
    for row in case["plan"]["rows"]:
        for promo in row["base_promotions"]:
            assert promo in known, f"{row['product_id']} cites unknown promotion {promo}"


# --- 3. the optimized side is unchanged and still constrained -----------------


def test_optimized_depths_are_approved_points_inside_the_window(case):
    approved = {rule.discount_pct for rule in response.all_treatments()}
    for row in case["plan"]["rows"]:
        if not row["promoted"]:
            assert row["discount_pct"] == 0.0
            assert row["treatment"] is None
            continue
        assert row["discount_pct"] in approved, row["product_id"]
        assert 0.0 <= row["discount_pct"] <= 25.0


def test_optimized_trade_spend_sums_to_the_summary_and_respects_the_ceiling(case):
    plan = case["plan"]
    low = sum(r["optimized_trade_spend"]["low"] for r in plan["rows"])
    high = sum(r["optimized_trade_spend"]["high"] for r in plan["rows"])
    assert low == pytest.approx(plan["optimized"]["trade_spend"]["low"])
    assert high == pytest.approx(plan["optimized"]["trade_spend"]["high"])
    # The ceiling binds at the TOP of the band -- that is the module's rule.
    assert high <= plan["constraints"]["effective_max_trade_spend"] + 1e-6


def test_an_unpromoted_recommendation_costs_nothing_and_sits_at_the_baseline(case):
    """The row that used to look like a bug: optimized units BELOW base units
    for a product the optimizer leaves alone. It is correct — the un-promoted
    option returns the product to its ordinary demand, and its base units
    include whatever promoted weeks the scope carries. The current column is
    what makes that legible."""
    for row in case["plan"]["rows"]:
        if row["promoted"]:
            continue
        assert row["optimized_trade_spend"]["low"] == pytest.approx(0.0)
        assert row["optimized_trade_spend"]["high"] == pytest.approx(0.0)
        # A band with no treatment does not move.
        assert row["optimized_units"]["low"] == pytest.approx(
            row["optimized_units"]["high"])
        if row["base_promoted"]:
            # Promoted history, no recommended promotion -> volume falls back.
            assert row["optimized_units"]["low"] <= row["base_units"] + 1e-6


# --- 4. scope and determinism -------------------------------------------------


def test_every_row_belongs_to_the_requested_scope(case):
    scope = case["scope"]
    for row in case["plan"]["rows"]:
        assert row["category"] == scope["category"][0], row["product_id"]
        assert row["channel_id"] in scope["channel"], row["product_id"]
        rows = case["grouped"][(row["product_id"], row["channel_id"])]
        assert rows, "row has no fact rows behind it"
        assert {r.month for r in rows} == {scope["month"]}


def test_the_plan_is_reproducible(case):
    assert _plan(case["scope"])["rows"] == case["plan"]["rows"]


def test_no_row_carries_a_blank_where_a_value_is_owed(case):
    for row in case["plan"]["rows"]:
        for field in ("base_units_display", "base_revenue_display",
                      "base_trade_spend_display", "base_discount_display"):
            assert row[field] not in (None, "", "—"), f"{row['product_id']}.{field}"
        assert row["optimized_units"]["display"]
        assert row["optimized_revenue"]["display"]
        assert row["optimized_trade_spend"]["display"]
