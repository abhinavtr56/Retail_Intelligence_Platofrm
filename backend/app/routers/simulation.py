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
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.tpo import (
    comparison,
    execution,
    investigation,
    optimization,
    recommendation,
    risk,
    simulation,
    weekly,
)
from app.tpo.filters import FilterState
from app.tpo.response import UnapprovedDiscount

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


class InvestigationContextRequest(BaseModel):
    """An RCA handoff, on its way to becoming a Simulation context.

    Everything except `filters` is optional because RCA genuinely supplies
    almost none of it today. The endpoint's job is to say so field by field
    rather than to demand values that do not exist.

    NOTE what is absent: no KPI value, no trade spend, no ROI. RCA's figures
    are authored display copy -- one of its context chips reports a trade spend
    of Rs 98.6 Cr where the validated engine measures Rs 7.7 Cr -- so none of
    them may enter a simulation. The scope travels as a FilterState and
    Simulation measures it for itself.
    """

    model_config = ConfigDict(extra="forbid")

    filters: SimulationFilters = Field(default_factory=SimulationFilters)
    #: The user's free-text query from the Investigations page, if they have
    #: actually run one. See `investigation_started`.
    question: Annotated[str | None, Field(max_length=500)] = None
    #: False means the user has not run an investigation, so any question the
    #: client is holding is the seeded example rather than something they
    #: asked. The endpoint refuses to report a seeded question as the
    #: investigation's own.
    investigation_started: bool = False
    #: Reserved. RCA assigns no identifier today; the field exists so the
    #: contract does not change shape when it does.
    investigation_id: Annotated[str | None, Field(max_length=64)] = None
    investigation_type: Annotated[str | None, Field(max_length=32)] = None
    problem_statement: Annotated[str | None, Field(max_length=1000)] = None


@router.post("/context")
def context(body: InvestigationContextRequest) -> dict[str, Any]:
    """Validate an RCA handoff into a Simulation context.

    Contract plumbing only. It runs no scenario and computes no KPI, and it
    does not touch /run or /simulate, both of which are unchanged. Every field
    comes back stamped with its provenance, and a field RCA cannot supply comes
    back null with the reason rather than with a plausible default.
    """
    try:
        state = body.filters.to_state()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return investigation.build_context(
        state,
        question=body.question,
        investigation_started=body.investigation_started,
        investigation_id=body.investigation_id,
        investigation_type=body.investigation_type,
        problem_statement=body.problem_statement,
    )


class ComparisonEntry(BaseModel):
    """One scenario offered for comparison.

    Exactly one of `measured` or `simulated` carries a result; an entry with
    neither is a scenario nobody has run, and it is EXCLUDED rather than
    counted as zero.

    Results are posted back rather than recomputed. Re-running them here would
    duplicate B2.2's execution and risk the comparison disagreeing with the
    numbers already on the user's screen.
    """

    model_config = ConfigDict(extra="forbid")

    scenario_id: Annotated[str, Field(min_length=1, max_length=64)]
    name: Annotated[str, Field(max_length=120)] = ""
    #: The `kpis` block from /simulation/run, for the measured Current Plan.
    measured: dict[str, Any] | None = None
    #: The scope that measured block was computed over.
    scope: dict[str, Any] | None = None
    #: A whole /simulation/simulate payload, which carries its own scope and
    #: provenance and is validated against the comparison's.
    simulated: dict[str, Any] | None = None


class ComparisonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filters: SimulationFilters = Field(default_factory=SimulationFilters)
    entries: Annotated[list[ComparisonEntry], Field(min_length=1, max_length=12)]
    currency: Annotated[str, Field(pattern="^(INR|USD|inr|usd)$")] = "INR"


@router.post("/compare")
def compare(body: ComparisonRequest) -> dict[str, Any]:
    """Line up already-computed scenario results side by side.

    Runs nothing and computes no KPI: it reads results /run and /simulate
    already produced, checks they describe the same rows on the same economic
    basis, and reports each metric with its delta at BOTH ends of the approved
    uplift range.

    It does not rank, score, weight or recommend. `recommendation` is null in
    every response, with the reason and the list of what a future
    recommendation would need.
    """
    try:
        state = body.filters.to_state()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return comparison.compare(
        state.applied(),
        [entry.model_dump() for entry in body.entries],
        currency=body.currency,
    )


class WeeklyRequest(BaseModel):
    """One simulated scenario to decompose across its business weeks.

    Note what a caller CANNOT send: an uplift, a promotion cost rate, a trade
    spend or a response rule. The treatment and its approved band are resolved
    from app/tpo/response.py, so the economics of the weekly view cannot drift
    from the economics of the scenario it decomposes.
    """

    model_config = ConfigDict(extra="forbid")

    filters: SimulationFilters = Field(default_factory=SimulationFilters)
    scenario_id: Annotated[str, Field(min_length=1, max_length=64)]
    discount_pct: float
    currency: Annotated[str, Field(pattern="^(INR|USD|inr|usd)$")] = "INR"


