"""Validation for the promotion response model -- B2.1.

Two jobs.

FIRST, pin the approved rules exactly. The five treatments, their discounts,
their uplift BANDS and their break-even uplifts are written out as literals
here rather than read from config, so that this file is an independent record
of what was approved. A test that reads its expectation from the code it is
testing proves only that the code is self-consistent.

SECOND, prove the three refusals hold: no interpolation, no midpoint, no spend
input. Those are what separate an approved rule from a fitted coefficient, and
they are the whole reason this module exists rather than a lookup table
somebody inlines later.

The closed-form economics is used ONLY as an oracle, to check that the
break-even the model reports really is the uplift at which ROI is zero. It is
not, and must not become, a production KPI path -- app/tpo/aggregate.py stays
the source of truth for every KPI.

Run with:

    ../venv/Scripts/python.exe -m pytest tests/ -q
"""

from __future__ import annotations

import pytest

from app.tpo import config, response
from app.tpo.response import UnapprovedDiscount, get_treatment_response

#: THE APPROVED RULES, written out independently of the implementation.
#: treatment -> (discount_pct, uplift_low, uplift_high)
APPROVED = {
    "PR001": (5.0, 0.15, 0.20),
    "PR002": (10.0, 0.25, 0.35),
    "PR003": (15.0, 0.40, 0.50),
    "PS001": (20.0, 0.55, 0.65),
    "PB001": (25.0, 0.60, 0.72),
}

#: The break-even uplift each treatment must clear, from the audit's own
#: reporting: 9.2 / 16.9 / 26.9 / 40.4 / 59.6 percent.
EXPECTED_BREAKEVEN = {
    "PR001": 0.092,
    "PR002": 0.169,
    "PR003": 0.269,
    "PS001": 0.404,
    "PB001": 0.596,
}

COST_RATE = 0.03


def closed_form_roi(u: float, d: float, c: float = COST_RATE) -> float:
    """THE ORACLE, and nothing else.

        Incremental Sales = b.u.P.(1-d)
        Trade Spend       = b.(1+u).P.(d+c)
        ROI               = u(1-d) / ((1+u)(d+c)) - 1

    b and P cancel out of the ratio, which is why neither appears. Used here to
    confirm the model's break-even really is the zero of ROI. Production KPIs
    come from app/tpo/aggregate.py; this function exists only in this file.
    """
    return u * (1 - d) / ((1 + u) * (d + c)) - 1


# --- the five approved treatments ------------------------------------------


@pytest.mark.parametrize("treatment", sorted(APPROVED))
def test_every_field_of_every_approved_treatment(treatment):
    """Correct discount, uplift low/high, break-even, headroom, cost rate and
    provenance -- for all five treatments."""
    discount_pct, uplift_low, uplift_high = APPROVED[treatment]
    result = get_treatment_response(discount_pct)

    assert result.treatment == treatment
    assert result.discount_pct == discount_pct
    assert result.uplift_low == uplift_low
    assert result.uplift_high == uplift_high
    assert result.breakeven_uplift == pytest.approx(EXPECTED_BREAKEVEN[treatment], abs=5e-4)
    assert result.headroom_low == pytest.approx(uplift_low - EXPECTED_BREAKEVEN[treatment], abs=5e-4)
    assert result.headroom_high == pytest.approx(uplift_high - EXPECTED_BREAKEVEN[treatment], abs=5e-4)
    assert result.promotion_cost_rate == COST_RATE
    assert result.provenance == "Approved TPO promotion treatment rule"


def test_the_approved_set_is_exactly_these_five():
    assert sorted(t.treatment for t in response.all_treatments()) == sorted(APPROVED)
    assert sorted(response.APPROVED_DISCOUNT_PCT) == [5.0, 10.0, 15.0, 20.0, 25.0]


@pytest.mark.parametrize("treatment", sorted(APPROVED))
def test_lookup_by_treatment_key_agrees_with_lookup_by_discount(treatment):
    by_key = response.get_treatment(treatment)
    assert by_key == get_treatment_response(APPROVED[treatment][0])


def test_unknown_treatment_key_is_rejected():
    with pytest.raises(ValueError, match="Unknown treatment"):
        response.get_treatment("PR999")


# --- 1-6: unapproved discounts are rejected --------------------------------


@pytest.mark.parametrize(
    "discount_pct,why",
    [
        (0, "2. 0% is not a promotion treatment"),
        (7, "3. between PR001 and PR002"),
        (12, "4. between PR002 and PR003"),
        (17, "5. between PR003 and PS001"),
        (30, "6. beyond the deepest approved treatment"),
        (-5, "1. a negative discount"),
        (2.5, "half of PR001 is not half a treatment"),
        (22.5, "the midpoint of two approved points is not a third point"),
        (5.4, "float noise is not tolerated into an approved point"),
        (4.9, "nor is it below one"),
        (100, "an absurd depth"),
    ],
)
def test_unapproved_discount_is_rejected(discount_pct, why):
    """1-6. An unapproved depth has no approved band. It raises."""
    with pytest.raises(UnapprovedDiscount):
        get_treatment_response(discount_pct)


