# Module 05 — Decision Center

**Route:** `#/decision` · **Page:** `frontend/src/pages/Decision.tsx` (930 lines)
**Status:** Implemented — **no approval workflow, by design**

## 1. Purpose

Show **one decision record**: the scenario the user chose to carry, its expected
impact, why it was (or was not) recommended, what governance says about it, and
exactly what stands between it and an approval.

> **An assembly, not a calculation.** `app/tpo/decision.py`:
> *"Nothing here computes a KPI, re-derives an uplift, re-runs a comparison,
> re-applies the recommendation policy or re-assesses risk. Every figure is
> carried through verbatim… If a number in Decision Center ever disagrees with
> the same number in Simulation Studio, the cause is a bug in this file rather
> than a second opinion."*

## 2. Inputs

`POST /api/decision/record` takes **five payloads the client already holds**:

| Field | Source contract |
|---|---|
| `context` | `POST /api/simulation/context` |
| `simulation` | `POST /api/simulation/simulate` — the scenario chosen to carry |
| `recommendation` | `POST /api/simulation/recommend` |
| `risk` | `POST /api/simulation/risk` |
| `weekly` *(optional)* | `POST /api/simulation/weekly`, when that view was open |

Posted back rather than recomputed. **That is what guarantees Decision Center
describes the same numbers the user was looking at** — there is no second
evaluation that could disagree.

The page receives them via `store/decisionDraft.ts`, carried from Simulation
Studio with a `signature` so a redundant re-post is skipped.

## 3. Cross-validation

Sections are checked **against each other** before anything is assembled. A
record silently combining scenario A's impact with scenario B's recommendation,
or a risk assessment computed over a different scope, would look authoritative
and be wrong. A mismatch raises `SectionMismatch` → **422** naming which two
sections disagree.

The strongest check costs nothing: `/risk` already carries the exact simulation
provenance it assessed, so

```
risk.provenance.scenario_provenance == simulation.provenance
```

proves the risk describes this scenario and no other.

## 4. The record

```jsonc
{
  "decision_id": null,           // no persistence in this contract
  "status": "draft",
  "scenario":        { scenario_id, name, treatment, discount_pct, uplift, range_label },
  "investigation":   { … from context, with per-field provenance … },
  "scope":           { filters_applied, period, row_count,
                       promoted_row_count, excluded_rows },
  "expected_impact": [ … per metric, BOTH band ends … ],
  "recommendation":  { is_this_scenario, policy_version, … },
  "governance":      { overall_status, findings[], governance_gaps[] },
  "weekly":          { available, week_count, weeks[], metrics[],
                       reconciliation, method }   // or { available: false, reason }
  "readiness":       { can_be_approved: false, reason, blockers[], unverified[],
                       states: { recommended, governed, ready_to_review, approved },
                       states_note },
  "provenance":      { assembled_from[], kpi_engine, response_rule,
                       promotion_cost_rate, recommendation_policy_version,
                       risk_policy_version, scenario_provenance, method },
  "meta":            { phase: "B7", persisted: false, persistence_note }
}
```

## 5. Page sections

| # | Section | Component | Shows |
|---|---|---|---|
| A | Header | — | Save Decision · Export Report · Generate Briefing |
| B | Summary | `SummarySection` | Scenario, treatment, scope, investigation question (with an ⓘ when there is none) |
| C | Expected impact | `ImpactSection` / `ImpactRow` | **Both ends of the approved range. No midpoint** |
| — | Weekly note | `WeeklyNote` | Present only when a weekly decomposition was carried |
| D | Recommendation | `RecommendationSection` | Whether **this** scenario is the recommended one, and the policy version |
| E | Governance | `GovernanceSection` / `FindingRow` | `overall_status` + risk findings, tinted by severity |
| F | Readiness | `ReadinessSection` | The four states and why approval is blocked |
| G | Workflow | `WorkflowSection` | The stated workflow position |
| H | Briefing | `BriefingSection` | Generate + download the artifact |
| — | Stored banner | `StoredBanner` | After a Save, the record's server-minted id and version |

## 6. Four different things, kept apart

`readiness.states`:

| State | Value |
|---|---|
| `recommended` | Whether the recommendation engine chose **this** scenario |
| `governed` | `risk.overall_status == "clear"` |
| `ready_to_review` | Always `true` |
| `approved` | **Always `false`** |

`states_note`: *"Recommended, governed, ready to review and approved are four
different things. A scenario can be recommended under the decision policy and
still carry open governance items, and no record is approved here."*

**Recommended is not approved, and selected is not recommended.** The user
chooses which scenario to carry; if that is the recommended one the record says
so, and if it is not, the record says that too — the recommendation is carried
through unchanged either way.

## 7. Approval — **not implemented, and refused**

`can_be_approved` is `false` in **every** record. `decision.NO_APPROVAL_CRITERIA`:

> *"This project defines no approval criteria: nothing states who approves a
> promotion decision, against which tests, or in what order. A record cannot be
> declared approvable against rules that do not exist."*

`readiness.blockers` always begins with that, then adds every **high-severity
`attention`** finding from the risk assessment. `readiness.unverified` collects
the remaining `attention`/`unknown` findings **plus every governance gap** —
the boundaries this project has never approved.