class RiskRequest(BaseModel):
    """One simulated scenario to assess, plus the decision context around it.

    Both payloads are results the client ALREADY has: the /simulate response
    and, optionally, the /recommend response. Nothing is recomputed here --
    passing them in is what guarantees the assessment describes the same
    numbers the user is looking at.
    """

    model_config = ConfigDict(extra="forbid")

    #: A whole /simulation/simulate payload.
    scenario: dict[str, Any]
    #: A whole /simulation/recommend payload, when one exists. B6 reads B4's
    #: answer and never changes it.
    recommendation: dict[str, Any] | None = None
    #: True when the weekly view is on screen, so its standing limitation is
    #: surfaced alongside the others.
    weekly_included: bool = False


@router.post("/risk")
def risk_assessment(body: RiskRequest) -> dict[str, Any]:
    """Assess the risk and governance position of one simulated scenario.

    An ASSESSMENT, not a recommendation. It runs no simulation, recomputes no
    KPI, re-runs no recommendation policy, and cannot change which scenario
    B4.3 selected -- `recommendation_context` carries that through untouched.

    Where the project has approved no boundary -- a budget ceiling, a margin
    floor, a cannibalization limit -- the metric is reported as a measurement
    with the gap named, rather than judged against an invented threshold.
    """
    if not body.scenario.get("scenario_id"):
        raise HTTPException(
            status_code=422,
            detail="A simulated scenario is required. Run a scenario before assessing it.",
        )
    return risk.assess(
        body.scenario,
        recommendation=body.recommendation,
        weekly_included=body.weekly_included,
    )


@router.post("/weekly")
def weekly_impact(body: WeeklyRequest) -> dict[str, Any]:
    """Decompose one simulated scenario across the business weeks in scope.

    A DECOMPOSITION, NOT A FORECAST: every week returned is a week the data has
    rows for, and every figure comes from the same validated KPI engine that
    produced the aggregate. No week is generated and no interval is estimated.

    Runs the same counterfactual B2.2 builds; /simulate is untouched.
    """
    try:
        state = body.filters.to_state()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        return weekly.weekly(
            state,
            scenario_id=body.scenario_id,
            discount_pct=body.discount_pct,
            currency=body.currency,
        )
    except UnapprovedDiscount as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except weekly.NoWeeklyData as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/recommend")
def recommend(body: ComparisonRequest) -> dict[str, Any]:
    """Apply the decision policy to already-computed scenario results.

    Takes the same body as /compare -- the recommendation is the comparison
    plus a policy, and building it from the same input is what stops the two
    from disagreeing on screen.

    Runs no scenario and recomputes no KPI. The policy that produced the
    answer travels back with it, so the recommendation is never a black box.
    """
    try:
        state = body.filters.to_state()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return recommendation.recommend(
        state.applied(),
        [entry.model_dump() for entry in body.entries],
        currency=body.currency,
    )


#: Causal levers this project cannot support, and why. Rejected by name with
#: the reason rather than by a bare "extra inputs are not permitted", because a
#: caller sending `spend_amount` has a mistaken model of the economics and
#: needs to be told which one.
_REJECTED_INPUTS = {
    "spend_amount": (
        "Trade spend is derived from scenario economics -- in the approved rules it "
        "is b(1+u)P(d+c), an output of the treatment rather than an independent "
        "input. It is measured from the simulated rows and returned in the result."
    ),
    "incentive_pct": (
        "No dataset in this project splits retailer support out of Promotion_Cost, "
        "so a retailer incentive cannot be simulated."
    ),
    "inventory_allocation": (
        "The project holds no inventory data, so an inventory allocation cannot be "
        "simulated."
    ),
}


class SimulateRequest(BaseModel):
    """One hypothetical scenario to execute.

    `discount_pct` must be one of the five APPROVED treatment depths -- the
    router does not decide which; app/tpo/response.py owns that and raises. No
    value is rounded, snapped or interpolated on the way in.

    `duration_weeks` is accepted for B1 scenario-state compatibility and is
    ECHOED, NOT MODELLED: no approved rule maps weeks to uplift, so admitting
    one that changed the answer would be inventing a response curve.
    """

    model_config = ConfigDict(extra="forbid")

    filters: SimulationFilters = Field(default_factory=SimulationFilters)
    scenario_id: Annotated[str, Field(min_length=1, max_length=64)]
    discount_pct: float
    duration_weeks: Annotated[float | None, Field(ge=0)] = None
    currency: Annotated[str, Field(pattern="^(INR|USD|inr|usd)$")] = "INR"

    @model_validator(mode="before")
    @classmethod
    def _reject_unsupported_levers(cls, data: Any) -> Any:
        """Name the unsupported lever and say why it cannot be one."""
        if isinstance(data, dict):
            for key, reason in _REJECTED_INPUTS.items():
                if key in data:
                    raise ValueError(f"{key} is not a simulation input. {reason}")
        return data


