"""The Command Center service — every payload the UI reads, one filter state.

Nothing in here computes a KPI. Every number comes from app/tpo/aggregate.py,
so the cards, the trend chart, the alerts and the two tables cannot disagree.
ROI in particular is only ever `aggregate.roi_percent`, whether it is being
computed for the whole selection or for one promotion event.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Sequence

from app.tpo import aggregate as A
from app.tpo import config, formatting as F
from app.tpo.filters import FilterState, baseline_rows_for, options_for, rows_for
from app.tpo.loader import MONTHS, get_store

# --- KPI card definitions --------------------------------------------------


@dataclass(frozen=True)
class KpiSpec:
    """One card: what it is called, how it is rendered, and what the ⓘ says.

    The formula text lives here, beside the code that reads the engine, so the
    tooltip cannot drift from the arithmetic it describes.
    """

    key: str
    label: str
    unit: str  # currency | percent | score
    formula: str
    meaning: str
    #: True when a lower value is the better outcome, so the delta arrow's
    #: colour can be right without the frontend knowing the semantics.
    lower_is_better: bool = False


KPI_SPECS: tuple[KpiSpec, ...] = (
    KpiSpec(
        key="trade_spend",
        label="Trade Spend",
        unit="currency",
        formula="Base Revenue − Actual Revenue + Promotion Cost",
        meaning=(
            "Total investment behind the promotion — the discount given away plus "
            "the promotion expenditure booked against it."
        ),
        lower_is_better=True,
    ),
    KpiSpec(
        key="incremental_sales",
        label="Incremental Sales",
        unit="currency",
        formula="Σ over promoted rows of (Actual Quantity − baseline) × Actual Price",
        meaning=(
            "Revenue the promotion added above the product's ordinary trading level, "
            "with every row valued at its own actual price."
        ),
    ),
    KpiSpec(
        key="promotion_roi",
        label="Promotion ROI",
        unit="percent",
        formula="(Incremental Sales − Trade Spend) ÷ Trade Spend × 100",
        meaning=(
            f"Return earned on every rupee invested. The target is "
            f"{config.PROMOTION_TARGET_ROI_PCT:.0f}%."
        ),
    ),
    KpiSpec(
        key="margin_impact",
        label="Margin Impact",
        unit="percent",
        formula="Σ(Actual Revenue − Total Cost) ÷ Σ(Actual Revenue) × 100",
        meaning=(
            "Gross margin retained across the selected period — one ratio of summed "
            "revenue and cost, not an average of per-row margins."
        ),
    ),
    KpiSpec(
        key="pei",
        label="Promotion Efficiency Index",
        unit="score",
        formula="0.40 × ROI + 0.30 × Incremental Qty % + 0.30 × Margin Impact",
        meaning=(
            "A 0–100 composite of the three KPIs above. If a component cannot be "
            "computed its weight is redistributed across the rest."
        ),
    ),
    KpiSpec(
        key="cannibalization_rate",
        label="Cannibalization Rate",
        unit="percent",
        formula="Total Cannibalized Quantity ÷ Promotional Incremental Quantity × 100",
        meaning=(
            "Share of a promotion's uplift taken from neighbouring pack sizes in the "
            "same Brand Form. Shown as — when the selection cannot support it."
        ),
        lower_is_better=True,
    ),
)

#: KPI key -> the KpiBundle attribute holding it.
_BUNDLE_FIELD = {
    "trade_spend": "trade_spend",
    "incremental_sales": "incremental_sales",
    "promotion_roi": "roi",
    "margin_impact": "margin_impact",
    "pei": "pei",
    "cannibalization_rate": "cannibalization",
}


# --- helpers ---------------------------------------------------------------


def _bundle(state: FilterState) -> tuple[A.KpiBundle, str | None]:
    """The KPI bundle for a selection, with its comparison period label.

    The comparison uses the SAME dimensional filters over the previous year —
    never unfiltered history. When no earlier year is loaded there is no
    comparison, and every delta resolves to undefined rather than to zero.
    """
    store = get_store()
    rows = rows_for(state)
    volume_rows = baseline_rows_for(state)
    previous_state = state.comparison(store)
    previous_rows = rows_for(previous_state) if previous_state else ()
    previous_volume = baseline_rows_for(previous_state) if previous_state else ()

    widened = state.widened_to_brand_form()
    family_rows = baseline_rows_for(widened) if widened != state else ()
    previous_family = ()
    if previous_state is not None and widened != state:
        previous_family = baseline_rows_for(previous_state.widened_to_brand_form())

    bundle = A.calculate_kpis(
        rows,
        previous_rows,
        family_rows=family_rows,
        previous_family_rows=previous_family,
        promoted_products=frozenset(state.product) if state.product else None,
        volume_rows=volume_rows,
        previous_volume_rows=previous_volume,
    )
    label = F.fiscal_label(previous_state.year) if previous_state else None
    return bundle, label


def offer_label(promotion) -> str:
    """The name to show for an offer — see `Promotion.label`, the one source
    the filter options read too."""
    return promotion.label if promotion is not None else ""


def _display(value: float | None, unit: str, currency: str) -> str:
    if unit == "currency":
        return F.money(value, currency)
    if unit == "percent":
        return F.percent(value)
    return F.score(value)


def _meta(state: FilterState, rows: Sequence[A.WeekRow], currency: str, comparison: str | None) -> dict[str, Any]:
    return {
        "period": F.period_label(state.year, state.month),
        "period_label": F.fiscal_label(state.year),
        "comparison_period": comparison,
        "currency": currency,
        "base_currency": config.BASE_CURRENCY,
        "exchange_rate": F._rate(currency),
        "target_roi_pct": config.PROMOTION_TARGET_ROI_PCT,
        "row_count": len(rows),
        "filters_applied": state.applied(),
    }


# --- KPI cards -------------------------------------------------------------


def kpis(state: FilterState, currency: str = "INR") -> dict[str, Any]:
    """The six KPI cards.

    `value` is always the canonical base-currency number; `display_value` is
    what the card shows, converted only if the KPI is monetary. ROI, PEI and
    Cannibalization carry the same `value` in both currencies by construction.
    """
    currency = F.normalise_currency(currency)
    bundle, comparison = _bundle(state)
    rows = rows_for(state)

    cards: dict[str, Any] = {}
    for spec in KPI_SPECS:
        metric: A.KpiMetric = getattr(bundle, _BUNDLE_FIELD[spec.key])
        delta_display, delta_sub = F.delta_label(metric.growth, comparison)
        cards[spec.key] = {
            "key": spec.key,
            "label": spec.label,
            "unit": spec.unit,
            "value": metric.value,
            "display_value": _display(metric.value, spec.unit, currency),
            "previous_value": metric.previous_year,
            "delta": metric.growth,
            "delta_display": delta_display,
            "delta_sub": delta_sub,
            "difference": metric.difference,
            "trend": _trend_of(metric.growth, spec.lower_is_better),
            "available": metric.value is not None,
            "unavailable_reason": None if metric.value is not None else _why_unavailable(spec.key, bundle),
            "info": {"name": spec.label, "formula": spec.formula, "meaning": spec.meaning},
        }

    return {"kpis": cards, "meta": _meta(state, rows, currency, comparison)}


def _trend_of(growth: float | None, lower_is_better: bool) -> str | None:
    """"up"/"down" as a DIRECTION, plus whether that direction is good.

    The card colours the arrow by `trend`; a rising Trade Spend is a rise, not
    an improvement, which is why `lower_is_better` travels with it.
    """
    if growth is None:
        return None
    return "up" if growth > 0 else "down"


def _why_unavailable(key: str, bundle: A.KpiBundle) -> str:
    if key == "cannibalization_rate":
        excluded = bundle.debug.get("excluded_events", 0)
        return (
            "No comparable promotion event in this selection — every candidate was "
            f"excluded ({excluded} checked). Cannibalization needs a promoted pack "
            "with an un-promoted neighbour in the same Brand Form and week."
        )
    if key == "pei":
        return "Nothing in this selection was promoted, so there is no promotion efficiency to index."
    return "No data in this selection."


# --- promotion events ------------------------------------------------------


@dataclass(frozen=True)
class PromotionEvent:
    """One promotion event: Year + Week + Product + Promotion.

    This is the grain risk alerts and the underperforming table report at.
    Different Promotion_Ids are never merged — a week running both a 5% and a
    10% offer is two events, and combining them would report a promotion that
    never ran.
    """

    key: str
    year: int
    week_key: str
    product_id: str
    product_name: str
    brand_form: str
    channel_id: str
    channel_name: str
    promotion_id: str
    promotion_name: str
    promotion_type: str
    trade_spend: float
    incremental_sales: float
    roi_pct: float | None
    at_stake: float

    @property
    def label(self) -> str:
        return f"{self.promotion_name} · {self.product_name.strip()} ({self.week_key})"


def promotion_events(state: FilterState) -> list[PromotionEvent]:
    """Every promotion event in the selection, priced by the shared engine.

    Trade Spend and Incremental Sales per event come from `period_series`,
    which holds the selection-wide baseline fixed — so the events sum exactly
    to the headline cards rather than forming a second, disagreeing total.
    """
    store = get_store()
    rows = baseline_rows_for(state)

    def key_of(r: A.WeekRow) -> str:
        return f"{r.product_id}|{r.channel_id}|{r.week_key}|{r.promotion_id}"

    points = {p.period_key: p for p in A.period_series(rows, key_of)}

    # The dimension labels for each event key, taken from the rows themselves.
    labels: dict[str, A.WeekRow] = {}
    for r in rows:
        if r.is_promoted:
            labels.setdefault(key_of(r), r)

    events: list[PromotionEvent] = []
    for key, row in labels.items():
        point = points.get(key)
        if point is None:
            continue
        spend = point.trade_spend
        sales = point.incremental_sales
        roi = A.roi_percent(sales, spend)
        product = store.dims.products.get(row.product_id)
        channel = store.dims.channels.get(row.channel_id)
        promotion = store.dims.promotions.get(row.promotion_id)
        events.append(PromotionEvent(
            key=key,
            year=int(row.year),
            week_key=row.week_key,
            product_id=row.product_id,
            product_name=product.name if product else row.product_id,
            brand_form=row.brand_form,
            channel_id=row.channel_id,
            channel_name=channel.name if channel else row.channel_id,
            promotion_id=row.promotion_id,
            promotion_name=offer_label(promotion) or row.promotion_id,
            promotion_type=promotion.type if promotion else "",
            trade_spend=spend,
            incremental_sales=sales,
            roi_pct=roi,
            # At Stake: the additional incremental revenue this event needs to
            # reach the ROI target. Never negative — an event already at target
            # has nothing at stake.
            at_stake=round(max(config.target_incremental_sales(spend) - sales, 0.0), 2),
        ))
    return events


def _rank_key(event: PromotionEvent) -> tuple:
    """At Stake DESC, then Trade Spend DESC, then ROI ASC.

    At Stake leads deliberately: it is the business-priority metric — the money
    needed to reach target. Ranking by most-negative ROI first would put a tiny
    promotion with a catastrophic percentage above a large one quietly losing
    far more money.
    """
    return (-event.at_stake, -event.trade_spend, event.roi_pct if event.roi_pct is not None else 0.0)


def _severity(roi_pct: float | None) -> str | None:
    """The severity band for an event's ROI. None once the target is met."""
    if roi_pct is None:
        return None
    bands = config.SEVERITY_BANDS
    if roi_pct < bands["critical"]:
        return "critical"
    if roi_pct < bands["high"]:
        return "high"
    if roi_pct < bands["medium"]:
        return "medium"
    return None