So the record says exactly what remains open rather than gesturing at it.

### What was removed

`pages/Decision.tsx`'s own docstring records what this page used to render from
`decision.json`:

- an ROI of **2.55** in units Simulation had abandoned,
- "Data Confidence — High (89%)",
- strategy rows for **Retailer Incentive** and **Inventory Allocation** — two
  levers no dataset in this project supports,
- a governance panel reporting "Budget Compliance — **Compliant**" and "Margin
  Threshold — **Compliant**", against thresholds the risk work established **do
  not exist**,
- an approval animation announcing that the **finance team had been notified**.

None of it was connected to anything. All of it is gone. `decision.json` is
still served at `GET /api/decision-default` for fidelity and is **not read by
this page**.

## 8. Persistence — implemented, and separate from the record

`POST /api/decision/record` itself **persists nothing** (`meta.persisted:
false`). Storage is an explicit user action:

```
Save Decision → POST /api/store/decisions { record, investigation_id?,
                                            scenario_id?, decision_id?,
                                            expected_version? }
```

- The record is stored **untouched** — `decision_id: null`, `status: "draft"`,
  `meta.persisted: false`, exactly as it was assembled. The storage identity
  lives in the **envelope around it**, which is what lets a record read back out
  of the store be handed straight to `/api/decision/briefing`.
- **Append-only.** Re-saving appends a version; nothing is overwritten.
- A stale `expected_version` → **409** naming `current_version`.
- **`owner` is always `null`**, with `NO_OWNER_NOTE` returned beside it.

The browser remembers the last saved id in `store/savedRefs.ts`
(`localStorage`) — a **pointer only**. With nothing carried from Simulation
Studio, the page falls back to that id and re-fetches the record from the
server, so a cleared cache loses the shortcut and not the decision.

## 9. Downstream hand-off — the briefing

`POST /api/decision/briefing` renders one record as two artifacts:

- `briefing.json` — machine-readable
- `briefing.html` — self-contained; the browser prints it to PDF

**A renderer, not a calculation.** No KPI engine, scenario execution,
comparison, recommendation policy or risk policy is imported or called, and
there is no dataset to scan. Nothing is persisted; both artifacts are built per
request.

The artifact insists on its own limits, in the JSON envelope, the page header, a
banner and the footer of every printed page:

> *"This briefing is a DRAFT. The decision it describes is NOT APPROVED and NOT
> SAVED. This application implements no approval workflow, notifies nobody and
> stores nothing… Nothing here authorises spend, and no reviewer has signed it."*

and

> *"This briefing names no author and no approver: this application has no
> authentication, so it cannot establish who produced or reviewed it."*

An incomplete record → **422** (`InvalidRecord`) naming what is wrong, rather
than a rendering with a hole in it.

`hooks/useBriefing.saveBriefing` saves the HTML through a synthetic anchor —
this project's one proven download path, shared with the Report Center.

## 10. Reports

`ExportReportButton` with `module="decision-center"`. The `record` option must
carry `context`, `simulation`, `recommendation` and `risk`; missing any of them
raises *"Open the decision in Decision Center before exporting"* → **422**.

The adapter calls `decision.build_record` — the **same** function
`/api/decision/record` calls — and flattens the record into sections **without
reinterpreting any of it**. Approval and persistence language is copied
verbatim: if the record says a decision is a draft with no approval criteria,
the export says exactly that.

Disclaimers carried into the file:
*"Decision status reflects the current application record and does not imply
approval unless explicitly shown"* and *"Simulated values are scenario estimates
and are not historical actuals."*

## 11. Known limitations

| # | Limitation |
|---|---|
| 1 | **No approval workflow.** `can_be_approved` is always `false`; no criteria exist to build one against |
| 2 | **No approver, no author, no notification.** No identity provider exists; the briefing states this on the page |
| 3 | `owner` is `null` on every stored record |
| 4 | `POST /api/decision/record` persists nothing; storage is a separate explicit action |
| 5 | Storage is **unauthenticated** — anyone who can reach the process can store a decision, append versions to records they did not create, and read every stored decision |
| 6 | The record depends on the client carrying four payloads; navigating directly to `#/decision` with no draft and no saved id shows an empty state |
| 7 | Decision Center is described as where execution would happen, but **nothing in this application executes a promotion** |

## 12. File map

| Concern | File |
|---|---|
| Page | `frontend/src/pages/Decision.tsx` |
| Draft store | `frontend/src/store/decisionDraft.ts` |
| Saved ids | `frontend/src/store/savedRefs.ts` |
| Hooks | `frontend/src/hooks/{useDecision,useBriefing,useStore}.ts` |
| Types | `frontend/src/types/{decision,risk,store}.ts` |
| Routers | `backend/app/routers/decision.py`, `briefing.py`, `store.py` |
| Services | `backend/app/tpo/decision.py`, `briefing.py` |
| Persistence | `backend/app/store/{repository,db,fingerprint}.py` |
| Report adapter | `backend/app/reports/adapters.decision_center` |
| Tests | `test_decision_record.py`, `test_decision_briefing.py`, `test_decision_journey.py`, `test_store_persistence.py`, `test_saved_decision_label.py`, `test_upstream_truthfulness.py` |
