# Module 04 — Simulation Studio

**Route:** `#/simulation` · **Page:** `frontend/src/pages/Simulation.tsx` (880 lines)
**Status:** Implemented — **three separate modes**

Per-mode detail:
[simulation/01 — Investigation Simulation](../simulation/01_INVESTIGATION_SIMULATION.md) ·
[simulation/02 — General Optimization](../simulation/02_GENERAL_OPTIMIZATION.md) ·
[simulation/03 — Target Rescue](../simulation/03_TARGET_RESCUE.md)

## 1. Three modes, deliberately not merged

```
┌─────────────────────────────────────────────────────────────────────┐
│  #/simulation   —  ONE page shell, ONE router entry                 │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ [Investigation Simulation] [General Optimization] [Target Rescue] │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   A. Measure the current plan and simulate an approved treatment    │
│   B. Allocate a trade-spend budget across a category/channel/month  │
│   C. Recover an at-risk monthly unit target                         │
└─────────────────────────────────────────────────────────────────────┘
```

They are **three modes, not three variants of one feature**, and the code
enforces it. `app/tpo/optimization.py`'s docstring:

> *"A SECOND, SEPARATE simulation mode. It shares nothing with the
> Investigation Simulation path except the two things that must not be written
> down twice: the ONE `FilterState`, and the APPROVED PROMOTION ECONOMICS.
> Nothing in `app/tpo/simulation.py`, `execution.py`, `scenarios.py`,
> `comparison.py`, `recommendation.py` or `risk.py` is imported, called or
> changed by this module."*

`app/tpo/rescue.py` says the same for the third, and adds
`optimization._price_and_baseline` to the shared list — **called**, not
restated.

| | Investigation Simulation | General Optimization | Target Rescue |
|---|---|---|---|
| **Question** | What would an approved treatment do to this plan? | Which products should carry a promotion, at what depth, inside a budget? | Is this month's unit target on track, and what recovers it? |
| **Service** | `simulation.py`, `execution.py`, `comparison.py`, `recommendation.py`, `risk.py`, `weekly.py` | `optimization.py` | `rescue.py` |
| **Scope source** | `commandFilters` (or the RCA hand-off) — all 14 dimensions | `store/generalOptimization` — category, channel, month | `store/targetRescue` — year, month, channel, category, product |
| **Endpoints** | `/context`, `/run`, `/simulate`, `/compare`, `/recommend`, `/weekly`, `/risk` | `/general-optimization[/scope]` | `/target-rescue[/scope]` |
| **Output** | A scenario result **range** | A budget-constrained plan | An intervention ladder + a recommendation |
| **Report module** | `simulation-investigation` | `simulation-general-optimization` | `simulation-target-rescue` |

## 2. What all three share — and nothing else

| Shared | Where it lives |
|---|---|
| The one `FilterState` | `app/tpo/filters.py` |
| The five approved treatment rules | `app/tpo/config.TREATMENT_RULES` + `app/tpo/response.py` |
| The validated KPI definitions | `app/tpo/aggregate.py` |
| The per-candidate baseline rule (modes B and C) | `optimization._price_and_baseline` |
| The channel cadence (mode C reads it) | `promo_calendar.CADENCE` |

Nothing else. No route in mode B or C calls any of mode A's routes, and none of
mode A's modules changed to make room for them.

## 3. Mode isolation on the frontend

The mode switch is a **segmented control, not a router** — all three modes are
this page, so switching cannot lose the investigation's scope, its question, or
a scenario the user has already run.

```ts
type SimulationMode = 'investigation' | 'general' | 'rescue'
```

- Each mode owns **its own Zustand store**, so switching away and back restores
  what the user had, and no mode observes another's selection.
- The default is `investigation`, and `generalOptimization.ts` **does not
  persist** the choice — a fresh load always opens on it.
- The branch is in the JSX, **not around the hooks**: every hook on the page
  still runs in either mode, so switching back is instant and the investigation
  path never observes that it was away.

