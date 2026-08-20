"""The portable decision briefing -- B8.

Renders ONE B7 decision record as two artifacts a person can take out of this
application: a machine-readable `briefing.json` and a self-contained
`briefing.html` their browser can print to PDF.

A RENDERER, NOT A CALCULATION. Nothing here computes, re-derives, ranks,
collapses or reinterprets anything. The record supplied by the caller is the
sole source of truth and is copied through untouched -- no KPI engine, no
scenario execution, no comparison, no recommendation policy and no risk policy
is imported or called, and there is no dataset to scan. If a number in the
briefing ever disagrees with the same number in Decision Center, the cause is a
bug in this file rather than a second opinion.

WHY THE ARTIFACT INSISTS ON ITS OWN LIMITS
------------------------------------------
A file that leaves the application is the most dangerous place in this product
for an unearned claim. On screen, a reader has the surrounding page to tell them
the record is a draft; in an emailed PDF they have only what is printed. So the
briefing states -- in the JSON envelope, in the page header, in a banner and in
the footer of every printed page -- that it is a draft, not approved and not
saved.

NO IDENTITY IS FABRICATED. This project has no authentication: any email signs
in, the display name is derived client-side from that string, and no API route
is guarded. There is therefore no verifiable actor, so the briefing names no
author and no approver. An artifact that invented one would be forged.

NOTHING IS PERSISTED. Both artifacts are built per request and stored nowhere.
"""

from __future__ import annotations

import html
from datetime import datetime, timezone
from typing import Any

#: Where the record came from. Recorded so a reader can trace the artifact back.
SOURCE = "/api/decision/record"

#: Stated in the envelope, in the header banner and in the print footer.
DISCLAIMER = (
    "This briefing is a DRAFT. The decision it describes is NOT APPROVED and NOT "
    "SAVED. This application implements no approval workflow, notifies nobody and "
    "stores nothing; the record was assembled on request and exists only in this "
    "file. Nothing here authorises spend, and no reviewer has signed it."
)

#: No identity exists in this system, so the artifact claims none. Printed on the
#: page so a reader cannot mistake the absence for an oversight.
NO_IDENTITY_NOTE = (
    "This briefing names no author and no approver: this application has no "
    "authentication, so it cannot establish who produced or reviewed it."
)

METHOD = (
    "A verbatim rendering of one decision record. No KPI, uplift, comparison, "
    "recommendation, risk finding or weekly value is recalculated, and no value "
    "is summarised, ranked or collapsed to a midpoint."
)

#: Every top-level section a B7 record carries. A record missing any of them is
#: refused rather than rendered with a hole in it -- a briefing that silently
#: dropped the governance section would read as if there were nothing to report.
REQUIRED_SECTIONS = (
    "decision_id",
    "status",
    "scenario",
    "investigation",
    "scope",
    "expected_impact",
    "recommendation",
    "governance",
    "weekly",
    "readiness",
    "provenance",
    "meta",
)

_REQUIRED_KEYS: dict[str, tuple[str, ...]] = {
    "scenario": ("scenario_id", "name", "treatment", "discount_pct"),
    "investigation": ("question", "investigation_type", "source"),
    "scope": ("filters_applied", "period"),
    "recommendation": ("recommended_scenario_id", "is_this_scenario", "reason", "note"),
    "governance": ("overall_status", "summary", "findings", "governance_gaps", "limitations"),
    "readiness": ("can_be_approved", "reason", "blockers", "unverified", "states"),
    "provenance": ("assembled_from", "kpi_engine", "response_rule", "method"),
    "meta": ("phase", "persisted", "persistence_note"),
}


