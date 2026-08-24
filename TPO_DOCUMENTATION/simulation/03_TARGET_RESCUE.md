# Simulation Mode C — Target Rescue

**Mode key:** `rescue` · **Service:** `backend/app/tpo/rescue.py` (2,604 lines — the
largest module in the project)
**Component:** `frontend/src/components/rescue/TargetRescue.tsx` (1,115 lines)
**Status:** Implemented · **Uncommitted in the working tree at the time of this audit**

## 1. The question

> *"Is this month's unit target on track, and if not, what is the LEAST
> AGGRESSIVE approved intervention that recovers it?"*

## 2. Separation

A **third, separate mode**. It shares exactly four things and nothing else:

- the one `FilterState` (`app/tpo/filters.py`),
- the approved promotion economics (`response.py`, `config.py`),
- the validated KPI definitions (`aggregate.py`),
- the per-candidate baseline rule `optimization._price_and_baseline` —
  **called**, not restated.

It also **imports** `promo_calendar.CADENCE` rather than declaring its own:
*"nothing here infers a cadence from the transaction pattern, which would make a
business rule depend on a data accident."*
`tests/test_target_rescue.py` asserts that `CADENCE` agrees with
`fact_sales.Schedule`.

> **IT RECOMMENDS. IT NEVER EXECUTES.** *"This module creates no promotion,
> writes no row, touches no dimension and activates nothing. Every function here
> reads. Final execution stays a Decision Center action."*

## 3. Scope controls

`TargetRescueScopeRequest`:

| Control | Required | Notes |
|---|---|---|
| `month` | **Yes**, 1–12 | *"A monthly target is a statement about one month, and a rescue evaluated across twelve of them would have no days elapsed to count."* |
| `year` | No | Resolved server-side to the most recent year the data holds |
| `channel` | No | `Channel_Id` |
| `category` | No | `dim_product.Category` |
| `product` | No | `Product_id` |
| `checkpoint` | No | See §5 |
| `currency` | No | Display only |

### `year` is present here — unlike General Optimization

> *"This mode counts DAYS, and January 2024 covers 37 of them where January 2025
> covers 36. Averaging two calendars would put 'day 20 of 36.5' on screen, which
> is not a day in any month."*

### Category → product is a HIERARCHY, not two independent filters

`rescue.validate_selection` rejects a product outside the selected category with
**422**, rather than resolving it to an empty scope: the caller is told which
value is wrong, not handed a no-data assessment that would read as *"this scope
traded nothing"*.

`cascade_options(state)` returns which categories trade in the selected channel
and month, and which products trade in the selected category. **The cascade is
returned even on a no-data response** — *"an empty scope is exactly when the
user needs the option lists to climb back out of it."*

## 4. Business weeks, not days

The brief asked for a **day 20** checkpoint. This project has no trustworthy
daily grain to answer it at:

> *"`loader.Dimensions.week_start` documents that CH002, CH004 and CH005 carry a
> scrambled `Date` — 51.9% of their rows disagree with the week start dim_date
> gives for their own (Year, Week) — which is why the analytical month is
> recovered from the WEEK and never from the date. Sales are knowable at
> complete-business-week boundaries and nowhere finer."*

So the checkpoint **snaps to the nearest complete business week**, exactly as the
discount control snaps to the nearest approved treatment depth, and for the same
reason: *"a value between two measurable points is not a shallower version of
either, it is a number nobody can measure."* Prorating a straddling week across
its days would be inventing a daily sales distribution.

`days_in_month` is **the days the analytical month's business weeks actually
cover** (28 or 35, occasionally 36–37 for January), read from dim_date — **not**
the calendar length of the month, because the calendar month's first days belong
to a business week the project files under the previous month, and a target is a
target for the trading the month contains.

Two consequences, both asserted in tests:

