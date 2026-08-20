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


def build_filter_state(raw: dict[str, Any] | None) -> FilterState:
    """Build a FilterState from planner output, ignoring anything unknown so a
    hallucinated key can't crash a run."""
    raw = raw or {}
    year = raw.get("year")
    month = raw.get("month")
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
        year=int(year) if isinstance(year, (int, str)) and str(year).isdigit() else None,
        month=int(month) if isinstance(month, (int, str)) and str(month).isdigit() else None,
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
