# 02 — Tech Stack

Versions below are the **installed / declared** versions verified on
2026-08-24, not aspirational ones.

## 1. Frontend

Source: `frontend/package.json`.

| Package | Declared | Role |
|---|---|---|
| `react` / `react-dom` | ^19.2.8 | UI runtime |
| `typescript` | ~6.0.2 | Types; `npm run build` runs `tsc -b` first |
| `vite` | ^8.2.0 | Dev server + production bundler |
| `@vitejs/plugin-react` | ^6.0.4 | React fast refresh |
| `tailwindcss` + `@tailwindcss/vite` | ^4.3.3 | Styling (v4, Vite plugin — no `tailwind.config.js`) |
| `react-router-dom` | ^7.18.2 | Routing, used as **HashRouter** |
| `@tanstack/react-query` | ^5.101.4 | Server state, caching, refetch |
| `zustand` | ^5.0.15 | Client state (filters, scenarios, drafts) |
| `oxlint` | ^1.75.0 | Linting (`npm run lint`) |
| `@types/node` | ^24.13.3 | Node typings for `vite.config.ts` |

**No charting library.** All charts are hand-written SVG in
`frontend/src/components/charts/`: `Sparkline`, `Donut`, `DonutBreakdown`,
`GroupedBar`, `DualLine`, `Waterfall`, `Forecast`, `ComboBarLine`, plus
`RankedBar` and `ScatterQuadrant` under `components/command/`.

**No UI component library.** `components/ui/` holds 22 hand-built primitives
(Button, Card, Modal, Dropdown, Table, Toast, Tabs, Kpi, TpoKpi, Confirm,
SidePopover, InfoPopover, …).

**No test framework.** There is no Vitest/Jest/Playwright configuration and no
frontend test file anywhere in the repository — see
[09_TESTING_AND_VALIDATION.md](09_TESTING_AND_VALIDATION.md).

### Design tokens

`frontend/src/styles/tokens.css` + `frontend/src/index.css`. Tailwind utilities
reference CSS custom properties (`--r-sm`, `--shadow-sm`, `brand-violet`,
`ink-muted`, `status-danger`, …). No colour or spacing value was invented
during the migration; they were translated from the predecessor app's CSS.

## 2. Backend

Source: `backend/requirements.txt`, verified against the active virtualenv.

| Package | Declared | Installed | Role |
|---|---|---|---|
| Python | — | **3.13.14** | Runtime |
| `fastapi` | >=0.115 | **0.141.1** | Web framework |
| `uvicorn[standard]` | >=0.32 | — | ASGI server |
| `pydantic` | >=2.9 | **2.13.4** | Request/response validation (v2 semantics) |
| `httpx` | >=0.28 | — | Outbound connector proxy calls |
| `openpyxl` | >=3.1 | **3.1.5** | `.xlsx` report writer |
| `reportlab` | >=4.0 | — | `.pdf` report writer |
| `pypdf` | >=4.0 | — | **Test only** — reads generated PDFs back so report tests assert on real page count, metadata and extracted text |

Standard library only for everything else — `csv`, `array`, `sqlite3`,
`functools.lru_cache`, `dataclasses`, `datetime`, `re`, `json`, `threading`.

**Explicitly not used:** pandas, numpy, scipy, SQLAlchemy, Alembic, Celery,
Redis, any ML/forecasting library. `optimization.solve()` documents the
deliberate rejection of SciPy: the decision variables are five discrete
approved discount depths, and a continuous solver would return depths this
project's economics refuse to price.

## 3. Data layer

| Component | Technology |
|---|---|
| Analytical store | 5 CSV files under `Data/`, parsed once into `array('d'/'i'/'h'/'b')` columns with integer dimension codes (`backend/app/tpo/loader.py`) |
| Cache | `functools.lru_cache(maxsize=1)` on `get_store()`; `maxsize=128` on `rows_for` / `baseline_rows_for`; `maxsize=64` on `_present_values`; `maxsize=4` on the Calendar's per-year aggregate |
| Static page content | JSON files under `backend/app/data/`, `lru_cache`d at first read (`backend/app/data_loader.py`) |
| Application writes | SQLite via stdlib `sqlite3`, WAL journal, one file at `backend/.store/tiq.db` (override with `TPO_STORE_PATH`) |

Load cost, as documented in `DEV.md`: ~15 MB, ~2 s, once per process.

## 4. Build and tooling