1. A day-20 checkpoint in a 28-day analytical month resolves to **day 21** —
   75% of the month elapsed, which is exactly the brief's canonical example of
   75 units against a 100-unit target reading as **WATCH**.
2. **"Maintain current treatment" reproduces the MEASURED full-month units to
   the unit**, because it *is* the measured remainder.

## 5. The checkpoint

| Value | Meaning |
|---|---|
| `"auto"` | Resolve from the channel's **promotion cadence** — the latest completed week for a **WEEKLY** channel, the mid-month week for a **MONTHLY** one |
| `"latest"` | The latest completed business week |
| `1 … N` | That business week of the month |

`MONTHLY_CHECKPOINT_WEEK = 3` — stated as a **week, not a day**: *"the brief's
day-20 checkpoint is what the third completed business week works out to in a
four-week month… and the week is what this dataset can actually measure."*

A week the month does not contain is **rejected** with the month's real week
count (`ImpossibleCheckpoint` → 422), **never clamped**: week 6 of a four-week
month is a question about a week that does not exist.

The int arm is `strict=True`, so a bool or a numeric string is a 422 rather than
a silent week 1: *"a checkpoint is the one control here whose value the whole
evaluation hangs on; coercing a client's mistake into a valid week would answer
a question nobody asked."*

`checkpoint_options(calendar, cadence)` returns the weeks that exist, so the
selector can offer those and only those — the brief forbids offering an
impossible future week.

### Cadence

| Value | When |
|---|---|
| `WEEKLY` | CH001, CH004 |
| `MONTHLY` | CH002, CH003, CH005 |
| `MIXED` | More than one cadence in scope — an all-channels selection, or two channels that plan differently. **Reported as its own value** rather than silently taking one channel's rule for the other's |

## 6. Target and gap

| | |
|---|---|
| `target_units` | **Required, > 0.** *"A target of zero is not a target that has been met — attainment against it is undefined, not 100% — so it is rejected at the contract boundary rather than divided by."* |
| `reference_target` | The **prior-year actual** for this scope, so the target input starts from a measured figure rather than an invented one |
| **Month-to-date units** | Σ actual units over the **completed business weeks** of the selected year, month and channel. The weeks come from `WeekRow.week_key` / `.month`, derived from the authoritative `(Year, Week) → dim_date` join — *"nothing here reads `fact_sales.Date`"* |
| **Attainment** | `units_mtd / target_units × 100` — **raw**, not pace-normalised |
| **Gap** | `max(target − units_sold, 0)` — **never negative.** A target already passed has no gap, and `on_track` says so instead of reporting a deficit. A surplus is reported separately |

## 7. Target status

`TARGET_STATUS` — one table, so the label, severity and action sentence cannot
drift apart between the API and the screen.

| Code | Label | Intent | Action | Condition |
|---|---|---|---|---|
| `on_track` | ON TRACK | success | Maintain current treatment. | attainment ≥ **80%** |
| `watch` | WATCH | warning | Monitor pace; intervention may not be required. | attainment ≥ **70%** |
| `at_risk` | TARGET AT RISK | danger | Recovery action recommended. | below 70% |
| `achieved` | TARGET ACHIEVED | success | No intervention required. | month complete, target met |
| `missed` | TARGET MISSED | danger | The month is closed. No intervention can change this result. | month complete, target missed |

Boundaries are **inclusive at the bottom**: 80% is on track, 70% is watch,
69.9% is at risk.

> **A complete month is not a rescue.** Once the month's last business week is
> in, the bands are not consulted at all — the result is `achieved` or `missed`,
> and no future intervention is offered.

These thresholds are **deliberately not** `config.SEVERITY_BANDS`, which are ROI
bands for Command Center risk alerts — different units, a different question.
Nothing here reads or changes them.

## 8. Phase of the month