A shared month or channel would mean changing a control in one mode silently
re-scoped another — the state leakage the design forbids.

## 4. The page shell

```
h1  TPO Simulation Studio  + LiveStatus
p   mode-dependent subtitle
    ├ investigation: "The measured promotion plan for the current selection,
    │                 and what an approved treatment would do to it."
    ├ general:       "Allocate a trade-spend budget across a category and
    │                 channel, at approved discount depths."
    └ rescue:        "Check monthly target progress and recover an at-risk
                      target with the least aggressive approved intervention."

[ModeSwitch] [ExportReportButton] [Recalculate — investigation mode only]
```

## 5. Export follows the active mode

`exportModule(mode)`, `exportScope(mode, filters)` and
`exportOptions(mode, …)` are three single switches, so the modes cannot drift
apart or fall through to a default that would silently export the wrong
workspace. `key={mode}` on the button resets its state on a switch.

**Scope and options are read at click time** from each mode's **own** store:

| Mode | Scope posted | Options posted |
|---|---|---|
| `investigation` | `toSimulationFilters(filters)` — the full 14-dimension state | `scenario_id`, `scenario_name`, `discount_pct`, `filename_hint` |
| `general` | `month`, `channel[]`, `category[]` | `max_trade_spend`, `min_discount_pct`, `max_discount_pct` |
| `rescue` | `year`, `month`, `channel[]`, `category[]`, `product[]` | `target_units`, `current_discount_pct`, `checkpoint`, `max_additional_trade_spend` |

So a Target Rescue export can never carry General Optimization's product plan,
and switching modes needs no cache to invalidate.

**The client posts inputs, never results.** The server re-runs the same service
the screen called.

## 6. The page computes nothing

`pages/Simulation.tsx`'s own docstring:

> *"This page computes NOTHING. It posts a scope to `/api/simulation/run` for
> the measured baseline, and a scope plus an approved treatment to
> `/api/simulation/simulate` to execute a hypothetical. Every figure on screen
> was produced by the validated KPI engine."*

The predecessor's browser-side engine
(`components/simulation/simulationEngine.ts` — `compute()`, `buildRisk()`,
referenced in `DEV.md` Phase 4) **no longer exists**. It divided revenue by
spend and called the result "ROI" — a different formula in different units,
sitting beside a Command Center reporting against a 50% target.

## 7. Two entry paths (mode A)

| Path | Scope |
|---|---|
| **Direct navigation** | The Command Center's current selection |
| **Drilled in from an investigation** | The scope the Command Center handed over — that same validated `FilterState`, narrowed by identifiers the source genuinely provided |

Either way it is **one `FilterState`**, and it is the one `/run` and `/simulate`
receive. Neither path invents a filter.

## 8. Result invalidation (mode A)

A result belongs to **the scope and the treatment it came from**. Changing
either invalidates it (`store/simulationScenarios.ts`), so a 10% result never
lingers on screen under a 15% selection. A scope change reseeds the store,
discarding every scenario result computed over the previous rows.

## 9. The approved economics, once

All three modes price a treatment the same way. For a candidate with baseline
volume `b`, list price `P`, unit cost `k`, under approved treatment `(d, u)`
with cost rate `c = 0.03`:

```
units      = b · (1 + u)
gross      = units · P
revenue    = gross · (1 − d)
discount   = gross · d
overhead   = gross · c
trade spend = discount + overhead = gross · (d + c)
total cost = k · units
```

`trade spend` is Trade Spend exactly as `aggregate.calculate_trade_spend`
defines it, so a ceiling the user sets is enforced against **the project's own
definition** and not a local one.

Five approved depths — **5, 10, 15, 20, 25** — and no interpolation between
them. Every discount slider in the studio steps in fives for that reason, and
none of the components writes the approved list down: the API sends it, and the
panel shows what it sent.

## 9a. The request lifecycle — and the StrictMode trap

