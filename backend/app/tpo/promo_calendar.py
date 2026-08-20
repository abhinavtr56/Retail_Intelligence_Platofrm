"""The Promotion Calendar read model: Year -> Month -> Channel -> Promotion.

A PRESENTATION read model, not a second analytics engine. It reads the same
`WeekRow` stream every KPI reads, through the same `filters.rows_for`, and does
no arithmetic beyond counting distinct products. No ROI, Trade Spend,
Incremental Sales or baseline logic is touched or duplicated here.

THE MONTH COMES FROM THE WEEK, NEVER FROM `fact_sales.Month`.
`WeekRow.month` is already derived from `Dimensions.week_start`, which joins
(Year, Week) to dim_date. The loader documents why: 22.6% of fact rows carry a
month that disagrees with the business week they belong to. Nothing here
re-derives a month independently.

Promotion metadata is resolved through `dim_promotion_final.csv` only, via
`Dimensions.promotions`:

    Promotion_Name        -> the MECHANIC ("5% Discount", "20% Discount",
                             "Buy3Get1")
    Promotion_Description -> the EVENT   ("Diwali Special 25")
    Promotion_Type        -> Regular | Seasonal | Normal

No promotion name, description or id is written down in this module or in the
frontend; an id with no dimension row keeps its id and is reported as a gap
rather than given an invented name.
"""

from __future__ import annotations

from collections import defaultdict
from functools import lru_cache
from typing import Any

from ..data_loader import load as load_json
from .filters import FilterState, rows_for
from .loader import get_store

#: Promotion planning cadence per channel.
#:
#: NOT present in dim_channel.csv (which carries Channel_Type: Retail/B2B), and
#: deliberately not inferred from the transaction pattern, which would make a
#: business rule depend on a data accident. It is the project's stated channel
#: structure, declared once HERE so the frontend never carries its own copy.
CADENCE: dict[str, str] = {
    "CH001": "WEEKLY",
    "CH002": "MONTHLY",
    "CH003": "MONTHLY",
    "CH004": "WEEKLY",
    "CH005": "MONTHLY",
}

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

#: Presentation buckets behind the legend. A cell carrying two or more seasonal
#: events in one month is called "festival" purely so it can be tinted
#: differently — October's Dussehra + Diwali being the case that motivates it.
#: It is not a business category and nothing downstream branches on it.
KIND_NONE = "none"
KIND_REGULAR = "regular"
KIND_SEASONAL = "seasonal"
KIND_FESTIVAL = "festival"


def _year_of(week_key: str) -> int:
    """"2025-W40" -> 2025. The week key is built by the loader, never parsed
    out of a date column here."""
    return int(week_key[:4])


def _week_number(week_key: str) -> int:
    return int(week_key.split("W")[-1])


@lru_cache(maxsize=4)
def _aggregate(year: int) -> dict[str, Any]:
    """One pass over the year's promoted rows, indexed for both views.

    Cached because the underlying store is immutable for the process lifetime;
    the Calendar therefore costs one pass per year, not one per request.
    """
    rows = rows_for(FilterState.build(year=year))

    # (channel, month, promotion) -> products, and the weeks it ran in
    products: dict[tuple[str, int, str], set[str]] = defaultdict(set)
    weeks: dict[tuple[str, int, str], set[str]] = defaultdict(set)
    # (channel, month, week_key, promotion) -> products, for the weekly drill-down
    week_products: dict[tuple[str, int, str, str], set[str]] = defaultdict(set)

    for row in rows:
        if not row.is_promoted:
            continue
        if _year_of(row.week_key) != year:
            continue
        key = (row.channel_id, row.month, row.promotion_id)
        products[key].add(row.product_id)
        weeks[key].add(row.week_key)
        week_products[(row.channel_id, row.month, row.week_key, row.promotion_id)].add(row.product_id)

    return {"products": dict(products), "weeks": dict(weeks), "week_products": dict(week_products)}