# --- risk alerts -----------------------------------------------------------

_SEVERITY_TONE = {"critical": "danger", "high": "danger", "medium": "warning"}
_SEVERITY_LABEL = {"critical": "Critical", "high": "High", "medium": "Medium"}


def risk_alerts(state: FilterState, currency: str = "INR", limit: int = 20) -> dict[str, Any]:
    """Promotion events below the ROI target, banded and ranked.

    Counts are of unique promotion EVENTS, and every ROI here is the same
    `roi_percent` the KPI card uses.
    """
    currency = F.normalise_currency(currency)
    events = promotion_events(state)

    banded: dict[str, list[PromotionEvent]] = defaultdict(list)
    for event in events:
        severity = _severity(event.roi_pct)
        if severity and event.trade_spend > 0:
            banded[severity].append(event)

    on_target = sum(
        1 for e in events
        if e.roi_pct is not None and e.roi_pct >= config.PROMOTION_TARGET_ROI_PCT
    )

    alerts: list[dict[str, Any]] = []
    for severity in ("critical", "high", "medium"):
        for event in sorted(banded[severity], key=_rank_key):
            alerts.append({
                "id": event.key,
                "severity": _SEVERITY_LABEL[severity],
                "tone": _SEVERITY_TONE[severity],
                "title": f"ROI below target — {event.promotion_name}",
                "description": (
                    f"{event.product_name.strip()} · {event.channel_name} · {event.week_key}: "
                    f"ROI {event.roi_pct:.1f}% against a {config.PROMOTION_TARGET_ROI_PCT:.0f}% target."
                ),
                "roi_pct": event.roi_pct,
                "trade_spend": event.trade_spend,
                "trade_spend_display": F.money(event.trade_spend, currency),
                "incremental_sales": event.incremental_sales,
                "at_stake": event.at_stake,
                "at_stake_display": F.money(event.at_stake, currency),
                "channel": event.channel_name,
                "product": event.product_name.strip(),
                "week": event.week_key,
                # The event's own dimension codes, for the same reason the
                # underperforming rows carry them: a drill-down narrows BY
                # IDENTITY instead of handing over the whole selection. The
                # names beside them stay display-only and are never converted.
                #
                # `week` is NOT among them, and cannot be. An event's
                # Incremental Sales is measured against the non-promoted rows
                # of the SELECTION -- `promotion_events` holds that
                # selection-wide baseline fixed on purpose -- and a scope
                # narrowed to the promoted week contains no such row, so the
                # counterfactual disappears and the ROI collapses to -100%.
                # The week identifies the event; it cannot scope it.
                "promotion_id": event.promotion_id,
                "product_id": event.product_id,
                "channel_id": event.channel_id,
            })

    return {
        "counts": {
            "critical": len(banded["critical"]),
            "high": len(banded["high"]),
            "medium": len(banded["medium"]),
            "target_achieved": on_target,
            "total_events": len(events),
        },
        "alerts": alerts[:limit],
        "meta": _meta(state, rows_for(state), currency, None),
    }


