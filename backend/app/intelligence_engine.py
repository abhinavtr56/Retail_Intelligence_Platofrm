"""
Promotion Intelligence — the deterministic half.

Everything the Intelligence page shows as a number, chart or table is computed
here from the star schema, through app/tpo/service.py. No model touches these
figures; the agent layer (app/agents/intelligence_agent.py) only interprets
them and writes recommendations.

The headline analysis is the discount saturation curve. The dataset's mechanics
carry their own depth — "5% Discount" through "20% Discount", plus Buy3Get1,
which is one free unit in four and so 25% effective. That gives five real
depth points to plot ROI against, which is a genuine elasticity read rather
than a decorative curve.
"""
import json
import re
from typing import Any

from app.agents.star_tools import build_filter_state, run_analysis, segment_kpis
from app.tpo import config, service

# Effective discount depth per mechanic. Buy3Get1 is 25% (one unit free in
# four) — the same reading the Command Center's economics fix applied.
_BUY_N_GET_M = re.compile(r"buy\s*(\d+)\s*get\s*(\d+)", re.I)
_PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s*%")


def mechanic_depth(label: str) -> float | None:
    """Effective discount depth implied by a mechanic's name, or None when the
    name carries no depth (so it's excluded rather than guessed at)."""
    if not label:
        return None
    if "no discount" in label.lower():
        return 0.0
    m = _BUY_N_GET_M.search(label)
    if m:
        buy, get = int(m.group(1)), int(m.group(2))
        total = buy + get
        return round(get / total * 100, 1) if total else None
    p = _PERCENT.search(label)
    return float(p.group(1)) if p else None


def saturation_curve(filters: dict[str, Any] | None = None) -> dict[str, Any]:
    """ROI and lift against discount depth — where deeper discounting stops
    paying for itself."""
    groups = run_analysis(filters, "promotion_mechanic", "roi", limit=20).get("groups") or []
    points = []
    for g in groups:
        depth = mechanic_depth(str(g.get("group", "")))
        if depth is None or g.get("roi") is None:
            continue
        points.append(
            {
                "mechanic": g["group"],
                "depth_pct": depth,
                "roi_pct": g.get("roi"),
                "incremental_sales": g.get("incremental_sales"),
                "trade_spend": g.get("trade_spend"),
                "spend_share_pct": g.get("share_pct"),
            }
        )
    points.sort(key=lambda p: p["depth_pct"])

    # Saturation = the shallowest depth at or beyond which ROI has fallen below
    # the target hurdle and keeps falling. Reported as None when the curve never
    # crosses it, rather than inventing a threshold.
    target = config.PROMOTION_TARGET_ROI_PCT
    saturation = None
    for i, p in enumerate(points):
        if p["roi_pct"] is not None and p["roi_pct"] < target:
            later = [q["roi_pct"] for q in points[i:] if q["roi_pct"] is not None]
            if later and all(v < target for v in later):
                saturation = p["depth_pct"]
                break

    above = [p for p in points if p["roi_pct"] is not None and p["roi_pct"] >= target]
    optimal = (
        f"{min(p['depth_pct'] for p in above):.0f}–{max(p['depth_pct'] for p in above):.0f}%"
        if above
        else "no depth clears the target"
    )
    return {
        "points": points,
        "target_roi_pct": target,
        "saturation_depth_pct": saturation,
        "optimal_range": optimal,
        "monotonic_decline": all(
            points[i]["roi_pct"] >= points[i + 1]["roi_pct"] for i in range(len(points) - 1)
        )
        if len(points) > 1
        else False,
    }


def contribution_waterfall(filters: dict[str, Any] | None = None) -> dict[str, Any]:
    """Which mechanics build or destroy incremental sales, largest first —
    the decomposition behind the headline number."""
    groups = run_analysis(filters, "promotion_mechanic", "incremental_sales", limit=10).get("groups") or []
    totals = segment_kpis(filters)
    items = [
        {
            "label": str(g.get("group")),
            "incremental_sales": g.get("incremental_sales"),
            "trade_spend": g.get("trade_spend"),
            "roi_pct": g.get("roi"),
        }
        for g in groups
        if g.get("incremental_sales") is not None
    ]
    items.sort(key=lambda x: x["incremental_sales"], reverse=True)
    return {
        "items": items,
        "total_incremental_sales": totals.get("incremental_sales"),
        "total_trade_spend": totals.get("trade_spend"),
        "note": (
            "Incremental sales are re-baselined per selection, so mechanic figures "
            "rank contribution rather than summing to the total."
        ),
    }


