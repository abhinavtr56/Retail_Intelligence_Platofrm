"""The AI decision brief -- an EXPLANATION LAYER, and nothing else.

WHAT THIS IS. One OpenAI call that turns a decision record a person has to read
carefully into six paragraphs they can read quickly. That is its entire job.

WHAT THIS IS NOT, and the whole file is arranged to make it impossible:

  * It is not a calculator. No KPI, ROI, trade spend, incremental sales,
    margin, PEI, cannibalization or baseline is computed here, and none is
    computed by the model -- it never receives a raw number it could do
    arithmetic on. See `projection`.
  * It is not a decision maker. The scenario was chosen by the user, the
    recommendation by `app/tpo/recommendation.py`, the risk status by
    `app/tpo/risk.py`. The model is told all three and asked to explain them.
    It cannot change any of them, because nothing downstream reads its output
    for a value.
  * It is not the source of truth. The response is TEXT. Every number on the
    Decision Center page comes from the deterministic record; the brief is
    rendered beside them, labelled, and could be deleted without changing a
    single figure on screen.

THE MODEL NEVER SEES A NUMBER IT COULD RECOMPUTE. `projection()` sends the
DISPLAY STRINGS the engines already produced -- "48% - 61%", "Rs 41.8 L" -- and
not the floats behind them. There is nothing to divide, average or re-derive:
a midpoint of two display strings is not a thing a language model can produce
by accident, and the prompt forbids it explicitly as well.

AND WHAT IT WRITES IS CHECKED. `unverified_figures()` extracts every number the
model wrote and reports the ones that do not appear anywhere in the record it
was given. That is advisory, not a gate -- the brief is still returned, with
the list beside it, because silently discarding an explanation would be worse
than showing one with a flagged figure. The deterministic cards are unaffected
either way.

THE KEY IS SERVER-SIDE. It is read by `app/agents/client.py` from
`backend/.env`, which is gitignored. It is not in a request, not in a response,
not in a log line and not in any VITE_ variable. This module never reads it,
prints it or returns it.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.agents.client import DEFAULT_MODEL, AgentConfigError, complete_json

#: Stated once, returned with every brief, and rendered on the card.
DISCLAIMER = (
    "AI-generated explanation, based on the decision record shown on this page. "
    "It is an explanation only: every figure, the recommendation, the risk "
    "assessment and the readiness state are produced by the deterministic TPO "
    "engines and are not affected by anything written here."
)

#: What the model is allowed to be. Deliberately blunt and deliberately long --
#: every prohibition below corresponds to something that would be a real defect
#: if it appeared in an executive brief.
SYSTEM = """You are the TPO Intelligence Decision Brief assistant.

You are an EXPLANATION LAYER ONLY. A deterministic trade-promotion system has
already produced the decision record you are given. Your only job is to explain
it in concise executive language.

You MUST use only the supplied decision record.

You MUST NOT calculate, infer, estimate, invent or modify any business metric.
You MUST NOT invent numbers. Every figure you mention must appear verbatim in
the record you were given, copied exactly as it is written there.
You MUST NOT convert a range into an average, a midpoint or a single number. If
the record says "48% - 61%", you write "48% - 61%".
You MUST NOT convert an unavailable value into zero, or describe it as nothing,
none, or no impact. An unavailable metric is unmeasured, which is different.
If every_promoted_row_was_excluded is true, the scenario had nothing to compute
over and its zeros are the ABSENCE of a result. Say that, and give the exclusion
reason. Never describe those zeros as an expected outcome, a loss, or a
prediction that the promotion will deliver nothing.
You MUST NOT invent governance policies, approval criteria, thresholds, budget
ceilings, margin floors, compliance verdicts or confidence scores. This project
defines none, and claiming any would be false.
You MUST NOT change the selected scenario or the recommendation, disagree with
them, or suggest a scenario the record does not contain.
You MUST NOT claim anything was approved, submitted, notified, executed or
scheduled. Nothing was.

If information is not in the record, say exactly:
"Not available in the decision record."