Six calls fire from mode A, **all of them mutations** (`hooks/useSimulation.ts`):
`/run`, `/simulate`, `/compare`, `/recommend`, `/weekly`, `/risk`. `/simulate`
is user-triggered; the other five are driven by effects keyed on what the page
actually has.

| Effect | Key | Fires when |
|---|---|---|
| `/run` | `scopeKey` | the scope changes |
| `/compare` + `/recommend` | `comparisonKey` + `run.data` | any scenario's result changes |
| `/weekly` | scope + scenario + treatment | the selected scenario's result changes |
| `/risk` | scope + scenario + treatment + recommendation | as above, or the recommendation moves |

### The trap, and why every guarded effect now cleans up

Each of these effects guards itself with a `useRef` so one key fires one
request. **A ref guard with no cleanup is a hang under `StrictMode`**, which is
active in `main.tsx`:

1. React mounts, runs the effect, then unmounts and remounts (development only).
2. react-query drops a mutation's observer on unsubscribe and never re-attaches
   it — `MutationObserver` has `onUnsubscribe` but no `onSubscribe`.
3. The request fired on the **discarded** pass returns `200` to a listener
   nobody holds: `onSuccess` never runs, `data` never arrives, `isPending` never
   clears, and **no error is ever raised**.
4. The surviving pass sees the ref already set and returns early — so the only
   request in flight is the dead one.

`/run` has carried the fix (a cleanup clearing the ref) since it was first hit.
**`/weekly` and `/risk` did not**, and they are the two whose keys are non-null
on the very first render: the scenario store is module-level zustand, so
returning from Decision Center repopulates `active0.simulation` immediately.
Both now clear their refs on teardown.

`/compare` is safe by construction — it is gated on `run.data`, which is a
mutation result and therefore never present during the discarded pass.

**Observed severity before the fix:** two orphaned requests per remount, and a
dead spinner until `/run` reseeded the store and the `!key` branch cleared the
ref. It became a **permanent** hang only when that `/run` also failed — and
since `canCarryDecision` requires `risk.data`, that left **Open Decision Center
disabled with no error on screen to explain it**.

## 9b. Result identity

`/simulate` echoes the `scenario_id` it was given. The page checks it before
attaching:

```ts
if (data.scenario_id !== requestedId) { failRun(requestedId, '…does not match…'); return }
```

Attaching a mismatched result would put one scenario's KPIs under another's
name. Downstream, `/weekly` and `/risk` results are likewise rendered only when
`data.scenario_id === active.id`, so a panel can never show scenario A's answer
under scenario B — it falls back to its spinner instead.

## 9c. Partial failure

The four downstream calls are **independent**. Each has its own error branch
with its own Retry, and none of them can erase a successful simulation:

| Failure | What the user still has |
|---|---|
| `/compare` | scenario result, recommendation, risk, weekly |
| `/recommend` | scenario result, comparison, weekly |
| `/risk` | scenario result, comparison, recommendation, weekly |
| `/weekly` | everything except the weekly decomposition |

