"""The scenario model -- Part B1.

A scenario is a NAMED LEVER SET over the simulation context. Exactly one of
them, Current Plan, is measured: its levers are what the data says actually
happened and its result is the validated KPI bundle. Every other scenario is
hypothetical -- a lever set that is worth nothing until something runs it.

THE DISTINCTION THIS MODULE EXISTS TO ENFORCE
---------------------------------------------
An UNRUN hypothetical carries `result: None`. Not zero, not the baseline's
numbers, not the baseline's numbers nudged by a factor -- None, so that a
client cannot render a hypothetical scenario as though it had been evaluated.
B2.2 added a third status, "simulated", and it is legitimate only because B2.2
genuinely executes scenarios: app/tpo/execution.py sets it on the way out of a
run that happened, and the guard then requires a result AND its provenance.
`assert_no_fabricated_results` is that guard, and it runs on the real payload.

"OPTIMIZED PLAN" IS A LABEL, NOT A CLAIM. There is no optimizer in this
project. Nothing here makes the Optimized Plan better than the Current Plan,
because nothing here evaluates either of them. The scenario exists so the
user has somewhere to put a lever set; what it is worth is unknown until the
response model is built.

ISOLATION. Every scenario is built with its OWN lever dict. They start equal
-- seeded from the observed plan, which is the sensible place for a what-if to
begin -- and they are separate objects, so editing one cannot reach another.
Sharing one mutable dict across three scenarios is the specific bug this
docstring exists to prevent.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

#: A scenario whose numbers came from the data, one nobody has run, or one an
#: execution actually produced. "simulated" was added in B2.2 and ONLY because
#: B2.2 genuinely executes scenarios -- app/tpo/execution.py sets it on the way
#: out of a run that happened. Nothing else in the codebase may set it.
ScenarioStatus = Literal["measured", "not_simulated", "simulated"]

#: What KIND of thing the scenario is, independent of whether it has been run.
#: The Current Plan is measured forever; a hypothetical stays hypothetical even
#: after Part B2 gives it a result.
ScenarioKind = Literal["measured", "hypothetical"]


@dataclass(frozen=True)
class ScenarioTemplate:
    """The identity of a default scenario. Frozen, and the only place the three
    default scenarios are named -- the frontend writes none of this down."""

    id: str
    name: str
    #: Shown under the name on the scenario card. Must describe the scenario's
    #: STATE, never promise an outcome.
    sub_label: str
    kind: ScenarioKind
    status: ScenarioStatus


#: The three default scenarios. Their sub-labels deliberately say what the
#: scenario IS rather than what it would achieve: "Configure levers", not
#: "Recommended" or "Maximize share". Nothing in this project can currently
#: justify the second kind of wording.
DEFAULT_SCENARIOS: tuple[ScenarioTemplate, ...] = (
    ScenarioTemplate(
        id="current-plan",
        name="Current Plan",
        sub_label="Measured baseline",
        kind="measured",
        status="measured",
    ),
    ScenarioTemplate(
        id="optimized-plan",
        name="Optimized Plan",
        sub_label="Configure levers",
        kind="hypothetical",
        status="not_simulated",
    ),
    ScenarioTemplate(
        id="aggressive-growth",
        name="Aggressive Growth",
        sub_label="Configure levers",
        kind="hypothetical",
        status="not_simulated",
    ),
)

#: Why a hypothetical scenario has no result. One sentence, stated once, and
#: carried on the scenario itself so a card can explain its own emptiness.
NOT_SIMULATED_REASON = (
    "This scenario has not been simulated. Its levers are recorded as inputs "
    "only -- scenario response modelling arrives in the next part."
)

#: The levers a scenario carries. Exactly the keys the Phase A API accepts;
#: `incentive_pct` and `inventory_allocation` are absent here for the same
#: reason they are absent there -- no dataset in this project backs them.
LEVER_KEYS: tuple[str, ...] = ("discount_pct", "duration_weeks", "spend_amount")


def seed_levers(observed: dict[str, Any]) -> dict[str, float | None]:
    """A fresh lever dict for one scenario, seeded from the observed plan.

    Returns a NEW dict every call. Callers must not share the result: three
    scenarios holding one dict is three scenarios that edit each other.
    """
    return {key: observed.get(key) for key in LEVER_KEYS}


def build(observed_levers: dict[str, Any], measured_result: dict[str, Any] | None) -> list[dict[str, Any]]:
    """The default scenario set for one context.

    `measured_result` is the validated KPI bundle and belongs to the Current
    Plan alone. Every hypothetical gets `result: None` and a reason, never a
    copy of it.
    """
    scenarios: list[dict[str, Any]] = []
    for template in DEFAULT_SCENARIOS:
        measured = template.kind == "measured"
        scenarios.append(
            {
                "id": template.id,
                "name": template.name,
                "sub_label": template.sub_label,
                "kind": template.kind,
                "status": template.status,
                # A separate dict per scenario. See the module docstring.
                "levers": seed_levers(observed_levers),
                "editable_levers": not measured,
                "result": measured_result if measured else None,
                "result_reason": None if measured else NOT_SIMULATED_REASON,
            }
        )
    return scenarios


def assert_no_fabricated_results(scenarios: list[dict[str, Any]]) -> None:
    """Status and result must agree, for every scenario, on the way out.

    A runtime guard rather than a test-only helper: it runs on the payload the
    API is about to return, so the invariant holds for real requests and not
    only for the ones a test happens to exercise.

    The three legal combinations, and nothing else:

        measured        -> a result, from the data
        not_simulated   -> NO result. Not zero, not the baseline's numbers,
                           not the baseline's numbers scaled.
        simulated       -> a result AND the provenance of the run that
                           produced it. A result with no provenance cannot be
                           traced back to a treatment, which is the same as
                           having been made up.

    B2.2 strengthened this from "hypotheticals carry nothing" to cover the new
    `simulated` status; it was not weakened to make room for it.
    """
    for scenario in scenarios:
        status, result = scenario["status"], scenario["result"]
        where = f"scenario {scenario['id']}"

        if scenario["kind"] == "measured":
            if status != "measured":
                raise AssertionError(f"{where} is measured but its status says {status!r}")
            continue

        if status == "not_simulated":
            if result is not None:
                # The wording keeps B1's phrase "hypothetical but carries a
                # result" deliberately: tests/test_simulation_scenarios.py
                # matches on it, and B2.2 strengthened this guard rather than
                # rewriting what it already promised.
                raise AssertionError(
                    f"{where} is hypothetical but carries a result while its status is "
                    "not_simulated; a scenario nobody ran has no numbers"
                )
        elif status == "simulated":
            if not result:
                raise AssertionError(f"{where} claims to be simulated but carries no result")
            if not result.get("provenance"):
                raise AssertionError(
                    f"{where} carries a simulated result with no provenance; a result "
                    "that cannot be traced to a treatment is indistinguishable from an "
                    "invented one"
                )
        else:
            raise AssertionError(f"{where} is hypothetical with an illegal status {status!r}")


def levers_are_isolated(scenarios: list[dict[str, Any]]) -> bool:
    """True when no two scenarios share one lever dict OBJECT.

    Equality is not the question -- they start equal on purpose. Identity is.
    """
    seen = [id(s["levers"]) for s in scenarios]
    return len(seen) == len(set(seen))
