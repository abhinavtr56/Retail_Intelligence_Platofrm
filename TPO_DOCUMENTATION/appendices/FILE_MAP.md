# Appendix — File Map

Feature → frontend → backend route → service → calculation → data → tests.
Based on repository inspection on 2026-08-24.

## 1. Repository layout

```
Retail_Intelligence_Platofrm/
├── README.md                 entry point + deployment safety note
├── DEV.md                    phase-by-phase migration notes
├── .gitignore
├── Data/                     the 5 analytical CSVs
├── scripts/                  9 audit / validation / correction scripts
├── backend/
│   ├── requirements.txt
│   ├── .store/tiq.db         SQLite (gitignored)
│   ├── tests/                29 modules, 1,470 tests
│   └── app/
│       ├── main.py
│       ├── data_loader.py
│       ├── data/             18 authored JSON files
│       ├── models/           EMPTY (only __init__.py)
│       ├── routers/          13 modules, 63 routes
│       ├── tpo/              21 modules — services + calculation core
│       ├── reports/          5 modules — report framework + writers
│       └── store/            4 modules — the ONLY place that writes
├── frontend/
│   ├── package.json · vite.config.ts · tsconfig*.json · .oxlintrc.json
│   ├── public/               favicon.svg, icons.svg, image.png
│   └── src/
│       ├── App.tsx · main.tsx · index.css
│       ├── pages/            11 route components
│       ├── components/       11 directories
│       ├── hooks/            15 modules
│       ├── store/            9 Zustand stores
│       ├── lib/              api, labels, portalConnectors, queryClient
│       ├── types/            22 modules
│       ├── icons/ · styles/ · assets/
└── venv/                     repo-root virtualenv used for the audit
```

---

## 2. Feature → file map

### Command Center

| Layer | File |
|---|---|
| Page | `frontend/src/pages/CommandCenter.tsx` |
| Filter bar | `frontend/src/components/command/FilterBar.tsx`, `MultiSelect.tsx` |
| Chart sections (6) | `frontend/src/components/command/ChartSections.tsx` |
| Chart chrome | `frontend/src/components/command/ChartFrame.tsx`, `RankedBar.tsx`, `ScatterQuadrant.tsx` |
| Trend | `frontend/src/components/command/TrendPanels.tsx` |
| Risk alerts | `frontend/src/components/command/RiskAlertsPanel.tsx`, `riskRanking.ts` |
| Promotion mix | `frontend/src/components/command/PromotionMixCard.tsx` |
| States | `frontend/src/components/command/States.tsx` |
| KPI tile | `frontend/src/components/ui/TpoKpi.tsx` |
| Hooks | `frontend/src/hooks/useCommandCenter.ts` |
| Store | `frontend/src/store/commandFilters.ts` |
| Types | `frontend/src/types/commandCenter.ts` |
| **Route** | `backend/app/routers/command_center.py` |
| **Service** | `backend/app/tpo/service.py` |
| **Calculation** | `backend/app/tpo/aggregate.py` |
| **Filters** | `backend/app/tpo/filters.py` |
| **Data** | `Data/*.csv` via `backend/app/tpo/loader.py` |
| **Tests** | `test_command_center.py`, `test_breakdown.py`, `test_filter_options.py`, `test_kpi_delta_precision.py`, `test_month_semantics.py` |

### Investigations / RCA

| Layer | File |
|---|---|
| Page | `frontend/src/pages/Investigations.tsx` |
| Components | `frontend/src/components/investigations/` — `InvestigationGraph`, `NodeDetailPopover`, `BizQuestionCard`, `AccelList`, `ProgressStrip`, `QueryBar`, `ActiveInvBanner`, `graphLayout.ts` |
| Hooks | `frontend/src/hooks/useInvestigations.ts` |
| Store | `frontend/src/store/activeInvestigation.ts` |
| Types | `frontend/src/types/investigation.ts`, `orchestration.ts` |
| **Route (content)** | `backend/app/routers/investigations.py` |
| **Route (hand-off)** | `backend/app/routers/simulation.py` → `POST /context` |
| **Service** | `backend/app/tpo/investigation.py` |
| **Data** | `backend/app/data/investigations.json`, `investigation-types.json`, `focus.json` — **STATIC** |
| **Tests** | `test_investigation_context.py`, `test_investigation_handoff.py`, `test_end_to_end_journey.py` |

### Promotion Intelligence

| Layer | File |
|---|---|
| Page | `frontend/src/pages/Intelligence.tsx` |
| Tabs (8) | `frontend/src/components/intelligence/tabs.tsx` |
| AI answer | `frontend/src/components/intelligence/AiAnswerCard.tsx`, `useStreamedAnswer.ts`, `answerFormat.ts` |
| Charts | `SalesTrendChart.tsx`, `SaturationChart.tsx`, `RegionVarianceBars.tsx`, `KeyInsightsList.tsx` |
| Hooks | `frontend/src/hooks/useIntelligence.ts` |
| Types | `frontend/src/types/intelligence.ts` |
| **Route** | `backend/app/routers/pages.py` |
| **Service** | `backend/app/data_loader.py` |
| **Data** | `backend/app/data/pages-by-type.json`, `intelligence-answers.json` — **STATIC** |
| **Tests** | none |