**One exception, and it is a contract, not a bug.** `POST /api/decision/record`
requires the recommendation *and* the risk assessment — a record missing either
is refused. So `Open Decision Center` stays disabled until both arrive, and the
status line beside it now **names the actual blocker** ("The risk assessment
could not be produced, and a decision record needs it") instead of telling the
user to run a scenario they have already run.

## 9d. Determinism

**No language model is anywhere in this pipeline.** OpenAI is used elsewhere in
the product — Investigations, Promotion Intelligence's "Go deeper", Decision
Center's AI brief — and none of them is reachable from a simulation module.

`test_simulation_determinism.py` pins this two ways: a **transitive import
walk** from all eleven pipeline modules asserting none can reach `openai`,
`app.agents` or `app.tpo.decision_brief`, and a source scan for `complete_json`
/ `chat.completions`. It also asserts that identical requests to `/run`,
`/simulate`, `/compare`, `/recommend`, `/risk`, `/weekly` and both optimisation
modes return **byte-identical** payloads, and that running one mode does not
move another's answer.

## 9e. Handoff to Decision Center

`Open Decision Center` carries **six payloads the page already holds** into
`store/decisionDraft.ts`: `context`, `simulation`, `recommendation`, `risk`,
`weekly` (when open), `comparison` and `baseline`. Nothing is recomputed on
either side.

The draft carries a **signature** — scope, scenario, treatment, recommendation
and risk status — and Simulation Studio drops it the moment that signature stops
matching. Decision Center opening on a scenario the user has since changed is
therefore structurally impossible.

Cross-checked server-side too: `/api/decision/record` refuses a risk assessment
belonging to another scenario, a comparison over another scope, or a context
describing different filters — **422**, naming which two sections disagree.

## 10. What none of the three modes does

| Not done | Stated reason |
|---|---|
| Forecast | No forecasting model exists. Every near-neighbour is labelled as what it is |
| Elasticity | The treatment rules are design parameters, not a fitted curve |
| Duration response | No approved rule maps weeks to uplift. `duration_weeks` is echoed, never modelled |
| Spend as an input | Trade Spend is `b(1+u)P(d+c)` — an output |
| Retailer incentive | No dataset splits retailer support out of `Promotion_Cost` |
| Inventory allocation | The project holds no inventory data |
| Cannibalization response | The approved rules define none. The engine still **measures** it on synthesized rows |
| Midpoint of a band | Would manufacture precision the rule does not grant |
| Writing anything | All three **recommend only.** No promotion is created, no fact or calendar row is touched, no discount is activated. Execution stays a Decision Center action |

## 11. Known limitations

| # | Limitation |
|---|---|
| 1 | **Levers are recorded, not applied** on `/run` — `levers.applied` is `false` in every response |
| 2 | Only **five** discount depths can be priced |
| 3 | `/compare` never recommends — `recommendation` is `null` by contract; ranking is `/recommend`'s job |
| 4 | `/simulate` refuses a scope with no promoted row (422) rather than returning zeros |
| 5 | Cannibalization inside a simulation gets the **evidence floor only** — the measurement ladder deliberately does not run, because widening the scope would hand the scenario a different population to re-base |
| 6 | Mode selection is not persisted and not in the URL — a reload returns to Investigation Simulation |
| 7 | No frontend tests cover the mode switch or store isolation — the StrictMode lifecycle fixes in 9a are verified by code inspection and by the backend contract tests, not by a rendering test |
| 8 | The mode-A effects live in the page body, so selecting General Optimization or Target Rescue still runs the investigation baseline, comparison and recommendation in the background. Wasteful but deliberate — it makes switching back instant, and no mode reads another's store |
| 9 | `max_trade_spend` above the measured ceiling is **clamped, not rejected**; the response reports the clamp |

## 12. File map

| Concern | File |
|---|---|
| Page + mode switch + export wiring | `frontend/src/pages/Simulation.tsx` |
| Mode A components | `frontend/src/components/simulation/*` (12 files) |
| Mode B component | `frontend/src/components/optimization/GeneralOptimization.tsx` |
| Mode C component | `frontend/src/components/rescue/TargetRescue.tsx` |
| Stores | `frontend/src/store/{simulationScenarios,generalOptimization,targetRescue,decisionDraft}.ts` |
| Hooks | `frontend/src/hooks/{useSimulation,useOptimization,useTargetRescue,useInvestigationContext,useStore}.ts` |
| Types | `frontend/src/types/{simulation,comparison,recommendation,risk,weekly,optimization,targetRescue}.ts` |
| Router | `backend/app/routers/simulation.py` (697 lines, 12 routes) |
| Services | `backend/app/tpo/{simulation,execution,scenarios,comparison,recommendation,risk,weekly,investigation,optimization,rescue,response}.py` |
| Tests | `test_simulation*.py` (8 modules, incl. `test_simulation_determinism.py`), `test_general_optimization.py`, `test_target_rescue.py`, `test_response_model.py`, `test_investigation_context.py`, `test_decision_reconciliation.py` |
