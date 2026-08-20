"""The Command Center endpoints.

Every route parses query parameters into the one shared `FilterState`,
delegates, and serialises. No business logic lives here — see app/tpo/service.py
for the payloads and app/tpo/aggregate.py for the arithmetic.

All seven take the SAME filter parameters, so the cards, trend, alerts and
tables are always describing one scope.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.tpo import service
from app.tpo.filters import FilterState

router = APIRouter(prefix="/api/command-center", tags=["command-center"])

ListParam = Annotated[list[str] | None, Query()]


def get_filters(
    year: int | None = None,
    month: int | None = Query(None, ge=1, le=12),
    channel: ListParam = None,
    retailer: ListParam = None,
    region: ListParam = None,
    state: ListParam = None,
    city: ListParam = None,
    tier: ListParam = None,
    distributor: ListParam = None,
    category: ListParam = None,
    brand: ListParam = None,
    product: ListParam = None,
    promotion: ListParam = None,
    promotion_type: ListParam = None,
) -> FilterState:
    """The shared filter contract, parsed once and reused by every route."""
    return FilterState.build(
        year=year, month=month, channel=channel, retailer=retailer, region=region,
        state=state, city=city, tier=tier, distributor=distributor,
        category=category, brand=brand, product=product, promotion=promotion,
        promotion_type=promotion_type,
    )


Filters = Annotated[FilterState, Depends(get_filters)]
Currency = Annotated[str, Query(pattern="^(INR|USD|inr|usd)$")]


@router.get("/filters")
def filters(state: Filters) -> dict[str, Any]:
    """Dependent option lists for the current selection."""
    return service.filters(state)


@router.get("/kpis")
def kpis(state: Filters, currency: Currency = "INR") -> dict[str, Any]:
    """The six KPI cards, from the single engine in app/tpo/aggregate.py."""
    return service.kpis(state, currency)


@router.get("/trend")
def trend(
    state: Filters,
    granularity: Annotated[str, Query(pattern="^(week|month)$")] = "week",
    currency: Currency = "INR",
) -> dict[str, Any]:
    return service.trend(state, granularity, currency)


@router.get("/risk-alerts")
def risk_alerts(state: Filters, currency: Currency = "INR", limit: int = 20) -> dict[str, Any]:
    return service.risk_alerts(state, currency, limit)


@router.get("/underperforming-promotions")
def underperforming_promotions(
    state: Filters, currency: Currency = "INR", limit: int = 20
) -> dict[str, Any]:
    return service.underperforming_promotions(state, currency, limit)


@router.get("/promotion-mix")
def promotion_mix(state: Filters, currency: Currency = "INR") -> dict[str, Any]:
    return service.promotion_mix(state, currency)


@router.get("/top-promotions")
def top_promotions(state: Filters, currency: Currency = "INR", limit: int = 10) -> dict[str, Any]:
    return service.top_promotions(state, currency, limit)


#: Built from the service's own whitelists so the route and the implementation
#: cannot drift — adding a dimension there is enough to expose it here.
_BY_PATTERN = "^(" + "|".join(service.BREAKDOWN_DIMENSIONS) + ")$"
_METRIC_PATTERN = "^(" + "|".join(service.BREAKDOWN_METRICS) + ")$"


@router.get("/breakdown")
def breakdown(
    state: Filters,
    by: Annotated[str, Query(pattern=_BY_PATTERN)],
    metric: Annotated[str, Query(pattern=_METRIC_PATTERN)] = "incremental_sales",
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    currency: Currency = "INR",
) -> dict[str, Any]:
    """Every KPI per value of one dimension — the single source behind all the
    ranking and scatter charts.

    Deliberately one endpoint rather than one per dimension: the alternative is
    ten places for the same aggregation to drift apart.
    """
    return service.breakdown(state, by=by, currency=currency, metric=metric, limit=limit)