### Simulation Studio — Mode A

| Layer | File |
|---|---|
| Page | `frontend/src/pages/Simulation.tsx` |
| Components | `frontend/src/components/simulation/` — `ContextBar`, `ScenarioRow`, `CurrentPlanPanel`, `LeverPanel`, `ScenarioResultPanel`, `ComparisonTable`, `RecommendationPanel`, `WeeklyImpactPanel`, `RiskPanel`, `TrendChart`, `panels.tsx` |
| Hooks | `frontend/src/hooks/useSimulation.ts`, `useInvestigationContext.ts` |
| Stores | `frontend/src/store/simulationScenarios.ts`, `decisionDraft.ts` |
| Types | `frontend/src/types/simulation.ts`, `comparison.ts`, `recommendation.ts`, `risk.ts`, `weekly.ts` |
| **Route** | `backend/app/routers/simulation.py` |
| **Services** | `backend/app/tpo/simulation.py`, `execution.py`, `scenarios.py`, `comparison.py`, `recommendation.py`, `risk.py`, `weekly.py`, `investigation.py` |
| **Rules** | `backend/app/tpo/response.py`, `config.py` |
| **Calculation** | `backend/app/tpo/aggregate.py` |
| **Tests** | `test_simulation.py`, `test_simulation_{scenarios,execution,comparison,recommendation,weekly,risk,cannibalization}.py`, `test_response_model.py` |

### Simulation Studio — Mode B (General Optimization)

| Layer | File |
|---|---|
| Component | `frontend/src/components/optimization/GeneralOptimization.tsx` |
| Slider | `frontend/src/components/optimization/Slider.tsx` |
| Hook | `frontend/src/hooks/useOptimization.ts` |
| Store | `frontend/src/store/generalOptimization.ts` |
| Types | `frontend/src/types/optimization.ts` |
| **Route** | `backend/app/routers/simulation.py` → `/general-optimization[/scope]` |
| **Service** | `backend/app/tpo/optimization.py` |
| **Tests** | `test_general_optimization.py` |

### Simulation Studio — Mode C (Target Rescue)

| Layer | File |
|---|---|
| Component | `frontend/src/components/rescue/TargetRescue.tsx` |
| Hook | `frontend/src/hooks/useTargetRescue.ts` |
| Store | `frontend/src/store/targetRescue.ts` |
| Types | `frontend/src/types/targetRescue.ts` |
| **Route** | `backend/app/routers/simulation.py` → `/target-rescue[/scope]` |
| **Service** | `backend/app/tpo/rescue.py` |
| **Reads (not restates)** | `optimization._price_and_baseline`, `promo_calendar.CADENCE` |
| **Tests** | `test_target_rescue.py` |

### Decision Center

| Layer | File |
|---|---|
| Page | `frontend/src/pages/Decision.tsx` |
| Hooks | `frontend/src/hooks/useDecision.ts`, `useBriefing.ts`, `useStore.ts` |
| Stores | `frontend/src/store/decisionDraft.ts`, `savedRefs.ts` |
| Types | `frontend/src/types/decision.ts`, `store.ts` |
| **Routes** | `backend/app/routers/decision.py`, `briefing.py`, `store.py` |
| **Services** | `backend/app/tpo/decision.py`, `briefing.py` |
| **Persistence** | `backend/app/store/repository.py`, `db.py`, `fingerprint.py` |
| **Tests** | `test_decision_record.py`, `test_decision_briefing.py`, `test_decision_journey.py`, `test_store_persistence.py`, `test_saved_decision_label.py`, `test_upstream_truthfulness.py` |

### Promotion Calendar

| Layer | File |
|---|---|
| Page | `frontend/src/pages/Calendar.tsx` |
| Components | `frontend/src/components/calendar/PromotionMatrix.tsx`, `PromotionDetailPanel.tsx`, `UpcomingEventsPanel.tsx`, `statusColors.ts` |
| Hook | `frontend/src/hooks/usePromotionCalendar.ts` |
| Types | `frontend/src/types/promotionCalendar.ts`, `calendar.ts` |
| **Route** | `backend/app/routers/promotion_calendar.py` |
| **Service** | `backend/app/tpo/promo_calendar.py` |
| **Data** | `Data/*.csv` + `backend/app/data/calendar.json` |
| **Tests** | no dedicated module; date semantics via `test_month_semantics.py` |

### Report Center