def test_rejection_names_the_approved_points():
    """The error has to be actionable -- it tells the caller what IS approved
    instead of only what is not."""
    with pytest.raises(UnapprovedDiscount) as excinfo:
        get_treatment_response(12)
    message = str(excinfo.value)
    for point in ("5%", "10%", "15%", "20%", "25%"):
        assert point in message
    assert "does not interpolate" in message


def test_rejection_is_catchable_as_valueerror():
    """`UnapprovedDiscount` stays a ValueError, so existing handling works."""
    assert issubclass(UnapprovedDiscount, ValueError)


# --- 7-8: no interpolation, no hidden midpoint -----------------------------


def test_no_interpolation_occurs():
    """7. THE central refusal. Every value between two approved points raises;
    none of them quietly produces a blended band."""
    produced = []
    for tenth in range(0, 301):  # 0.0% to 30.0% in 0.1 steps
        discount = tenth / 10
        try:
            produced.append((discount, get_treatment_response(discount)))
        except UnapprovedDiscount:
            continue
    assert [d for d, _ in produced] == [5.0, 10.0, 15.0, 20.0, 25.0], (
        "the model answered for a depth nobody approved"
    )


@pytest.mark.parametrize("treatment", sorted(APPROVED))
def test_no_hidden_midpoint_is_generated(treatment):
    """8. The band is carried whole. There is no point estimate anywhere on the
    response -- not as a field, not as the two ends collapsed together."""
    result = get_treatment_response(APPROVED[treatment][0])
    low, high = APPROVED[treatment][1], APPROVED[treatment][2]
    midpoint = (low + high) / 2

    assert result.uplift_low != result.uplift_high, "the band was collapsed to a point"
    assert result.uplift_low == low and result.uplift_high == high

    # No field anywhere on the response equals the midpoint -- which is what a
    # smuggled point estimate would look like.
    for field, value in vars(result).items():
        if isinstance(value, float):
            assert value != midpoint, f"{field} is the band midpoint"

    payload = result.as_dict()
    assert payload["uplift"] == {"low": low, "high": high}
    assert "uplift_point" not in payload and "uplift_mid" not in payload


def test_no_confidence_probability_or_recommendation_is_exposed():
    """The response carries the rule and nothing that dresses it up."""
    payload = get_treatment_response(10).as_dict()
    flat = str(payload).lower()
    for word in ("confidence", "probability", "recommend", "forecast", "elasticity", "predict"):
        assert word not in flat


def test_provenance_makes_no_ml_or_mmm_claim():
    """These are approved rules, not a model fit. Every response says so, and
    none of them says anything else."""
    for treatment in response.all_treatments():
        assert treatment.provenance == "Approved TPO promotion treatment rule"
        lowered = treatment.provenance.lower()
        for claim in ("mmm", "machine learning", "elasticity", "forecast", "estimate", "predict", "model"):
            assert claim not in lowered, f"provenance claims {claim!r}"


# --- 9: PB001's narrow headroom --------------------------------------------


def test_pb001_headroom_is_positive_but_very_small():
    """9. PB001 clears break-even by about four tenths of a percentage point.

    This is a real property of the approved rules, not a rounding artefact:
    a 25% giveaway plus 3% overhead needs a 59.6% uplift to pay for itself and
    is approved for 60%. It must NOT be smoothed, widened or rounded away --
    anything built on PB001 is genuinely fragile and has to say so.
    """
    pb001 = get_treatment_response(25)

    assert pb001.headroom_low > 0, "PB001 must still clear break-even"
    assert pb001.headroom_low == pytest.approx(0.004255, abs=1e-5)
    assert 0.004 < pb001.headroom_low < 0.005, "PB001's headroom was smoothed away"
    assert round(pb001.headroom_low * 100, 1) == 0.4, "the audit reports +0.4pp"
    assert pb001.covers_breakeven is True


def test_pb001_is_by_far_the_tightest_treatment():
    """Every other approved treatment has at least an order of magnitude more
    room. If that stops being true, a rule changed."""
    pb001 = get_treatment_response(25)
    others = [t for t in response.all_treatments() if t.treatment != "PB001"]
    assert all(t.headroom_low > pb001.headroom_low * 10 for t in others)


@pytest.mark.parametrize("treatment", sorted(APPROVED))
def test_every_approved_band_clears_breakeven(treatment):
    """An approved band whose floor cannot pay for itself would be a defect in
    the rules themselves."""
    assert get_treatment_response(APPROVED[treatment][0]).covers_breakeven