Write plainly, for a commercial director. No preamble, no headings, no bullet
markers, no markdown. Two to four sentences per field. Be specific: name the
scenario, quote the record's own figures, and attribute findings to what the
record says rather than asserting them yourself."""

#: Strict structured output. Six fields, all required, nothing else accepted --
#: so the card renders known sections instead of parsing prose, and the model
#: cannot bury a stray recommendation in an unexpected key.
SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "why_this_scenario",
        "expected_impact",
        "key_evidence",
        "key_risks",
        "unverified",
        "next_action",
    ],
    "properties": {
        "why_this_scenario": {
            "type": "string",
            "description": (
                "Why this scenario is the one being decided, and whether the decision "
                "policy recommended it. State the policy's own reason."
            ),
        },
        "expected_impact": {
            "type": "string",
            "description": (
                "What the record expects this scenario to do, quoting its figures "
                "EXACTLY as written, ranges kept whole. Say which metrics are "
                "unavailable rather than omitting them."
            ),
        },
        "key_evidence": {
            "type": "string",
            "description": (
                "What supports this: the scope, the measured baseline, the scenario "
                "comparison, the policy that chose it."
            ),
        },
        "key_risks": {
            "type": "string",
            "description": "The risk findings the record carries, at their stated severity.",
        },
        "unverified": {
            "type": "string",
            "description": (
                "What the record says is unverified or blocking, including that this "
                "project configures no approval criteria."
            ),
        },
        "next_action": {
            "type": "string",
            "description": (
                "One concrete next step for a human. Never an approval, an execution "
                "or a notification -- none of those exist in this application."
            ),
        },
    },
}

#: The order the card renders them in, with the heading each one gets.
SECTIONS: tuple[tuple[str, str], ...] = (
    ("why_this_scenario", "Why this scenario"),
    ("expected_impact", "Expected impact"),
    ("key_evidence", "Key evidence"),
    ("key_risks", "Key risks"),
    ("unverified", "What remains unverified"),
    ("next_action", "Next action"),
)


class BriefError(RuntimeError):
    """The brief could not be generated. Decision Center is unaffected."""


# --- what the model is allowed to see ----------------------------------------


def _impact(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Expected impact as DISPLAY STRINGS, both ends, never the floats.

    The model gets "48% - 61%" and no way to reach 54.5: there is no low and no
    high field for it to average, because it is never sent two numbers -- it is
    sent one string the engine already formatted.
    """
    rows = []
    for metric in record.get("expected_impact", []):
        label = metric.get("label") or metric.get("metric")
        if metric.get("available"):
            rows.append({
                "metric": label,
                "expected_range": f"{metric.get('display_low')} - {metric.get('display_high')}",
                "kind": "simulated",
            })
        else:
            rows.append({
                "metric": label,
                "expected_range": None,
                "unavailable_reason": metric.get("unavailable_reason"),
                "kind": "simulated",
            })
    return rows


def _measured(record: dict[str, Any]) -> list[dict[str, Any]]:
    """The MEASURED baseline, kept in its own list and labelled as such.

    Separate from `_impact` on purpose. A single merged list is exactly how a
    reader -- or a model -- comes to describe a simulated band as something that
    already happened.
    """
    comparison = record.get("comparison") or {}
    if not comparison.get("available"):
        return []
    rows = []
    for metric in comparison.get("metrics", []):
        baseline = metric.get("baseline") or {}
        rows.append({
            "metric": metric.get("label"),
            "measured_value": baseline.get("display_value") if baseline.get("available") else None,
            "unavailable_reason": None if baseline.get("available")
            else baseline.get("unavailable_reason"),
            "kind": "measured_historical",
        })
    return rows


