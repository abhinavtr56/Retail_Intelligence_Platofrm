# Simulation Mode B — General Optimization

**Mode key:** `general` · **Service:** `backend/app/tpo/optimization.py` (966 lines)
**Component:** `frontend/src/components/optimization/GeneralOptimization.tsx` (507 lines)
**Status:** Implemented · Added in commit `d150c06`

## 1. The question

> *"Given a category, a channel and a month, which products should carry a
> promotion, at which approved depth, so that revenue is as high as it can be
> without the trade spend exceeding a stated ceiling?"*

## 2. Separation

A **second, separate mode**. It shares with the Investigation Simulation exactly
the two things that must not be written down twice — the one `FilterState` and
the approved promotion economics — and nothing else.

> *"Nothing in `app/tpo/simulation.py`, `execution.py`, `scenarios.py`,
> `comparison.py`, `recommendation.py` or `risk.py` is imported, called or
> changed by this module."*

`MODE = "general_optimization"` is carried on every response so a client can
never mistake a budget allocation for an investigation scenario.

## 3. Scope — exactly three dimensions

`GeneralOptimizationScopeRequest` is **deliberately not** a `SimulationFilters`:

| Control | Type | Notes |
|---|---|---|
| `category` | `list[str] \| None` | `dim_product.Category`; `null` = every category |
| `channel` | `list[str] \| None` | `Channel_Id`; `null` = every channel |
| `month` | `int 1–12 \| None` | Real calendar month; `null` = every month |
| `currency` | `INR` \| `USD` | Display only |

Accepting the other eleven dimensions *"would let a caller build a scope the
screen cannot show or explain"*. The three are handed to the same
`FilterState.build`, so they are the same dimensions the rest of the project
filters on.

### `year` is deliberately absent

> *"The historical reference is BOTH 2024 and 2025 by contract, and the service
> resolves each year itself — letting a caller pin one would silently halve the
> reference."*

`REFERENCE_YEARS = (2024, 2025)`.

Frontend state lives in `store/generalOptimization.ts`, **separate from
`commandFilters`** so the two modes cannot re-scope each other. Not persisted:
*"these are working constraints for one sitting, not a saved plan, and a ceiling
restored from last week against this week's data would be a number nobody
chose."*

## 4. Trade-spend constraint

`POST /api/simulation/general-optimization/scope` measures the one thing the
client cannot work out for itself: **the mean Trade Spend across the reference
years** for this category, channel and month, measured by the validated engine.

That is the slider's ceiling. *"Not a number chosen to look round"* — each year
that carries rows for the scope contributes one observation.

`store.seedCeiling(average)` applies it when a new scope's average arrives; the
ceiling **cannot outlive the scope it was measured for**, so changing category,
channel or month clears it and it is re-seeded.

### Clamping, not rejecting

`max_trade_spend` above the historical average is **clamped**, and the response
reports it:

```json
"constraints": { "max_trade_spend": …, "effective_max_trade_spend": …,
                 "effective_max_trade_spend_display": "…", "clamped": true }
```

> *"A slider that has drifted out of date should not lose the user their
> request."*

## 5. Discount range

`min_discount_pct` (default 0) and `max_discount_pct` (default
`MAX_DISCOUNT_PCT = 25`, read from the deepest approved treatment rather than
written down again).

**The range is a WINDOW OVER THE APPROVED POINTS, not a continuous interval.**

`allowed_treatments(min, max)` returns the approved treatments inside the
window. A window of **6–9%** contains none, and the service says so
(`constraint_conflict`) rather than quietly rounding to 5 or 10 — *"the nearest
approved point is a different treatment with a different approved band."*

The UI slider steps in fives (`DISCOUNT_STEP = 5`) so the handle can never land
between two approved depths. **The component writes down no approved list of its
own** — the API sends `discount.approved_points` and the panel shows what it
sent.

`min_discount_pct = 0` does **not** mean "no discount is allowed" — it means the
optimizer may leave a product unpromoted, which it always may.

## 6. Optimization population — candidates

A candidate is one `(product, channel)` **the filtered dataset actually
contains**. No product, Brand Form, category, channel or historical value is
generated.

A candidate needs a **non-promoted row to form a baseline from**. Without one
there is nothing to apply an uplift *to*, and the engine excludes such a
`(product, channel)` from every volume KPI for the same reason. It is reported
as **excluded with a reason**, never optimised against its promoted volume —
which would treat an existing promotion's uplift as the ordinary level.

