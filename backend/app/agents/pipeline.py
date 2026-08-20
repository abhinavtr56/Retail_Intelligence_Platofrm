"""
The investigation pipeline: plan → specialists (parallel) → synthesis.

Shape of the work:

  1. PLAN      one call. Maps this dataset's real column names onto semantic
               roles, picks the investigation archetype, and chooses which
               specialists are worth running *for this question and these
               columns* (no point running a discount-depth agent on a file
               with no discount column).
  2. AGGREGATE pure pandas, no model. See aggregates.py.
  3. SPECIALISTS  N calls in parallel, one per analysis, each seeing only its
               own aggregate table. Each returns a structured finding.
  4. SYNTHESIS one call. Cross-cutting narrative and confidence over all
               findings.

Graph *structure* (node positions, icon choice, progress arithmetic) is
assembled deterministically in Python afterwards — the model supplies
judgement, not layout. That's what keeps the rendered graph stable.
"""
import asyncio
import math
from typing import Any

import pandas as pd

from app.agents.aggregates import ColumnRoles, build_analysis, overall
from app.agents.client import complete_json

# Icons the Investigations graph already ships with (see icons/icons.ts) —
# the model must choose from these or the node renders blank.
VALID_ICONS = [
    "pricing", "retailer", "tag", "trending", "inventory", "users", "history",
    "cannib", "variance", "layers", "package", "pieChart", "shield", "target",
    "calendar", "flow", "zoomIn", "sparkles",
]
INVESTIGATION_TYPES = ["diagnostic", "optimization", "launch", "strategic"]
MAX_SPECIALISTS = 6

PLAN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["investigation_type", "focus_label", "focus_sub", "column_roles", "specialists"],
    "properties": {
        "investigation_type": {"type": "string", "enum": INVESTIGATION_TYPES},
        "focus_label": {"type": "string", "description": "Short name for what's being investigated, e.g. 'South MT Push'"},
        "focus_sub": {"type": "string", "description": "Period or qualifier, e.g. '(Jan – Jun 25)'"},
        "column_roles": {
            "type": "object",
            "additionalProperties": False,
            "required": ["time", "spend", "revenue", "discount", "baseline", "actual", "dimensions"],
            "properties": {
                "time": {"type": ["string", "null"]},
                "spend": {"type": ["string", "null"]},
                "revenue": {"type": ["string", "null"], "description": "Incremental revenue or sales outcome"},
                "discount": {"type": ["string", "null"]},
                "baseline": {"type": ["string", "null"], "description": "Expected/base volume before promo"},
                "actual": {"type": ["string", "null"], "description": "Realised volume after promo"},
                "dimensions": {"type": "array", "items": {"type": "string"}},
            },
        },
        "specialists": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["key", "name", "desc", "analysis", "dimension", "dimensions", "icon"],
                "properties": {
                    "key": {"type": "string", "description": "short slug, e.g. 'discount_depth'"},
                    "name": {"type": "string", "description": "Title case, e.g. 'Discount Depth Analysis'"},
                    "desc": {"type": "string", "description": "One short line on what it examines"},
                    "analysis": {
                        "type": "string",
                        "enum": ["segment", "segment_discount", "dimension", "discount_band", "time", "correlation"],
                    },
                    "dimension": {"type": ["string", "null"], "description": "Column name when analysis is 'dimension'"},
                    "dimensions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Two or more column names when analysis is 'segment' or 'segment_discount'",
                    },
                    "icon": {"type": "string", "enum": VALID_ICONS},
                },
            },
        },
    },
}

FINDING_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["headline", "body", "evidence", "metric", "delta", "trend", "impact", "confidence", "viz_items"],
    "properties": {
        "headline": {"type": "string", "description": "One line, states the finding"},
        "body": {"type": "string", "description": "1–2 sentences of explanation"},
        "evidence": {"type": "string", "description": "The specific numbers backing it"},
        "metric": {"type": "string", "description": "Headline figure for the graph node, e.g. '2.4x' or '₹98.6 Cr'"},
        "delta": {"type": "string", "description": "Change vs comparison, e.g. '-18%'. Empty string if none."},
        "trend": {"type": "string", "enum": ["up", "down", ""]},
        "impact": {"type": "string", "enum": ["strong", "moderate", "negative", "risk", "data"]},
        "confidence": {"type": "integer", "description": "0-100, how well the data supports this"},
        "viz_items": {
            "type": "array",
            "description": "2–4 bars comparing the key values",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["label", "value", "tone"],
                "properties": {
                    "label": {"type": "string"},
                    "value": {"type": "number"},
                    "tone": {"type": "string", "enum": ["muted", "accent", "accent2"]},
                },
            },
        },
    },
}

