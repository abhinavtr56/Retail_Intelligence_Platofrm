"""Numeric provenance for agent output.

THE RULE THIS FILE ENFORCES: an agent may choose which figure matters, but it
may not produce one. Every number that reaches a chart, a KPI strip or a
"current value" caption has to be traceable to something the KPI engine
computed for that same agent, in that same call.

Structured output guarantees SHAPE, not TRUTH: a `viz_items` entry typed as a
number is still a number the model typed. Where that number is then rendered as
a bar, a mistyped digit is indistinguishable from a measurement. So these
helpers sit at the boundary where model output becomes rendered data:

  * `numeric_provenance()` flattens everything the agent was actually given
    into the set of values it is allowed to cite.
  * `traceable()` asks whether one figure it wrote is in that set.
  * `verified_viz_items()` splits its chart bars into the drawable and the rest.
  * `computed_delta()` does the subtraction the agent is no longer asked for,
    from two operands it named and both of which must be traceable.
  * `prose_figures()` flags — but does not edit — figures in its sentences.

`app/tpo/decision_brief.unverified_figures` does the same job for prose, by
scanning the text for number-shaped tokens. It is deliberately left alone: it
compares DISPLAY STRINGS, because the brief is only ever sent display strings.
This module compares FLOATS, because the pipelines send the model raw values.

WHY THE TOLERANCE IS NOT AN EXACT MATCH. The engine hands a specialist
32717886.4 and it is correct for the specialist to chart that as 3.3 (₹ Cr),
32.7 (₹ L) or 32717886 (rounded). A strict equality check would reject all
three and empty every chart in the product, so a value counts as traceable when
it matches a supplied value at any of the display scales this project actually
uses, or within a rounding tolerance of one. What it will NOT match is a figure
that is simply not in the data — which is the failure being guarded against.
"""

from __future__ import annotations

import re
from typing import Any

#: Scales a figure legitimately appears at once it is written for a reader:
#: as-is, a fraction expressed as a percentage, thousands, lakhs and crores.
#: Applied to the SUPPLIED value, because presentation only ever shrinks a
#: number (₹32,717,886.4 -> 3.3 Cr); nothing in this project inflates one.
_DISPLAY_SCALES: tuple[float, ...] = (1.0, 100.0, 1e-3, 1e-5, 1e-7)

#: A cited figure is traceable within half a percent of a supplied one, which
#: covers every rounding the formatters apply, or within 0.05 absolute, which
#: covers one-decimal-place rounding of small values (13.44 written as 13.4).
_REL_TOL = 0.005
_ABS_TOL = 0.05

#: A number as a person writes one: 48, 48.5, 1,240, 41.8.
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def numeric_provenance(payload: Any) -> set[float]:
    """Every number anywhere in what an agent was given.

    Walks the whole structure rather than a known list of keys: the specialists'
    payloads are shaped by their own fetchers (`app/agents/roster.py`) and a
    per-fetcher list would go stale the moment one of them gains a field.
    Booleans are excluded — `True` is not the figure 1.

    STRINGS ARE READ FOR NUMBERS TOO, because the engine writes some of its
    figures into prose: `run_analysis` explains that "50 = the target hurdle",
    and a mechanic's own label is "20% Discount". Both are things the agent was
    told and may legitimately cite, so treating them as absent would flag
    correct quotations as fabrications.
    """
    found: set[float] = set()

    def walk(node: Any) -> None:
        if isinstance(node, bool) or node is None:
            return
        if isinstance(node, (int, float)):
            value = float(node)
            if value == value and value not in (float("inf"), float("-inf")):
                found.add(value)
            return
        if isinstance(node, str):
            for token in _NUMBER.findall(node):
                try:
                    found.add(float(token.replace(",", "")))
                except ValueError:
                    continue
            return
        if isinstance(node, dict):
            for key, item in node.items():
                walk(key)
                walk(item)
            return
        if isinstance(node, (list, tuple)):
            for item in node:
                walk(item)

    walk(payload)
    return found


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= max(_ABS_TOL, _REL_TOL * max(abs(a), abs(b)))


def traceable(value: float, supplied: set[float]) -> bool:
    """Does this figure come from the data the agent was handed?

    The magnitude is compared, not the sign: a bar chart cannot draw a negative
    height, so a specialist charting a -2.7% decline as a bar of 2.7 is
    reporting the supplied figure correctly, not inventing one.
    """
    try:
        candidate = abs(float(value))
    except (TypeError, ValueError):
        return False
    if candidate != candidate:  # NaN
        return False
    for source in supplied:
        magnitude = abs(source)
        for scale in _DISPLAY_SCALES:
            if _close(candidate, magnitude * scale):
                return True
    return False