# --- underperforming promotions --------------------------------------------

_CAUSES = (
    # (predicate, cause, action) — evaluated in order, first match wins. These
    # read only numbers the engine already produced; nothing is invented.
    (lambda e, m: e.incremental_sales <= 0,
     "No measurable uplift over baseline",
     "Review whether the offer reached the shelf"),
    (lambda e, m: m > 25,
     "High cannibalization within the Brand Form",
     "Shift the offer to a non-adjacent pack size"),
    (lambda e, m: e.trade_spend > 0 and e.incremental_sales / e.trade_spend < 1,
     "Trade spend exceeds the revenue it returned",
     "Reduce discount depth or promotion cost"),
    (lambda e, m: True,
     "Uplift below the level the spend requires",
     "Re-test at a shallower discount"),
)


def underperforming_promotions(
    state: FilterState, currency: str = "INR", limit: int = 20
) -> dict[str, Any]:
    """Promotion events with ROI below target, sorted by At Stake DESC.

    Uses the same shared ROI and the same event grain as the risk alerts —
    the two panels are two views of one computation.
    """
    currency = F.normalise_currency(currency)
    events = promotion_events(state)
    bundle, _ = _bundle(state)
    by_brand = bundle.debug.get("brand_form_cannibalization", {}) or {}

    under = [
        e for e in events
        if e.roi_pct is not None and e.roi_pct < config.PROMOTION_TARGET_ROI_PCT
    ]

    rows: list[dict[str, Any]] = []
    for event in sorted(under, key=_rank_key)[:limit]:
        cannib = by_brand.get(event.brand_form, 0.0)
        cause, action = next(
            (c, a) for predicate, c, a in _CAUSES if predicate(event, cannib)
        )
        rows.append({
            # THE EVENT'S OWN DIMENSION CODES, carried so a drill-down can
            # narrow BY IDENTITY. They are not derived here and nothing is
            # guessed: `PromotionEvent` was built from the WeekRows themselves,
            # so these are the same codes the row was selected by. Without them
            # a click on this table could only hand over the user's existing
            # selection, and the Simulation Studio would answer for the whole
            # promotion while the row on screen described one SKU in one
            # channel in one week.
            #
            # THE WEEK IS STILL NOT NARROWABLE. FilterState has `year` and
            # `month` and no week, so a hand-off reaches this event's
            # (promotion, product, channel) and pools whatever weeks that pair
            # traded in scope. Exact for a single-week event; a pooled figure
            # otherwise, which is a real number for a real scope rather than a
            # week invented out of a month.
            "promotion": event.promotion_name,
            "promotion_id": event.promotion_id,
            "product": event.product_name.strip(),
            "product_id": event.product_id,
            "channel": event.channel_name,
            "channel_id": event.channel_id,
            "period": event.week_key,
            "roi_pct": event.roi_pct,
            "roi_display": F.percent(event.roi_pct),
            "vs_target_pp": round(event.roi_pct - config.PROMOTION_TARGET_ROI_PCT, 1),
            "trade_spend": event.trade_spend,
            "trade_spend_display": F.money(event.trade_spend, currency),
            "at_stake": event.at_stake,
            "at_stake_display": F.money(event.at_stake, currency),
            "primary_cause": cause,
            "action": action,
            "status": "Underperforming",
        })

    return {
        "rows": rows,
        "total": len(under),
        "meta": _meta(state, rows_for(state), currency, None),
    }