Exclusion reasons:

| Reason |
|---|
| *"No non-promoted row in this scope, so there is no ordinary demand level to apply a treatment to."* |
| *"No priced volume in this scope."* |

### Everything is per average reference year

`base_units`, `base_revenue`, `base_trade_spend` and `baseline_units` are
divided by `reference_year_count(state)`.

> *"The baseline RATE is untouched (it is a per-transaction mean and carries no
> year in it); what is divided is the VOLUME the rate is multiplied by, and the
> measured totals beside it, so the two sides of the comparison match the
> budget."*

The baseline itself comes from `optimization._price_and_baseline`, which
`app/tpo/rescue.py` later **calls** rather than restating.

## 7. Options per candidate

`_options(candidate, rules)` — cheapest first:

**Option 0 is always NO PROMOTION.** The candidate sits at its baseline, draws
nothing from the budget, and returns its un-promoted revenue. That is what makes
"a product may stay at its base allocation" expressible, and it is why **a
feasible plan always exists**.

Then one option per allowed treatment:

```
lo_units = baseline_units · (1 + uplift_low)      hi_units = baseline_units · (1 + uplift_high)
lo_gross = lo_units · list_price                  hi_gross = hi_units · list_price
revenue_low  = lo_gross · (1 − d)                 revenue_high = hi_gross · (1 − d)
spend_low    = lo_gross · (d + c)                 spend_high   = hi_gross · (d + c)
```

`spend` is **Trade Spend exactly as `aggregate.calculate_trade_spend` defines
it** — `(Base_Revenue − Actual_Revenue) + Promotion_Cost` — so the ceiling the
user sets is enforced against the project's own definition and not a local one.

At most **6** options per candidate (no-promotion + up to five approved depths).

## 8. Objective and constraint

| | |
|---|---|
| **Maximise** | total `revenue_low` — what the plan returns if every treatment lands at the **bottom** of its approved band |
| **Subject to** | total `spend_high` ≤ ceiling — volume rises with uplift and so does the spend that buys it, so the ceiling is enforced against the **worst case** |

> *"Maximising a floor while funding a ceiling is the conservative reading of
> both."* A plan that fits at the bottom of the band and bursts the budget at the
> top has not met the constraint.

Stated on every response in `provenance.basis`.

## 9. The solver

`solve(options_per_candidate, max_trade_spend, buckets=2000)` — an **exact
multiple-choice knapsack**: pick one option per candidate, maximising total
`revenue_low` subject to total `spend_high` ≤ budget.

### Why this, and not SciPy

| Reason | |
|---|---|
| **The variables are discrete** | Each candidate chooses one of at most six approved treatments. A continuous solver would return depths like 11.3%, which `get_treatment_response` rejects outright — and rounding its answer afterwards would discard the optimality that was the only reason to use it |
| **This is exact** | A dynamic program over the budget returns the true optimum for the discretised budget: no starting point, no tolerance, no convergence to babysit, no local minimum |
| **It is deterministic** | Same inputs, same plan, every run. Ties break to the lower option index — the **shallower** discount |
| **It adds no dependency** | SciPy is not installed, and the brief ruled out a heavyweight optimisation dependency unless necessary. It is not: ~36 candidates × ≤6 options × 2,000 buckets is a fraction of a second in plain Python |

### The discretisation is safe in one direction only, on purpose

`BUDGET_BUCKETS = 2000` — sub-lakh granularity over a ceiling of a few crore,
finer than any figure the screen displays.

Each option's spend is rounded **UP** into its bucket, so the plan's true spend
is always ≤ the ceiling. The cost is up to one bucket of budget per promoted
candidate going unused; the benefit is that **the hard constraint is never
violated by a rounding artefact**.

## 10. Statuses

| Status | Carries numbers? | Meaning |
|---|---|---|
| `optimized` | **Yes** | A plan was produced |
| `no_feasible_solution` | **No** | No promotion fits the ceiling. The message names the cheapest approved treatment in range at the top of its band, against the ceiling, and suggests raising the ceiling or widening the range |
| `insufficient_data` | **No** | No candidate has a non-promoted week, or there is no historical trade spend for this scope |
| `constraint_conflict` | **No** | No approved treatment sits inside the discount window. The message lists the approved depths |

