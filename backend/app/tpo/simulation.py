"""Simulation Studio -- Phase A: the measured scenario baseline.

ORCHESTRATION ONLY. Not one KPI is computed in this module. Every number it
returns comes out of app/tpo/aggregate.py by way of app/tpo/service.py -- the
same call the Command Center's cards make -- so a scenario baseline and the
Command Center cannot disagree about the same scope.

That matters most for ROI. There is exactly one Promotion ROI in this product,
`aggregate.roi_percent`:

    ROI % = (Incremental Sales - Trade Spend) / Trade Spend x 100

The Simulation Studio used to divide revenue by spend in the browser and call
the result "ROI" -- a different formula in different units, sitting next to a
Command Center reporting against a 50% target. It no longer computes anything.

WHAT PHASE A DELIBERATELY DOES NOT DO
-------------------------------------
The levers are accepted, validated, anchored on real measurements and echoed
back, and they MOVE NOTHING. There is no promotion-response model in this
project, so the only truthful answer to "what if the discount were 18%?" is
this scope's measured performance plus an explicit statement that the response
model has not been built. `levers.applied` is False in every response for that
reason and the frontend surfaces it. Manufacturing an uplift from a
coefficient is the thing this phase exists to remove.

Nothing here returns confidence, risk, target probability, sell-through, a
weekly series, an ROI trajectory or a recommendation. Every one of those was
mock data; none can be derived from the current datasets without the response
model, and a plausible-looking placeholder is worse than an absent number.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from statistics import median
from typing import Any, Sequence

from app.tpo import aggregate as A
from app.tpo import config
from app.tpo import formatting as F
from app.tpo import service
from app.tpo.filters import FilterState, baseline_rows_for, rows_for

#: The phase this service implements, carried in every response so a client
#: can never mistake a measured baseline for a modelled scenario.
PHASE = "A"

#: Shown by the UI wherever a lever is offered. One sentence, stated once.
LEVERS_NOT_MODELLED = (
    "Lever values are recorded but do not change these results. Scenario "
    "response modelling arrives in the next phase; until then every figure "
    "shown is this scope's measured performance."
)


# --- the KPI set -----------------------------------------------------------


@dataclass(frozen=True)
class SimulationKpi:
    """One output figure and where it is read from.

    `card_key` names the Command Center KPI card this figure IS -- not one
    computed the same way, the same call. Reading the label, formula text and
    unavailability reason from that card too means the Simulation Studio
    cannot describe a KPI differently from the way the Command Center
    describes it.
    """

    key: str  # the name this API returns
    card_key: str | None  # service.KPI_SPECS key, or None if it is not a card
    unit: str = ""
    label: str = ""
    formula: str = ""


#: The seven Phase A figures. `incremental_units` is the only one that is not
#: a Command Center card; it is read straight off the same engine function
#: `aggregate.calculate_kpis` uses for it (see `_incremental_units`).
SIMULATION_KPIS: tuple[SimulationKpi, ...] = (
    SimulationKpi("trade_spend", "trade_spend"),
    SimulationKpi(
        "incremental_units",
        None,
        unit="quantity",
        label="Incremental Units",
        formula="Sum over promoted rows of (Actual Quantity - baseline)",
    ),
    SimulationKpi("incremental_sales", "incremental_sales"),
    SimulationKpi("roi_percent", "promotion_roi"),
    SimulationKpi("margin_percent", "margin_impact"),
    SimulationKpi("cannibalization", "cannibalization_rate"),
    SimulationKpi("pei", "pei"),
)


def _display(value: float | None, unit: str, currency: str) -> str:
    """Formatting dispatch only -- app/tpo/formatting.py owns every rule."""
    if unit == "currency":
        return F.money(value, currency)
    if unit == "percent":
        return F.percent(value)
    if unit == "quantity":
        return F.quantity(value)
    return F.score(value)


def _incremental_units(state: FilterState) -> float | None:
    """Incremental Units for a selection, from the one engine function.

    Reproduces `aggregate.calculate_kpis`'s guard exactly and for its stated
    reason: an empty SELECTION means nothing was selected, full stop. The
    baseline-widened set can still hold rows under an Offer filter, and
    reporting an incremental off those would put a number against a population
    that is itself empty.
    """
    rows = rows_for(state)
    volume_rows = baseline_rows_for(state) if rows else ()
    return A.calculate_incremental_quantity(volume_rows)


def _kpis(state: FilterState, currency: str) -> dict[str, Any]:
    """The seven figures, read from the Command Center's own KPI payload.

    Deliberately `service.kpis` and not a fresh `aggregate.calculate_kpis`
    call: the scope rules that surround the engine -- the baseline-widened
    volume set, the Brand-Form widening cannibalization needs, the
    same-filters-previous-year comparison -- are decisions, and having them
    written down twice is how two screens start disagreeing. One call, one set
    of decisions.
    """
    payload = service.kpis(state, currency)
    cards = payload["kpis"]

    out: dict[str, Any] = {}
    for kpi in SIMULATION_KPIS:
        if kpi.card_key is not None:
            card = cards[kpi.card_key]
            out[kpi.key] = {
                "key": kpi.key,
                "label": card["label"],
                "unit": card["unit"],
                "value": card["value"],
                "display_value": card["display_value"],
                "available": card["available"],
                "unavailable_reason": card["unavailable_reason"],
                "formula": card["info"]["formula"],
            }
            continue

        value = _incremental_units(state)
        out[kpi.key] = {
            "key": kpi.key,
            "label": kpi.label,
            "unit": kpi.unit,
            "value": value,
            "display_value": _display(value, kpi.unit, currency),
            "available": value is not None,
            "unavailable_reason": None if value is not None else "No data in this selection.",
            "formula": kpi.formula,
        }

    return out


# --- scope measurements ----------------------------------------------------


@dataclass(frozen=True)
class ScopeMeasurement:
    """What the selected rows actually are, before any scenario is imagined."""

    row_count: int
    promoted_row_count: int
    promoted_weeks: int
    median_promotion_weeks: int
    average_discount_pct: float | None


def _measure(rows: Sequence[A.WeekRow]) -> ScopeMeasurement:
    """Descriptive statistics of the selection.

    NOT KPIs -- nothing here is a business metric and nothing here is used to
    compute one. They exist so that a lever can be anchored on something real
    instead of on a number somebody typed into a JSON file.

    Average discount depth is the share of gross revenue given away on
    promoted rows. `WeekRow` carries the two halves the loader already split:
    Base Revenue is `actual_revenue + discount_value` by construction.

    Two different week counts, because they answer different questions and
    confusing them puts a wrong number on a control. `promoted_weeks` is how
    many weeks of the scope contained ANY promotion -- 52 for a channel over a
    full year, which is a statement about the scope, not about a promotion.
    `median_promotion_weeks` is the typical span of ONE promotion in the scope,
    which is what a duration lever is actually about: the year-round PR001-003
    mechanics run for ~52 weeks and the seasonal offers for a handful, so the
    median is the honest single figure to anchor on.
    """
    promoted = A.promotion_rows(rows)
    gross = sum(r.actual_revenue + r.discount_value for r in promoted)
    given_away = sum(r.discount_value for r in promoted)
    depth = A.safe_divide(given_away, gross)

    weeks_per_promotion: dict[str, set[str]] = defaultdict(set)
    for row in promoted:
        weeks_per_promotion[row.promotion_id].add(row.week_key)
    spans = sorted(len(weeks) for weeks in weeks_per_promotion.values())

    return ScopeMeasurement(
        row_count=len(rows),
        promoted_row_count=len(promoted),
        promoted_weeks=len({r.week_key for r in promoted}),
        median_promotion_weeks=int(median(spans)) if spans else 0,
        average_discount_pct=None if depth is None else round(depth * 100, 1),
    )


# --- levers ----------------------------------------------------------------
#
# THE RANGE RULE, stated once. A slider needs endpoints, and inventing them is
# how "Trade Spend (Cr) 40-150" ends up sitting next to a measured Trade Spend
# of 712. So every Phase A lever is anchored on a MEASURED value for the
# selected scope and offered over half to one-and-a-half times it. That is a
# CONTROL range -- how far the handle travels -- and NOT a claim about what is
# safe, supported by the data, or achievable. Each lever carries a `basis`
# string naming the measurement it was anchored on, and the UI shows it.
# Phase B replaces this rule with bounds the response model can defend.

#: Lever key -> (label, unit, decimals, step). Retailer Incentive and Inventory
#: Allocation are absent on purpose: no field in any of the five datasets
#: splits retailer support out of Promotion_Cost, and the project holds no
#: inventory data at all. A lever with nothing behind it is not offered.
_LEVER_META: dict[str, tuple[str, str, int, float]] = {
    "discount_pct": ("Discount Depth", "percent", 1, 0.5),
    "duration_weeks": ("Promotion Duration", "weeks", 0, 1),
    "spend_amount": ("Trade Spend", "currency", 1, 1),
}

LEVER_KEYS: tuple[str, ...] = tuple(_LEVER_META)


def _lever(key: str, anchor: float | None, basis: str, currency: str) -> dict[str, Any]:
    """One lever definition. An unanchorable lever is returned unavailable
    with the reason, never with a plausible default."""
    label, unit, decimals, step = _LEVER_META[key]
    if anchor is None:
        return {
            "key": key,
            "label": label,
            "unit": unit,
            "available": False,
            "unavailable_reason": basis,
            "value": None,
            "display_value": None,
            "min": None,
            "max": None,
            "step": step,
            "decimals": decimals,
            "basis": None,
        }

    low = round(anchor * 0.5, decimals)
    high = round(anchor * 1.5, decimals)
    if unit == "weeks":
        low, high = max(1, int(low)), max(2, int(high))
    if unit == "currency":
        # A rupee-granular handle across a range of hundreds of millions is not
        # a control. One hundred positions across whatever range was offered.
        step = max(1.0, round((high - low) / 100))
    return {
        "key": key,
        "label": label,
        "unit": unit,
        "available": True,
        "unavailable_reason": None,
        "value": round(anchor, decimals),
        "display_value": _display(anchor, unit, currency),
        "min": low,
        "max": high,
        "step": step,
        "decimals": decimals,
        "basis": basis,
    }


_NO_PROMOTIONS = (
    "Nothing in this selection was promoted, so there is no measured value to "
    "anchor this lever on."
)


def _levers(
    measurement: ScopeMeasurement,
    trade_spend: float | None,
    submitted: dict[str, float | None] | None,
    currency: str,
) -> dict[str, Any]:
    """The lever block: what was submitted, and what the controls should offer.

    `applied` is a field rather than a comment because a client must be able to
    tell a measured baseline from a modelled scenario without reading this
    docstring.
    """
    discount = measurement.average_discount_pct
    weeks = measurement.median_promotion_weeks
    definitions = [
        _lever(
            "discount_pct",
            discount,
            f"Measured average discount depth for this scope: {F.percent(discount)}"
            if discount is not None
            else _NO_PROMOTIONS,
            currency,
        ),
        _lever(
            "duration_weeks",
            float(weeks) if weeks else None,
            f"Median weeks per promotion in this scope: {weeks}" if weeks else _NO_PROMOTIONS,
            currency,
        ),
        _lever(
            "spend_amount",
            trade_spend,
            f"Measured Trade Spend for this scope: {F.money(trade_spend, currency)}"
            if trade_spend is not None
            else "No Trade Spend in this selection to anchor this lever on.",
            currency,
        ),
    ]
    return {
        "submitted": submitted,
        "applied": False,
        "note": LEVERS_NOT_MODELLED,
        "definitions": definitions,
    }


# --- the endpoint payload --------------------------------------------------


def run(
    state: FilterState,
    levers: dict[str, float | None] | None = None,
    scenario_name: str | None = None,
    currency: str = "INR",
) -> dict[str, Any]:
    """The measured baseline for one scope, plus the levers that were offered.

    Called by POST /api/simulation/run. Returns None -- never a fabricated
    zero -- for any KPI the selection cannot support, exactly as the Command
    Center does, and says why in `unavailable_reason`.
    """
    currency = F.normalise_currency(currency)
    rows = rows_for(state)
    measurement = _measure(rows)
    kpis = _kpis(state, currency)

    return {
        "scenario": {
            "name": scenario_name or "Measured Baseline",
            #: Not an id. Phase A persists nothing, and handing out something
            #: that looked like a stable key would invite a client to store it.
            "source": "measured",
            "phase": PHASE,
            "modelled": False,
        },
        "scope": {
            "period": F.period_label(state.year, state.month),
            "period_label": F.fiscal_label(state.year),
            "filters_applied": state.applied(),
            "row_count": measurement.row_count,
            "promoted_row_count": measurement.promoted_row_count,
            "promoted_weeks": measurement.promoted_weeks,
            "median_promotion_weeks": measurement.median_promotion_weeks,
            "has_data": measurement.row_count > 0,
        },
        "levers": _levers(measurement, kpis["trade_spend"]["value"], levers, currency),
        "kpis": kpis,
        "meta": {
            "currency": currency,
            "base_currency": config.BASE_CURRENCY,
            "exchange_rate": F._rate(currency),
            "target_roi_pct": config.PROMOTION_TARGET_ROI_PCT,
            "phase": PHASE,
        },
    }