def computed_delta(
    basis: Any, supplied: set[float]
) -> tuple[str, str]:
    """The node's delta and trend, subtracted here rather than by the model.

    THE FIELD THIS REPLACES WAS MEASURED WRONG. `delta` used to be free text a
    specialist wrote, and someone tallied what came back across the recorded
    runs: a percentage-point difference 86% of the time, a relative percentage
    6%, neither 7% — every one of them labelled "%". A point gap wearing a
    percent sign is not the figure it claims to be.

    That tally lived in `frontend/.../comparisonDelta.ts`, which patched around
    the problem in the client for two of the six agents by recomputing the
    delta from their first two chart bars. It has since been deleted: this
    function is the fix it was standing in for, and once bars that cannot be
    traced to the specialist's own table are dropped before rendering, reading
    them positionally as (subject, benchmark) is not safe either.

    So the specialist now names the TWO FIGURES it is comparing and which
    comparison it means, and both have to be traceable to its own table before
    anything is drawn. The arithmetic and the sign are done here, once, in the
    same one-decimal-place convention the rest of the platform uses.

    Returns ("", "") whenever the comparison cannot be made honestly — no
    basis, an operand that is not in the data, or a relative change against
    zero. An empty delta draws no figure and no arrow.
    """
    if not isinstance(basis, dict):
        return "", ""
    value, against = basis.get("value"), basis.get("compared_to")
    if isinstance(value, bool) or isinstance(against, bool):
        return "", ""
    if not isinstance(value, (int, float)) or not isinstance(against, (int, float)):
        return "", ""
    if not (traceable(value, supplied) and traceable(against, supplied)):
        return "", ""

    if basis.get("kind") == "relative_change_pct":
        if not against:
            return "", ""
        # Divided by the MAGNITUDE of the benchmark, so a negative benchmark
        # cannot invert the sign of the comparison.
        change = round((value - against) / abs(against) * 100, 1)
        text = f"{change:+.1f}%"
    else:
        change = round(value - against, 1)
        text = f"{change:+.1f} pp"
    # NO DIFFERENCE IS NOT A DELTA. "+0.0 pp" would still be drawn, and the
    # graph node picks its arrow on `trend === 'down'`, so an empty trend
    # renders an UP arrow beside a figure that moved nowhere.
    if change == 0:
        return "", ""
    return text, ("down" if change < 0 else "up")


def cited_figures(text: str) -> list[tuple[str, float]]:
    """The number-shaped tokens in a sentence that are worth checking.

    Two shapes are ignored to keep the signal usable, following the precedent
    in `app/tpo/decision_brief.unverified_figures`: a bare single digit ("two
    to three weeks", list positions), and a four-digit year, which names a
    period rather than measuring anything.

    Returned as (as written, as a number) pairs so a caller can both count what
    was checked — the denominator `confidence.py` needs — and report the
    failures the way the agent wrote them.
    """
    out: list[tuple[str, float]] = []
    seen: set[str] = set()
    for raw in _NUMBER.findall(text or ""):
        plain = raw.replace(",", "")
        try:
            value = float(plain)
        except ValueError:
            continue
        if "." not in plain and (abs(value) < 10 or 1900 <= value <= 2100):
            continue
        if raw in seen:
            continue
        seen.add(raw)
        out.append((raw, value))
    return out


def prose_figures(text: str, supplied: set[float]) -> list[str]:
    """Number-shaped tokens in a sentence that are not in the supplied data.

    ADVISORY, AND DELIBERATELY SO. This project already settled the question in
    `app/tpo/decision_brief.unverified_figures`: an explanation is worth more
    with a flagged figure beside it than suppressed, because the figures that
    matter are rendered from the deterministic side regardless. Prose gets
    flagged; `viz_items` and `delta_basis`, which ARE the deterministic side's
    rendering, are held to the stricter rule and dropped instead.

    The flags are not inert, though: `confidence.py` scores the proportion that
    trace, so prose an agent cannot support lowers the evidence score of the
    finding it appears on.
    """
    return [raw for raw, value in cited_figures(text) if not traceable(value, supplied)]


def verified_viz_items(
    items: list[dict[str, Any]] | None, supplied: set[float]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Split a specialist's chart bars into the traceable and the rest.

    Returned as two lists rather than filtered in place because the caller
    needs both: the traceable bars are what gets drawn, and the untraceable
    ones are recorded on the finding so a run can be audited afterwards instead
    of the discard being silent.
    """
    kept: list[dict[str, Any]] = []
    dropped: list[dict[str, Any]] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        if traceable(item.get("value"), supplied):
            kept.append(item)
        else:
            dropped.append(item)
    return kept, dropped