def top_promotions(state: FilterState, currency: str = "INR", limit: int = 10) -> dict[str, Any]:
    """The best-performing promotion events, by ROI descending."""
    currency = F.normalise_currency(currency)
    events = [e for e in promotion_events(state) if e.roi_pct is not None]
    ranked = sorted(events, key=lambda e: -(e.roi_pct or 0))[:limit]
    return {
        "rows": [
            {
                "promotion": e.promotion_name,
                "product": e.product_name.strip(),
                "channel": e.channel_name,
                "period": e.week_key,
                "roi_pct": e.roi_pct,
                "roi_display": F.percent(e.roi_pct),
                "vs_target_pp": round(e.roi_pct - config.PROMOTION_TARGET_ROI_PCT, 1),
                "trade_spend": e.trade_spend,
                "trade_spend_display": F.money(e.trade_spend, currency),
                "incremental_sales": e.incremental_sales,
                "incremental_sales_display": F.money(e.incremental_sales, currency),
                "status": "On Track" if e.roi_pct >= config.PROMOTION_TARGET_ROI_PCT else "Underperforming",
            }
            for e in ranked
        ],
        "meta": _meta(state, rows_for(state), currency, None),
    }


# --- promotion mix ---------------------------------------------------------

_MIX_COLORS = ("#7C5CFF", "#4F7CFF", "#14B8A6", "#F59E0B", "#EF4444", "#9CA3AF")