@lru_cache(maxsize=1)
def available_years() -> list[int]:
    """Years that actually carry promotion activity.

    Taken from the fact stream, not from dim_date: the date dimension also
    describes 2026, which holds no transactions, and offering it as a tab would
    put an empty twelve-month grid in front of the user.
    """
    rows = rows_for(FilterState.build())
    return sorted({_year_of(r.week_key) for r in rows if r.is_promoted})


def _promotion_meta(promotion_id: str) -> dict[str, Any]:
    """dim_promotion_final.csv, or an explicit gap marker.

    A missing dimension row is reported, never papered over with a made-up
    name: `metadata_missing` travels to the UI so the gap is visible rather
    than silently rendered as a real promotion.
    """
    promotion = get_store().dims.promotions.get(promotion_id)
    if promotion is None:
        return {
            "promotion_id": promotion_id,
            "mechanic": promotion_id,
            "type": "Unknown",
            "description": promotion_id,
            "metadata_missing": True,
        }
    return {
        "promotion_id": promotion_id,
        # Promotion_Name is the mechanic; Promotion_Description is the event.
        "mechanic": promotion.name,
        "type": promotion.type,
        "description": promotion.description,
        "metadata_missing": False,
    }


def _first_week(agg: dict[str, Any], channel: str, month: int, promotion_id: str) -> int:
    weeks = agg["weeks"].get((channel, month, promotion_id), set())
    return min((_week_number(w) for w in weeks), default=99)


def _cell(agg: dict[str, Any], channel: str, month: int) -> dict[str, Any]:
    """One Channel x Month summary.

    `product_count` is the DISTINCT products promoted in the cell, so a product
    carried by both a regular and a seasonal offer in the same month counts
    once — the cell answers "how many products are on promotion here?".
    """
    entries = [
        (promotion_id, sku)
        for (ch, mo, promotion_id), sku in agg["products"].items()
        if ch == channel and mo == month
    ]
    if not entries:
        return {
            "month": month, "kind": KIND_NONE, "label": "No Promo",
            "promotion_ids": [], "product_count": 0, "promotion_count": 0,
            "extra_regular": 0,
        }

    entries.sort(key=lambda e: _first_week(agg, channel, month, e[0]))
    metas = {promotion_id: _promotion_meta(promotion_id) for promotion_id, _ in entries}
    seasonal = [pid for pid, _ in entries if metas[pid]["type"] == "Seasonal"]
    regular = [pid for pid, _ in entries if metas[pid]["type"] == "Regular"]

    # The headline is the season when there is one — that is the event a planner
    # scans for. Regular activity alongside it is reported as a count, and the
    # detail panel still lists every promotion in the cell.
    if seasonal:
        named, kind = seasonal, (KIND_FESTIVAL if len(seasonal) > 1 else KIND_SEASONAL)
        label = " + ".join(metas[pid]["description"] for pid in named)
    elif regular:
        named, kind = regular, KIND_REGULAR
        label = "Regular"
    else:
        named, kind = [pid for pid, _ in entries], KIND_REGULAR
        label = " + ".join(metas[pid]["description"] for pid in named)

    distinct: set[str] = set()
    for _, sku in entries:
        distinct |= sku

    return {
        "month": month,
        "kind": kind,
        "label": label,
        "promotion_ids": named,
        "product_count": len(distinct),
        "promotion_count": len(entries),
        "extra_regular": len(regular) if seasonal else 0,
    }


def matrix(year: int, channels: list[str] | None = None) -> dict[str, Any]:
    """The 12-month x N-channel grid for one year."""
    store = get_store()
    agg = _aggregate(year)
    wanted = [c for c in CADENCE if not channels or c in channels]

    return {
        "year": year,
        "years": available_years(),
        "months": [{"month": i + 1, "name": MONTH_NAMES[i], "abbr": MONTH_ABBR[i]} for i in range(12)],
        # The full roster, independent of `channels`. The filtered `channels`
        # list below cannot drive a channel picker: once narrowed to one
        # channel it would offer only that channel, leaving no way back to the
        # others.
        "all_channels": [
            {
                "channel_id": code,
                "name": store.dims.channels[code].name if code in store.dims.channels else code,
                "cadence": CADENCE[code],
            }
            for code in CADENCE
            if code in store.dims.channels
        ],
        "channels": [
            {
                "channel_id": code,
                "name": store.dims.channels[code].name if code in store.dims.channels else code,
                "cadence": CADENCE[code],
                "cells": [_cell(agg, code, month) for month in range(1, 13)],
            }
            for code in wanted
            if code in store.dims.channels
        ],
    }