| Phase | Condition | Effect |
|---|---|---|
| `complete` | No remaining business week | **No ladder.** An empty list says "the month is closed" better than four rungs each carrying "cannot be estimated" |
| `early_month` | Fewer completed weeks than `MONTHLY_CHECKPOINT_WEEK` | `EARLY_MONTH_NOTE` **qualifies** the evidence; it does not withhold it |
| `checkpoint` | Otherwise | The normal interpretation applies |

`EARLY_MONTH_NOTE`: *"Early-month signal. Fewer than 3 business weeks of the
month have completed, so the run-rate rests on less trading than the mid-month
checkpoint assumes. Target Rescue becomes more reliable from the third completed
business week, which is approximately day 20."*

## 9. Two projections, kept apart and never merged

### PACE — a run-rate projection

```
daily_pace          = units_mtd / days the COMPLETED business weeks cover
projected_month_end = daily_pace × days ALL the month's business weeks cover
```

Labelled `RUN_RATE_LABEL = "Run-rate projection"`, with `RUN_RATE_NOTE`:

> *"The elapsed coverage comes from the authoritative business-week calendar,
> never from raw calendar days. A straight-line projection of the pace measured
> so far — **not a forecast, and no model stands behind it**."*

It is **division and nothing else**. With no complete week elapsed it returns
nulls plus *"No complete business week has elapsed, so there is no pace to
measure."*

The same `days_in_month` denominator is used everywhere on the response, so the
projection and the progress bar describe one month rather than two.

### RECOVERY — a counterfactual

A counterfactual over the month's **remaining** business weeks under an approved
treatment, priced by the approved rules and read by the validated KPI
definitions.

**Completed weeks are never re-priced.**

The two are reported side by side, in different cards on screen, and **never
averaged into one number**.

## 10. The intervention ladder

`ladder(current_discount_pct)` — approved treatments **strictly deeper** than
the current one, **shallowest first**.

> *"The brief is explicit that the engine must not jump to 25% and must not jump
> to clearance: it tests interventions in increasing aggressiveness and stops at
> the first that meets the target. An ascending list is what makes 'the first
> that reaches the target' and 'the least aggressive that reaches the target'
> the same sentence."*

An empty ladder is not a failure — it is the answer to *"what is stronger than
25%?"*, and `no_stronger_reason` says so in words, in the terms the promotion
master supports.

### Rung kinds

| Kind | |
|---|---|
| `maintain` | The current treatment, carried over the remaining weeks. Labelled "Current treatment" |
| `discount` | A deeper approved price discount |
| `clearance` | An approved **mechanic** — a treatment whose promotion-master name is not a percentage |

### Level 3 and Level 4 coincide in this project — and the label says so

`clearance_treatments()` inspects `dim_promotion`, applying the brief's rule
rather than assuming it. The master holds **`PB001 = "Buy3Get1"` at 25%**, which
is also the deepest approved depth, and **no Buy2Get1 at all**.

> *"Buy3Get1 is therefore offered on its own approved economics — d = 25%, uplift
> 60–72% — and **Buy2Get1 is never offered, because fabricating an uplift and a
> cost for it is the one thing this must not do**."*

An empty result is legitimate: a master with no mechanic yields no clearance
rung, and the ladder ends at the deepest approved discount.

### `snap_to_approved(discount_pct)`

Resolves a slider position to an applicable approved depth. Below **half** the
shallowest approved depth it returns `0.0` with a null treatment key — *"the
user has chosen 'no discount', which is a real state."* **Ties resolve DOWN**, to
the shallower treatment: the conservative reading of an ambiguous position is
the smaller intervention.

`MAX_DISCOUNT_PCT = 25` is read from the deepest approved treatment, not written
down again. A request above it → **422** naming the ceiling.

`current_treatment.measured_depth_pct` is the depth the elapsed weeks **actually
ran at** — given-away revenue over gross revenue — *"read from prices rather
than from a promotion's name"*, so the control can be set from evidence.

## 11. Pricing a rung — `Level`

