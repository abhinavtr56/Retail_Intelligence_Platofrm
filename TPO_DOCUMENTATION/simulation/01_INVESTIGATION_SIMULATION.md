# Simulation Mode A — Investigation Simulation

**Mode key:** `investigation` (the default) · **Status:** Implemented

> **The default mode.** Answers: *"here is the promotion plan that actually ran
> for this scope — what would an approved treatment do to it?"*

## 1. RCA context

`POST /api/simulation/context` (`app/tpo/investigation.py`).

Validates an RCA hand-off into a Simulation context. **Contract plumbing only** —
it runs no scenario, computes no KPI, and does not touch `/run` or `/simulate`.

Every field is stamped with a provenance: `rca`, `command_center`,
`filter_state`, `seed_example`, `unavailable`.

| Field | Status today |
|---|---|
| `filters` | **Real** — the one `FilterState` |
| `question` | Real only when `investigation_started` is true and it is not a seeded example |
| `investigation_id` | **`unavailable`** — nothing assigns one |
| `investigation_type` | Carried when supplied |
| `problem_statement` | **`unavailable`** — RCA's node details are authored copy |
| Any KPI, spend or ROI | **Never crosses.** RCA's figures are display fiction — one chip reports ₹98.6 Cr where the engine measures ₹7.7 Cr |

Rendered by `components/simulation/ContextBar.tsx`, which shows each field with
its provenance rather than presenting an unavailable one as blank.

## 2. The investigation question

The banner shows the **resolved** question (`context.data.question.value`), not
the raw store value — the store seeds itself with an example, and a banner
sitting next to a context bar reading "no question yet" would contradict it.
With nothing resolved it reads *"No investigation question yet"*.

## 3. The Current Plan — measured

`POST /api/simulation/run` (`app/tpo/simulation.py`).

**Orchestration only. Not one KPI is computed in this module.** Every number
comes out of `aggregate.py` **by way of `service.kpis`** — the same call the
Command Center's cards make.

That indirection is deliberate:

> *"the scope rules that surround the engine — the baseline-widened volume set,
> the Brand-Form widening cannibalization needs, the same-filters-previous-year
> comparison — are decisions, and having them written down twice is how two
> screens start disagreeing. One call, one set of decisions."*

### The seven figures

| Key | Source card | Unit |
|---|---|---|
| `trade_spend` | `trade_spend` | currency |
| `incremental_units` | **not a card** — read from `aggregate.calculate_incremental_quantity` | quantity |
| `incremental_sales` | `incremental_sales` | currency |
| `roi_percent` | `promotion_roi` | percent |
| `margin_percent` | `margin_impact` | percent |
| `cannibalization` | `cannibalization_rate` | percent |
| `pei` | `pei` | score |

Each carries `label`, `unit`, `value`, `display_value`, `available`,
`unavailable_reason` and `formula` — **copied from the card, not re-derived**.
Cannibalization additionally carries `comparable_events` and `measured_at`.

### The scope measurement

`_measure(rows)` describes what was selected before any scenario is imagined:
`row_count`, `promoted_row_count`, `promoted_weeks`, `median_promotion_weeks`,
`average_discount_pct`, the `promotion_ids` present, weeks per promotion, and
the `week_span`.

Rendered by `components/simulation/CurrentPlanPanel.tsx`.

## 4. The three scenarios

`app/tpo/scenarios.DEFAULT_SCENARIOS` — the **only** place they are named; the
frontend writes none of this down.

| Id | Name | Sub-label | Kind | Initial status |
|---|---|---|---|---|
| `current-plan` | Current Plan | Measured baseline | `measured` | `measured` |
| `optimized-plan` | Optimized Plan | **Configure levers** | `hypothetical` | `not_simulated` |
| `aggressive-growth` | Aggressive Growth | **Configure levers** | `hypothetical` | `not_simulated` |

> **"Optimized Plan" is a label, not a claim.** *"There is no optimizer in this
> [mode]. Nothing here makes the Optimized Plan better than the Current Plan,
> because nothing here evaluates either of them. The scenario exists so the user
> has somewhere to put a lever set."*
>
> The sub-labels deliberately say what the scenario **is** — "Configure levers",
> not "Recommended" or "Maximize share". Nothing in this project can currently
> justify the second kind of wording.

