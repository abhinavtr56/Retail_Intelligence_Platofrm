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
    VALID_ICONS,
    assemble_orchestration,
)
from app.agents.star_tools import (
    BREAKDOWN_DIMENSIONS,
    BREAKDOWN_METRICS,
    run_analysis,
    schema_summary,
    segment_kpis,
)

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
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["key", "name", "desc", "by", "metric", "scope", "filters", "icon"],
                "properties": {
                    "key": {"type": "string", "description": "short slug, e.g. 'mechanic_roi'"},
                    "name": {"type": "string", "description": "Title case, e.g. 'Mechanic Effectiveness'"},
                    "desc": {"type": "string", "description": "One short line on what it examines"},
                    "by": {"type": "string", "enum": list(BREAKDOWN_DIMENSIONS)},
                    "metric": {"type": "string", "enum": list(BREAKDOWN_METRICS)},
                    "scope": {
                        "type": "string",
                        "enum": ["segment", "overall"],
                        "description": (
                            "'segment' applies the global filters (the segment under "
                            "investigation). 'overall' ignores them and analyses the whole "
                            "business, for comparison."
                        ),
                    },
                    "filters": FILTER_OBJECT,
                    "icon": {"type": "string", "enum": VALID_ICONS},
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
3. Choose up to %d specialist analyses. Each is one breakdown dimension (`by`),
   ranked by one `metric`, optionally narrowed by its own `filters`.

CHOOSING ANALYSES — the part that decides whether this investigation is useful:

Promotion problems are usually INTERACTIONS. A mechanic that loses money only
in one channel, or a region that fails only on seasonal offers, looks perfectly
average in any single dimension's totals. If every specialist just breaks the
whole dataset down by one column, you will report noise and miss the cause.

So:
  - When the question names a segment (a channel, a region, a retailer, a
    combination), put it in `global_filters` and give MOST specialists
    scope="segment", varying the `by` dimension between them. That is how you
    find the interaction.
  - Give AT LEAST ONE specialist scope="overall". It runs the same kind of
    breakdown across the whole business, so the segment's numbers can be judged
    against the norm rather than in isolation. Without it nobody can tell
    whether a bad-looking figure is actually unusual.
  - Vary the metric. `roi` finds efficiency problems, `trade_spend` finds where
    the money actually went, `incremental_sales` finds what it returned.
  - NEVER give two specialists the same `by` AND the same `scope`. Each one
    costs a model call, and two identical breakdowns produce two copies of the
    same finding. Every specialist must be able to discover something the
    others cannot.

Useful dimensions: promotion_mechanic (the offer type: "20%% Discount",
"Buy3Get1"), promotion (the individual offer), channel, region, retailer,
category, brand, promotion_type, state, city, product, distributor.

Archetypes: diagnostic (why did X happen), optimization (how do we improve X),
launch (new product/SKU decisions), strategic (portfolio/long-term mix).""" % MAX_SPECIALISTS

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
    seen: set[tuple[str, str]] = set()
    for spec in (plan.get("specialists") or [])[:MAX_SPECIALISTS]:
        if spec.get("by") not in BREAKDOWN_DIMENSIONS:
            continue
        scope = spec.get("scope") or "segment"
        # scope="segment" refines the global scope, so a year set once at the
        # top still applies. scope="overall" deliberately drops it — that's the
        # only way a specialist can look outside the segment for comparison.
        own = clean_filters(spec.get("filters"))
        spec["_filters"] = {**global_filters, **own} if scope == "segment" else own
        spec["_scope"] = scope
        # Two specialists with the same dimension AND scope would return the
        # same table and bill twice for one finding.
        signature = (spec["by"], scope)
        if signature in seen:
            continue
        seen.add(signature)
        specialists.append(spec)

    if not specialists:  # planner produced nothing usable — still say something
        specialists = [
            {
                "key": "channel_roi",
                "name": "Channel ROI Analysis",
                "desc": "ROI by channel",
                "by": "channel",
                "metric": "roi",
                "icon": "retailer",
                "_filters": global_filters,
                "_scope": "segment",
            }
        ]

    scoped_totals = segment_kpis(global_filters) if global_filters else overall
    await emit("planned", {"plan": plan, "specialists": specialists, "totals": scoped_totals})

    # ---- 2/3. Analyse + specialists in parallel ----------------------------
    async def run_specialist(spec: dict[str, Any]) -> dict[str, Any]:
        await emit("specialist_started", {"key": spec["key"]})
        data = run_analysis(spec["_filters"], spec["by"], spec.get("metric", "incremental_sales"))
        if data.get("error"):
            result = {
                "headline": f"{spec['name']} unavailable",
                "body": f"This analysis could not run: {data['error']}.",
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
                STAR_SPECIALIST_SYSTEM,
                (
                    f"QUESTION: {question}\n\n"
                    f"YOUR ANALYSIS: {spec['name']} — {spec.get('desc', '')}\n\n"
                    f"BREAKDOWN:\n{json.dumps(data, indent=1)}"
                ),
                FINDING_SCHEMA,
                "specialist_finding",
                temperature=0.2,
            )
        # Spec fields are applied AFTER the model's result on purpose: both
        # carry a `metric` key, and they mean different things — the spec's is
        # the breakdown metric ("roi"), the model's is the headline figure for
        # the graph node ("13.4%"). Merging the other way silently destroyed
        # the former. Keep both, under distinct names.
        finding = {
            **result,
            "key": spec["key"],
            "name": spec["name"],
            "desc": spec.get("desc", ""),
            "icon": spec.get("icon", "variance"),
            "by": spec["by"],
            "breakdown_metric": spec.get("metric"),
            "scope": spec["_scope"],
            "analysis": spec["by"],
            "_filters": spec["_filters"],
            "analysis_data": data,
        }
        await emit("specialist_done", {"key": spec["key"], "finding": finding})
        return finding

    results = await asyncio.gather(*(run_specialist(s) for s in specialists), return_exceptions=True)
    findings = [f for f in results if isinstance(f, dict)]
    failed = [(s["key"], repr(e)) for s, e in zip(specialists, results) if isinstance(e, Exception)]
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
                f"[{f['name']}] (confidence {f['confidence']}, impact {f['impact']}, "
                f"scope {json.dumps(f.get('_filters') or {})})\n"
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