| Command | Location | What it does |
|---|---|---|
| `npm run dev` | `frontend/` | Vite dev server on 5173 (next free port if taken), proxying `/api` to 8100 |
| `npm run build` | `frontend/` | `tsc -b && vite build` → `frontend/dist/` |
| `npm run lint` | `frontend/` | oxlint against `.oxlintrc.json` |
| `npm run preview` | `frontend/` | Serve the built bundle |
| `python -m pytest tests/ -q` | `backend/` | 1,470 tests |
| `python -m uvicorn app.main:app` | `backend/` | API (+ SPA in prod) |

Verified build output (2026-08-24):

```
dist/index.html                   0.47 kB │ gzip:   0.30 kB
dist/assets/index-*.css          76.50 kB │ gzip:  14.40 kB
dist/assets/index-*.js          648.32 kB │ gzip: 172.56 kB
210 modules transformed · built in 716 ms
```

Vite emits one warning: the JS chunk exceeds 500 kB. **No code splitting is
configured** — a known, accepted limitation.

## 5. Configuration surface

Everything tunable lives in `backend/app/tpo/config.py`. Nothing else in
`app/tpo/` reads `os.environ`.

| Variable | Default | Effect |
|---|---|---|
| `TPO_DATA_DIR` | unset | Overrides dataset location; wins over every fallback |
| `TPO_USD_PER_INR` | `0.0115` | Display-only FX rate |
| `TPO_STORE_PATH` | `backend/.store/tiq.db` | SQLite file location |

Dataset resolution order (`config._resolve_data_dir`):
1. `$TPO_DATA_DIR`
2. `<repo>/Data` — present in this repository, so a clone is self-contained
3. `~/OneDrive/Desktop/TPO_FINAL` — where the datasets were authored

Non-environment constants in the same file:

| Constant | Value | Meaning |
|---|---|---|
| `PROMOTION_TARGET_ROI_PCT` | `50.0` | The ROI hurdle for alerts, "vs Target" and the trend benchmark |
| `SEVERITY_BANDS` | critical `<25`, high `<40`, medium `<50` | Risk alert banding, in ROI % |
| `PROMOTION_COST_RATE` | `0.03` | Promotional overhead as a share of `Base_Revenue` |
| `TREATMENT_RULES` | 5 entries (see below) | The approved promotion treatment rules |
| `BASE_CURRENCY` | `"INR"` | Every stored figure and every calculation |
| `SUPPORTED_CURRENCIES` | `("INR", "USD")` | Display toggle |

### The five approved treatment rules

`config.TREATMENT_RULES` — discount `d`, uplift band low/high, as **fractions**:

| Key | Discount | Uplift band | Break-even `u* = (d+c)/(1−c−2d)` | Headroom low → high |
|---|---|---|---|---|
| PR001 | 5% | 15 – 20% | 9.2% | +5.8 → +10.8 pp |
| PR002 | 10% | 25 – 35% | 16.9% | +8.1 → +18.1 pp |
| PR003 | 15% | 40 – 50% | 26.9% | +13.1 → +23.1 pp |
| PS001 | 20% | 55 – 65% | 40.4% | +14.6 → +24.6 pp |
| PB001 | 25% | 60 – 72% | 59.6% | **+0.4** → +12.4 pp |

Values produced by `response.all_treatments()` on 2026-08-24; the API returns
them unrounded on every simulation response. Note PB001's +0.4 pp headroom at
the bottom of its band — `scripts/audit_roi_realism.py` marks anything under
2 pp as "NO MARGIN", and `risk.py` reuses that boundary with its provenance
attached rather than inventing a new one.

These are **the design parameters the dataset was generated under**, verified
to hold in the live file — measured uplifts of 18.2 / 30.3 / 43.8 / 60.5 / 69.1
percent, each inside its own band. They are **not** an elasticity, a model fit,
an ML prediction, an MMM estimate or a forecast, and
`response.PROVENANCE` says so on every payload that uses them.

## 6. Runtime characteristics (observed)

| Metric | Value | Source |
|---|---|---|
| Fact rows loaded | 205,920 | `Data/fact_sales_2024_2025_all_channels.csv` |
| First-load cost | ~2 s, ~15 MB | `DEV.md` |
| API routes | **63** | Enumerated from `app.openapi()` |
| Backend tests | **1,470 passing** in 669 s | `pytest tests/ -q`, 2026-08-24 |
| Frontend modules bundled | 210 | `vite build` |
| Backend Python LOC (`app/`) | ~17,500 | `wc -l` |
| Frontend TS/TSX LOC (`src/`) | ~22,100 | `wc -l` |