def inc_sales_trend(filters: dict[str, Any] | None = None) -> dict[str, Any]:
    """Realised incremental sales against the spend-implied target, by month.

    Target comes from config.target_incremental_sales — the same inversion of
    the ROI definition the Command Center's "At Stake" figure uses, so the two
    pages cannot disagree about what "on target" means.
    """
    t = service.trend(build_filter_state(filters), "month")
    series = t.get("series") or {}
    spend = series.get("trade_spend") or []
    actual = series.get("incremental_sales") or []
    target = [config.target_incremental_sales(s) if s else None for s in spend]
    gap = [
        round(a - g, 2) if (a is not None and g is not None) else None
        for a, g in zip(actual, target)
    ]
    return {
        "labels": t.get("labels") or [],
        "actual": actual,
        "target": target,
        "trade_spend": spend,
        "roi": series.get("roi") or [],
        "gap_to_target": gap,
        "months_below_target": sum(1 for g in gap if g is not None and g < 0),
    }


def _dimension_table(filters: dict[str, Any] | None, by: str, limit: int = 10) -> list[dict[str, Any]]:
    groups = run_analysis(filters, by, "trade_spend", limit=limit).get("groups") or []
    target = config.PROMOTION_TARGET_ROI_PCT
    rows = []
    for g in groups:
        roi = g.get("roi")
        rows.append(
            {
                "name": g.get("group"),
                "trade_spend": g.get("trade_spend"),
                "incremental_sales": g.get("incremental_sales"),
                "roi_pct": roi,
                "spend_share_pct": g.get("share_pct"),
                "vs_target_pp": round(roi - target, 1) if roi is not None else None,
                "status": (
                    "unknown" if roi is None
                    else "on_track" if roi >= target
                    else "watching" if roi >= target * 0.7
                    else "underperforming"
                ),
            }
        )
    return rows


def risk_summary(filters: dict[str, Any] | None = None) -> dict[str, Any]:
    alerts = service.risk_alerts(build_filter_state(filters), limit=8)
    return {
        "counts": alerts.get("counts"),
        "at_stake_total": round(sum(a.get("at_stake") or 0 for a in (alerts.get("alerts") or [])), 2),
        "top": [
            {
                "title": a.get("title"),
                "severity": a.get("severity"),
                "roi_pct": a.get("roi_pct"),
                "trade_spend": a.get("trade_spend"),
                "at_stake": a.get("at_stake"),
            }
            for a in (alerts.get("alerts") or [])[:6]
        ],
    }


# ---------------------------------------------------------------------------
# Section cache.
#
# service.breakdown() re-runs the whole KPI engine once per group, so a single
# breakdown over 31 retailers is 31 passes. Computing every section eagerly
# took ~40s — unusable as a page load. Sections are therefore computed on
# demand and memoised per (section, scope): the first request for a tab pays
# for that tab only, and revisiting it is instant.
#
# The underlying data is immutable seed data (see data_loader), so nothing
# invalidates this. It would need clearing if uploads ever fed this engine.
# ---------------------------------------------------------------------------
_SECTION_CACHE: dict[tuple[str, str], Any] = {}

SECTIONS = ("core", "dimensions", "risk", "waterfall")


def _cached(section: str, filters: dict[str, Any], build) -> Any:
    key = (section, json.dumps(filters, sort_keys=True, default=str))
    if key not in _SECTION_CACHE:
        _SECTION_CACHE[key] = build()
    return _SECTION_CACHE[key]


def _core(filters: dict[str, Any]) -> dict[str, Any]:
    """What the Overview and Saturation tabs need — the cheap, high-value half."""
    return {
        "kpis": segment_kpis(filters),
        "whole_business_kpis": segment_kpis({}),
        "saturation": saturation_curve(filters),
        "trend": inc_sales_trend(filters),
        "by_mechanic": _dimension_table(filters, "promotion_mechanic"),
    }


def _dimensions(filters: dict[str, Any]) -> dict[str, Any]:
    return {
        "by_channel": _dimension_table(filters, "channel"),
        "by_region": _dimension_table(filters, "region"),
        "by_retailer": _dimension_table(filters, "retailer", limit=12),
        "by_category": _dimension_table(filters, "category"),
        "by_brand": _dimension_table(filters, "brand"),
        "by_product": _dimension_table(filters, "product", limit=12),
    }


def build_intelligence_facts(
    filters: dict[str, Any] | None = None, sections: tuple[str, ...] = SECTIONS
) -> dict[str, Any]:
    """The deterministic basis for the page and for the agent layer.

    `sections` selects how much to compute. The agents ask for everything; the
    page asks for one tab's worth at a time.
    """
    filters = filters or {}
    out: dict[str, Any] = {
        "scope": filters,
        # Stated explicitly because every figure below is INR, and a model not
        # told the currency will default to dollars.
        "currency": config.BASE_CURRENCY,
        "currency_symbol": "₹",
        "target_roi_pct": config.PROMOTION_TARGET_ROI_PCT,
        "sections": list(sections),
    }
    if "core" in sections:
        out.update(_cached("core", filters, lambda: _core(filters)))
    if "dimensions" in sections:
        out.update(_cached("dimensions", filters, lambda: _dimensions(filters)))
    if "waterfall" in sections:
        out["waterfall"] = _cached("waterfall", filters, lambda: contribution_waterfall(filters))
    if "risk" in sections:
        out["risk"] = _cached("risk", filters, lambda: risk_summary(filters))
    return out
