"""
Investigation pipeline over the TPO star schema.

Same four stages as the uploaded-CSV pipeline (plan -> analyse -> specialists
-> synthesis) and the same finding/synthesis schemas, so both produce the
identical orchestration the graph renders. The difference is where the
numbers come from: this one calls app/tpo/service.py through star_tools,
so every figure agrees with the Command Center by construction.

The planner's real job here is choosing SEGMENTS. A breakdown alone answers
"which channel is worst"; a filter plus a breakdown answers "within Modern
Trade in the South, which mechanic is bleeding money" — and that is the shape
most promotion problems actually take.
"""
import asyncio
from typing import Any

from app.agents.client import complete_json
from app.agents.pipeline import (
    FINDING_SCHEMA,
    MAX_SPECIALISTS,
    SYNTHESIS_SCHEMA,
    SYNTHESIS_SYSTEM,
    assemble_orchestration,
)
from app.agents.roster import BY_KEY as ROSTER_BY_KEY
from app.agents.roster import KEYS as ROSTER_KEYS
from app.agents.roster import roster_catalogue
from app.agents.star_tools import schema_summary, segment_kpis

INVESTIGATION_TYPES = ["diagnostic", "optimization", "launch", "strategic"]

# Filter dimensions a planner may set. Every property is required and
# nullable because OpenAI strict json_schema demands a closed, fully-specified
# object — "omit what you don't need" is expressed as null, not absence.
_FILTER_PROPS = {
    "year": {"type": ["integer", "null"]},
    "month": {"type": ["integer", "null"]},
    "channel": {"type": ["array", "null"], "items": {"type": "string"}, "description": "Channel_Id codes, e.g. CH002"},
    "region": {"type": ["array", "null"], "items": {"type": "string"}},
    "state": {"type": ["array", "null"], "items": {"type": "string"}},
    "city": {"type": ["array", "null"], "items": {"type": "string"}},
    "retailer": {"type": ["array", "null"], "items": {"type": "string"}},
    "category": {"type": ["array", "null"], "items": {"type": "string"}},
    "brand": {"type": ["array", "null"], "items": {"type": "string"}},
    "promotion_type": {"type": ["array", "null"], "items": {"type": "string"}},
}
FILTER_OBJECT = {
    "type": "object",
    "additionalProperties": False,
    "required": list(_FILTER_PROPS),
    "properties": _FILTER_PROPS,
}

STAR_PLAN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["investigation_type", "focus_label", "focus_sub", "global_filters", "specialists"],
    "properties": {
        "investigation_type": {"type": "string", "enum": INVESTIGATION_TYPES},
        "focus_label": {"type": "string", "description": "Short name for what's investigated, e.g. 'South Modern Trade'"},
        "focus_sub": {"type": "string", "description": "Period or qualifier, e.g. '(F25)'"},
        "global_filters": FILTER_OBJECT,
        "specialists": {
            "type": "array",
            "description": "Which specialists to assign, in the order they should be read.",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["specialist", "assignment"],
                "properties": {
                    "specialist": {"type": "string", "enum": list(ROSTER_KEYS)},
                    "assignment": {
                        "type": "string",
                        "description": (
                            "One sentence telling this specialist what to look for in THIS "
                            "investigation — the part of the question it owns."
                        ),
                    },
                },
            },
        },
    },
}

STAR_PLANNER_SYSTEM = """You are the planning agent for a trade promotion intelligence platform,
working over a finalised star schema of real promotion data.

Given a business question, you must:
1. Classify it into one of the four investigation archetypes.
2. Set `global_filters` to the scope the question implies (a year, a channel,
   a region). Use ONLY codes/values present in the schema summary. Set every
   field you are not constraining to null.
3. Assign the specialists who should investigate it.

You do NOT invent analyses. You ASSIGN work to a standing team of specialists,
each of whom owns one link in the promotion-ROI causal chain and pulls their own
data. Your skill is choosing which lenses this question actually needs, and
telling each specialist what to look for.

YOUR TEAM:
%s

HOW TO ASSIGN — this decides whether the investigation is a real RCA:

  - Pick %d or fewer. Prefer a CHAIN over a crowd: one that establishes whether
    the problem is real, one or two that localise it, one that names specifics,
    one that quantifies what is at stake. Four well-chosen beats six overlapping.
  - ALWAYS include `benchmark` on a diagnostic question. Without it nobody can
    tell whether a bad-looking number is actually unusual, and every other
    finding risks being over-read.
  - Choose lenses that can DISAGREE with each other. If `mechanic_efficiency`
    blames the offer design and `geography` finds it only breaks at one
    retailer, that tension is the most informative thing the investigation can
    produce. Picking four lenses that all point the same way tells you nothing.
  - Match the lens to the question. "Why did ROI fall" wants benchmark +
    mechanic_efficiency + spend_allocation. "Where is money leaking" wants
    offer_forensics + risk_exposure. "Is our lift real" wants cannibalization.
    "Did it fade" wants temporal.
  - `assignment` must be specific to THIS question, naming what that specialist
    should look for. Not "analyse mechanics" but "check whether Buy3Get1 fails
    only in the South or everywhere".

Set `global_filters` to the scope the question implies, using ONLY values from
the schema summary. Every specialist analyses that scope, and those that need a
comparison pull the whole-business baseline themselves.

Archetypes: diagnostic (why did X happen), optimization (how do we improve X),
launch (new product/SKU decisions), strategic (portfolio/long-term mix).""" % (
    roster_catalogue(),
    MAX_SPECIALISTS,
)

