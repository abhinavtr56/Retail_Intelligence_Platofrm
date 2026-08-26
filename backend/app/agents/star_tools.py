"""
Star-schema analysis tools for the investigation agents.

The agents do NOT recompute promotion economics here. Every number comes
from app/tpo/service.py — the same engine the Command Center renders and
that backend/tests covers with 289 tests. That is deliberate: incremental
sales are measured against a per-(product, channel) baseline derived from
non-promoted rows, not a naive `actual - base`. Reimplementing that in
pandas would quietly drift, and the Investigations tab would then contradict
the Command Center on the same dataset — the fastest way to make an
analytics product untrustworthy.

So this module is a thin, agent-shaped adapter over that engine:

  * `schema_summary()`  what the planner is allowed to filter and group by,
                        with the dataset's real values.
  * `run_analysis()`    one breakdown, optionally narrowed to a segment —
                        which is how interaction effects are found.
  * `segment_kpis()`    headline KPIs for a selection.

Note on additivity, carried over from service.breakdown's contract: Trade
Spend sums back to the headline; Incremental Sales does not, because its
baseline is re-derived per selection. Groups are therefore a RANKING, never
a composition, and the specialist prompt says so.
"""
from typing import Any

from app.tpo import service
from app.tpo.filters import FilterState

# Mirrors service.BREAKDOWN_DIMENSIONS / BREAKDOWN_METRICS. Read from the
# service rather than restated, so a change there cannot silently desync.
BREAKDOWN_DIMENSIONS: tuple[str, ...] = tuple(service.BREAKDOWN_DIMENSIONS)
BREAKDOWN_METRICS: tuple[str, ...] = tuple(service.BREAKDOWN_METRICS)

# FilterState fields an agent may set. `tier` and `product` are allowed but
# rarely useful to a planner; kept for completeness.
FILTER_FIELDS: tuple[str, ...] = (
    "year", "month", "channel", "retailer", "region", "state", "city",
    "tier", "distributor", "category", "brand", "product", "promotion",
    "promotion_type",
)

_LIST_FIELDS = {f for f in FILTER_FIELDS if f not in ("year", "month")}


def _codes(values: list[Any]) -> list[str]:
    """Filter option lists are either bare strings or {code,name} dicts."""
    out = []
    for v in values:
        out.append(str(v["code"]) if isinstance(v, dict) else str(v))
    return out


def schema_summary() -> dict[str, Any]:
    """What the planning agent needs to choose filters and breakdowns: the
    dimensions that exist and the actual values they take."""
    opts = service.filters(FilterState())
    return {
        "row_count": None,  # not exposed by the service; unused by the planner
        "filter_dimensions": {
            "year": opts.get("years", []),
            "month": [m["code"] for m in opts.get("months", [])],
            "channel": [{"code": c["code"], "name": c["name"]} for c in opts.get("channels", [])],
            "region": _codes(opts.get("regions", [])),
            "state": _codes(opts.get("states", [])),
            "city": _codes(opts.get("cities", [])),
            "tier": _codes(opts.get("tiers", [])),
            "retailer": _codes(opts.get("retailers", []))[:30],
            "distributor": _codes(opts.get("distributors", [])),
            "category": _codes(opts.get("categories", [])),
            "brand": _codes(opts.get("brands", [])),
            "promotion_type": _codes(opts.get("promotion_types", [])),
            "offers": [{"code": o["code"], "name": o["name"], "type": o.get("type")} for o in opts.get("offers", [])],
        },
        "breakdown_dimensions": list(BREAKDOWN_DIMENSIONS),
        "breakdown_metrics": list(BREAKDOWN_METRICS),
        "year_labels": opts.get("year_labels", {}),
    }


def _bounded_int(value: Any, low: int, high: int) -> int | None:
    """Accept an integer only inside a sensible range, else drop it.

    A planner reading "week 41 of 2025" will happily emit month=41, and the
    engine's formatter indexes a 12-element month list — so an unchecked value
    becomes an IndexError deep inside code that is not ours. Validating at this
    boundary keeps malformed model output from ever reaching the KPI engine.
    """
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if low <= n <= high else None