def promotion_mix(state: FilterState, currency: str = "INR") -> dict[str, Any]:
    """Trade Spend share by offer, read off dim_promotion.

    Grouped on the promotion's own name — never reverse-engineered from a
    realised price, which would invent buckets the promotion calendar never
    ran. Only offers actually present in the selection are returned.
    """
    currency = F.normalise_currency(currency)
    store = get_store()
    rows = rows_for(state)

    spend: dict[str, float] = defaultdict(float)
    for r in rows:
        if r.is_promoted:
            spend[r.promotion_id] += r.discount_value + r.promotion_cost

    total = sum(spend.values())
    slices = []
    for index, (promotion_id, value) in enumerate(
        sorted(spend.items(), key=lambda kv: -kv[1])
    ):
        promotion = store.dims.promotions.get(promotion_id)
        slices.append({
            "code": promotion_id,
            "label": offer_label(promotion) or promotion_id,
            "type": promotion.type if promotion else "",
            "spend": round(value, 2),
            "spend_display": F.money(value, currency),
            "pct": round(value / total * 100, 1) if total else 0.0,
            "color": _MIX_COLORS[index % len(_MIX_COLORS)],
        })

    return {
        "slices": slices,
        "total_spend": round(total, 2),
        "total_spend_display": F.money(total, currency),
        "meta": _meta(state, rows, currency, None),
    }


# --- trend -----------------------------------------------------------------


