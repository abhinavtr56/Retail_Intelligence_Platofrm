"""
Promotion Intelligence agents: Analyst, then Advisor.

Two calls, deliberately sequential rather than one combined call — the Advisor
sees the Analyst's conclusions and recommends against them, instead of forming
opinions and advice simultaneously from raw tables. Diagnosis before
prescription.

Every figure they cite is computed in app/intelligence_engine.py. Neither agent
does arithmetic; they interpret, rank and advise. Recommendations carry
simulation parameters so the Simulation Studio can pick them up directly —
closing the investigate -> diagnose -> simulate loop rather than ending at a
paragraph of advice.
"""
import json
from typing import Any

from app.agents.client import complete_json

ANALYSIS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["headline", "narrative", "key_insights", "drivers", "uncertainties", "confidence"],
    "properties": {
        "headline": {"type": "string", "description": "One sentence stating the single most important fact."},
        "narrative": {
            "type": "string",
            "description": (
                "3-5 sentences answering the question directly. Mark tone inline: "
                "[r]bad figures[/r], [g]good figures[/g], [n]neutral figures[/n]. "
                "Use \\n between paragraphs. Every number must come from the facts given."
            ),
        },
        "key_insights": {
            "type": "array",
            "description": "3-5 insights, most material first.",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["title", "detail", "impact", "trend", "severity"],
                "properties": {
                    "title": {"type": "string", "description": "Under 60 characters"},
                    "detail": {"type": "string"},
                    "impact": {"type": "string", "description": "The quantified effect, e.g. '45.7% of spend at 6.8% ROI'"},
                    "trend": {"type": "string", "enum": ["up", "down", "flat"]},
                    "severity": {"type": "string", "enum": ["critical", "high", "medium", "low", "positive"]},
                },
            },
        },
        "drivers": {
            "type": "array",
            "description": "What is moving the outcome, ranked. Weights are your judgement of relative contribution and must sum to roughly 100.",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["driver", "weight_pct", "direction", "note", "is_primary"],
                "properties": {
                    "driver": {"type": "string"},
                    "weight_pct": {"type": "integer"},
                    "direction": {"type": "string", "enum": ["negative", "positive"]},
                    "note": {"type": "string"},
                    "is_primary": {"type": "boolean", "description": "True for root causes, false for secondary contributors"},
                },
            },
        },
        "uncertainties": {
            "type": "array",
            "items": {"type": "string"},
            "description": "What this analysis cannot determine from the available data. Empty list only if genuinely none.",
        },
        "confidence": {"type": "integer", "description": "0-100, based on evidence strength and agreement, not on how much data existed."},
    },
}

RECOMMENDATION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["recommendations", "do_not_do", "expected_combined_impact"],
    "properties": {
        "recommendations": {
            "type": "array",
            "maxItems": 3,
            "description": (
                "Two or three concrete, mutually executable decisions, highest expected "
                "value first. Not monitoring, not further investigation, not warnings."
            ),
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "action", "rationale", "evidence", "expected_impact",
                    "priority", "effort", "confidence", "simulation",
                ],
                "properties": {
                    "action": {"type": "string", "description": "Imperative and specific: 'Shift Buy3Get1 spend to 10% Discount in Modern Trade'"},
                    "rationale": {"type": "string", "description": "Why this follows from the diagnosis"},
                    "evidence": {"type": "string", "description": "The specific figures that justify it"},
                    "expected_impact": {"type": "string", "description": "What should change, with a number where the data supports one"},
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                    "effort": {"type": "string", "enum": ["low", "medium", "high"]},
                    "confidence": {"type": "integer"},
                    "simulation": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["lever", "current_value", "proposed_value", "scope", "metric_to_watch"],
                        "properties": {
                            "lever": {
                                "type": "string",
                                "enum": ["discount_depth", "mechanic_mix", "spend_allocation", "channel_mix", "product_mix", "promotion_calendar"],
                            },
                            "current_value": {"type": "string"},
                            "proposed_value": {"type": "string"},
                            "scope": {"type": "string", "description": "Where it applies, e.g. 'Modern Trade / South'"},
                            "metric_to_watch": {"type": "string"},
                        },
                    },
                },
            },
        },
        "do_not_do": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Plausible-sounding actions the evidence does NOT support, with the reason. Empty list if none apply.",
        },
        "expected_combined_impact": {"type": "string"},
    },
}

