"""The promotion response model -- B2.1.

WHAT THIS IS. A lookup of the project's five APPROVED PROMOTION TREATMENT
RULES, each mapping a discount depth to the uplift BAND that discount is
approved to produce, plus the break-even uplift that band has to clear. The
rules and the algebra live in app/tpo/config.py; this module is the typed way
to read them.

WHAT THIS IS NOT, and every caller must repeat it. These rules are the design
parameters the project's dataset was generated under, verified to hold in the
live file -- the audit measures uplifts of 18.2 / 30.3 / 43.8 / 60.5 / 69.1
percent, each inside its own band. They are NOT an elasticity estimated from
observed variation, NOT a model fit, NOT an ML prediction, NOT an MMM estimate
and NOT a forecast. `PROVENANCE` travels on every response so that a UI cannot
present them as something they are not.

THREE THINGS THIS MODULE REFUSES TO DO
--------------------------------------
NO INTERPOLATION. Five discount points are approved: 5, 10, 15, 20 and 25
percent. 12% is not a shallower PR003 -- it is a treatment nobody approved, and
`get_treatment_response(12)` raises rather than inventing a band between two
that exist. Interpolating would be exactly the fixed-coefficient modelling
Phase A was built to remove, wearing an approved rule as a disguise.

NO MIDPOINT. The approved rule for PR003 is 40-50%, not 45%. The band is
carried whole. Collapsing it to a point would manufacture a precision the rule
does not grant, and would throw away the only honest uncertainty this model
has.

NO SPEND INPUT. In the approved economics Trade Spend is DERIVED --
`b(1+u)P(d+c)` -- so it is an output of a treatment, not a dial that can be
turned independently of one. Nothing in this module accepts a spend, and
nothing here should be given one.

Cannibalization is likewise absent: the approved rules define no
cannibalization response. The existing KPI engine can still MEASURE
cannibalization on synthesized scenario rows, and that engine remains the
source of that number -- it is engine-derived, never a response curve.

This module computes no KPI. It answers "what uplift is this treatment
approved to produce, and what must it clear to break even?" -- nothing else.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.tpo import config

#: Stated on every response. The wording is deliberate and load-bearing: see
#: the module docstring for what these rules are and are not.
PROVENANCE = "Approved TPO promotion treatment rule"

#: UNITS, because this module mixes two scales and silence about that is how
#: a 0.25 becomes a 25 somewhere downstream:
#:
#:   * `discount_pct` is a PERCENTAGE -- 10.0 means ten percent.
#:   * `uplift_*`, `breakeven_uplift` and `headroom_*` are FRACTIONS -- 0.35
#:     means thirty-five percent. Multiply by 100 for the "+8.1pp" the audit
#:     script prints.
#:
#: The suffix is the contract: `_pct` is percent, everything else is a
#: fraction.

#: Approved discount points as PERCENTAGES, in the order the rules are stated.
#: Built from config so a rule change cannot leave this list behind. Exact
#: float equality is safe here and deliberate: every d in TREATMENT_RULES
#: multiplies to an exact float at the percent scale (0.05 -> 5.0, ...), so no
#: rounding is applied to caller input either. A caller carrying float noise
#: gets a rejection, not a silent snap to the nearest approved point.
APPROVED_DISCOUNT_PCT: tuple[float, ...] = tuple(
    d * 100 for d, _, _ in config.TREATMENT_RULES.values()
)

#: discount percentage -> treatment key.
_BY_DISCOUNT_PCT: dict[float, str] = {
    d * 100: treatment for treatment, (d, _, __) in config.TREATMENT_RULES.items()
}


@dataclass(frozen=True)
class TreatmentResponse:
    """One approved treatment's response rule.

    Frozen: a response is a statement about an approved rule, and nothing
    downstream has any business editing one.
    """

    treatment: str
    #: Percent. 10.0 means ten percent.
    discount_pct: float
    #: Fractions. The BAND, carried whole -- there is no point estimate.
    uplift_low: float
    uplift_high: float
    #: Fraction. The uplift at which ROI is exactly zero, from
    #: `config.breakeven_uplift`.
    breakeven_uplift: float
    #: Fractions. How far each end of the approved band sits above break-even.
    #: Negative would mean an approved band that cannot pay for itself.
    headroom_low: float
    headroom_high: float
    promotion_cost_rate: float
    provenance: str

    @property
    def covers_breakeven(self) -> bool:
        """True when even the bottom of the approved band clears break-even."""
        return self.headroom_low > 0

    def as_dict(self) -> dict[str, Any]:
        """The nested form for transport. Same numbers, grouped."""
        return {
            "treatment": self.treatment,
            "discount_pct": self.discount_pct,
            "uplift": {"low": self.uplift_low, "high": self.uplift_high},
            "breakeven_uplift": self.breakeven_uplift,
            "headroom": {"low": self.headroom_low, "high": self.headroom_high},
            "promotion_cost_rate": self.promotion_cost_rate,
            "provenance": self.provenance,
        }


class UnapprovedDiscount(ValueError):
    """Raised for a discount depth no approved treatment defines.

    A distinct type so a caller can catch this specifically and offer the
    approved points, rather than pattern-matching on a message.
    """

    def __init__(self, discount_pct: float) -> None:
        approved = ", ".join(f"{d:g}%" for d in sorted(APPROVED_DISCOUNT_PCT))
        super().__init__(
            f"{discount_pct:g}% is not an approved promotion treatment. The approved "
            f"discount depths are {approved}. This model does not interpolate between "
            f"them: an unapproved depth has no approved uplift band, and inventing one "
            f"would be a coefficient, not a rule."
        )
        self.discount_pct = discount_pct


def get_treatment_response(discount_pct: float) -> TreatmentResponse:
    """The approved response rule for one discount depth.

    `discount_pct` is a PERCENTAGE: pass 10 for ten percent, not 0.10. Only the
    five approved depths are accepted; anything else raises
    `UnapprovedDiscount`. Nothing is rounded, snapped or interpolated on the
    way in.
    """
    key = float(discount_pct)
    treatment = _BY_DISCOUNT_PCT.get(key)
    if treatment is None:
        raise UnapprovedDiscount(key)
    return get_treatment(treatment)


def get_treatment(treatment: str) -> TreatmentResponse:
    """The approved response rule for one treatment key (PR001 ... PB001)."""
    rule = config.TREATMENT_RULES.get(treatment)
    if rule is None:
        approved = ", ".join(sorted(config.TREATMENT_RULES))
        raise ValueError(f"Unknown treatment {treatment!r}. Approved treatments: {approved}.")

    discount, uplift_low, uplift_high = rule
    cost_rate = config.PROMOTION_COST_RATE
    breakeven = config.breakeven_uplift(discount, cost_rate)

    return TreatmentResponse(
        treatment=treatment,
        discount_pct=discount * 100,
        uplift_low=uplift_low,
        uplift_high=uplift_high,
        breakeven_uplift=breakeven,
        headroom_low=uplift_low - breakeven,
        headroom_high=uplift_high - breakeven,
        promotion_cost_rate=cost_rate,
        provenance=PROVENANCE,
    )


def all_treatments() -> list[TreatmentResponse]:
    """Every approved treatment, in the order the rules are stated."""
    return [get_treatment(treatment) for treatment in config.TREATMENT_RULES]