| Layer | File |
|---|---|
| Page | `frontend/src/pages/Reports.tsx` |
| Export button | `frontend/src/components/reports/ExportReportButton.tsx` |
| Client | `frontend/src/hooks/useReportCenter.ts` |
| Types | `frontend/src/types/reportCenter.ts`, `reports.ts` |
| **Route** | `backend/app/routers/reports.py` |
| **Registry / dispatch** | `backend/app/reports/service.py` |
| **Adapters** | `backend/app/reports/adapters.py` |
| **Document model** | `backend/app/reports/model.py` |
| **Writers** | `backend/app/reports/excel.py`, `pdf.py` |
| **Persistence** | `backend/app/store/reports.py` |
| **Tests** | `test_report_center.py`, `test_reports_export.py` |

### Data Connections

| Layer | File |
|---|---|
| Page | `frontend/src/pages/Connections.tsx` |
| Portal rail | `frontend/src/components/portal/ConnectorRail.tsx`, `connectors.ts` |
| Modals | `frontend/src/components/portal/modals/` (7 files) |
| Client | `frontend/src/lib/portalConnectors.ts` |
| Hook | `frontend/src/hooks/useMisc.ts` |
| **Routes** | `backend/app/routers/misc.py` (catalogue), `connectors.py` (7 proxies) |
| **Data** | `backend/app/data/connections.json` — **STATIC** |
| **Tests** | none |

### Settings / Portal / Shell

| Layer | File |
|---|---|
| Pages | `frontend/src/pages/Settings.tsx`, `Login.tsx`, `Home.tsx` |
| Portal | `frontend/src/components/portal/ModuleGrid.tsx`, `AdvisorCard.tsx`, `HeroArt.tsx`, `modules.ts` |
| Layout | `frontend/src/components/layout/AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx` |
| Stores | `frontend/src/store/portalUser.ts`, `sidebar.ts` |
| Hooks | `frontend/src/hooks/useNav.ts`, `useMisc.ts` |
| **Routes** | `backend/app/routers/nav.py`, `misc.py` |
| **Data** | `backend/app/data/nav.json`, `user.json`, `settings.json`, `focus.json` |
| **Tests** | `test_unauthenticated_disclosure.py` |

---

## 3. Cross-cutting files

| Concern | File | Note |
|---|---|---|
| **THE KPI engine** | `backend/app/tpo/aggregate.py` | The only arithmetic in the project |
| **THE filter engine** | `backend/app/tpo/filters.py` | 14 dimensions, two row sets, option lists |
| **THE data loader** | `backend/app/tpo/loader.py` | 5 CSVs → cached columnar store |
| **THE configuration** | `backend/app/tpo/config.py` | Every tunable; the only `os.environ` reader in `app/tpo/` |
| **THE approved rules** | `backend/app/tpo/response.py` | Typed read of the 5 treatments |
| **THE formatter** | `backend/app/tpo/formatting.py` | Currency, magnitude, F24/F25 |
| **THE API client** | `frontend/src/lib/api.ts` | One fetch wrapper, one error type |
| **THE query client** | `frontend/src/lib/queryClient.ts` | 30 s stale, 1 retry, no focus refetch |
| **THE app entry** | `backend/app/main.py`, `frontend/src/App.tsx` | |
| Design tokens | `frontend/src/styles/tokens.css`, `index.css` | |
| Icon set | `frontend/src/icons/{Icon.tsx,icons.ts}` | |

## 4. Largest files

| Lines | File |
|---:|---|
| 2,604 | `backend/app/tpo/rescue.py` |
| 1,115 | `frontend/src/components/rescue/TargetRescue.tsx` |
| 1,097 | `backend/app/tpo/aggregate.py` |
| 1,079 | `backend/app/tpo/service.py` |
| 981 | `backend/app/reports/adapters.py` |
| 966 | `backend/app/tpo/optimization.py` |
| 953 | `frontend/src/components/command/ChartSections.tsx` |
| 930 | `frontend/src/pages/Decision.tsx` |
| 880 | `frontend/src/pages/Simulation.tsx` |
| 697 | `backend/app/routers/simulation.py` |
| 660 | `backend/app/tpo/simulation.py` |
| 636 | `frontend/src/pages/CommandCenter.tsx` |
| 624 | `backend/app/tpo/risk.py` |
| 586 | `frontend/src/pages/Reports.tsx` |
| 585 | `backend/app/tpo/recommendation.py` |

Totals: backend `app/` ≈ **17,500** lines · frontend `src/` ≈ **22,100** lines.

## 5. Files that exist but are unused

| File | Status |
|---|---|
| `frontend/src/pages/PlaceholderPage.tsx` | No route uses it; kept as a template |
| `backend/app/models/` | Empty package (`__init__.py` only) |
| `backend/app/data/reports.json` | **Dead** — its endpoint was removed |
| `backend/app/data/command.json` | Served at `/api/command`; no consumer found |
| `backend/app/data/ai-watch.json` | Served; no consumer found |
| `backend/app/data/recommendations.json` | Served; no consumer found |
| `backend/app/data/{simulation,decision,intelligence}.json` | Served as `*-default`; superseded |
| `scripts/correct_ch002_f25_buy3get1.py` | **Superseded — file says DO NOT RUN** |