def build_filter_state(raw: dict[str, Any] | None) -> FilterState:
    """Build a FilterState from planner output, ignoring anything unknown or
    out of range so malformed model output can't crash a run."""
    raw = raw or {}
    lists: dict[str, list[str]] = {}
    for field in _LIST_FIELDS:
        value = raw.get(field)
        if value in (None, "", []):
            continue
        if isinstance(value, str):
            value = [value]
        if isinstance(value, list) and value:
            lists[field] = [str(v) for v in value]
    return FilterState.build(
        year=_bounded_int(raw.get("year"), 1900, 2200),
        month=_bounded_int(raw.get("month"), 1, 12),
        **lists,
    )


def _compact_kpis(payload: dict[str, Any]) -> dict[str, Any]:
    """service.kpis() returns {"kpis": {name: {value, display_value, delta, …}}}.

    Keep the raw `value` (and the delta when there's a comparison period) and
    drop the pre-formatted strings — the model should reason on numbers, not
    on "₹147.7 Cr", and formatting is a presentation concern that belongs in
    app/tpo/formatting.py.
    """
    metrics = (payload or {}).get("kpis", payload) or {}
    out: dict[str, Any] = {}
    for key, metric in metrics.items():
        if not isinstance(metric, dict):
            continue
        if metric.get("available") is False:
            continue
        if "value" in metric:
            out[key] = metric["value"]
            if metric.get("delta") is not None:
                out[f"{key}_delta_pct"] = metric["delta"]
    return out


def _compact_group(group: dict[str, Any]) -> dict[str, Any]:
    """Breakdown groups are flat, with a `_display` string beside each number.
    Keep the numbers and the label."""
    out: dict[str, Any] = {"group": group.get("label") or group.get("code")}
    for key, value in group.items():
        if key in ("code", "label") or key.endswith("_display"):
            continue
        if isinstance(value, (int, float)) or value is None:
            out[key] = value
    return out


def segment_kpis(filters: dict[str, Any] | None = None) -> dict[str, Any]:
    state = build_filter_state(filters)
    return _compact_kpis(service.kpis(state))


def run_analysis(
    filters: dict[str, Any] | None,
    by: str,
    metric: str = "incremental_sales",
    limit: int = 12,
) -> dict[str, Any]:
    """One breakdown, optionally scoped to a segment.

    Passing `filters` AND `by` together is what surfaces interactions: narrow
    to Modern Trade / South, then break down by mechanic, and a problem that
    is invisible in either dimension's overall average becomes obvious.
    """
    if by not in BREAKDOWN_DIMENSIONS:
        return {"error": f"unsupported breakdown dimension {by!r}"}
    if metric not in BREAKDOWN_METRICS:
        metric = "incremental_sales"

    state = build_filter_state(filters)
    try:
        result = service.breakdown(state, by=by, metric=metric, limit=limit)
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:  # a bad filter combination shouldn't kill the run
        return {"error": f"{type(e).__name__}: {e}"}

    groups = [_compact_group(g) for g in (result.get("groups") or [])]
    if not groups:
        return {"error": "no rows matched this filter combination"}

    return {
        "grouped_by": by,
        "ranked_by": metric,
        "applied_filters": filters or {},
        "note": (
            "roi is a percentage (50 = the target hurdle). Trade Spend sums back "
            "to the total; Incremental Sales does not (its baseline is re-derived "
            "per selection). Treat groups as a ranking, not a composition."
        ),
        "selection_totals": segment_kpis(filters),
        "truncated": bool(result.get("truncated")),
        "total_groups": result.get("total_groups"),
        "groups": groups,
    }


# --- neighbour cannibalization ---------------------------------------------


