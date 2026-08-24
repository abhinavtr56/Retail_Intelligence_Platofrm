# Appendix — Validation Matrix

Results produced **2026-08-24** on branch `shiva` at commit `870bec5`.
Nothing here is estimated.

## Legend

| Status | Meaning |
|---|---|
| ✅ Passing | Automated, executed, green |
| 🟡 Partial | Covered indirectly, or only on one side of the boundary |
| ⚪ Manual | A read-only script exists; not executed in this audit |
| ❌ None | No automated coverage |

---

## 1. Backend tests

| Feature | Test | Status | Evidence |
|---|---|---|---|
| Full backend suite | `pytest tests/ -q` | ✅ | **1,470 passed** in 669.53 s, 1 upstream deprecation warning |
| Command Center KPIs + 18 spec filter cases | `test_command_center.py` | ✅ | 29 test functions |
| Baseline keyed per channel | `test_command_center.test_baseline_is_keyed_per_channel` | ✅ | Guards the 141.2% → 8.6% ROI collapse |
| Volume KPIs are non-additive | `test_command_center.test_incremental_sales_is_not_additive_across_months` | ✅ | Pins the documented behaviour |
| Breakdown partition ≡ re-filter | `test_breakdown.py` | ✅ | 16 tests, per supported dimension |
| Filter options — no dead options | `test_filter_options.py` | ✅ | 15 tests |
| Filter reconciliation (server-side half) | `test_filter_reconciliation.py` | 🟡 | 16 tests; **the reconciliation itself is frontend code** and the module says so |
| Delta precision (taken before rounding) | `test_kpi_delta_precision.py` | ✅ | 14 tests |
| Month semantics `(Year, Week) → dim_date` | `test_month_semantics.py` | ✅ | 14 tests |
| Approved response model — no interpolation / midpoint / spend | `test_response_model.py` | ✅ | 22 tests |
| Scenario model — measured vs hypothetical never mixed | `test_simulation_scenarios.py` | ✅ | 26 tests |
| Simulation ≡ Command Center parity | `test_simulation.py` | ✅ | 17 tests; also asserts `SimulationFilters` fields **equal** `filters.DIMENSIONS` |
| Scenario execution through the same engine | `test_simulation_execution.py` | ✅ | 26 tests |
| Cannibalization scope (both widenings) | `test_simulation_cannibalization.py` | ✅ | 31 tests |
| Comparison refusals; no midpoint on the real payload | `test_simulation_comparison.py` | ✅ | 22 tests |
| Recommendation policy is data | `test_simulation_recommendation.py` | ✅ | 29 tests; swaps the primary metric at runtime |
| Weekly reconciles to the aggregate | `test_simulation_weekly.py` | ✅ | 28 tests |
| Risk — no invented thresholds, no score | `test_simulation_risk.py` | ✅ | 37 tests |
| RCA context refusals | `test_investigation_context.py` | ✅ | 24 tests |
| Command Center → RCA hand-off | `test_investigation_handoff.py` | ✅ | 18 tests |
| General Optimization | `test_general_optimization.py` | ✅ | 46 tests |
| Target Rescue | `test_target_rescue.py` | ✅ | 79 tests — the largest module |
| Decision record assembly + cross-validation | `test_decision_record.py` | ✅ | 33 tests |
| Decision briefing renders, never calculates | `test_decision_briefing.py` | ✅ | 42 tests |
| Decision journey end to end | `test_decision_journey.py` | ✅ | 14 tests |
| Saved decision label regression | `test_saved_decision_label.py` | ✅ | 3 tests |
| Storage — append-only; only `app/store/` writes | `test_store_persistence.py` | ✅ | 33 tests |
| Unauthenticated deferral is **disclosed** | `test_unauthenticated_disclosure.py` | ✅ | 10 tests |
| No compliance claim survives upstream | `test_upstream_truthfulness.py` | ✅ | 14 tests |
| Report Center workflow | `test_report_center.py` | ✅ | 28 tests |
| Report file integrity | `test_reports_export.py` | ✅ | 41 tests — bytes opened with **openpyxl / pypdf** |
| Full journey: Command Center → RCA → Simulation → result | `test_end_to_end_journey.py` | ✅ | 6 tests |

## 2. Frontend validation