def _products_payload(product_ids: set[str]) -> list[dict[str, Any]]:
    """Promoted products in the project's own hierarchy: Brand Form, then SKU
    rank smallest -> largest. Never alphabetical, which would interleave the
    pack sizes of different brand forms."""
    store = get_store()
    known = [store.dims.products[pid] for pid in product_ids if pid in store.dims.products]
    known.sort(key=lambda p: (p.brand, p.rank))
    return [
        {
            "product_id": p.product_id,
            "name": p.name,
            "brand_form": p.brand,
            "category": p.category,
            "size": p.size,
            "rank": p.rank,
        }
        for p in known
    ]


def _promotion_entry(agg: dict[str, Any], channel: str, month: int, promotion_id: str) -> dict[str, Any]:
    skus = agg["products"].get((channel, month, promotion_id), set())
    weeks = sorted(agg["weeks"].get((channel, month, promotion_id), set()))
    meta = _promotion_meta(promotion_id)
    products = _products_payload(skus)
    return {
        **meta,
        # The count IS the length of the list below, so the panel can never
        # claim nine products and then list eight.
        "product_count": len(products),
        "weeks": [_week_number(w) for w in weeks],
        "products": products,
    }


def cell_detail(year: int, month: int, channel: str) -> dict[str, Any]:
    """Everything the detail panel needs for one Channel x Month.

    Monthly channels get the month's promotions. Weekly channels additionally
    get the week-by-week breakdown, because a month there genuinely holds
    several separate promotion events and collapsing them would misreport the
    plan.
    """
    store = get_store()
    agg = _aggregate(year)
    cadence = CADENCE.get(channel, "MONTHLY")

    promotion_ids = sorted(
        {pid for (ch, mo, pid) in agg["products"] if ch == channel and mo == month},
        key=lambda pid: _first_week(agg, channel, month, pid),
    )
    promotions = [_promotion_entry(agg, channel, month, pid) for pid in promotion_ids]

    weeks: list[dict[str, Any]] = []
    if cadence == "WEEKLY":
        by_week: dict[str, list[str]] = defaultdict(list)
        for (ch, mo, week_key, pid) in agg["week_products"]:
            if ch == channel and mo == month:
                by_week[week_key].append(pid)
        for week_key in sorted(by_week):
            starts = store.dims.week_dates.get((year, _week_number(week_key)), [])
            entries = []
            for pid in sorted(by_week[week_key], key=lambda p: p):
                skus = agg["week_products"][(channel, month, week_key, pid)]
                products = _products_payload(skus)
                entries.append({**_promotion_meta(pid), "product_count": len(products), "products": products})
            weeks.append({
                "week_key": week_key,
                "week_number": _week_number(week_key),
                "week_start": min(starts).isoformat() if starts else None,
                "promotions": entries,
            })

    return {
        "year": year,
        "month": month,
        "month_name": MONTH_NAMES[month - 1],
        "channel": {
            "channel_id": channel,
            "name": store.dims.channels[channel].name if channel in store.dims.channels else channel,
            "cadence": cadence,
        },
        "cell": _cell(agg, channel, month),
        "promotions": promotions,
        "weeks": weeks,
    }