Every rung is priced at **both ends** of its approved band, using
`execution.synthesize`'s per-row arithmetic term for term:

```
units      = b·n·(1 + u)      gross = units · P
revenue    = gross · (1 − d)  discount = gross · d
overhead   = gross · c        total cost = k · units
```

Those values are assembled into real `aggregate.WeekRow`s and handed to the
engine:

```
Trade Spend   = aggregate.calculate_trade_spend(rows)
Margin Impact = aggregate.calculate_margin(rows)
ROI           = aggregate.roi_percent(incremental_sales, trade_spend)
```

Incremental Units and Sales use `aggregate._volume`'s definitions **with the
baseline SUPPLIED rather than re-derived** — the one figure the engine cannot
simply be handed a row set for, since `_volume` derives baselines from the
non-promoted rows inside the set it is given and a set where every row carries
the treatment has none. `execution.py` supplies baselines for the same reason,
and `tests/test_target_rescue.py` asserts the supplied number equals
`_volume.baseline_average`.

### `reaches_target` is decided at the LOW end, and only there

> *"An intervention that clears the target at the top of its approved band and
> misses at the bottom has not been shown to recover the target, and
> recommending it would be reading the band as a forecast."*

### Per-week breakout

Each rung carries `by_week: tuple[WeekImpact, ...]` — the rung broken out by
remaining business week, whose aggregate **is** the rung's totals. That is what
*"evaluate the remaining weekly promotion events individually, then aggregate"*
means in arithmetic.

### Carried units

Products with no non-promoted week anywhere in the month have no ordinary demand
level for a treatment to be applied to. They are **carried at the measured
level in every rung identically**, so they cannot tilt the comparison, and the
`population` block reports them with the reason.

## 12. Trade-spend constraint

`max_additional_trade_spend` is optional. When present it is a **HARD limit**:
an intervention needing more is reported as **blocked with the amount it
needed** (`within_budget: false`, `budget_reason`), and is **never
recommended**.

`budget_reference(state, currency)` supplies a measured reference beside it.

## 13. Recommendation

`RANKING_BASIS`:

> *"Among the interventions that reach the target at the BOTTOM of their approved
> uplift band and stay inside the trade-spend ceiling: **least aggressive first**
> (shallowest approved depth), then lowest additional trade spend, then better
> ROI, then better margin impact. **Units alone never decide it.**"*

`_rank_key` implements exactly that. Depths are distinct, so in practice the
first term decides — *"the rest are tie-breakers that never fire. They are
implemented anyway, because a policy that exists only in a comment is a policy
nobody can test."*

The ladder is walked **only if the trajectory does not already reach the
target**. `recommendation` carries the chosen `level`, the `reason`, and the
full `intervention` payload.

`NO_ESTIMATE_REASON` is used verbatim where a recovery figure is missing —
*"Recovery impact cannot be reliably estimated with the available promotion
economics"* — because the brief forbids showing fake precision in its place.

## 14. Outputs

```jsonc
{
  "mode": "target_rescue", "status": "evaluated", "message": null,
  "scope": {…}, "cadence": {…}, "checkpoint": {…},
  "options": { …the channel→category→product cascade… },
  "progress": { checkpoint_type, checkpoint_week, checkpoint_label, week_key,
                weeks_completed, weeks_total, weeks_remaining,
                days_elapsed, days_in_month, days_remaining, boundaries[],
                units_mtd, units_sold, target_units, attainment_pct,
                phase, phase_note, mtd_basis },
  "target_status": { code, label, intent, action, final, thresholds },
  "pace":  { daily_pace, projected_month_end, projected_achievement_pct,
             days_remaining, label, note, unavailable_reason },
  "gap":   { units, on_track, label, surplus_units },
  "current_treatment": { discount_pct, treatment, name, requested_pct, snapped,
                         measured_depth_pct, at_ceiling, ceiling_pct,
                         no_stronger_reason },
  "interventions": [ …the ladder, each rung priced at both band ends… ],
  "recommendation": { level, reason, intervention },
  "evidence": [ …the sentences behind the assessment… ],
  "remaining_scope": {…}, "budget": {…}, "population": {…},
  "discount": {…}, "provenance": {…}, "meta": {…}
}
```