| Feature | Check | Status | Evidence |
|---|---|---|---|
| Type safety | `npx tsc -b` | ✅ | **0 errors** |
| Lint | `npm run lint` (oxlint) | ✅ | **0 errors, 6 warnings** — all `react(only-export-components)` |
| Production build | `npm run build` | ✅ | 210 modules, 648.32 kB JS (172.56 kB gzip), 76.50 kB CSS, 716 ms |
| Unit tests | — | ❌ | **No test framework configured. No test file exists** |
| Component tests | — | ❌ | None |
| E2E / browser | — | ❌ | None |
| Accessibility | — | ❌ | No automated check (`role`/`aria-*` are hand-written) |
| Type ↔ OpenAPI drift | — | ❌ | Types are hand-written; **no schema-sync step exists** |

## 3. Data validation

| Feature | Check | Status | Evidence |
|---|---|---|---|
| Unresolvable `(Year, Week)` | `loader._build_store` | ✅ | **Raises at load** — the month cannot be derived and a silent fallback would misfile the row |
| Fact row → absent dimension id | `loader._build_store` | ✅ | Warned to stdout; the row is kept under a blank label |
| Missing dataset file | `loader._read_csv` | ✅ | `FileNotFoundError` naming the path and `TPO_DATA_DIR` |
| Post-correction fact checks A–G | `scripts/validate_fact_data.py` | ⚪ | Read-only script; **not run in this audit** |
| Promotion sits in its assigned business month | `scripts/validate_promotion_schedule.py` | ⚪ | Read-only |
| ROI realism | `scripts/audit_roi_realism.py` | ⚪ | Read-only; owns the "NO MARGIN" (<2 pp headroom) boundary `risk.py` cites |
| Seasonal 2024 vs 2025 | `scripts/audit_seasonal_2024_vs_2025.py` | ⚪ | Read-only |
| Promotion economics diagnosis | `scripts/diagnose_promotion_economics.py` | ⚪ | Read-only |

## 4. KPI validation

| KPI | Coverage | Status |
|---|---|---|
| Trade Spend | `test_command_center.py`, `test_simulation.py` (parity) | ✅ |
| Incremental Quantity / Quantity % | `test_command_center.py`, `test_simulation_execution.py` | ✅ |
| Incremental Sales | `test_command_center.py`, non-additivity pinned | ✅ |
| Promotion ROI | `test_command_center.py`, `test_kpi_delta_precision.py` | ✅ |
| Margin Impact | `test_command_center.py`, `test_kpi_delta_precision.py` | ✅ |
| PEI | `test_command_center.py`, `test_kpi_delta_precision.py` | ✅ |
| Trade Spend Efficiency | Covered inside the bundle | 🟡 |
| Cannibalization (rate, score, floor, ladder) | `test_simulation_cannibalization.py`, `test_command_center.py` | ✅ |
| Baseline derivation | `test_command_center.test_baseline_is_keyed_per_channel`, `test_target_rescue.py` (supplied baseline ≡ `_volume.baseline_average`) | ✅ |
| YoY deltas at full precision | `test_kpi_delta_precision.py` | ✅ |
| Currency is display-only | `test_command_center.py` (currency rules) | ✅ |

## 5. Filter validation

| Behaviour | Coverage | Status |
|---|---|---|
| OR within / AND across dimensions | `test_command_center.py` (18 spec cases) | ✅ |
| Dependent option lists, no dead options | `test_filter_options.py` | ✅ |
| The active selection stays in its own dropdown | `test_filter_options.py` | ✅ |
| `rows_for` vs `baseline_rows_for` split | `test_command_center.py`, `test_simulation_cannibalization.py` | ✅ |
| Brand-Form widening | `test_simulation_cannibalization.py` | ✅ |
| Comparison period keeps the same filters | `test_command_center.py` | ✅ |
| Unknown dimension → 422 | `test_simulation.py`, report `to_state` | ✅ |
| **Frontend reconciliation + recency tie-break** | — | ❌ **No frontend tests** |
| **The two-scope Command Center query split** | — | ❌ **No test on either side** |

## 6. Calendar validation

| Behaviour | Coverage | Status |
|---|---|---|
| Month from `(Year, Week) → dim_date` | `test_month_semantics.py` | ✅ |
| `CADENCE` ≡ `fact_sales.Schedule` | `test_target_rescue.py` | ✅ |
| Promotion in its assigned business month | `scripts/validate_promotion_schedule.py` | ⚪ |
| Matrix / cell / upcoming payloads | — | ❌ **No dedicated test module** |
| Verified by hand in this audit | 2025 matrix across 5 channels; CH001 & CH002 October cells; `upcoming(2025, after_month=9)` = 33 events | 🟡 Manual |

## 7. RCA validation

