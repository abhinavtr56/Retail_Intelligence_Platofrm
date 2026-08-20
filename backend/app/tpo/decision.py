"""The governed decision record -- B7.

Assembles one read-only record from results the earlier phases already
produced: the investigation context, the selected scenario's simulation, the
recommendation, the risk assessment and -- optionally -- the weekly
decomposition.

AN ASSEMBLY, NOT A CALCULATION. Nothing here computes a KPI, re-derives an
uplift, re-runs a comparison, re-applies the recommendation policy or
re-assesses risk. Every figure is carried through verbatim from the contract
that owns it, and `provenance.assembled_from` names each one. If a number in
Decision Center ever disagrees with the same number in Simulation Studio, the
cause is a bug in this file rather than a second opinion.

WHY THE SECTIONS ARE VALIDATED AGAINST EACH OTHER
-------------------------------------------------
A record silently combining scenario A's impact with scenario B's
recommendation, or a risk assessment computed over a different scope, would be
worse than no record at all -- it would look authoritative and be wrong. So
every section is checked to describe the SAME scenario over the SAME scope
before anything is assembled, and a mismatch is refused rather than merged.

The strongest of those checks costs nothing: B6 already carries the exact
simulation provenance it assessed, so `risk.provenance.scenario_provenance ==
simulation.provenance` proves the risk describes this scenario and no other.

NOT APPROVED, AND NOT APPROVABLE HERE
-------------------------------------
`can_be_approved` is False in every record. This project defines no approval
criteria -- nothing states who approves a promotion decision, against what
tests, or in what order -- so declaring a record approvable would be inventing
governance in code. The record instead states plainly what is recommended,
what is governed, what is unverified and why it cannot yet be approved.

RECOMMENDED IS NOT APPROVED, AND SELECTED IS NOT RECOMMENDED. The user chooses
which scenario to carry here. If that is the recommended one the record says
so; if it is not, the record says that too, and the recommendation is carried
through unchanged either way.
"""

from __future__ import annotations

from typing import Any

from app.tpo import response, simulation

#: Every source this record is assembled from, in the order it reads them.
ASSEMBLED_FROM = (
    "/api/simulation/context",
    "/api/simulation/simulate",
    "/api/simulation/recommend",
    "/api/simulation/risk",
    "/api/simulation/weekly (optional)",
)

METHOD = (
    "A read-only assembly of results the simulation, recommendation and risk "
    "contracts already produced. No KPI, uplift, comparison, recommendation or "
    "risk finding is recalculated here; every figure is carried through verbatim."
)

#: Why no record can be approved yet. Stated once.
NO_APPROVAL_CRITERIA = (
    "This project defines no approval criteria: nothing states who approves a "
    "promotion decision, against which tests, or in what order. A record cannot be "
    "declared approvable against rules that do not exist."
)