STAR_SPECIALIST_SYSTEM = """You are a specialist analyst on a trade promotion intelligence platform.

You are given one pre-computed breakdown. Every figure was produced by the
platform's validated KPI engine — the same one the Command Center displays.
Analyse ONLY what is in front of you.

Rules:
- Never invent figures. Every number you cite must appear in the data given.
- `roi` is a PERCENTAGE and 50 is the target hurdle. ROI of 13.6 means the
  promotion returned well under target, not "13.6x".
- Read `applied_filters`: your table may describe one segment, not the whole
  business. Say which. A headline that implies company-wide scope when you
  were given one channel is wrong.
- Groups are a RANKING, not a composition — incremental sales do not sum to
  the total, because the baseline is re-derived per selection. Never present
  group figures as shares of a whole beyond the given share_pct.
- If differences between groups are small, or a group carries very little
  trade spend, that ordering is probably noise. Say so and set confidence
  below 40. A large ROI on trivial spend is not a finding.
- `metric` and `headline` must come from a GROUP in your table, naming it —
  "Buy3Get1 at 7.7%", not "ROI is 13.4%". The selection total in
  `selection_totals` is context you share with every other specialist; leading
  with it means your analysis contributed nothing the others didn't. Your value
  is which group inside your dimension explains the total.
- viz_items must use real values from the table so the chart matches the text.
- Keep headline under 60 characters; it renders on a graph node."""


def _plan_prompt(question: str, summary: dict[str, Any], totals: dict[str, Any]) -> str:
    import json

    dims = summary["filter_dimensions"]
    lines = [
        f"QUESTION: {question}",
        "",
        "DATASET: finalised TPO star schema (fact_sales joined to product, store, "
        "channel, promotion and date dimensions).",
        f"OVERALL KPIS: {json.dumps(totals)}",
        "",
        "AVAILABLE FILTER VALUES:",
        f"  year: {dims['year']}   month: 1-12",
        f"  channel: {json.dumps(dims['channel'])}",
        f"  region: {dims['region']}",
        f"  state: {dims['state']}",
        f"  city: {dims['city']}",
        f"  category: {dims['category']}",
        f"  brand: {dims['brand']}",
        f"  promotion_type: {dims['promotion_type']}",
        f"  retailer (first 30): {dims['retailer']}",
        f"  offers: {json.dumps(dims['offers'])}",
        "",
        f"BREAKDOWN DIMENSIONS: {summary['breakdown_dimensions']}",
        f"METRICS: {summary['breakdown_metrics']}",
    ]
    return "\n".join(lines)