ANALYST_SYSTEM = """You are the Promotion Intelligence Analyst for a trade promotion platform.

You are given a complete, pre-computed factual picture of a promotion portfolio.
Every number was calculated by the platform's KPI engine. Your job is to
interpret it — you never calculate.

How to read the facts:
- roi_pct is a PERCENTAGE and `target_roi_pct` is the hurdle it must clear.
  An ROI of 6.8 means the promotion returned far below target, not "6.8x".
- The saturation curve plots ROI against discount depth. If it declines
  monotonically, deeper discounting is systematically destroying value, and
  `saturation_depth_pct` is where it stops clearing the target.
- `spend_share_pct` matters as much as ROI. A poor return on a large share of
  budget is the story; the same return on 2% of budget is trivia. Always pair
  them.
- Incremental sales are re-baselined per selection, so group figures rank
  contribution — never present them as shares summing to a total.

Rules:
- Cite only numbers present in the facts. Never estimate or extrapolate.
- CURRENCY: every monetary figure is Indian Rupees. Write ₹ or "INR". Never
  write $ or "dollars" — the figures are not dollars and presenting them as
  such is a factual error.
- The `narrative` field MUST carry tone markup. Wrap every figure or clause in
  [r]...[/r] when it is bad news, [g]...[/g] when it is good, [n]...[/n] when
  it is neutral context. A narrative without markup renders as flat grey text
  and fails its purpose. Example: "ROI is [r]33.7%, against a 50% target[/r],
  while [g]5% Discount returns 77.6%[/g]."
- Weight findings by money at stake, not by how extreme the percentage looks.
- State what you cannot determine. The `uncertainties` field is not optional
  padding — an analysis that admits its blind spots is more useful than one
  that implies completeness it does not have.
- Set confidence on evidence strength, not data volume. A large dataset that
  disagrees with itself deserves low confidence."""

ADVISOR_SYSTEM = """You are the Promotion Intelligence Advisor for a trade promotion platform.

You receive a completed diagnosis and the facts behind it. Your job is to turn
it into actions a commercial team can actually take this quarter.

Rules for a good recommendation:
- Address a PRIMARY driver from the diagnosis. Do not invent new problems.
- Be specific and quantified. "Optimise promotions" is worthless. "Move the
  45.7% of spend on Buy3Get1 toward 10% Discount, which returns 59.5% against
  Buy3Get1's 6.8%" is actionable.
- Prefer reallocating existing spend over asking for more budget — the former
  is usually approvable, the latter usually is not.
- Every recommendation must carry `simulation` parameters so the Simulation
  Studio can model it before anyone commits money.
- CURRENCY: all figures are Indian Rupees. Write ₹ or "INR", never $.

What is NOT a recommendation — these are the four ways this output goes wrong:
- "Monitor the results", "track performance", "set up a dashboard". That is
  business-as-usual, not a decision. Omit it.
- "Investigate why X is failing". If the data cannot support a remedy, that
  belongs in the diagnosis's uncertainties, not here.
- "Do not do X". That is what `do_not_do` is for. Never phrase a warning as a
  recommendation — it double-counts and pads the list.
- Two actions that draw on the same pot of money. This is the most common
  failure, so check for it explicitly before answering.

  WRONG (these sum to more than the pot):
    1. Shift all ₹357 Cr of Buy3Get1 spend to 10% Discount
    2. Shift ₹95 Cr of Buy3Get1 spend to 15% Discount

  RIGHT (one recommendation, one budget, an explicit split):
    1. Reallocate the ₹357 Cr on Buy3Get1: ₹250 Cr to 10% Discount and
       ₹107 Cr to 15% Discount

  If two of your recommendations name the same source budget, merge them into
  one with the split stated. Recommendations must be independently executable —
  a team should be able to approve one, both, or neither.

Give two or three real decisions rather than four padded ones. A short list
that a team can act on beats a long one they have to triage.

On expected impact, be careful about scale. A mechanic returning a high ROI on
a small share of spend will not necessarily hold that ROI at four times the
volume — the saturation curve is itself evidence that returns fall as a lever
is pushed harder. Frame the upside as directional, or bound it, rather than
projecting the current rate onto a much larger base.

`do_not_do` is important: name the obvious-sounding actions this evidence does
NOT justify, and why. Steering a team away from a plausible mistake is often
worth more than one more suggestion — and it demonstrates the analysis was read
rather than pattern-matched."""


def _facts_prompt(question: str, facts: dict[str, Any]) -> str:
    return (
        f"QUESTION: {question}\n\n"
        f"SCOPE: {json.dumps(facts.get('scope') or {}) or 'whole business'}\n\n"
        f"FACTS (all pre-computed):\n{json.dumps(facts, indent=1, default=str)}"
    )


async def analyse(question: str, facts: dict[str, Any]) -> dict[str, Any]:
    return await complete_json(
        ANALYST_SYSTEM, _facts_prompt(question, facts), ANALYSIS_SCHEMA, "intelligence_analysis", temperature=0.2
    )


async def recommend(question: str, facts: dict[str, Any], analysis: dict[str, Any]) -> dict[str, Any]:
    primary = [d for d in analysis.get("drivers", []) if d.get("is_primary")]
    return await complete_json(
        ADVISOR_SYSTEM,
        (
            f"QUESTION: {question}\n\n"
            f"DIAGNOSIS\n"
            f"  Headline: {analysis.get('headline')}\n"
            f"  Narrative: {analysis.get('narrative')}\n"
            f"  Primary drivers: {json.dumps(primary)}\n"
            f"  Uncertainties: {json.dumps(analysis.get('uncertainties'))}\n"
            f"  Confidence: {analysis.get('confidence')}\n\n"
            f"SUPPORTING FACTS:\n{json.dumps(facts, indent=1, default=str)}"
        ),
        RECOMMENDATION_SCHEMA,
        "intelligence_recommendations",
        temperature=0.3,
    )