# ---------------------------------------------------------------------------
# Upcoming events
# ---------------------------------------------------------------------------
#
# WHAT COUNTS AS AN EVENT. Two real sources, merged into one chronological
# feed; nothing is synthesised.
#
#   1. PROMOTION STARTS, from this module's own aggregate. In a trade-promotion
#      calendar "what is coming next" is first of all the next promotions, and
#      this is the only source with data for every year, month and channel.
#   2. BUSINESS EVENTS from app/data/calendar.json — the six reviews, launches
#      and refreshes the Calendar page already served. They are kept so the
#      existing event types (review / launch / extension / data / closure)
#      still appear, but that file holds only June-July 2025, which is exactly
#      why it cannot be the sole source of an "upcoming" panel.
#
# Business-event channel codes are the channel NAMES abbreviated, so they are
# resolved against dim_channel rather than a hand-written map: "GT" ->
# General Trade -> CH003. "All" fans out to every channel in scope.

#: Business-event channel token -> channel id, derived from dim_channel names.
_EVENT_CHANNEL_TOKENS = {"GT": "General Trade", "MT": "Modern Trade", "Ecom": "E-commerce"}


def _business_events() -> list[dict[str, Any]]:
    """app/data/calendar.json, or nothing if it is absent. Never fabricated."""
    try:
        return list(load_json("calendar").get("events", []))
    except FileNotFoundError:
        return []


def _event_channel_ids(token: str) -> list[str]:
    """"GT" -> ["CH003"]; "All" -> every channel. Unknown tokens map to
    nothing rather than being guessed at."""
    if token == "All":
        return list(CADENCE)
    name = _EVENT_CHANNEL_TOKENS.get(token)
    if name is None:
        return []
    return [c.channel_id for c in get_store().dims.channels.values() if c.name == name]


def upcoming(
    year: int,
    after_month: int = 0,
    channels: list[str] | None = None,
    limit: int = 60,
) -> dict[str, Any]:
    """Promotion starts and business events after `after_month`, in order.

    `after_month` is the month the user is looking at; 0 means "the whole
    year". The feed never crosses into another year — the calendar is a
    one-year plan and mixing years would misreport it.
    """
    scope = [c for c in CADENCE if not channels or c in channels]
    store = get_store()
    agg = _aggregate(year)
    events: list[dict[str, Any]] = []

    for (channel, month, promotion_id), skus in agg["products"].items():
        if channel not in scope or month <= after_month:
            continue
        weeks = agg["weeks"].get((channel, month, promotion_id), set())
        if not weeks:
            continue
        week_number = min(_week_number(w) for w in weeks)
        days = store.dims.week_dates.get((year, week_number), [])
        if not days:
            continue
        meta = _promotion_meta(promotion_id)
        events.append({
            "date": min(days).isoformat(),
            "month": month,
            "name": meta["description"],
            # Regular / Seasonal, straight from dim_promotion.Promotion_Type.
            "type": meta["type"],
            "source": "promotion",
            "promotion_id": promotion_id,
            "channel_id": channel,
            "channel_name": store.dims.channels[channel].name if channel in store.dims.channels else channel,
            "product_count": len(skus),
            "week_number": week_number,
        })

    for raw in _business_events():
        iso = str(raw.get("date", ""))
        if not iso.startswith(f"{year}-"):
            continue
        month = int(iso[5:7])
        if month <= after_month:
            continue
        token = str(raw.get("channel", ""))
        targets = _event_channel_ids(token)
        if not any(c in scope for c in targets):
            continue
        # An "All" event is ONE event that applies to every channel, not five
        # copies of itself; it only narrows to a channel id when the user has
        # filtered to a single channel.
        if token == "All" and len(scope) > 1:
            channel_id, channel_name = None, "All Channels"
        else:
            channel_id = next(c for c in targets if c in scope)
            channel_name = (
                store.dims.channels[channel_id].name if channel_id in store.dims.channels else channel_id
            )
        events.append({
            "date": iso,
            "month": month,
            "name": raw.get("name", ""),
            "type": str(raw.get("type", "")),
            "source": "event",
            "promotion_id": None,
            "channel_id": channel_id,
            "channel_name": channel_name,
            "product_count": None,
            "week_number": None,
        })

    events.sort(key=lambda e: (e["date"], e["channel_id"] or "", e["name"]))
    return {
        "year": year,
        "after_month": after_month,
        "total": len(events),
        "events": events[:limit],
    }