SYNTHESIS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "root_cause", "confidence", "insight_count", "recommendations"],
    "properties": {
        "summary": {"type": "string", "description": "2–3 sentences answering the question directly"},
        "root_cause": {"type": "string", "description": "The single most likely driver"},
        "confidence": {"type": "integer", "description": "0-100 overall confidence"},
        "insight_count": {"type": "integer", "description": "Distinct material insights found"},
        "recommendations": {
            "type": "array",
            "items": {"type": "string"},
            "description": "2–4 concrete actions",
        },
    },
}

PLANNER_SYSTEM = """You are the planning agent for a trade promotion intelligence platform.

Given a business question and the schema of an uploaded dataset, you must:
1. Classify the question into one of the four investigation archetypes.
2. Map the dataset's ACTUAL column names onto semantic roles. Use exact column
   names from the schema, or null when no column fits. Never invent a name.
3. Choose up to %d specialist analyses that fit BOTH the question and the
   available columns. Skip any analysis whose required column is missing.

CHOOSING ANALYSES — this matters more than anything else you do:

Real promotion problems are usually INTERACTIONS, not single-factor effects.
A channel that underperforms only in one region, or only at deep discounts,
looks completely normal in any single-dimension average. If you only break the
data down one column at a time you will miss the actual cause and report noise.

So, when the question names or implies a specific segment (a channel, a region,
a combination), or asks "why did X underperform":
  - ALWAYS include a `segment` analysis across the relevant dimensions.
  - If a discount column exists, ALSO include `segment_discount`, which splits
    those segments by discount depth.
These two find interaction effects. Single-dimension analyses cannot.

Use `dimension` (one column) only for genuinely one-factor questions, and at
most twice. Use `time` for trend/decay questions, `correlation` for "what drives
X" questions. Prefer a spread of analysis kinds over repeating one.

For `segment` and `segment_discount`, put the relevant column names in
`dimensions` (2 or more). For `dimension`, set `dimension` to the one column.

Archetypes: diagnostic (why did X happen), optimization (how do we improve X),
launch (new product/SKU decisions), strategic (portfolio/long-term mix).""" % MAX_SPECIALISTS

SPECIALIST_SYSTEM = """You are a specialist analyst on a trade promotion intelligence platform.

You are given a pre-computed aggregate table — every number in it was calculated
in pandas from the full dataset. Analyse ONLY what the numbers show.

Rules:
- Never invent figures. Every number you cite must appear in the data given.
- ROI is revenue divided by spend. uplift_pct is percentage lift over baseline.
  roi_index is the segment's ROI as a % of overall (100 = on par, 60 = 40% worse).
- Your headline must describe what YOUR table shows. Do not restate the user's
  question as a finding. If your table is broken down by promotional mechanic,
  your headline is about mechanics — not about a region or channel the question
  happened to mention. A headline your own data cannot support is a failure.
- Beware of ranking noise. If the spread between best and worst is small, or the
  segments have few rows, that ordering is probably random variation, not a real
  effect. Say so and set confidence below 40.
- If the data does not support a strong conclusion, say so and set a low
  confidence. A hedged accurate finding beats a confident wrong one.
- viz_items must use real values from the table so the chart matches the text.
- Keep headline under 60 characters; it renders on a graph node."""

SYNTHESIS_SYSTEM = """You are the lead analyst synthesising specialist findings on a
trade promotion investigation.

Answer the user's actual question directly in the summary. Identify the single
most likely root cause, weighing findings by their confidence and impact.
Do not introduce numbers that no specialist reported. If findings conflict, say
which is better supported and why.

Weight interaction findings (segment / segment-by-discount) above single-factor
ones. A specific underperforming combination is a far more credible root cause
than a small difference in some column's overall average, which is usually noise.

If no finding is well supported, say the data does not identify a clear cause and
set a low confidence. Do not manufacture a root cause to have one."""


