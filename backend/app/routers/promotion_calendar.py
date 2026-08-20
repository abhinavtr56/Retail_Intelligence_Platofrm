"""Promotion Calendar routes.

Mounted at `/api/promotion-calendar`, NOT at `/api/calendar` — that path
already serves the event calendar from `misc.py` and its contract is unchanged.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query

from app.tpo import promo_calendar

router = APIRouter(prefix="/api/promotion-calendar", tags=["promotion-calendar"])

_CHANNEL_PATTERN = "^(" + "|".join(promo_calendar.CADENCE) + ")$"

#: No `pattern=` here. In Pydantic v2 a string pattern on a `list[str]` query
#: parameter is applied to the LIST, not to its items, which fails validation
#: for every non-empty value. The codes are checked explicitly below instead.
ChannelParam = Annotated[list[str] | None, Query()]


@router.get("/matrix")
def matrix(
    year: int,
    channel: ChannelParam = None,
) -> dict[str, Any]:
    """The 12-month x N-channel promotion grid for one year.

    `channel` may repeat, matching the list-parameter convention the Command
    Center filters already use. Omitted means every channel.
    """
    unknown = sorted(set(channel or ()) - set(promo_calendar.CADENCE))
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown channel(s): {', '.join(unknown)}")
    return promo_calendar.matrix(year, channel)


@router.get("/cell")
def cell(
    year: int,
    month: Annotated[int, Query(ge=1, le=12)],
    channel: Annotated[str, Query(pattern=_CHANNEL_PATTERN)],
) -> dict[str, Any]:
    """One Channel x Month: its promotions, their products, and — for weekly
    channels — the week-by-week breakdown."""
    return promo_calendar.cell_detail(year, month, channel)


@router.get("/upcoming")
def upcoming(
    year: int,
    after_month: Annotated[int, Query(ge=0, le=12)] = 0,
    channel: ChannelParam = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 60,
) -> dict[str, Any]:
    """Promotion starts and business events after `after_month`, chronological.

    `after_month=0` means the whole year. The feed never crosses years.
    """
    unknown = sorted(set(channel or ()) - set(promo_calendar.CADENCE))
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown channel(s): {', '.join(unknown)}")
    return promo_calendar.upcoming(year, after_month, channel, limit)