### An unrun hypothetical carries `result: null`

Not zero, not the baseline's numbers, not the baseline's numbers nudged by a
factor. `NOT_SIMULATED_REASON` travels on the scenario itself, so a card can
explain its own emptiness.

`scenarios.assert_no_fabricated_results` runs **on the real payload**, not only
in a test. `status: "simulated"` is legitimate only because
`app/tpo/execution.py` sets it on the way out of a run that actually happened —
nothing else in the codebase may set it.

### Lever isolation

Every scenario is built with its **own** lever dict. They start equal (seeded
from the observed plan) and are separate objects, so editing one cannot reach
another. Sharing one mutable dict across three scenarios is the specific bug
`scenarios.levers_are_isolated` exists to prevent.

## 5. Levers

`LEVER_KEYS = ("discount_pct", "duration_weeks", "spend_amount")`.

| Lever | On `/run` | On `/simulate` |
|---|---|---|
| `discount_pct` | Recorded, echoed, **not applied** | **Modelled** — must be an approved depth |
| `duration_weeks` | Recorded, echoed, not applied | Echoed, `modelled: false`, with `DURATION_NOTE` |
| `spend_amount` | Accepted on `/run`, not applied | **Rejected outright** — `derived: true` with `SPEND_NOTE` |

### `/run` applies nothing, and says so

`levers.applied` is `false` in **every** `/run` response.
`simulation.LEVERS_NOT_MODELLED`:

> *"Lever values are recorded but do not change these results… until then every
> figure shown is this scope's measured performance."*

The frontend surfaces it (`components/simulation/LeverPanel.tsx`).

### Rejected levers, named individually

`POST /api/simulation/simulate` rejects three inputs **by name with a reason**,
rather than with a bare "extra inputs are not permitted" — a caller sending
`spend_amount` has a mistaken model of the economics and needs to be told which
one:

| Rejected | Reason |
|---|---|
| `spend_amount` | Trade Spend is `b(1+u)P(d+c)` — an output of the treatment, measured from the simulated rows |
| `incentive_pct` | No dataset splits retailer support out of `Promotion_Cost` |
| `inventory_allocation` | The project holds no inventory data |

The Phase-A `SimulationLevers` model likewise sets `extra="forbid"`: *"a client
posting `incentive_pct` should get a 422 telling it the lever does not exist,
not a silent success that leaves it believing a retailer incentive was taken
into account."*

## 6. Executing a scenario

`POST /api/simulation/simulate` (`app/tpo/execution.py`).

```
scenario (an approved discount)
  → response.py resolves the treatment and its uplift BAND
  → counterfactual WeekRows synthesized at EACH END of the band
  → aggregate.calculate_kpis reads those rows
  → a low/high result range
```

**It computes no KPI.** Not ROI, not Trade Spend, not Incremental Sales or
Units, not Margin, not PEI, not Cannibalization. It builds rows and hands them
to the engine that already owns every one of those definitions.

> **Why synthesizing rows is the right shape.** The alternative is a closed-form
> `simulated_roi = …`, which would be a second ROI definition living beside the
> validated one and drifting from it. Feeding rows in means the scenario
> inherits every decision the engine already makes — the per-`(product,
> channel)` baseline, the Brand-Form widening, the negative-uplift policy, the
> rounding — for free and identically.

### Scope resolution mirrors a measurement exactly

`_evaluate` resolves the same three row sets `service._bundle` does — the
selection, the baseline-widened volume set, the Brand-Form widened set — because
*"a scenario has to be scoped the same way a measurement is, or the two are not
comparable."*

**Targets come from the selection.** A sibling SKU's own promotion, pulled in
only by the Brand-Form widening, is not this scenario's promotion and **keeps
its measured values**.

**One baseline map for all three sets**, computed from the baseline-widened set.
The selection alone cannot supply it under an Offer filter — it holds no
non-promoted row — and a per-set map could re-base the same `(product, channel)`
two different ways.