def _plan_user_prompt(question: str, profile: dict[str, Any], filename: str) -> str:
    cols = []
    for c in profile["columns"]:
        bits = [f"- {c['name']} ({c['kind']}, dtype={c['dtype']}, nulls={c['null_count']}, unique={c['unique_count']}"]
        if c["kind"] == "numeric":
            bits.append(f", min={c.get('min')}, max={c.get('max')}, mean={c.get('mean')}")
        elif c["kind"] == "categorical" and c.get("top_values"):
            vals = ", ".join(str(v["value"]) for v in c["top_values"][:6])
            bits.append(f", values=[{vals}]")
        elif c["kind"] == "datetime":
            bits.append(f", range={c.get('min')} to {c.get('max')}")
        bits.append(")")
        cols.append("".join(bits))
    return (
        f"QUESTION: {question}\n\n"
        f"DATASET: {filename} — {profile['rows']} rows, {profile['column_count']} columns\n\n"
        f"COLUMNS:\n" + "\n".join(cols)
    )


async def run_pipeline(
    question: str,
    df: pd.DataFrame,
    profile: dict[str, Any],
    filename: str,
    on_event: Any = None,
) -> dict[str, Any]:
    """Execute the full pipeline. `on_event(kind, payload)` is called as
    stages complete so the caller can stream real progress."""

    async def emit(kind: str, payload: dict[str, Any]) -> None:
        if on_event:
            await on_event(kind, payload)

    # ---- 1. Plan -----------------------------------------------------------
    plan = await complete_json(
        PLANNER_SYSTEM,
        _plan_user_prompt(question, profile, filename),
        PLAN_SCHEMA,
        "investigation_plan",
        temperature=0.1,
    )
    valid_columns = {c["name"] for c in profile["columns"]}
    roles = ColumnRoles.from_dict(plan.get("column_roles") or {}, valid_columns)

    # Drop specialists whose analysis can't actually run against these columns.
    specialists: list[dict[str, Any]] = []
    for spec in (plan.get("specialists") or [])[:MAX_SPECIALISTS]:
        kind = spec.get("analysis")
        dims = [d for d in (spec.get("dimensions") or []) if d in valid_columns]
        if kind == "dimension" and spec.get("dimension") not in valid_columns:
            continue
        if kind in ("discount_band", "segment_discount") and not roles.discount:
            continue
        if kind == "time" and not roles.time:
            continue
        if kind == "segment":
            # Needs 2+ real dimensions; fall back to the dataset's own dimension
            # list before discarding an otherwise valid interaction analysis.
            if len(dims) < 2:
                dims = roles.dimensions[:2]
            if len(dims) < 2:
                continue
        if kind == "segment_discount" and not dims:
            dims = roles.dimensions[:2]
        spec["dimensions"] = dims
        specialists.append(spec)
    if not specialists:  # nothing fit — fall back to the always-available view
        specialists = [
            {
                "key": "correlation",
                "name": "Driver Correlation Analysis",
                "desc": "What moves the outcome most",
                "analysis": "correlation",
                "dimension": None,
                "icon": "variance",
            }
        ]

    totals = overall(df, roles)
    await emit("planned", {"plan": plan, "specialists": specialists, "totals": totals, "roles": roles.__dict__})

    # ---- 2/3. Aggregate + specialists in parallel --------------------------
    async def run_specialist(spec: dict[str, Any]) -> dict[str, Any]:
        await emit("specialist_started", {"key": spec["key"]})
        data = build_analysis(df, roles, spec["analysis"], spec.get("dimension"), spec.get("dimensions"))
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
            import json as _json

            result = await complete_json(
                SPECIALIST_SYSTEM,
                (
                    f"QUESTION: {question}\n\n"
                    f"YOUR ANALYSIS: {spec['name']} — {spec['desc']}\n\n"
                    f"DATASET TOTALS: {_json.dumps(totals)}\n\n"
                    f"YOUR AGGREGATE TABLE:\n{_json.dumps(data, indent=1)}"
                ),
                FINDING_SCHEMA,
                "specialist_finding",
                temperature=0.2,
            )
        finding = {**spec, **result, "analysis_data": data}
        await emit("specialist_done", {"key": spec["key"], "finding": finding})
        return finding

    findings = await asyncio.gather(*(run_specialist(s) for s in specialists), return_exceptions=True)
    ok_findings = [f for f in findings if isinstance(f, dict)]
    failed = [(s["key"], repr(e)) for s, e in zip(specialists, findings) if isinstance(e, Exception)]
    if not ok_findings:
        raise RuntimeError(f"All specialists failed: {failed}")

    # ---- 4. Synthesis ------------------------------------------------------
    import json as _json

    synthesis = await complete_json(
        SYNTHESIS_SYSTEM,
        (
            f"QUESTION: {question}\n\n"
            f"DATASET TOTALS: {_json.dumps(totals)}\n\n"
            f"SPECIALIST FINDINGS:\n"
            + "\n\n".join(
                f"[{f['name']}] (confidence {f['confidence']}, impact {f['impact']})\n"
                f"  {f['headline']}\n  {f['body']}\n  Evidence: {f['evidence']}"
                for f in ok_findings
            )
        ),
        SYNTHESIS_SCHEMA,
        "investigation_synthesis",
        temperature=0.3,
    )

    orchestration = assemble_orchestration(plan, ok_findings, synthesis, totals)
    return {
        "plan": plan,
        "roles": roles.__dict__,
        "totals": totals,
        "findings": ok_findings,
        "failed_specialists": failed,
        "synthesis": synthesis,
        "orchestration": orchestration,
        "investigation_type": plan.get("investigation_type", "diagnostic"),
    }