def trend(state: FilterState, granularity: str = "week", currency: str = "INR") -> dict[str, Any]:
    """Trade Spend, Incremental Sales and ROI over time.

    The series are a finer PARTITION of the same rows the cards read — Trade
    Spend and Incremental Sales sum back to the headline figures exactly — and
    each point's ROI goes through the same `roi_percent`.
    """
    currency = F.normalise_currency(currency)
    # The baseline-widened set: its incremental figures sum to the card, and
    # the non-promoted rows add exactly zero to Trade Spend.
    rows = baseline_rows_for(state)
    monthly = granularity == "month"

    def key_of(r: A.WeekRow) -> str:
        return f"{r.year}-{r.month:02d}" if monthly else r.week_key

    points = A.period_series(rows, key_of)
    target = config.PROMOTION_TARGET_ROI_PCT

    labels, roi, incremental, spend = [], [], [], []
    for point in points:
        labels.append(_period_label(point.period_key, monthly))
        roi.append(A.roi_percent(point.incremental_sales, point.trade_spend))
        incremental.append(round(point.incremental_sales, 2))
        spend.append(round(point.trade_spend, 2))

    return {
        "granularity": "month" if monthly else "week",
        "labels": labels,
        "series": {
            "roi": roi,
            "incremental_sales": incremental,
            "trade_spend": spend,
            "target_roi": [target] * len(labels),
        },
        "display": {
            "incremental_sales": [F.money(v, currency) for v in incremental],
            "trade_spend": [F.money(v, currency) for v in spend],
            "roi": [F.percent(v) for v in roi],
        },
        "meta": _meta(state, rows, currency, None),
    }


def _period_label(period_key: str, monthly: bool) -> str:
    """"2025-03" -> "Mar F25"; "2025-W07" -> "W07 F25"."""
    year, part = period_key.split("-", 1)
    fiscal = F.fiscal_label(int(year))
    if monthly:
        return f"{MONTHS[int(part) - 1][:3]} {fiscal}"
    return f"{part} {fiscal}"


# --- filters ---------------------------------------------------------------


def filters(state: FilterState) -> dict[str, Any]:
    """Dependent filter options for the current selection, plus the labels the
    period control shows (F24 / F25)."""
    options = options_for(state)
    options["year_labels"] = {str(y): F.fiscal_label(y) for y in options["years"]}
    options["currencies"] = list(config.SUPPORTED_CURRENCIES)
    options["selected"] = state.applied()
    return options


# --- breakdown -------------------------------------------------------------
#
# ONE endpoint behind every ranking and scatter chart. It does not contain a
# single line of KPI arithmetic: for each group it narrows the SAME FilterState
# by one more constraint and calls the frozen functions in aggregate.py. If a
# formula ever changes there, these charts move with it automatically.

#: Dimensions a breakdown can group by -> where its option list lives and how a
#: group value is labelled for display.
BREAKDOWN_DIMENSIONS: dict[str, str] = {
    "channel": "channels",
    "retailer": "retailers",
    "product": "products",
    "category": "categories",
    "brand": "brands",
    "promotion": "offers",
    # The MECHANIC: dim_promotion.Promotion_Name ("5% Discount", "20%
    # Discount", "Buy3Get1"), as opposed to "promotion", which is the
    # individual offer. Deliberately absent from every option list because it
    # is NOT unique per promotion — six seasonal offers share one mechanic —
    # so `breakdown` derives its group values from the offers in scope rather
    # than reading this key. Whitelist entry only: no new arithmetic, and every
    # KPI is still produced by app/tpo/aggregate.py unchanged.
    "promotion_mechanic": "offers",
    "promotion_type": "promotion_types",
    # Distributor lives on the store, so it takes the same generic re-filter
    # path as region/state/city. Whitelist entry only — no new arithmetic, and
    # every KPI below is still produced by app/tpo/aggregate.py unchanged.
    "distributor": "distributors",
    "region": "regions",
    "state": "states",
    "city": "cities",
}

#: What a breakdown may be ranked by. Incremental Sales is the default
#: everywhere: ranking by raw ROI surfaces trivia, because a promotion with
#: Rs 17k of trade spend can post 1,398% and outrank one carrying real money.
BREAKDOWN_METRICS = ("incremental_sales", "trade_spend", "incremental_units", "roi")