**No comparison period is passed.** A hypothetical has no last year; comparing a
counterfactual against real prior-year trading would be a growth figure about
nothing, so every delta stays undefined.

### The arithmetic

For a row covering `n` transactions with baseline `b` and list price `P`:

```
quantity         = b · n · (1 + u)
price            = P · (1 − d)
actual_revenue   = quantity · price
base_revenue     = quantity · P
discount_value   = base_revenue − actual_revenue
promotion_cost   = c · base_revenue
total_cost       = unit_cost · quantity
base_quantity    = quantity          (Base_Quantity == Actual_Quantity holds)
actual_price_sum = price · n
```

### Refusals

| Situation | Response |
|---|---|
| Discount not one of 5/10/15/20/25 | **422** — `UnapprovedDiscount`, listing the approved depths |
| Scope selects no rows | **422** — *"nothing to simulate"* |
| Nothing in scope was promoted | **422** — *"there is no promotion for a treatment to replace"* |

Neither returns a zeroed result: **a scenario that could not run has no numbers,
and saying so is the answer.**

Rows whose `(product, channel)` has no baseline are dropped and counted in
`scope.excluded_rows` with `excluded_reason`.

### Cannibalization in a scenario

The engine still **measures** it on the counterfactual rows, and
`CANNIBALIZATION_NOTE` travels with the figure:

> *"…measured by the existing KPI engine from the counterfactual rows. The
> approved promotion rules define no cannibalization response to discount depth,
> so this is not an estimated response — the promoted SKU's volume moves with
> the treatment while its neighbours are left exactly as the data recorded
> them."*

The **evidence floor** applies (fewer than 3 comparable events → unavailable);
the **measurement ladder does not**, because widening the scope would hand this
scenario a different population to re-base. The studio shows the resolved
measured figure beside those cells instead.

## 7. Comparison

`POST /api/simulation/compare` (`app/tpo/comparison.py`) ·
`components/simulation/ComparisonTable.tsx`.

Takes results **already computed** — the measured baseline from `/run` and
executed scenarios from `/simulate` — checks they are genuinely comparable, and
lines their metrics up side by side with a delta per metric.

### It does not rank

`recommendation` is `null` in every response, and `recommendation_status` says
why: *"this project defines no business objective for Simulation Studio…
Choosing one is a business-policy decision, not an implementation detail, and
inventing it here would bury it in code where nobody would ever review it."*

(That objective now exists — in `/recommend`. `/compare`'s contract is
deliberately unchanged.)

### Three things that make a comparison invalid — checked, not assumed

| # | Invalid because | Handling |
|---|---|---|
| 1 | **Different scope** — a result over CH002 + PBDI25 says nothing about CH003 | Excluded with the reason |
| 2 | **Different economic basis** — different approved rules, cost rate or KPI engine | Excluded. `/simulate` stamps all three on every result, so this is a check rather than a hope |
| 3 | **Nothing to compare** — a scenario nobody ran | **Excluded, not zeroed.** A zero would read as "we evaluated this and it came to nothing" |

### The range is preserved whole

Every metric keeps its low and its high, and every delta is computed at **both
ends**. No midpoint is produced anywhere in the module —
`test_simulation_comparison.py` asserts it over the real payload.

### Delta types

| Type | Used for |
|---|---|
| `absolute` | Same unit as the metric. Always valid |
| `percentage_point` | The metric **is** a percentage |
| `percent_change` | **Extensive** quantities only — money and units |

> An ROI moving 34% → 68% is **+34 points**. Calling it "+100%" invites somebody
> to think returns doubled when what doubled was the rate.

## 8. Recommendation

`POST /api/simulation/recommend` (`app/tpo/recommendation.py`) ·
`components/simulation/RecommendationPanel.tsx`.

Takes the **same body** as `/compare` — the recommendation is the comparison
plus a policy, and building it from the same input is what stops the two from
disagreeing on screen.

### The policy is data, not code

`RECOMMENDATION_POLICY` is one object. `recommend()` walks it; it hardcodes no
metric name and no direction. `test_simulation_recommendation.py` proves it by
**swapping the primary metric at runtime** and watching the outcome follow.