# --- 10: the break-even formula --------------------------------------------


@pytest.mark.parametrize("treatment", sorted(APPROVED))
def test_breakeven_matches_the_approved_equation(treatment):
    """10. u* = (d + c) / (1 - c - 2d), written out independently here."""
    discount_pct = APPROVED[treatment][0]
    d, c = discount_pct / 100, COST_RATE
    expected = (d + c) / (1 - c - 2 * d)
    assert get_treatment_response(discount_pct).breakeven_uplift == pytest.approx(expected, rel=1e-12)


@pytest.mark.parametrize("treatment", sorted(APPROVED))
def test_breakeven_is_the_zero_of_the_closed_form_roi(treatment):
    """THE ORACLE CHECK. The reported break-even really is the uplift at which
    ROI is exactly zero, and ROI is negative just below it and positive just
    above -- so the number is a threshold, not a coincidence."""
    result = get_treatment_response(APPROVED[treatment][0])
    d, u_star = result.discount_pct / 100, result.breakeven_uplift

    assert closed_form_roi(u_star, d) == pytest.approx(0.0, abs=1e-12)
    assert closed_form_roi(u_star * 0.99, d) < 0
    assert closed_form_roi(u_star * 1.01, d) > 0


@pytest.mark.parametrize("treatment", sorted(APPROVED))
def test_the_approved_band_produces_a_positive_roi_under_the_oracle(treatment):
    """Both ends of every approved band return money under the same algebra --
    and the band's ROI range is what a scenario would inherit."""
    result = get_treatment_response(APPROVED[treatment][0])
    d = result.discount_pct / 100
    roi_low = closed_form_roi(result.uplift_low, d)
    roi_high = closed_form_roi(result.uplift_high, d)
    assert roi_low > 0 and roi_high > roi_low


# --- spend is derived, not an input ----------------------------------------


def test_spend_is_not_an_input_to_the_response_model():
    """In the approved economics Trade Spend is b(1+u)P(d+c) -- an OUTPUT of a
    treatment. Nothing in this model accepts one, and no response carries one.
    """
    import inspect

    for fn in (response.get_treatment_response, response.get_treatment):
        params = set(inspect.signature(fn).parameters)
        assert not any("spend" in p for p in params), f"{fn.__name__} accepts a spend input"

    payload = get_treatment_response(15).as_dict()
    assert not any("spend" in key for key in payload)


def test_response_model_computes_no_kpi():
    """The module answers what uplift a treatment is approved to produce. It
    does not calculate Trade Spend, Incremental Sales, ROI, margin or
    cannibalization -- aggregate.py owns every one of those."""
    payload = get_treatment_response(20).as_dict()
    for kpi in ("roi", "incremental", "margin", "cannibal", "pei", "trade_spend"):
        assert not any(kpi in key for key in payload)


# --- the relocation into config --------------------------------------------


def test_config_holds_the_approved_rules_unchanged():
    """The relocation from scripts/audit_roi_realism.py changed no value."""
    assert config.PROMOTION_COST_RATE == 0.03
    assert config.TREATMENT_RULES == {
        "PR001": (0.05, 0.15, 0.20),
        "PR002": (0.10, 0.25, 0.35),
        "PR003": (0.15, 0.40, 0.50),
        "PS001": (0.20, 0.55, 0.65),
        "PB001": (0.25, 0.60, 0.72),
    }


def test_the_audit_script_reads_the_same_source():
    """ONE source of truth: the script no longer keeps its own copy."""
    from pathlib import Path

    script = Path(__file__).resolve().parents[2] / "scripts" / "audit_roi_realism.py"
    text = script.read_text(encoding="utf-8")
    assert "TREATMENT_RULES = config.TREATMENT_RULES" in text
    assert "PROMOTION_COST_RATE = config.PROMOTION_COST_RATE" in text
    assert "breakeven_uplift = config.breakeven_uplift" in text
    # And no second literal copy of the rules survives in the script.
    assert '"PR001": (0.05, 0.15, 0.20)' not in text
    assert "(d + c) / (1 - c - 2 * d)" not in text, "the script kept its own copy of the formula"


def test_units_are_what_the_field_names_say():
    """`_pct` is a percentage; everything else is a fraction. Mixing the two
    silently is how a 0.25 becomes a 25 three modules downstream."""
    pr002 = get_treatment_response(10)
    assert pr002.discount_pct == 10.0  # percent
    assert config.TREATMENT_RULES["PR002"][0] == 0.10  # the same thing as a fraction
    assert 0 < pr002.uplift_low < 1 and 0 < pr002.uplift_high < 1
    assert 0 < pr002.breakeven_uplift < 1