def _group_label(store, dimension: str, code: str) -> str:
    """The display name for one group value."""
    if dimension == "channel":
        channel = store.dims.channels.get(code)
        return channel.name if channel else code
    if dimension == "product":
        product = store.dims.products.get(code)
        return product.name.strip() if product else code
    if dimension == "promotion":
        promotion = store.dims.promotions.get(code)
        # Promotion_Description via Promotion.label — the one shared source.
        # Never deduplicated by Promotion_Name.
        return offer_label(promotion) or code
    if dimension == "promotion_mechanic":
        # The code IS Promotion_Name. Qualify it with the Promotion_Type every
        # promotion carrying that mechanic shares, so "20% Discount" reads as
        # the seasonal mechanic it is. Qualified only when the type is
        # unambiguous; a mechanic spanning two types keeps its bare name rather
        # than claiming one of them.
        types = {
            promotion.type
            for promotion in store.dims.promotions.values()
            if promotion.name.strip() == code and promotion.type
        }
        return f"{code} ({types.pop()})" if len(types) == 1 else code
    return code



#: Dimensions carried on the WeekRow itself, so a breakdown can partition one
#: already-filtered row set instead of re-running the filter per group.
#:
#: This is an optimisation, not a different calculation. The KPI grain is
#: (product, channel, week, offer), so filtering to one channel yields exactly
#: the WeekRows whose channel_id is that channel — no other group's rows can
#: merge into them. Partitioning therefore hands the frozen engine byte-identical
#: input to what a re-filter would, and `tests/test_breakdown.py` asserts the two
#: paths agree for every supported dimension.
#:
#: Retailer/region/state/city are NOT here: stores are pooled when WeekRows are
#: built, so their values are no longer recoverable from a row and a real filter
#: pass is required.
_WEEKROW_DIMENSIONS = (
    "channel", "product", "promotion", "promotion_mechanic", "promotion_type", "brand", "category",
)


def _partition(
    rows: Sequence[A.WeekRow], volume: Sequence[A.WeekRow], by: str, store
) -> dict[str, tuple[tuple[A.WeekRow, ...], tuple[A.WeekRow, ...]]]:
    """One filtered row set -> per-group (selection rows, volume rows).

    The volume set needs care for offer dimensions. `baseline_rows_for` keeps
    the non-promoted rows an uplift is measured against, so each offer's volume
    partition is ITS promoted rows plus EVERY non-promoted row — exactly what
    filtering to that offer would have produced.
    """
    def key_of(row: A.WeekRow) -> str | None:
        if by == "channel":
            return row.channel_id
        if by == "product":
            return row.product_id
        if by == "brand":
            return row.brand_form
        if by == "category":
            product = store.dims.products.get(row.product_id)
            return product.category if product else None
        if by == "promotion":
            return row.promotion_id if row.is_promoted else None
        if by == "promotion_mechanic":
            promotion = store.dims.promotions.get(row.promotion_id)
            return promotion.name.strip() if promotion and row.is_promoted else None
        if by == "promotion_type":
            promotion = store.dims.promotions.get(row.promotion_id)
            return promotion.type if promotion and row.is_promoted else None
        return None

    offer_dimension = by in ("promotion", "promotion_mechanic", "promotion_type")
    selection: dict[str, list[A.WeekRow]] = defaultdict(list)
    volumes: dict[str, list[A.WeekRow]] = defaultdict(list)
    baseline_rows = [r for r in volume if not r.is_promoted] if offer_dimension else []

    for row in rows:
        key = key_of(row)
        if key is not None:
            selection[key].append(row)
    for row in volume:
        key = key_of(row)
        if key is not None:
            volumes[key].append(row)

    return {
        key: (tuple(selection.get(key, ())), tuple(volumes.get(key, ())) + tuple(baseline_rows))
        for key in set(selection) | set(volumes)
    }