class InvalidRecord(ValueError):
    """The supplied payload is not a B7 decision record."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise InvalidRecord(message)


def validate(record: Any) -> None:
    """Refuse anything that is not a complete B7 decision record.

    Checked rather than assumed. The briefing is the artifact a reader trusts
    when the application is closed, so a partial record must not become a
    partial-looking-but-authoritative document.
    """
    _require(isinstance(record, dict), "The briefing needs one decision record object.")

    missing = [s for s in REQUIRED_SECTIONS if s not in record]
    _require(
        not missing,
        "The supplied record is not a complete decision record. Missing: "
        + ", ".join(missing)
        + ".",
    )

    # --- the three facts the artifact will print about itself
    _require(
        record["decision_id"] is None,
        "This record carries a decision_id. Nothing in this project persists a "
        "decision, so a record with an identity did not come from /api/decision/record.",
    )
    _require(
        record["status"] == "draft",
        f"This record's status is {record['status']!r}. Only a draft record can be "
        "rendered: no approval workflow exists to produce any other state.",
    )
    _require(
        (record.get("meta") or {}).get("persisted") is False,
        "This record claims to have been persisted. Nothing in this project stores "
        "a decision.",
    )
    _require(
        (record.get("readiness") or {}).get("can_be_approved") is False,
        "This record claims it can be approved. This project defines no approval "
        "criteria, so no record can carry that claim.",
    )

    for section, keys in _REQUIRED_KEYS.items():
        body = record.get(section)
        _require(isinstance(body, dict), f"Record section {section!r} is not an object.")
        absent = [k for k in keys if k not in body]
        _require(not absent, f"Record section {section!r} is missing: {', '.join(absent)}.")

    _require(
        isinstance(record["expected_impact"], list),
        "Record section 'expected_impact' is not a list.",
    )
    for metric in record["expected_impact"]:
        _require(isinstance(metric, dict), "An expected_impact entry is not an object.")
        absent = [k for k in ("metric", "low", "high", "available") if k not in metric]
        _require(
            not absent,
            f"An expected_impact entry is missing: {', '.join(absent)}. Both ends of "
            "the range must survive into the briefing.",
        )

    weekly = record["weekly"]
    _require(isinstance(weekly, dict) and "available" in weekly,
             "Record section 'weekly' does not state whether it is available.")


# --- the JSON artifact -------------------------------------------------------


def build_envelope(exported_at: str) -> dict[str, Any]:
    """What the briefing says about itself.

    Deliberately small and entirely fixed apart from the timestamp: everything
    else the artifact asserts comes from the record.
    """
    return {
        "exported_at": exported_at,
        "record_status": "draft",
        "persisted": False,
        "approved": False,
        "source": SOURCE,
        "disclaimer": DISCLAIMER,
        "identity": NO_IDENTITY_NOTE,
        "method": METHOD,
        "phase": "B8",
    }


def build_json(record: dict[str, Any], exported_at: str) -> dict[str, Any]:
    """`briefing.json` -- the record whole, plus the envelope.

    The record is copied, never edited: the caller's payload must come back out
    of this module exactly as it went in.
    """
    return {"export": build_envelope(exported_at), "record": record}


# --- the HTML artifact -------------------------------------------------------


def _e(value: Any) -> str:
    """Escape for HTML text. Every record value passes through here.

    The record is data, not markup -- a promotion description containing an
    angle bracket must print as an angle bracket, not open a tag.
    """
    if value is None:
        return ""
    return html.escape(str(value), quote=True)


def _or_dash(value: Any) -> str:
    return _e(value) if value not in (None, "") else "&mdash;"

#: One <style> block, no external stylesheet, no webfont, no image, no script.
#: The page must render identically on a machine that has never heard of this
#: application, so it carries everything it needs and asks the network for
#: nothing. Fonts are the operating system's own stacks.
_CSS = """
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 36px 48px;
    font: 13px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1F2937; background: #FFFFFF;
  }
  h1 { font-size: 21px; margin: 0 0 2px; letter-spacing: -0.02em; }
  h2 {
    font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;
    color: #6B7280; margin: 26px 0 8px; padding-bottom: 5px;
    border-bottom: 1px solid #E5E7EB;
  }
  h3 { font-size: 13px; margin: 14px 0 4px; }
  p { margin: 0 0 8px; }
  .sub { color: #6B7280; font-size: 12px; margin: 0; }
  .stamp {
    display: inline-block; border: 1px solid #B45309; color: #B45309;
    background: #FFFBEB; border-radius: 3px; padding: 2px 7px;
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; margin-right: 6px;
  }
  .banner {
    border: 1px solid #B45309; background: #FFFBEB; color: #7C2D12;
    border-radius: 5px; padding: 10px 12px; margin: 14px 0 4px; font-size: 12px;
  }
  .note { color: #6B7280; font-size: 11.5px; margin: 6px 0 0; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 4px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #E5E7EB;
           vertical-align: top; font-size: 12px; }
  th { color: #6B7280; font-weight: 600; font-size: 10.5px;
       text-transform: uppercase; letter-spacing: 0.05em; }
  td.num { text-align: right; font-variant-numeric: tabular-nums;
           white-space: nowrap; font-weight: 600; }
  .kv { display: flex; flex-wrap: wrap; gap: 4px 28px; margin: 8px 0 2px; }
  .kv div { min-width: 120px; }
  .kv span { display: block; color: #6B7280; font-size: 10.5px;
             text-transform: uppercase; letter-spacing: 0.05em; }
  .kv strong { font-size: 13px; }
  ul { margin: 4px 0 8px; padding-left: 18px; }
  li { margin: 0 0 5px; font-size: 12px; }
  .tag { display: inline-block; border-radius: 3px; padding: 1px 6px;
         font-size: 9.5px; font-weight: 700; text-transform: uppercase;
         letter-spacing: 0.05em; border: 1px solid #D1D5DB; color: #4B5563; }
  .state { display: inline-block; margin: 0 18px 4px 0; font-size: 12px; }
  .state em { font-style: normal; font-weight: 700; }
  footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #E5E7EB;
           color: #6B7280; font-size: 10.5px; }
  @media print {
    body { padding: 0; font-size: 11.5px; }
    h2 { margin-top: 18px; }
    section { break-inside: avoid; }
    .banner { break-inside: avoid; }
  }
"""


def _impact_rows(record: dict[str, Any]) -> str:
    """Both ends of the approved range, side by side.

    NEVER a single number. The band is the approved response rule's own bounds;
    printing one figure between them would invent a precision the rule does not
    grant, and a printed page is exactly where that invention would go
    unchallenged.
    """
    rows = []
    for m in record["expected_impact"]:
        label = m.get("label") or m.get("metric")
        if m.get("available"):
            low = _or_dash(m.get("display_low"))
            high = _or_dash(m.get("display_high"))
            rows.append(
                f"<tr><td>{_e(label)}</td><td class='num'>{low}</td>"
                f"<td class='num'>{high}</td></tr>"
            )
        else:
            reason = _e(m.get("unavailable_reason") or "Not available.")
            rows.append(
                f"<tr><td>{_e(label)}</td>"
                f"<td colspan='2' style='color:#6B7280'>Not available &mdash; {reason}</td></tr>"
            )
    return "".join(rows)


def _findings(record: dict[str, Any]) -> str:
    out = []
    for f in record["governance"].get("findings", []):
        out.append(
            f"<li><strong>{_e(f.get('title'))}</strong> "
            f"<span class='tag'>{_e(f.get('severity'))}</span> "
            f"<span class='tag'>{_e(str(f.get('category', '')).replace('_', ' '))}</span>"
            f"<br>{_e(f.get('reason'))}</li>"
        )
    return "".join(out) or "<li>No findings were reported.</li>"


def _listed(items: list[dict[str, Any]], title_key: str, body_key: str) -> str:
    out = [
        f"<li><strong>{_e(i.get(title_key))}</strong> &mdash; {_e(i.get(body_key))}"
        + (f" {_e(i.get('action'))}" if i.get("action") else "")
        + "</li>"
        for i in items
    ]
    return "".join(out) or "<li>None reported.</li>"


def _weekly_section(record: dict[str, Any]) -> str:
    """Every week, and BOTH ENDS of every week.

    The weekly view carries a low and a high cell per metric per week. Printing
    one column per metric would silently pick an end, so each metric gets two.
    Wide, and correct.
    """
    weekly = record["weekly"]
    if not weekly.get("available"):
        return f"<p class='note'>{_e(weekly.get('reason'))}</p>"

    metrics = weekly.get("metrics") or []
    head = "".join(
        f"<th class='num'>{_e(m.get('label') or m.get('key'))} (low)</th>"
        f"<th class='num'>{_e(m.get('label') or m.get('key'))} (high)</th>"
        for m in metrics
    )
    body = []
    for w in weekly.get("weeks", []):
        cells = []
        for m in metrics:
            key = m.get("key")
            for end in ("low", "high"):
                cell = (w.get(end) or {}).get(key) or {}
                cells.append(f"<td class='num'>{_or_dash(cell.get('display_value'))}</td>")
        body.append(
            f"<tr><td>{_e(w.get('week_label') or w.get('week_id'))}</td>{''.join(cells)}</tr>"
        )

    reconciliation = weekly.get("reconciliation") or {}
    note = reconciliation.get("note")
    return (
        f"<p class='note'>{_e(weekly.get('method'))}</p>"
        f"<table><thead><tr><th>Week</th>{head}</tr></thead>"
        f"<tbody>{''.join(body)}</tbody></table>"
        f"<p class='note'>{_e(weekly.get('week_count'))} weeks. {_e(note)}</p>"
    )


def _states(record: dict[str, Any]) -> str:
    states = record["readiness"]["states"]
    order = ("recommended", "governed", "ready_to_review", "approved")
    return "".join(
        f"<span class='state'>{'Yes' if states.get(k) else 'No'} &middot; "
        f"<em>{_e(k.replace('_', ' ').title())}</em></span>"
        for k in order
    )


def build_html(record: dict[str, Any], exported_at: str) -> str:
    """`briefing.html` -- one self-contained page.

    No script, no external stylesheet, no webfont, no image, no network request
    of any kind: the file must open on a machine where this application does not
    exist and show exactly what Decision Center showed.
    """
    scenario = record["scenario"]
    investigation = record["investigation"]
    scope = record["scope"]
    recommendation = record["recommendation"]
    governance = record["governance"]
    readiness = record["readiness"]
    provenance = record["provenance"]

    uplift = scenario.get("uplift") or {}
    uplift_text = (
        f"{uplift['low'] * 100:.0f}&ndash;{uplift['high'] * 100:.0f}%"
        if uplift.get("low") is not None and uplift.get("high") is not None
        else "&mdash;"
    )
    discount = scenario.get("discount_pct")
    discount_text = f"{_e(discount)}%" if discount is not None else "&mdash;"
    question = investigation.get("question")
    sources = "".join(f"<li>{_e(s)}</li>" for s in provenance.get("assembled_from", []))

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Decision Briefing (Draft) &mdash; {_e(scenario.get('name'))}</title>
<style>{_CSS}</style>
</head>
<body>

<header>
  <p><span class="stamp">Draft</span><span class="stamp">Not approved</span
     ><span class="stamp">Not saved</span></p>
  <h1>Promotion Decision Briefing</h1>
  <p class="sub">{_e(scenario.get('name'))} &middot; exported {_e(exported_at)}</p>
  <div class="banner">{_e(DISCLAIMER)}</div>
  <p class="note">{_e(NO_IDENTITY_NOTE)}</p>
</header>

<section>
  <h2>What is being decided</h2>
  <div class="kv">
    <div><span>Scenario</span><strong>{_e(scenario.get('name'))}</strong></div>
    <div><span>Treatment</span><strong>{_or_dash(scenario.get('treatment'))}</strong></div>
    <div><span>Discount</span><strong>{discount_text}</strong></div>
    <div><span>{_or_dash(scenario.get('range_label'))}</span><strong>{uplift_text}</strong></div>
    <div><span>Period</span><strong>{_or_dash(scope.get('period'))}</strong></div>
    <div><span>Rows in scope</span><strong>{_or_dash(scope.get('row_count'))}</strong></div>
    <div><span>Promoted rows</span><strong>{_or_dash(scope.get('promoted_row_count'))}</strong></div>
  </div>
  <h3>Investigation</h3>
  <p>{
      _e(question) if question
      else "No investigation question was recorded. " + _e(
          investigation.get("question_unavailable_reason") or "")
  }</p>
  <p class="note">
    Type: {_or_dash(investigation.get('investigation_type'))} &middot;
    Investigation ID: {_e(investigation.get('investigation_id')) or 'not assigned'} &middot;
    Context source: {_or_dash(investigation.get('source'))}
  </p>
</section>

<section>
  <h2>Expected impact</h2>
  <table>
    <thead><tr><th>Metric</th><th class="num">Low end</th><th class="num">High end</th></tr></thead>
    <tbody>{_impact_rows(record)}</tbody>
  </table>
  <p class="note">Both ends of the treatment's approved uplift range are shown.
    There is no midpoint and no expected value between them, and this is not a
    confidence interval or a prediction.</p>
</section>

<section>
  <h2>Recommendation</h2>
  <p><strong>{
      "Recommended under the current decision policy."
      if recommendation.get("is_this_scenario")
      else "This scenario is NOT the recommended one. The policy selected "
           + (_e(recommendation.get("recommended_scenario_id")) or "no scenario") + "."
  }</strong></p>
  <p>{_e(recommendation.get('reason'))}</p>
  <p class="note">Policy v{_or_dash(recommendation.get('policy_version'))} &middot;
    primary metric {_e(str(recommendation.get('primary_metric') or '').replace('_', ' '))}
    at the {_or_dash(recommendation.get('primary_endpoint'))} end.</p>
  <p class="note">{_e(recommendation.get('note'))}</p>
</section>

<section>
  <h2>Weekly impact</h2>
  {_weekly_section(record)}
</section>

<section>
  <h2>Risk &amp; governance &mdash; {_e(governance.get('overall_status'))}</h2>
  <p>{_e(governance.get('summary'))}</p>
  <p class="note">{_e(governance.get('overall_status_rule'))}</p>
  <h3>Findings</h3>
  <ul>{_findings(record)}</ul>
  <h3>Governance considerations</h3>
  <p class="note">These boundaries are not defined anywhere in this project, so
    nothing above is judged against them and no compliance position is stated.</p>
  <ul>{_listed(governance.get('governance_gaps', []), 'label', 'statement')}</ul>
  <h3>Method limitations</h3>
  <ul>{_listed(governance.get('limitations', []), 'title', 'statement')}</ul>
</section>

<section>
  <h2>Readiness</h2>
  <p>{_states(record)}</p>
  <p class="note">{_e(readiness.get('states_note'))}</p>
  <h3>Blocking approval</h3>
  <ul>{_listed(readiness.get('blockers', []), 'title', 'detail')}</ul>
  <h3>Unverified before execution</h3>
  <ul>{_listed(readiness.get('unverified', []), 'title', 'detail')}</ul>
</section>

<section>
  <h2>Decision path &amp; provenance</h2>
  <p class="note">{_e(provenance.get('method'))}</p>
  <ul>{sources}</ul>
  <div class="kv">
    <div><span>KPI engine</span><strong>{_or_dash(provenance.get('kpi_engine'))}</strong></div>
    <div><span>Response rule</span><strong>{_or_dash(provenance.get('response_rule'))}</strong></div>
    <div><span>Recommendation policy</span><strong>{_or_dash(provenance.get('recommendation_policy_version'))}</strong></div>
    <div><span>Risk policy</span><strong>{_or_dash(provenance.get('risk_policy_version'))}</strong></div>
  </div>
  <p class="note">{_e((record.get('meta') or {}).get('persistence_note'))}</p>
</section>

<footer>
  Draft &middot; not approved &middot; not saved &middot; no author &middot; no approver.
  {_e(METHOD)}
</footer>

</body>
</html>
"""


# --- the briefing ------------------------------------------------------------


def build(record: dict[str, Any], exported_at: str | None = None) -> dict[str, Any]:
    """Render one decision record as both artifacts.

    `exported_at` is the ONE value not taken from the record. It defaults to the
    server clock; passing it explicitly makes rendering deterministic, which is
    how the tests pin the output.

    Raises `InvalidRecord` when the payload is not a complete B7 record.
    """
    validate(record)
    stamp = exported_at or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return {
        "briefing": build_json(record, stamp),
        "html": build_html(record, stamp),
        "filenames": {"json": "briefing.json", "html": "briefing.html"},
    }