| | |
|---|---|
| **Version** | `B4.3-initial` |
| **Objective** | Prefer a scenario that provides stronger incremental commercial impact while maintaining economically viable promotion performance |
| **Hard constraint** | `roi_percent` **strictly positive at BOTH band ends**. Deliberately conservative: a scenario that only pays back at the top of its band is not treated as viable |
| **Primary** | `incremental_sales` at the **low** end, higher preferred |
| **Tie-breaker 1** | `roi_percent`, low, higher |
| **Tie-breaker 2** | `incremental_units`, low, higher |
| **Tie-breaker 3** | `margin_percent`, low, higher |
| **Tie-breaker 4** | `pei`, low, higher |
| **Tie-breaker 5** | `trade_spend`, low, **lower** preferred — **final tie-breaker only** |
| **Required metrics** | `incremental_sales`, `roi_percent` — never defaulted to zero, never inferred |
| **Tolerance** | Derived from the engine's own rounding, not chosen. Half a rounding step is the smallest difference the engine can express |

On the last tie-breaker: *"Trade Spend is NOT an optimisation target: this policy
does not hold that lower spend is better, only that between two scenarios
equivalent on everything above, the cheaper one is preferred."*

### Why the low end

> *"A simulated scenario carries an approved uplift BAND, not a point. The policy
> reads the LOW end for every comparison, which is the conservative reading… No
> midpoint is computed anywhere in this module — averaging the ends would invent
> a precision the approved rules do not grant, and would quietly make a wide,
> risky band look like a narrow, safe one."*

### Statuses

`recommended` · `maintain_current_plan` · `no_clear_winner` ·
`insufficient_data`.

**The policy travels back with the answer**, so the recommendation is never a
black box.

**No ML, no LLM, no embeddings, no probability, no confidence, no forecasting,
no optimiser, no learned weights and no hidden score.** Deterministic
business-rule logic over numbers the validated engine already produced.

## 9. Weekly impact

`POST /api/simulation/weekly` (`app/tpo/weekly.py`) ·
`components/simulation/WeeklyImpactPanel.tsx`.

**A decomposition, not a forecast.** No week is generated, no trend is fitted,
no future is projected and no interval is estimated. If the scope covers four
weeks, four weeks come back.

**No second simulation.** The treatment, the band and the counterfactual rows
all come from `response.py` and `execution.py` unchanged. This module slices; it
does not model.

### How the slice reconciles — the design problem

The engine derives a baseline per `(product, channel)` from the non-promoted
rows in whatever set it is handed. Slice naively and each week gets its own
baseline, so the weekly incrementals no longer add up to the scope's. The fix
feeds `calculate_kpis` two different sets, which it already accepts:

| Argument | Contents |
|---|---|
| `rows` | **That week's rows only.** Trade Spend and Margin are sums and ratios over the selection, so this makes them genuinely weekly. Every row belongs to exactly one week, so Trade Spend adds up **exactly** |
| `volume_rows` | The **whole scope's** non-promoted rows **plus that week's** promoted rows. The baseline is therefore the same number the aggregate measured against, and `incremental_W = p_qty_W − baseline × p_rows_W` sums to the aggregate **by construction, not by luck** |

Verified against the live data before the module was written: Trade Spend
reconciles exactly; Incremental Sales and Units to within the engine's own
rounding.

### Additive and non-additive kept apart

| Additive (sum to the aggregate) | Non-additive (never summed or averaged) |
|---|---|
| Incremental Sales, Incremental Units, Trade Spend | ROI, Margin, Cannibalization |

A weekly ROI is computed by the engine from that week's own components; the
aggregate ROI is reported separately as the authority. `reconciliation` states
which is which rather than leaving a reader to guess.

**422** on an unapproved discount, or when the scope holds no weekly rows
(`NoWeeklyData`).

## 10. Risk assessment

`POST /api/simulation/risk` (`app/tpo/risk.py`) ·
`components/simulation/RiskPanel.tsx`.

An **assessment**, not a recommendation. It runs no simulation, recomputes no
KPI, re-runs no recommendation policy, and **cannot change which scenario the
recommendation chose** — `recommendation_context` carries that through
untouched.