@router.post("/simulate")
def simulate(body: SimulateRequest) -> dict[str, Any]:
    """Execute one hypothetical scenario and return its result RANGE.

    The scenario's discount resolves to an approved treatment, counterfactual
    rows are synthesized at each end of that treatment's approved uplift band,
    and both ends are read by the existing validated KPI engine. No KPI is
    computed here or in the service.

    `low`/`high` are the two ends of the approved uplift range. They are not a
    confidence interval and are not statistical uncertainty -- see
    `execution.RANGE_LABEL` and the provenance block on every response.
    """
    try:
        state = body.filters.to_state()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        return execution.simulate(
            state,
            scenario_id=body.scenario_id,
            discount_pct=body.discount_pct,
            duration_weeks=body.duration_weeks,
            currency=body.currency,
        )
    except UnapprovedDiscount as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except execution.NoApplicableRows as exc:
        # 422, not 404: the scope is well-formed and simply holds nothing a
        # treatment could replace. A zeroed result would be the wrong answer.
        raise HTTPException(status_code=422, detail=str(exc)) from exc


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


# --- General Optimization ---------------------------------------------------
#
# A SECOND, SEPARATE MODE. It shares the ONE FilterState and the approved
# promotion economics with the Investigation Simulation above, and nothing
# else: no route here calls /run, /simulate, /compare, /recommend, /weekly or
# /risk, and none of those changed to make room for these two.


class GeneralOptimizationScopeRequest(BaseModel):
    """The scope controls, before a budget has been chosen.

    Deliberately NOT a `SimulationFilters`: this mode offers exactly three
    dimensions -- category, channel and month -- and accepting the other eleven
    would let a caller build a scope the screen cannot show or explain. The
    fields are handed to the same `FilterState.build`, so they are the same
    dimensions the rest of the project filters on.
    """

    model_config = ConfigDict(extra="forbid")

    category: list[str] | None = None
    channel: list[str] | None = None
    month: Annotated[int | None, Field(ge=1, le=12)] = None
    currency: Annotated[str, Field(pattern="^(INR|USD|inr|usd)$")] = "INR"

    def to_state(self) -> FilterState:
        # `year` is deliberately absent. The historical reference is BOTH 2024
        # and 2025 by contract, and the service resolves each year itself --
        # letting a caller pin one would silently halve the reference.
        return FilterState.build(month=self.month, category=self.category, channel=self.channel)


class GeneralOptimizationRequest(GeneralOptimizationScopeRequest):
    """The scope plus the business constraints.

    `max_trade_spend` is bounded by the historical average for the selected
    scope, which the client learns from /general-optimization/scope. A value
    above it is clamped by the service rather than rejected, and the response
    reports the clamp -- a slider that has drifted out of date should not lose
    the user their request.
    """

    model_config = ConfigDict(extra="forbid")

    max_trade_spend: Annotated[float, Field(ge=0)]
    min_discount_pct: Annotated[float, Field(ge=0, le=100)] = 0.0
    max_discount_pct: Annotated[float, Field(ge=0, le=100)] = optimization.MAX_DISCOUNT_PCT


@router.post("/general-optimization/scope")
def general_optimization_scope(body: GeneralOptimizationScopeRequest) -> dict[str, Any]:
    """Measure the selected scope so its controls can be bounded.

    The trade-spend ceiling is the one thing the client cannot work out for
    itself: it is the mean Trade Spend across 2024 and 2025 for this category,
    channel and month, measured by the validated engine. Optimises nothing.
    """
    try:
        state = body.to_state()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return optimization.scope(state, currency=body.currency)


@router.post("/general-optimization")
def general_optimization(body: GeneralOptimizationRequest) -> dict[str, Any]:
    """Allocate a trade-spend budget across the selected scope.

    Maximises optimized revenue at the bottom of each approved uplift band
    subject to optimized trade spend at the TOP of that band staying inside the
    ceiling. Every treatment it may place is one of the five approved depths;
    it interpolates none of them, and a plan it could not produce comes back as
    a status with the reason and no numbers.
    """
    try:
        state = body.to_state()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        return optimization.optimize(
            state,
            max_trade_spend=body.max_trade_spend,
            min_discount_pct=body.min_discount_pct,
            max_discount_pct=body.max_discount_pct,
            currency=body.currency,
        )
    except optimization.InvalidConstraints as exc:
        # 422: the scope is well-formed and the constraints contradict each
        # other. A clamped or emptied plan would hide the contradiction.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