def neighbour_sales_decline(filters: dict[str, Any] | None = None) -> dict[str, Any]:
    """Did products sharing the promoted product's BRAND FORM lose sales while
    it was on promotion?

    AN OPERATIONAL INDICATOR, NOT A CAUSAL CLAIM. It reports what neighbouring
    sales did during the promotion weeks against their own ordinary level. A
    decline is consistent with cannibalization; it does not establish that the
    promotion caused it, and the payload says so in `causality_note`.

    NOT A SECOND KPI. `aggregate.cannibalization_detail` -- the Command Center's
    validated Cannibalization Rate -- is untouched and still travels beside this
    on the same finding. That one asks "what share of the promoted SKU's uplift
    came out of its ADJACENT pack sizes", in QUANTITY, at +/-1 rank. This asks
    the question the investigation brief poses: "did the brand form's OTHER
    products sell less, in MONEY, while this promotion ran". Two questions, two
    answers; the finding carries both rather than replacing one with the other.

    WHERE EVERY INPUT COMES FROM, so none of it is invented:

      * BRAND FORM  `Product.brand` -- the field app/tpo/loader.py documents as
        "the Brand Form, 4 pack sizes share one". This dataset carries no
        separate Form column; the Brand Form IS the brand+form grouping.
      * NEIGHBOURS  every other product in that brand form within the scope.
        The promoted product is excluded by construction.
      * PERIOD      the business weeks the promoted product actually carried a
        promotion, read off the rows. No date arithmetic, no fixed window.
    DIRECTION: the payload reports `neighbour_sales_change_pct`, defined as
    (promotion-period sales - baseline) / baseline x 100. NEGATIVE is a decline
    and is the cannibalization signal; POSITIVE is growth and means no decline
    was detected.

      * BASELINE    each neighbour's own mean revenue per week over the weeks it
        was NOT promoted and the promotion was NOT running -- the convention
        `aggregate._sku_baselines` already uses for quantity, read on revenue.
        No new baseline model.

    TWO PASSES, BECAUSE TWO DIFFERENT POPULATIONS ARE NEEDED. The promotion
    under investigation is identified in the SELECTED scope; the neighbours are
    by definition not on that promotion, so a Promotion filter would hide every
    one of them, exactly as a Product filter would. So:

      pass 1  the scope as selected  -> which product is promoted, and in which
                                        business weeks
      pass 2  the same scope with the Product filter lifted to its Brand Form
              (, which exists for exactly
              this) and the Promotion filter dropped -> the neighbours

    Nothing else about the selection is relaxed: year, channel, region, retailer
    and the rest still bound both passes.
    """
    from app.tpo.filters import rows_for
    from app.tpo.loader import get_store

    selected = build_filter_state(filters)
    scoped = rows_for(selected)
    if not scoped:
        return {"available": False, "reason": "No rows in this scope."}

    promoted_ids = sorted({r.product_id for r in scoped if r.is_promoted})
    if not promoted_ids:
        return {"available": False, "reason": "No promotion in this scope."}

    # The promotion(s) actually running, named through dim_promotion the way
    # `Promotion.label` already resolves them everywhere else — no second
    # naming rule, and an id with no dimension row keeps its id.
    promotions = get_store().dims.promotions
    promo_ids = sorted({r.promotion_id for r in scoped if r.is_promoted})
    promo_names = [
        promotions[p].label if p in promotions else p for p in promo_ids
    ]

    # The promotion period: the weeks the SELECTED promotion actually ran, per
    # brand form. Read off the rows, never computed from a date.
    weeks_by_form: dict[str, set[str]] = {}
    for r in scoped:
        if r.is_promoted:
            weeks_by_form.setdefault(r.brand_form, set()).add(r.week_key)

    rows = rows_for(selected.widened_to_brand_form().replace(promotion=None, promotion_type=None))

    products = get_store().dims.products
    brand_forms = sorted({products[p].brand for p in promoted_ids if p in products})

    per_form: list[dict[str, Any]] = []
    total_expected = total_actual = 0.0

    for form in brand_forms:
        in_form = [r for r in rows if r.brand_form == form]
        promoted_here = sorted(p for p in promoted_ids if products[p].brand == form)
        promo_weeks = sorted(weeks_by_form.get(form, set()))
        neighbours = sorted({r.product_id for r in in_form if r.product_id not in promoted_here})

        if not neighbours:
            per_form.append({
                "brand_form": form,
                "promoted_products": promoted_here,
                "neighbour_count": 0,
                "computable": False,
                "reason": (
                    "No comparable neighbouring products found within the same brand form "
                    "in this scope."
                ),
            })
            continue

        detail: list[dict[str, Any]] = []
        form_expected = form_actual = 0.0
        for pid in neighbours:
            own = [r for r in in_form if r.product_id == pid]
            base_rows = [r for r in own if not r.is_promoted and r.week_key not in promo_weeks]
            during = [r for r in own if r.week_key in promo_weeks]
            base_weeks = {r.week_key for r in base_rows}
            during_weeks = {r.week_key for r in during}
            if not base_weeks or not during_weeks:
                detail.append({
                    "product_id": pid,
                    "product": products[pid].name.strip() if pid in products else pid,
                    "computable": False,
                    "reason": (
                        "No non-promoted weeks to read an ordinary level from."
                        if not base_weeks
                        else "No rows for this product during the promotion weeks."
                    ),
                })
                continue
            per_week = sum(r.actual_revenue for r in base_rows) / len(base_weeks)
            expected = per_week * len(during_weeks)
            actual = sum(r.actual_revenue for r in during)
            form_expected += expected
            form_actual += actual
            detail.append({
                "product_id": pid,
                "product": products[pid].name.strip() if pid in products else pid,
                "computable": True,
                "baseline_weeks": len(base_weeks),
                "promotion_weeks_measured": len(during_weeks),
                "expected_sales": round(expected, 2),
                "actual_sales": round(actual, 2),
                # (during - baseline) / baseline: POSITIVE means it sold MORE.
                "sales_change_pct": round((actual - expected) / expected * 100, 1) if expected else None,
            })

        total_expected += form_expected
        total_actual += form_actual
        per_form.append({
            "brand_form": form,
            "promoted_products": promoted_here,
            "promotions": promo_names,
            "promotion_weeks": promo_weeks,
            "neighbour_count": len(neighbours),
            "computable": form_expected > 0,
            "reason": None if form_expected > 0 else (
                "Baseline neighbour sales are zero, so a percentage change cannot be expressed."
            ),
            "expected_neighbour_sales": round(form_expected, 2),
            "actual_neighbour_sales": round(form_actual, 2),
            "neighbour_sales_change_pct": (
                round((form_actual - form_expected) / form_expected * 100, 1) if form_expected else None
            ),
            "neighbours": detail,
        })

    overall = round((total_actual - total_expected) / total_expected * 100, 1) if total_expected else None
    return {
        "available": True,
        "metric": "neighbour_sales_change_pct",
        "direction": (
            "(promotion-period sales - baseline sales) / baseline sales x 100. NEGATIVE means "
            "neighbouring products sold LESS than their ordinary level -- report that as a "
            "decline of that size, indicating POTENTIAL cannibalization. POSITIVE means neighbour "
            "sales ROSE -- report the increase and state that no decline was detected. Never "
            "describe neighbour growth as negative cannibalization."
        ),
        "neighbour_definition": (
            "Every other product sharing the promoted product's Brand Form (dim_product.Brand, "
            "which this dataset uses as the brand+form grouping). The promoted product is excluded."
        ),
        "baseline_definition": (
            "Each neighbour's own mean revenue per week over the weeks it was not promoted and the "
            "promotion was not running, scaled to the number of promotion weeks measured."
        ),
        "causality_note": (
            "An observed co-movement, not an attribution. A decline here is CONSISTENT WITH "
            "cannibalization and does not establish that the promotion caused it."
        ),
        "expected_neighbour_sales": round(total_expected, 2),
        "actual_neighbour_sales": round(total_actual, 2),
        "promotions": promo_names,
        "neighbour_sales_change_pct": overall,
        "by_brand_form": per_form,
    }