A scenario can be recommended **and** carry attention-level risk.

### Four refusals

| Refusal | Why |
|---|---|
| **No invented thresholds** | This project has never approved a budget ceiling, a margin floor, a cannibalization limit, a PEI floor, a maximum discount or a maximum duration. *"Writing 'Trade Spend > 10 Cr = High Risk' here would create a business rule by implementation, in a file nobody would think to review."* |
| **No score** | No risk score, no weighting, no probability, no confidence. Severity comes from explicit rules or is `unknown` |
| **No recomputation** | Every number is read off results already produced |
| **The one boundary it does use is cited** | `scripts/audit_roi_realism.py` marks under 2 pp of break-even headroom as "NO MARGIN". That is the project's own documented boundary, reused with its provenance attached |

Where no boundary exists, the metric is reported as a **measurement plus a named
governance gap** — *"Trade Spend is X to Y; no approved budget ceiling is
defined"* — which is the true state of affairs and is actionable in a way a
fabricated verdict is not.

Finding categories: `ECONOMIC`, `ASSUMPTION`, `DATA_AVAILABILITY`, `SCOPE`,
`CANNIBALIZATION`, `EXECUTION`, `GOVERNANCE`.
Statuses: `clear` / `attention` / `unknown`. Severities: `low` / `medium` /
`high` / `unknown`.

**A category with no supporting evidence produces no finding** — the panel is
never padded to look thorough.

## 11. Decision hand-off

```
[Carry to Decision Center]
  → store/decisionDraft.carry({ context, simulation, recommendation, risk, weekly? })
  → navigate('#/decision')
  → POST /api/decision/record
```

A `signature` on the draft prevents a redundant re-post. The scenario can also
be saved first via `POST /api/store/scenarios`, whose id is remembered in
`store/savedRefs`.

## 12. Report

`module: "simulation-investigation"` → `adapters.simulation_investigation`,
which calls `simulation.run` and — when a `discount_pct` option is present —
`execution.simulate`.

> *"MEASURED AND SIMULATED ARE NEVER MERGED. They are two labelled columns of one
> comparison, and the simulated one is reported as the approved uplift BAND it
> is — low and high — because `response.py` refuses to collapse a band to a
> midpoint and this report will not do it either."*

A failed simulation is **surfaced to the reader**, not swallowed.

Options posted: `scenario_id`, `scenario_name`, `discount_pct`,
`filename_hint`. Disclaimer carried: *"Simulated values are scenario estimates
and are not historical actuals."*

## 13. Known limitations

| # | Limitation |
|---|---|
| 1 | `/run` **applies no lever** — `levers.applied: false` |
| 2 | Only **five** discount depths can be simulated; no interpolation |
| 3 | **Duration is echoed, never modelled** |
| 4 | **Spend cannot be an input** |
| 5 | `/compare` never recommends — `recommendation` is `null` by contract |
| 6 | No comparison period inside a scenario, so a simulated result carries no YoY delta |
| 7 | Cannibalization inside a scenario gets the evidence floor only |
| 8 | Nothing here is persisted unless the user explicitly saves it |
| 9 | The RCA context still reports `investigation_id` and `problem_statement` as `unavailable` |

## 14. File map

| Concern | File |
|---|---|
| Page (mode branch) | `frontend/src/pages/Simulation.tsx` |
| Components | `frontend/src/components/simulation/*` (12 files) |
| Store | `frontend/src/store/{simulationScenarios,decisionDraft}.ts` |
| Hooks | `frontend/src/hooks/{useSimulation,useInvestigationContext}.ts` |
| Types | `frontend/src/types/{simulation,comparison,recommendation,risk,weekly,investigationContext}.ts` |
| Router | `backend/app/routers/simulation.py` |
| Services | `backend/app/tpo/{investigation,simulation,scenarios,execution,comparison,recommendation,weekly,risk,response}.py` |
| Tests | `test_simulation.py`, `test_simulation_{scenarios,execution,comparison,recommendation,weekly,risk,cannibalization}.py`, `test_response_model.py`, `test_investigation_context.py`, `test_end_to_end_journey.py` |