| Behaviour | Coverage | Status |
|---|---|---|
| Seeded question is not reported as the user's | `test_investigation_context.py` | ✅ |
| No static KPI enters a simulation | `test_investigation_context.py` | ✅ |
| No second filter model from display labels | `test_investigation_context.py` | ✅ |
| Hand-off scope narrows the way the Command Center narrows it | `test_investigation_handoff.py` | ✅ |
| The RCA content itself | — | ❌ Static; nothing to validate |

## 8. Simulation validation

| Mode | Coverage | Status |
|---|---|---|
| A — scenario model, execution, comparison, recommendation, weekly, risk | 7 modules, ~190 tests | ✅ |
| A — parity with the Command Center | `test_simulation.py` | ✅ |
| B — General Optimization (optimality, budget never burst, statuses) | `test_general_optimization.py` (46) | ✅ |
| C — Target Rescue (cadence, checkpoint, ladder, "maintain" ≡ measured) | `test_target_rescue.py` (79) | ✅ |
| Approved response model | `test_response_model.py` (22) | ✅ |
| **Frontend mode switch / store isolation** | — | ❌ |

## 9. Decision validation

| Behaviour | Coverage | Status |
|---|---|---|
| Sections cross-validated; mismatch → 422 | `test_decision_record.py` | ✅ |
| Nothing recalculated | `test_decision_record.py` | ✅ |
| `can_be_approved` always false | `test_decision_record.py`, `test_upstream_truthfulness.py` | ✅ |
| Briefing renders verbatim, states its limits | `test_decision_briefing.py` | ✅ |
| Append-only storage, 409 on stale version | `test_store_persistence.py` | ✅ |
| `owner: null` everywhere | `test_store_persistence.py`, `test_unauthenticated_disclosure.py` | ✅ |

## 10. Report validation

| Behaviour | Coverage | Status |
|---|---|---|
| Generate returns metadata, never bytes | `test_report_center.py` | ✅ |
| Every listed row has an artifact | `test_report_center.py` | ✅ |
| Empty library is genuinely empty | `test_report_center.py` | ✅ |
| Generated `.xlsx` opens in openpyxl | `test_reports_export.py` | ✅ |
| Generated `.pdf` opens in pypdf — page count, metadata, text | `test_reports_export.py` | ✅ |
| Unknown scope key → 422 | `test_reports_export.py` | ✅ |
| Report values come from the authoritative service | `test_reports_export.py` | ✅ |
| Delete / clear semantics | `test_report_center.py` | ✅ |

## 11. Security validation

| Area | Status | Note |
|---|---|---|
| Authentication | ❌ **Not implemented** | Deferred (B11) with a stated reason |
| Authorization | ❌ **Not implemented** | No actor to authorize |
| Route guards | ❌ **None** | All 63 routes open |
| **Disclosure of the above** | ✅ | `test_unauthenticated_disclosure.py` (10 tests) asserts every store route repeats it in its OpenAPI description and every response carries `owner: null` with the note |
| Credential handling in proxies | 🟡 | Forwarded, never persisted or logged. Untested |
| Input validation | ✅ | Pydantic `extra="forbid"` throughout; unknown keys are 422s |
| Injection | 🟡 | All SQL is parameterised; no dynamic SQL construction. Untested |

## 12. Performance validation

| Area | Status | Note |
|---|---|---|
| Load / stress | ❌ | None |
| Query latency | ❌ | Not measured |
| Bundle size | 🟡 | Vite warns the chunk exceeds 500 kB; **no code splitting configured** |
| Observed load cost | 🟡 | ~15 MB / ~2 s once per process (documented in `DEV.md`) |
| Test-suite duration | ✅ | 669 s — several modules build the full 205,920-row store |

## 13. Summary

| Area | Coverage |
|---|---|
| Backend business logic | ✅ **Extensive** — 1,470 tests across 29 modules |
| Report file integrity | ✅ Real readers, not status codes |
| Data-quality guards at load | ✅ Fail loud on the one thing that must not be guessed |
| Data validation scripts | ⚪ Exist, read-only, **not run in this audit** |
| Calendar route payloads | ❌ No dedicated module |
| Frontend | ❌ **Nothing** |
| E2E / browser | ❌ Nothing |
| Security | ❌ Nothing to test — open by design, and the openness is tested |
| Performance | ❌ Nothing |

## 14. Reproducing

```bash
cd backend  && ../venv/Scripts/python.exe -m pytest tests/ -q   # ~11 min
cd frontend && npx tsc -b && npm run lint && npm run build
```