def assemble_orchestration(
    plan: dict[str, Any], findings: list[dict[str, Any]], synthesis: dict[str, Any], totals: dict[str, Any]
) -> dict[str, Any]:
    """Turn findings into the exact orchestration shape the Investigations page
    already renders (see data/investigations.json).

    Node positions are computed here, not by the model: a ring around the
    centre at 50,50, matching the hand-authored layout. Asking an LLM for
    coordinates produces overlapping nodes and drifts between runs.
    """
    nodes: list[dict[str, Any]] = []
    accelerators: list[dict[str, Any]] = []
    node_details: dict[str, Any] = {}

    count = max(1, len(findings))
    for i, f in enumerate(findings):
        key = f["key"]
        # Start at the top (-90°) and go clockwise; radius in the same 0-100
        # coordinate space the original layout uses.
        angle = -math.pi / 2 + (2 * math.pi * i / count)
        x = round(50 + 34 * math.cos(angle), 1)
        y = round(50 + 36 * math.sin(angle), 1)

        nodes.append(
            {
                "key": key,
                "label": f["name"].replace(" Analysis", ""),
                "metric": f.get("metric", ""),
                "delta": f.get("delta", ""),
                "trend": f.get("trend", ""),
                "impact": f.get("impact", "data"),
                "icon": f.get("icon", "variance"),
                "pos": {"x": x, "y": y},
            }
        )
        accelerators.append(
            {
                "key": key,
                "name": f["name"],
                "desc": f.get("desc", ""),
                "status": "Completed",
                "icon": f.get("icon", "variance"),
                "tone": "warning" if f.get("impact") in ("negative", "risk") else "success",
                "node": key,
            }
        )
        node_details[key] = {
            "headline": f.get("headline", ""),
            "body": f.get("body", ""),
            "evidence": f.get("evidence", ""),
            "viz": {"type": "bars", "unit": "", "items": f.get("viz_items", [])},
        }

    chips: dict[str, Any] = {}
    if totals.get("period_start") and totals.get("period_end"):
        chips["period"] = f"{totals['period_start']} → {totals['period_end']}"
    if totals.get("total_spend") is not None:
        chips["spend"] = f"{totals['total_spend']:,.0f}"
    if totals.get("overall_roi") is not None:
        chips["roi"] = f"{totals['overall_roi']:.2f}x"
    chips["rows"] = f"{totals.get('rows', 0):,}"

    confidence = int(synthesis.get("confidence", 0))
    return {
        "center": {"label": plan.get("focus_label", "Investigation"), "sub": plan.get("focus_sub", "")},
        "contextChips": chips,
        "nodes": nodes,
        "accelerators": accelerators,
        "progress": {
            "completed": len(findings),
            "total": len(findings),
            "pct": 100,
            "insights": int(synthesis.get("insight_count", len(findings))),
            "sources": int(totals.get("rows", 0)),
            "confidence": confidence,
            "confidenceDelta": f"{confidence}% supported",
        },
        "nodeDetails": node_details,
    }
