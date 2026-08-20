"""Simulation Studio routes -- Phase A.

Mounted at `/api/simulation`, which does NOT collide with the two legacy
`/api/simulation/{type}` and `/api/simulation-default` page-data readers in
routers/pages.py: those take an investigation-type path segment, this one is a
POST to a fixed `/run`.

No business logic here. The route parses a body into the ONE `FilterState`
every other module already uses, delegates to app/tpo/simulation.py, and
serialises. The filter contract is deliberately the same object the Command
Center's query parameters build, so "the Simulation Studio's South Modern
Trade" and "the Command Center's South Modern Trade" are the same rows by
construction rather than by coincidence.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.tpo import simulation
from app.tpo.filters import FilterState

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


class SimulationFilters(BaseModel):
    """The request-body form of `FilterState`.

    A transport shape, NOT a second filter model: every field is handed
    straight to `FilterState.build`, which owns normalisation and rejects any
    dimension it does not know. `tests/test_simulation.py` asserts these field
    names are exactly `filters.DIMENSIONS`, so the two cannot drift apart.

    Year and month are the real calendar values, as everywhere else in the
    project; F24/F25 is a display label applied in app/tpo/formatting.py. Month
    semantics are the corrected ones by construction -- this model never sees a
    month, it passes one to the filter engine, which resolves it through the
    same week-derived path every KPI uses.
    """

    model_config = ConfigDict(extra="forbid")

    year: int | None = None
    month: Annotated[int | None, Field(ge=1, le=12)] = None
    channel: list[str] | None = None
    retailer: list[str] | None = None
    region: list[str] | None = None
    state: list[str] | None = None
    city: list[str] | None = None
    tier: list[str] | None = None
    distributor: list[str] | None = None
    category: list[str] | None = None
    brand: list[str] | None = None
    product: list[str] | None = None
    promotion: list[str] | None = None
    promotion_type: list[str] | None = None

    def to_state(self) -> FilterState:
        lists = self.model_dump(exclude={"year", "month"})
        return FilterState.build(year=self.year, month=self.month, **lists)


class SimulationLevers(BaseModel):
    """What the user moved.

    ACCEPTED AND NOT MODELLED in Phase A -- see app/tpo/simulation.py. The
    fields exist so the contract is ready for the response model; the response
    echoes them back with `applied: false` beside them.

    `extra="forbid"` on purpose. A client posting `incentive_pct` should get a
    422 telling it the lever does not exist, not a silent success that leaves
    it believing a retailer incentive was taken into account. No dataset in
    this project splits retailer support out of Promotion_Cost, and none
    carries inventory at all, so neither lever is offered.
    """

    model_config = ConfigDict(extra="forbid")

    discount_pct: Annotated[float | None, Field(ge=0, le=100)] = None
    duration_weeks: Annotated[float | None, Field(ge=0)] = None
    spend_amount: Annotated[float | None, Field(ge=0)] = None


class SimulationRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filters: SimulationFilters = Field(default_factory=SimulationFilters)
    levers: SimulationLevers | None = None
    #: Free-text label for the run. Not an id -- Phase A persists nothing.
    scenario_name: str | None = Field(default=None, max_length=120)
    currency: Annotated[str, Field(pattern="^(INR|USD|inr|usd)$")] = "INR"


@router.post("/run")
def run(body: SimulationRunRequest) -> dict[str, Any]:
    """The measured baseline for the submitted scope.

    Every KPI comes from the existing validated engine. The levers are
    recorded and echoed; they do not move a number, and the response says so
    in `levers.applied`.
    """
    try:
        state = body.filters.to_state()
    except ValueError as exc:  # unknown dimension -- FilterState.build's own guard
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return simulation.run(
        state,
        levers=body.levers.model_dump() if body.levers else None,
        scenario_name=body.scenario_name,
        currency=body.currency,
    )