def breakdown(
    state: FilterState,
    by: str,
    currency: str = "INR",
    metric: str = "incremental_sales",
    limit: int = 10,
) -> dict[str, Any]:
    """Every KPI, computed per value of one dimension, ranked and truncated.

    For each group: take the user's FilterState, add that one constraint, and
    run the frozen engine over the resulting rows. The group list comes from
    `options_for`, so a value is only ever computed if it actually returns rows.

    ADDITIVITY. Trade Spend is a plain row sum and its groups add back to the
    headline exactly. Incremental Sales does NOT reliably add up: the baseline
    is re-derived per selection, which is why a year is not the sum of its
    months (-17.6% on this data). `share_pct` is therefore computed on Trade
    Spend only, and the caller must render a ranking, never a composition.
    """
    if by not in BREAKDOWN_DIMENSIONS:
        raise ValueError(f"Unsupported breakdown dimension: {by!r}")
    if metric not in BREAKDOWN_METRICS:
        raise ValueError(f"Unsupported breakdown metric: {metric!r}")

    currency = F.normalise_currency(currency)
    store = get_store()

    mechanic_members: dict[str, list[str]] = {}
    if by == "promotion_mechanic":
        # Derived from the offers the CURRENT scope holds, so the mechanic list
        # narrows with the filters exactly as every other dimension does. Order
        # is first-seen; `groups.sort` below decides the ranking regardless.
        #
        # `mechanic_members` records which Promotion_Ids each mechanic is made
        # of. A caller that needs to SCOPE a query to one mechanic — the
        # Channel card's discount selector — passes those ids to the existing
        # `promotion` filter, instead of carrying its own hardcoded map of
        # which offers belong to which mechanic.
        for entry in options_for(state)["offers"]:
            promotion = store.dims.promotions.get(entry["code"])
            if promotion and promotion.name:
                mechanic_members.setdefault(promotion.name.strip(), []).append(entry["code"])
        codes = list(mechanic_members)
    else:
        raw = options_for(state)[BREAKDOWN_DIMENSIONS[by]]
        codes = [entry["code"] if isinstance(entry, dict) else str(entry) for entry in raw]

    base_rows = rows_for(state)
    base_volume = baseline_rows_for(state)
    partitioned = _partition(base_rows, base_volume, by, store) if by in _WEEKROW_DIMENSIONS else None

    groups: list[dict[str, Any]] = []
    for code in codes:
        if partitioned is not None:
            rows, volume = partitioned.get(code, ((), ()))
        else:
            # Geography lives on the STORE, which WeekRow has already pooled
            # away, so those dimensions genuinely need a re-filter.
            scoped = state.replace(**{by: frozenset({code})})
            rows, volume = rows_for(scoped), baseline_rows_for(scoped)
        if not rows:
            continue

        # Every number below comes from app/tpo/aggregate.py unchanged.
        trade_spend = A.calculate_trade_spend(rows)
        groups.append({
            "code": code,
            "label": _group_label(store, by, code),
            "trade_spend": trade_spend,
            "trade_spend_display": F.money(trade_spend, currency),
            "incremental_units": A.calculate_incremental_quantity(volume),
            "incremental_sales": A.calculate_incremental_sales(volume),
            "incremental_sales_display": F.money(A.calculate_incremental_sales(volume), currency),
            "roi": A.calculate_roi(rows, volume),
            "margin_impact": A.calculate_margin(rows),
            "pei": A.calculate_pei(rows, volume),
            "cannibalization": A.calculate_cannibalization(volume),
        })

    # The Promotion_Ids behind each mechanic, so a caller can re-scope to one
    # mechanic through the existing `promotion` filter. Present only for this
    # dimension; every other breakdown group is unchanged.
    if by == "promotion_mechanic":
        for group in groups:
            group["members"] = mechanic_members.get(group["code"], [])

    # Share is of Trade Spend, the one additive money measure.
    total_spend = sum(g["trade_spend"] or 0.0 for g in groups)
    for group in groups:
        group["share_pct"] = (
            round((group["trade_spend"] or 0.0) / total_spend * 100, 1) if total_spend else 0.0
        )

    # None sorts last regardless of direction — an undefined ROI is not a
    # ranking position, and must not masquerade as the worst or the best.
    groups.sort(key=lambda g: (g[metric] is None, -(g[metric] or 0.0)))

    total_groups = len(groups)
    truncated = limit > 0 and total_groups > limit
    if truncated:
        groups = groups[:limit]

    return {
        "by": by,
        "metric": metric,
        "groups": groups,
        "truncated": truncated,
        "total_groups": total_groups,
        "meta": _meta(state, rows_for(state), currency, None),
    }