Three of the four carry **null summaries**. *"An infeasible plan has no revenue,
and reporting a zero for it would be a fabricated result."* The component
renders the reason rather than a grid of zeros.

Contradictory constraints raise `InvalidConstraints` → **422**: *"a clamped or
emptied plan would hide the contradiction."*

## 11. Outputs

```jsonc
{
  "mode": "general_optimization",
  "status": "optimized",
  "scope":      { candidates, excluded[], … },
  "reference":  { average_trade_spend, display_average, basis, available, … },
  "constraints":{ max_trade_spend, effective_max_trade_spend, clamped,
                  min_discount_pct, max_discount_pct, allowed_treatments[],
                  ceiling_basis },
  "historical": { units, revenue, trade_spend, average_discount_pct },
  "optimized": {
     "units":       { low, high, … },
     "revenue":     { low, high, … },
     "trade_spend": { low, high, … },
     "average_discount_pct": 12.4,
     "promoted_candidates": 21, "untouched_candidates": 15,
     "budget_used_pct": 97.3
  },
  "comparison": { per metric: historical, optimized_low, optimized_high,
                  change_pct_low, change_pct_high },
  "rows": [ … one per candidate, with its chosen treatment … ],
  "provenance": { basis, … }, "meta": { currency, … }
}
```

**Every optimized figure is a band.** The component shows both ends rather than
inventing a single number to sit between them.

`average_discount_pct` is **revenue-weighted over the PROMOTED candidates
only** — *"averaging a zero in for every untouched product would report a depth
nobody chose."*

`budget_used_pct` is measured against `spend_high` and the effective ceiling.

## 12. Recommendation

The plan **is** the recommendation: which products to promote, at what depth,
inside the stated budget, with the revenue and spend it implies at both ends of
the approved bands.

There is **no separate recommendation engine** in this mode — `/recommend` and
`RECOMMENDATION_POLICY` belong to the Investigation Simulation and are neither
called nor changed here.

**It recommends only.** No promotion is created, no calendar or fact row is
written, no discount is activated.

## 13. What is not modelled

| Not modelled | |
|---|---|
| Forecast | None |
| Elasticity | None |
| Cannibalization response | The approved rules define none, and this module does not invent one — **so a plan's figures are the promoted products' own and say nothing about their neighbours** |
| Generated entities | Every candidate is a `(product, channel)` the filtered dataset actually contains |

## 14. Report

`module: "simulation-general-optimization"` → `adapters.simulation_general_optimization`.

Calls `optimization.optimize` — **the function the endpoint calls** — once, with
the constraints the screen was set to, and prints the plan it returns. **Never
re-solved.** When no ceiling is supplied it falls back to
`historical_reference(state).average_trade_spend`.

Options posted: `max_trade_spend`, `min_discount_pct`, `max_discount_pct`.
Scope posted: `month`, `channel[]`, `category[]` — read from
`store/generalOptimization` at click time.

## 15. Known limitations

| # | Limitation |
|---|---|
| 1 | **Only three scope dimensions.** Region, retailer, tier, brand and product cannot narrow this mode |
| 2 | The ceiling is **capped at the historical average** — a genuinely larger budget cannot be explored |
| 3 | **No cannibalization** in the plan's figures |
| 4 | Up to one budget bucket per promoted candidate goes unused (the safe-direction rounding) |
| 5 | Reference years are hardcoded to **(2024, 2025)** |
| 6 | Candidates without a non-promoted week are excluded entirely |
| 7 | The plan is not comparable through `/compare`, which belongs to mode A |
| 8 | Controls are **not persisted** — a reload loses them |

## 16. File map

| Concern | File |
|---|---|
| Component | `frontend/src/components/optimization/GeneralOptimization.tsx` |
| Slider | `frontend/src/components/optimization/Slider.tsx` |
| Store | `frontend/src/store/generalOptimization.ts` |
| Hook | `frontend/src/hooks/useOptimization.ts` |
| Types | `frontend/src/types/optimization.ts` |
| Routes | `backend/app/routers/simulation.py` → `/general-optimization[/scope]` |
| Service | `backend/app/tpo/optimization.py` |
| Report adapter | `backend/app/reports/adapters.simulation_general_optimization` |
| Tests | `backend/tests/test_general_optimization.py` (46) |