class SectionMismatch(ValueError):
    """Two sections of the record do not describe the same thing."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise SectionMismatch(message)


def validate(
    context: dict[str, Any],
    scenario: dict[str, Any],
    recommendation: dict[str, Any],
    risk: dict[str, Any],
    weekly: dict[str, Any] | None,
) -> None:
    """Every section must describe the same scenario over the same scope.

    Checked rather than assumed. A record that combined one scenario's impact
    with another's recommendation would read as authoritative and be wrong.
    """
    scenario_id = scenario.get("scenario_id")
    _require(bool(scenario_id), "The simulation payload carries no scenario_id.")

    # --- risk was assessed on THIS simulation
    _require(
        risk.get("scenario_id") == scenario_id,
        f"The risk assessment is for scenario {risk.get('scenario_id')!r}, not "
        f"{scenario_id!r}.",
    )
    _require(
        (risk.get("provenance") or {}).get("scenario_provenance") == scenario.get("provenance"),
        "The risk assessment was computed from a different simulation result than the "
        "one supplied. Re-assess the selected scenario before carrying it here.",
    )

    # --- the scope the investigation established is the scope simulated
    context_scope = (context.get("filter_state") or {}).get("value")
    scenario_scope = (scenario.get("scope") or {}).get("filters_applied")
    _require(
        context_scope == scenario_scope,
        f"The investigation context describes a different scope ({context_scope}) "
        f"from the simulated scenario ({scenario_scope}).",
    )

    # --- the recommendation considered this scenario
    #
    # The recommendation payload carries no scope of its own, so membership is
    # the available proof: a recommendation that never saw this scenario cannot
    # be presented beside it.
    considered = {s.get("scenario_id") for s in recommendation.get("eligible_scenarios", [])} | {
        s.get("scenario_id") for s in recommendation.get("excluded_scenarios", [])
    }
    _require(
        scenario_id in considered,
        f"The recommendation did not consider scenario {scenario_id!r}. It covers "
        f"{sorted(c for c in considered if c)}.",
    )

    if weekly is not None:
        _require(
            weekly.get("scenario_id") == scenario_id,
            f"The weekly decomposition is for scenario {weekly.get('scenario_id')!r}, "
            f"not {scenario_id!r}.",
        )
        _require(
            weekly.get("discount_pct") == scenario.get("discount_pct"),
            "The weekly decomposition was built at a different treatment from the "
            "selected scenario.",
        )
        _require(
            (weekly.get("provenance") or {}).get("scope") == scenario_scope,
            "The weekly decomposition covers a different scope from the selected "
            "scenario.",
        )


# --- sections ---------------------------------------------------------------


def _expected_impact(scenario: dict[str, Any]) -> list[dict[str, Any]]:
    """The scenario's KPIs, carried whole.

    BOTH ENDS OF THE APPROVED RANGE, never a midpoint: the band is the approved
    rule's bounds and collapsing it would invent a precision the rule does not
    grant. An unavailable metric keeps the engine's own reason and is never
    zero-filled.
    """
    low = (scenario.get("result", {}).get("low", {}) or {}).get("kpis", {}) or {}
    high = (scenario.get("result", {}).get("high", {}) or {}).get("kpis", {}) or {}

    impact = []
    for kpi in simulation.SIMULATION_KPIS:
        low_cell, high_cell = low.get(kpi.key, {}), high.get(kpi.key, {})
        if not low_cell:
            continue
        available = bool(low_cell.get("available")) and bool(high_cell.get("available"))
        impact.append(
            {
                "metric": kpi.key,
                "label": low_cell.get("label"),
                "unit": low_cell.get("unit"),
                "low": low_cell.get("value"),
                "high": high_cell.get("value"),
                "display_low": low_cell.get("display_value"),
                "display_high": high_cell.get("display_value"),
                "available": available,
                "unavailable_reason": low_cell.get("unavailable_reason")
                or high_cell.get("unavailable_reason"),
            }
        )
    return impact


def _investigation(context: dict[str, Any]) -> dict[str, Any]:
    """Who is asking, and about what -- with B3.1's honest nulls intact.

    A question the user never asked stays absent: B3.1 reports the seeded
    example as `seed_example` rather than as the investigation's own, and that
    distinction survives into the decision record.
    """
    question = context.get("question") or {}
    identity = context.get("investigation_id") or {}
    return {
        "question": question.get("value"),
        "question_source": question.get("source"),
        "question_unavailable_reason": question.get("reason"),
        "investigation_id": identity.get("value"),
        "investigation_id_unavailable_reason": identity.get("reason"),
        "investigation_type": (context.get("investigation_type") or {}).get("value"),
        "source": context.get("source"),
    }


def _recommendation_section(
    recommendation: dict[str, Any], scenario_id: str
) -> dict[str, Any]:
    """The recommendation, verbatim.

    Not re-derived and not reinterpreted. `is_this_scenario` is a comparison of
    two ids and nothing more -- selecting a scenario the policy did not choose
    does not change what the policy chose.
    """
    recommended_id = recommendation.get("recommended_scenario_id")
    policy = recommendation.get("policy") or {}
    return {
        "recommended_scenario_id": recommended_id,
        "is_this_scenario": recommended_id is not None and recommended_id == scenario_id,
        "status": recommendation.get("status"),
        "policy_version": policy.get("version"),
        "objective": policy.get("objective"),
        "primary_metric": policy.get("primary_metric"),
        "primary_endpoint": policy.get("primary_endpoint"),
        "reason": recommendation.get("reason"),
        "note": (
            "Recommended under the current decision policy. A different policy could "
            "select a different scenario; this is a preference under the stated rule, "
            "not a statement that the scenario is best in every respect."
        ),
    }


def _governance_section(risk: dict[str, Any]) -> dict[str, Any]:
    """B6's assessment, verbatim -- findings, gaps and limitations unchanged.

    Nothing here converts a governance gap into a compliance verdict. Where the
    project has approved no boundary, the gap travels through saying so.
    """
    return {
        "overall_status": risk.get("overall_status"),
        "overall_status_rule": risk.get("overall_status_rule"),
        "summary": risk.get("summary"),
        "findings": risk.get("findings", []),
        "governance_gaps": risk.get("governance_gaps", []),
        "limitations": risk.get("limitations", []),
        "policy_version": (risk.get("policy") or {}).get("version"),
    }


def _readiness(risk: dict[str, Any], recommendation_section: dict[str, Any]) -> dict[str, Any]:
    """What stands between this record and an approval.

    `can_be_approved` is False in every record -- see NO_APPROVAL_CRITERIA. The
    blockers and unverified lists are built from B6's own findings so the record
    says exactly what remains open rather than gesturing at it.
    """
    findings = risk.get("findings", [])

    blockers = [
        {
            "id": "no_approval_criteria",
            "title": "No approval criteria are defined",
            "detail": NO_APPROVAL_CRITERIA,
        }
    ]
    blockers += [
        {"id": f["id"], "title": f["title"], "detail": f["reason"]}
        for f in findings
        if f.get("status") == "attention" and f.get("severity") == "high"
    ]

    unverified = [
        {"id": f["id"], "title": f["title"], "detail": f["reason"],
         "action": f.get("recommended_action")}
        for f in findings
        if f.get("status") in {"attention", "unknown"} and not (
            f.get("status") == "attention" and f.get("severity") == "high"
        )
    ]
    unverified += [
        {"id": gap["key"], "title": gap["label"], "detail": gap["statement"], "action": None}
        for gap in risk.get("governance_gaps", [])
    ]

    return {
        "can_be_approved": False,
        "reason": NO_APPROVAL_CRITERIA,
        "blockers": blockers,
        "unverified": unverified,
        "states": {
            "recommended": recommendation_section["is_this_scenario"],
            "governed": risk.get("overall_status") == "clear",
            "ready_to_review": True,
            "approved": False,
        },
        "states_note": (
            "Recommended, governed, ready to review and approved are four different "
            "things. A scenario can be recommended under the decision policy and still "
            "carry open governance items, and no record is approved here."
        ),
    }


# --- the record -------------------------------------------------------------


def build_record(
    context: dict[str, Any],
    scenario: dict[str, Any],
    recommendation: dict[str, Any],
    risk: dict[str, Any],
    weekly: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Assemble one governed decision record.

    Raises `SectionMismatch` when the sections do not describe the same
    scenario over the same scope. Nothing is recalculated.
    """
    validate(context, scenario, recommendation, risk, weekly)

    scenario_id = scenario["scenario_id"]
    recommendation_section = _recommendation_section(recommendation, scenario_id)
    scope = scenario.get("scope") or {}

    return {
        # NO PERSISTENCE IN B7. A record is assembled per request and stored
        # nowhere, so it has no identity to hand out -- an id here would invite
        # a client to believe it could be retrieved again.
        "decision_id": None,
        "status": "draft",
        "scenario": {
            "scenario_id": scenario_id,
            "name": scenario.get("name") or scenario_id,
            "treatment": scenario.get("treatment"),
            "discount_pct": scenario.get("discount_pct"),
            "uplift": scenario.get("uplift"),
            "range_label": scenario.get("range_label"),
        },
        "investigation": _investigation(context),
        "scope": {
            "filters_applied": scope.get("filters_applied"),
            "period": scope.get("period"),
            "row_count": scope.get("row_count"),
            "promoted_row_count": scope.get("promoted_row_count"),
            "excluded_rows": scope.get("excluded_rows"),
        },
        "expected_impact": _expected_impact(scenario),
        "recommendation": recommendation_section,
        "governance": _governance_section(risk),
        "weekly": (
            {
                "available": True,
                "week_count": len(weekly.get("weeks", [])),
                "weeks": weekly.get("weeks", []),
                "metrics": weekly.get("metrics", []),
                "reconciliation": weekly.get("reconciliation"),
                "method": (weekly.get("provenance") or {}).get("method"),
            }
            if weekly is not None
            else {
                "available": False,
                "reason": (
                    "No weekly decomposition was carried with this scenario. Open the "
                    "weekly view in Simulation Studio to include it."
                ),
            }
        ),
        "readiness": _readiness(risk, recommendation_section),
        "provenance": {
            "assembled_from": list(ASSEMBLED_FROM),
            "kpi_engine": (scenario.get("provenance") or {}).get("kpi_engine"),
            "response_rule": (scenario.get("provenance") or {}).get("response_rule"),
            "promotion_cost_rate": (scenario.get("provenance") or {}).get("promotion_cost_rate"),
            "recommendation_policy_version": recommendation_section["policy_version"],
            "risk_policy_version": (risk.get("policy") or {}).get("version"),
            "scenario_provenance": scenario.get("provenance"),
            "method": METHOD,
        },
        "meta": {
            "phase": "B7",
            "persisted": False,
            "persistence_note": (
                "This record is assembled per request and stored nowhere. It cannot be "
                "retrieved later, and reloading the page does not recover it."
            ),
        },
    }