async def run_star_pipeline(question: str, on_event: Any = None) -> dict[str, Any]:
    """Investigate the star schema. Mirrors run_pipeline's return shape so the
    router and the frontend treat both sources identically."""
    import json

    async def emit(kind: str, payload: dict[str, Any]) -> None:
        if on_event:
            await on_event(kind, payload)

    summary = schema_summary()
    overall = segment_kpis(None)

    # ---- 1. Plan -----------------------------------------------------------
    plan = await complete_json(
        STAR_PLANNER_SYSTEM,
        _plan_prompt(question, summary, overall),
        STAR_PLAN_SCHEMA,
        "star_investigation_plan",
        temperature=0.1,
    )

    def clean_filters(raw: dict[str, Any] | None) -> dict[str, Any]:
        return {k: v for k, v in (raw or {}).items() if v not in (None, [], "")}

    global_filters = clean_filters(plan.get("global_filters"))
    specialists: list[dict[str, Any]] = []
    seen: set[str] = set()
    for assigned in (plan.get("specialists") or [])[:MAX_SPECIALISTS]:
        key = assigned.get("specialist")
        spec = ROSTER_BY_KEY.get(key)
        if spec is None or key in seen:  # unknown or duplicate assignment
            continue
        seen.add(key)
        specialists.append({"spec": spec, "assignment": assigned.get("assignment", "")})

    if not specialists:  # planner produced nothing usable — still run a real RCA
        specialists = [
            {"spec": ROSTER_BY_KEY["benchmark"], "assignment": "Establish whether this segment is abnormal."},
            {"spec": ROSTER_BY_KEY["mechanic_efficiency"], "assignment": "Find which mechanics underperform."},
            {"spec": ROSTER_BY_KEY["spend_allocation"], "assignment": "Find where the budget concentrated."},
        ]

    scoped_totals = segment_kpis(global_filters) if global_filters else overall
    await emit(
        "planned",
        {
            "plan": plan,
            # Specialist is a frozen dataclass holding a callable — flatten to
            # the plain fields the run record and the UI actually need.
            "specialists": [
                {
                    "key": a["spec"].key,
                    "name": a["spec"].name,
                    "desc": a["spec"].desc,
                    "icon": a["spec"].icon,
                    "assignment": a.get("assignment", ""),
                }
                for a in specialists
            ],
            "totals": scoped_totals,
        },
    )

    # ---- 2/3. Each specialist pulls its own data, in parallel --------------
    async def run_specialist(assigned: dict[str, Any]) -> dict[str, Any]:
        spec = assigned["spec"]
        await emit("specialist_started", {"key": spec.key})
        try:
            data = spec.fetch(global_filters)
            error = None
        except Exception as e:  # one lens failing must not sink the whole RCA
            data, error = {}, f"{type(e).__name__}: {e}"

        if error:
            result = {
                "headline": f"{spec.name} unavailable",
                "body": f"This analysis could not run: {error}.",
                "evidence": "",
                "metric": "n/a",
                "delta": "",
                "trend": "",
                "impact": "data",
                "confidence": 0,
                "viz_items": [],
            }
        else:
            result = await complete_json(
                f"{STAR_SPECIALIST_SYSTEM}\n\nYOUR SPECIALISM — {spec.name}:\n{spec.focus}",
                (
                    f"QUESTION UNDER INVESTIGATION: {question}\n\n"
                    f"YOUR ASSIGNMENT: {assigned.get('assignment') or spec.role}\n\n"
                    f"SCOPE: {json.dumps(global_filters) if global_filters else 'whole business'}\n\n"
                    f"YOUR DATA:\n{json.dumps(data, indent=1, default=str)}"
                ),
                FINDING_SCHEMA,
                "specialist_finding",
                temperature=0.2,
            )
        # Roster fields are applied AFTER the model's result: both carry a
        # `metric` key meaning different things (the model's is the headline
        # figure for the graph node). Merging the other way lost one silently.
        finding = {
            **result,
            "key": spec.key,
            "name": spec.name,
            "desc": spec.desc,
            "icon": spec.icon,
            "role": spec.role,
            "assignment": assigned.get("assignment", ""),
            "analysis": spec.key,
            "_filters": global_filters,
            "analysis_data": data,
        }
        await emit("specialist_done", {"key": spec.key, "finding": finding})
        return finding

    results = await asyncio.gather(*(run_specialist(s) for s in specialists), return_exceptions=True)
    findings = [f for f in results if isinstance(f, dict)]
    failed = [(s["spec"].key, repr(e)) for s, e in zip(specialists, results) if isinstance(e, Exception)]
    if not findings:
        raise RuntimeError(f"All specialists failed: {failed}")

    # ---- 4. Synthesis ------------------------------------------------------
    synthesis = await complete_json(
        SYNTHESIS_SYSTEM,
        (
            f"QUESTION: {question}\n\n"
            f"SCOPE: {json.dumps(global_filters) if global_filters else 'whole dataset'}\n"
            f"KPIS FOR THAT SCOPE: {json.dumps(scoped_totals)}\n\n"
            f"SPECIALIST FINDINGS:\n"
            + "\n\n".join(
                f"[{f['name']}] (confidence {f['confidence']}, impact {f['impact']})\n"
                f"  Lens: {f['role']}\n"
                f"  {f['headline']}\n  {f['body']}\n  Evidence: {f['evidence']}"
                for f in findings
            )
        ),
        SYNTHESIS_SCHEMA,
        "investigation_synthesis",
        temperature=0.3,
    )

    # Real fact-table size, not a literal — assemble_orchestration formats
    # `rows` with a thousands separator, so it must be a number.
    from app.tpo.loader import get_store

    row_count = get_store().row_count
    orchestration = assemble_orchestration(plan, findings, synthesis, {"rows": row_count, **scoped_totals})
    # Context chips read better from the star schema's own vocabulary.
    chips: dict[str, Any] = {}
    if global_filters.get("year"):
        chips["period"] = summary["year_labels"].get(str(global_filters["year"]), str(global_filters["year"]))
    if scoped_totals.get("trade_spend") is not None:
        chips["spend"] = f"₹{scoped_totals['trade_spend'] / 1e7:,.1f} Cr"
    if scoped_totals.get("promotion_roi") is not None:
        chips["roi"] = f"{scoped_totals['promotion_roi']}%"
    chips["source"] = "TPO star schema"
    orchestration["contextChips"] = chips
    orchestration["progress"]["sources"] = row_count

    return {
        "plan": plan,
        "source": "star_schema",
        "global_filters": global_filters,
        "totals": scoped_totals,
        "findings": findings,
        "failed_specialists": failed,
        "synthesis": synthesis,
        "orchestration": orchestration,
        "investigation_type": plan.get("investigation_type", "diagnostic"),
    }
