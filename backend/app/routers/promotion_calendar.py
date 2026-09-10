"""Promotion Calendar routes.

Mounted at `/api/promotion-calendar`, NOT at `/api/calendar` — that path
already serves the event calendar from `misc.py` and its contract is unchanged.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query

from app.tpo import promo_calendar

router = APIRouter(prefix="/api/promotion-calendar", tags=["promotion-calendar"])

#: No `pattern=` on either channel parameter.
#:
#: For the list form, Pydantic v2 applies a string pattern to the LIST rather
#: than to its items, which fails validation for every non-empty value. For the
#: single form, a pattern would have to be built at import time out of a fixed
#: channel list, and that is exactly the thing that goes stale -- it was
#: compiled from `CADENCE`, so a channel in dim_channel but not in that
#: declaration was rejected as "unknown" by the API even though the data had
#: it. Both are now checked at REQUEST time against the dimension, via
#: `promo_calendar.known_channels()`, so the routes accept precisely the
#: channels that exist.
ChannelParam = Annotated[list[str] | None, Query()]


def _reject_unknown(channels: list[str] | str | None) -> None:
    """422 for codes the dimension does not have. Nothing else is filtered."""
    if channels is None:
        return
    wanted = [channels] if isinstance(channels, str) else list(channels)
    unknown = sorted(set(wanted) - set(promo_calendar.known_channels()))
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown channel(s): {', '.join(unknown)}")


@router.get("/matrix")
def matrix(
    year: int,
    channel: ChannelParam = None,
) -> dict[str, Any]:
    """The 12-month x N-channel promotion grid for one year.

    `channel` may repeat, matching the list-parameter convention the Command
    Center filters already use. Omitted means every channel.
    """
    _reject_unknown(channel)
    return promo_calendar.matrix(year, channel)


@router.get("/cell")
def cell(
    year: int,
    month: Annotated[int, Query(ge=1, le=12)],
    channel: str,
) -> dict[str, Any]:
    """One Channel x Month: its promotions, their products, and — for weekly
    channels — the week-by-week breakdown."""
    _reject_unknown(channel)
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
    _reject_unknown(channel)
    return promo_calendar.upcoming(year, after_month, channel, limit)