def _comparison(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Each compared scenario, as display strings, with its standing."""
    comparison = record.get("comparison") or {}
    if not comparison.get("available"):
        return []

    by_scenario: dict[str, dict[str, str]] = {}
    for metric in comparison.get("metrics", []):
        for cell in metric.get("scenarios", []):
            low, high = cell.get("low") or {}, cell.get("high") or {}
            if low.get("available") and high.get("available"):
                text = f"{low.get('display_value')} - {high.get('display_value')}"
            elif low.get("available"):
                text = str(low.get("display_value"))
            else:
                continue
            by_scenario.setdefault(cell.get("scenario_id", ""), {})[
                str(metric.get("label"))
            ] = text

    rows = []
    for entry in comparison.get("scenarios", []):
        if entry.get("status") == "excluded":
            rows.append({
                "scenario": entry.get("name"),
                "status": "excluded",
                "exclusion_reason": entry.get("exclusion_reason"),
            })
            continue
        rows.append({
            "scenario": entry.get("name"),
            "status": entry.get("status"),
            "is_the_selected_scenario": bool(entry.get("is_selected")),
            "is_the_recommended_scenario": bool(entry.get("is_recommended")),
            "treatment": entry.get("treatment"),
            "metrics": by_scenario.get(entry.get("scenario_id", ""), {}),
        })
    return rows


def _strategy(record: dict[str, Any]) -> list[dict[str, Any]]:
    strategy = record.get("strategy") or {}
    rows = []
    for lever in strategy.get("levers", []):
        rows.append({
            "lever": lever.get("label"),
            "current_measured": lever.get("current_display")
            if lever.get("current_available") else None,
            "selected": lever.get("selected_value") if lever.get("selected_available") else None,
            "recommended": (
                lever.get("recommended_display") or lever.get("recommended_value")
            ) if lever.get("recommended_available") else None,
            "recommended_is_the_measured_current_plan": bool(
                lever.get("recommended_is_measured_plan")
            ),
            "unavailable_reason": None if lever.get("current_available")
            else lever.get("current_unavailable_reason"),
            "moves_a_kpi": bool(lever.get("modelled")),
        })
    return rows


def projection(record: dict[str, Any]) -> dict[str, Any]:
    """EXACTLY what the model is sent -- and nothing else.

    A deliberate projection rather than the whole record. Three reasons, in
    order of how badly each would go wrong:

      1. NO RAW NUMBERS. Every figure is the display string an engine already
         produced. There is no float to average, no low/high pair to collapse
         and no rate to re-express.
      2. NO SEPARATE SOURCES OF TRUTH. The provenance block, the dataset
         fingerprint, the stored ids and the internal scenario provenance are
         withheld: the model has no reason to explain them and every reason not
         to paraphrase an id.
      3. MEASURED AND SIMULATED STAY APART, each in its own list with a `kind`
         on every row, so nothing in the prompt invites conflating them.
    """
    scenario = record.get("scenario") or {}
    investigation = record.get("investigation") or {}
    scope = record.get("scope") or {}
    recommendation = record.get("recommendation") or {}
    governance = record.get("governance") or {}
    readiness = record.get("readiness") or {}

    return {
        "decision_status": record.get("status"),
        "scenario_being_decided": {
            "name": scenario.get("name"),
            "approved_treatment": scenario.get("treatment"),
            "discount_depth_percent": scenario.get("discount_pct"),
            "uplift_range_meaning": scenario.get("range_label"),
        },
        "investigation": {
            "question": investigation.get("question"),
            "question_unavailable_reason": investigation.get("question_unavailable_reason"),
            "type": investigation.get("investigation_type"),
        },
        "scope": {
            "period": scope.get("period"),
            "filters_applied": scope.get("filters_applied"),
            "rows_in_scope": scope.get("row_count"),
            "promoted_rows_in_scope": scope.get("promoted_row_count"),
            # WITHOUT THIS THE MODEL WOULD EXPLAIN A ROW OF ZEROS AS AN OUTCOME.
            # When every promoted row is excluded the engine returns zeros
            # because there was nothing left to compute over, and "the promotion
            # is expected to deliver nothing" is a different and false claim.
            "promoted_rows_excluded_from_this_scenario": scope.get("excluded_rows"),
            "exclusion_reason": scope.get("excluded_reason"),
            "every_promoted_row_was_excluded": scope.get("all_promoted_rows_excluded"),
        },
        "recommendation": {
            "recommended_scenario_id": recommendation.get("recommended_scenario_id"),
            "recommended_scenario_name": recommendation.get("recommended_scenario_name"),
            "the_selected_scenario_is_the_recommended_one":
                bool(recommendation.get("is_this_scenario")),
            "objective": recommendation.get("objective"),
            "primary_metric": recommendation.get("primary_metric"),
            "primary_endpoint": recommendation.get("primary_endpoint"),
            "policy_reason": recommendation.get("reason"),
            "policy_caveat": recommendation.get("note"),
        },
        "strategy_levers": _strategy(record),
        "expected_impact_simulated": _impact(record),
        "measured_baseline_historical": _measured(record),
        "scenario_comparison": _comparison(record),
        "risk": {
            "overall_status": governance.get("overall_status"),
            "summary": governance.get("summary"),
            "findings": [
                {"title": f.get("title"), "severity": f.get("severity"),
                 "status": f.get("status"), "reason": f.get("reason")}
                for f in governance.get("findings", [])
            ],
            "governance_gaps": [
                {"label": g.get("label"), "statement": g.get("statement")}
                for g in governance.get("governance_gaps", [])
            ],
            "method_limitations": [
                {"title": limit.get("title"), "statement": limit.get("statement")}
                for limit in governance.get("limitations", [])
            ],
        },
        "readiness": {
            "can_be_approved": readiness.get("can_be_approved"),
            "reason": readiness.get("reason"),
            "blockers": [
                {"title": b.get("title"), "detail": b.get("detail")}
                for b in readiness.get("blockers", [])
            ],
            "unverified": [
                {"title": u.get("title"), "detail": u.get("detail")}
                for u in readiness.get("unverified", [])
            ],
        },
        "facts_about_this_application": {
            "approval_workflow": "not configured -- this project defines no approval criteria",
            "execution_write_back": "not configured -- nothing is written to any plan or dataset",
            "identity": "no authentication -- there is no author and no approver to name",
        },
    }


# --- checking what came back --------------------------------------------------

#: A number as a person writes one: 48, 48.5, 1,240, 41.8.
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _normalise(token: str) -> str:
    """Compare 48, 48.0 and 48.00 as the same figure.

    Without this the check would fire constantly: the record formats a depth as
    "15.0%" and a model quoting it as "15%" is quoting it correctly.
    """
    plain = token.replace(",", "")
    try:
        return f"{float(plain):g}"
    except ValueError:
        return plain


def _figures(text: str) -> set[str]:
    return {_normalise(match) for match in _NUMBER.findall(text)}


def unverified_figures(brief: dict[str, str], sent: dict[str, Any]) -> list[str]:
    """Numbers in the brief that are not in the record it was given.

    ADVISORY, NOT A GATE. A flagged figure does not suppress the brief: the
    deterministic cards above it are the numbers that matter, and hiding an
    explanation because one token failed a string match would trade a small
    problem for a bigger one. The list is returned so the card can say so.

    SMALL INTEGERS ARE IGNORED -- a single digit is far more likely to be "two
    to three weeks" or an enumeration than a fabricated KPI, and flagging those
    would make the signal useless.
    """
    allowed = _figures(json.dumps(sent, ensure_ascii=False, default=str))
    seen: list[str] = []
    for value in brief.values():
        if not isinstance(value, str):
            continue
        for raw in _NUMBER.findall(value):
            figure = _normalise(raw)
            if figure in allowed or figure in seen:
                continue
            # One bare digit is noise; anything longer or fractional is a claim.
            if len(figure.replace(".", "").lstrip("0")) < 2 and "." not in figure:
                continue
            seen.append(figure)
    return seen


# --- the call -----------------------------------------------------------------


async def generate(record: dict[str, Any]) -> dict[str, Any]:
    """One brief for one decision record.

    Raises `BriefError` for anything that goes wrong. The caller turns that into
    a status code; Decision Center keeps working either way, because nothing on
    the page reads this result for a value.
    """
    if not isinstance(record, dict) or record.get("expected_impact") is None:
        raise BriefError(
            "A complete decision record is required. Open a decision in Decision "
            "Center before generating a brief."
        )

    sent = projection(record)
    try:
        brief = await complete_json(
            system=SYSTEM,
            user=(
                "Explain this decision record. Copy every figure exactly as it is "
                "written here, keep every range whole, and do not introduce any number "
                "that does not appear below.\n\n"
                + json.dumps(sent, ensure_ascii=False, indent=2, default=str)
            ),
            schema=SCHEMA,
            schema_name="tpo_decision_brief",
            # Low, not zero: this is prose, but it is prose about numbers, and
            # the less room there is to embellish the better.
            temperature=0.1,
        )
    except AgentConfigError:
        # NOT wrapped. "No key is configured" is a different fact from "the call
        # failed", the route maps it to a different status code, and the card
        # tells the user something different about each. Collapsing the two into
        # one error would hide a five-second fix behind "unavailable".
        raise
    except Exception as exc:
        # The reason is surfaced to the user, so it must not carry anything out
        # of the environment. The OpenAI SDK's messages name the endpoint and the
        # failure, never the credential; anything without a message is reported
        # by type rather than by repr.
        raise BriefError(str(exc) or type(exc).__name__) from exc

    missing = [key for key, _ in SECTIONS if not str(brief.get(key, "")).strip()]
    if missing:
        raise BriefError(
            "The explanation came back incomplete (missing: " + ", ".join(missing) + ")."
        )

    return {
        "brief": {key: str(brief[key]).strip() for key, _ in SECTIONS},
        "sections": [{"key": key, "heading": heading} for key, heading in SECTIONS],
        "model": DEFAULT_MODEL,
        "disclaimer": DISCLAIMER,
        # Empty in the normal case. Non-empty means the card shows a caution --
        # and the numbers on the page are unaffected regardless.
        "unverified_figures": unverified_figures(brief, sent),
        "source": "/api/decision/record",
        "authoritative": False,
    }