### `status: "no_data"`

A scope with no rows returns a **status and a reason and NO NUMBERS** — *"a
zeroed assessment would read as a missed target rather than an unmeasured
one."* **Every block of the evaluated shape is present and `null`**, so a client
reads one shape either way and cannot mistake an absent key for a zero. The
cascade `options` are still returned.

## 15. What is not modelled

**No elasticity, no forecast, no seasonality, no duration response, no
cannibalization response.**

`CANNIBALIZATION_NOTE`: *"Not modelled. The approved promotion rules define no
cannibalization response to discount depth, so a rescue plan describes the
treated products only and says nothing about their neighbours."*

## 16. The component

`TargetRescue.tsx` **computes nothing** — it collects the controls, posts them,
and renders what comes back. The status thresholds, the ladder, the bands, the
ceiling and the ranking policy all live in `rescue.py`.

- The **cadence is shown beside the checkpoint control**, so the weekly/monthly
  difference is explained rather than merely felt.
- **No day figure is offered as a sales read** — the day count on screen is what
  the completed weeks cover in the authoritative calendar, and it is labelled
  that way.
- The run-rate and the ladder sit in **different cards** and are never blended
  into one headline.
- Every modelled figure is shown as a **band**.
- The no-data status and every unestimable rung render their **stated reason**,
  never a grid of zeros.
- The discount slider steps in fives (`DISCOUNT_STEP = 5`); the component writes
  down no approved list of its own.

`useReviewRecommendedScenario` links the recommendation onward.

## 17. Report

`module: "simulation-target-rescue"` → `adapters.simulation_target_rescue`,
which calls `rescue.rescue` — the function the endpoint calls.

**`target_units` is required**: *"Target Rescue needs the monthly unit target
that was on screen. Enter a target before exporting."* → **422**.

Options posted: `target_units`, `current_discount_pct`, `checkpoint`,
`max_additional_trade_spend`.
Scope posted: `year`, `month`, `channel[]`, `category[]`, `product[]` — read
from `store/targetRescue` at click time.

## 18. Known limitations

| # | Limitation |
|---|---|
| 1 | **No day-grain analysis.** The finest grain is the completed business week, because `fact_sales.Date` is scrambled on three channels |
| 2 | **Unit targets only** — no revenue, margin or ROI target |
| 3 | **One month at a time** — `month` is required |
| 4 | Level 3 and Level 4 of the brief's ladder **coincide** at PB001/25%; the label says so rather than pretending to two rungs |
| 5 | **Buy2Get1 is never offered** — the promotion master holds none |
| 6 | **No cannibalization** in a rescue plan's figures |
| 7 | A `MIXED`-cadence scope is reported as such rather than resolved |
| 8 | Products with no non-promoted week are carried, not treated |
| 9 | The mode **recommends only** — nothing is created or activated |
| 10 | Controls are **not persisted** |

## 19. File map

| Concern | File |
|---|---|
| Component | `frontend/src/components/rescue/TargetRescue.tsx` |
| Slider | `frontend/src/components/optimization/Slider.tsx` (shared with mode B) |
| Store | `frontend/src/store/targetRescue.ts` |
| Hook | `frontend/src/hooks/useTargetRescue.ts` |
| Types | `frontend/src/types/targetRescue.ts` (512 lines) |
| Routes | `backend/app/routers/simulation.py` → `/target-rescue[/scope]` |
| Service | `backend/app/tpo/rescue.py` |
| Report adapter | `backend/app/reports/adapters.simulation_target_rescue` |
| Tests | `backend/tests/test_target_rescue.py` (79 — the largest module) |
