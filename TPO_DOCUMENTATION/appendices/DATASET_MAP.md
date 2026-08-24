# Appendix — Dataset Map

Row counts and column lists counted from the files on 2026-08-24.

## 1. Analytical datasets — `Data/`

Resolution order (`app/tpo/config._resolve_data_dir`):
`$TPO_DATA_DIR` → `<repo>/Data` → `~/OneDrive/Desktop/TPO_FINAL`.
The in-repo copy is present, so a clone is self-contained.

---

### `fact_sales_2024_2025_all_channels.csv`

| | |
|---|---|
| **Purpose** | The transaction fact table — every promoted and non-promoted booking |
| **Rows** | **205,920** |
| **Grain** | `Transaction_Id` — one Store × Product × Promotion × business-week/month booking |
| **Loaded by** | `app/tpo/loader._build_store` |
| **Used by** | Everything analytical: KPI engine, filters, breakdown, Calendar, all three simulation modes, all reports |

**Columns**

| Column | Loaded | Notes |
|---|---|---|
| `Transaction_Id` | ✗ | Composite PK, e.g. `CH001-2024-W01-S211-P11-100ml` |
| `Date` | **year only** | DD-MM-YYYY. **Scrambled on CH002/CH004/CH005** |
| `Week` | ✓ | Business week ordinal. **Intact in every row — the join key** |
| `Month` | ✗ | **NOT USED.** Wrong on 22.6% of rows |
| `Product_id` | ✓ (as code) | FK → `dim_product` |
| `Store_Id` | ✓ (as code) | FK → `dim_geo_store` |
| `Channel_Id` | ✗ | Present, but channel is read from the **store** dimension |
| `Promotion_Id` | ✓ (as code) | FK → `dim_promotion`; `-1` = not promoted |
| `Base_Quantity` | ✓ | **Equals `Actual_Quantity` on every row** |
| `Actual_Quantity` | ✓ | |
| `Base_Price` | ✗ | List price recovered arithmetically where needed |
| `Actual_Price` | ✓ | Summed per group as `actual_price_sum` |
| `Base_Revenue` | ✓ | Used as `discount_value = Base_Revenue − Actual_Revenue` |
| `Actual_Revenue` | ✓ | |
| `Total_Cost` | ✓ | COGS |
| `Promotion_Cost` | ✓ | |
| `Schedule` | ✗ | `WEEKLY`/`MONTHLY`, one value per channel. Cadence is read from `promo_calendar.CADENCE` instead; tests assert the two agree |

**Distribution**

| Channel | Rows | Schedule |
|---|---:|---|
| CH001 E-commerce | 37,440 | WEEKLY |
| CH002 Modern Trade | 37,440 | MONTHLY |
| CH003 General Trade | 37,440 | MONTHLY |
| CH004 Travel & Hospitality | 56,160 | WEEKLY |
| CH005 B2B | 37,440 | MONTHLY |

| Year | Rows |
|---|---:|
| 2024 | 102,960 |
| 2025 | 102,960 |

| Promotion_Id | Rows |
|---|---:|
| `-1` (not promoted) | 146,070 |
| PR001 · PR002 · PR003 | 15,840 · 14,760 · 15,930 |
| PBNY24 / PBNY25 | 1,305 / 1,305 |
| PBHO24 / PBHO25 | 1,125 / 1,305 |
| PBSU24 / PBSU25 | 1,125 / 1,125 |
| PBIN24 / PBIN25 | 1,125 / 1,125 |
| PBDU24 / PBDU25 | 1,125 / 805 |
| PBDI24 / PBDI25 | 1,125 / 725 |

> `PS001` and `PB001` are **absent from the fact table** — they exist in
> `dim_promotion` as the generic seasonal mechanics and in
> `config.TREATMENT_RULES` as the approved 20% and 25% treatments.

---

### `dim_product_reordered.csv`

| | |
|---|---|
| **Purpose** | Product dimension |
| **Rows** | **36** |
| **Grain** | `Product_id` |
| **Columns** | `Product_id`, `Product_Name`, `Brand`, `Category`, `Size`, `Cost` |
| **Relationship** | `fact_sales.Product_id` → `Product_id` |
| **Derived at load** | **`Product.rank`** — 1–4 position inside the Brand Form, ordered by the leading number in `Size`. Not in the file |
| **Used by** | `category` / `brand` / `product` filters, cannibalization neighbours, Calendar product lists, report labels |

3 categories × 3 Brand Forms × 4 pack sizes:

| Category | Brand Forms |
|---|---|
| Fabric & Home Care | Laundry Detergent · Fabric Conditioner · Fabric Softener Dryer Sheets |
| Baby Care | Taped Diapers · Baby Wipes · L_Diapers |
| Health Care | Toothpaste · Toothbrushes · Cough & Cold |

**Data quality:** several `Product_Name` and `Brand` cells carry **stray leading
spaces**; `loader._clean` trims them, otherwise one brand would split into two
filter options.

**Rank 1 is never promoted** — 0 promoted rows at rank 1, against 24,210 /
24,660 / 11,430 at ranks 2/3/4. It appears only as a cannibalization victim.

---

### `dim_geo_store_final.csv`

| | |
|---|---|
| **Purpose** | Store and geography dimension |
| **Rows** | **509** |
| **Grain** | `Store_Id` |
| **Columns** | `Store_Id`, `Channel_Id`, `Retailer`, `Distributor_Name`, `Region`, `Country`, `State`, `City`, `Tier` |
| **Relationship** | `fact_sales.Store_Id` → `Store_Id`; `Channel_Id` → `dim_channel` |
| **Used by** | `channel`/`retailer`/`region`/`state`/`city`/`tier`/`distributor` filters and breakdowns |

| Dimension | Values |
|---|---|
| Region | Central, East, North, South, West |
| Tier | Tier 1, Tier 2, Tier 3 |
| State | Chandigarh, Delhi, Gujarat, Karnataka, Madhya Pradesh, Maharashtra, Punjab, Rajasthan, Tamil Nadu, Telangana, West Bengal |
| Distributor | `Distributor_01`…`Distributor_05` |
| Country | India (single value — **not a filter dimension**) |

| Channel | Stores |
|---|---:|
| CH001 | 10 |
| CH002 | 210 |
| CH003 | 210 |
| CH004 | 15 |
| CH005 | 64 |

**Data quality:** `Retailer` is **blank on every CH005 (B2B) store**, which is
why `options_for` returns `retailer_available: false` and the UI hides the
control. `Distributor_Name` is blank outside General Trade.

---

### `dim_channel.csv`

| | |
|---|---|
| **Purpose** | Channel dimension |
| **Rows** | **5** |
| **Grain** | `Channel_Id` |
| **Columns** | `Channel_Id`, `Channel_Name`, `Channel_Type` |
| **Used by** | Channel labels, business-event token resolution in the Calendar |

| Id | Name | Type | Cadence *(from `promo_calendar.CADENCE`, not this file)* |
|---|---|---|---|
| CH001 | E-commerce | Retail | WEEKLY |
| CH002 | Modern Trade | Retail | MONTHLY |
| CH003 | General Trade | Retail | MONTHLY |
| CH004 | Travel & Hospitality | Retail | WEEKLY |
| CH005 | B2B | B2B | MONTHLY |

---

### `dim_promotion_final.csv`

| | |
|---|---|
| **Purpose** | Promotion dimension |
| **Rows** | **18** |
| **Grain** | `Promotion_Id` |
| **Columns** | `Promotion_Id`, `Promotion_Name`, `Promotion_Type`, `Promotion_Description` |
| **Used by** | `promotion` / `promotion_type` filters, `promotion_mechanic` breakdown, promotion mix, Calendar labels, Target Rescue's clearance-mechanic lookup |

| Field | Role | Unique? |
|---|---|---|
| `Promotion_Name` | **MECHANIC** | **No** — 7 rows are "20% Discount", 7 are "Buy3Get1" |
| `Promotion_Description` | **EVENT** | **Yes**, across all 18 |
| `Promotion_Type` | Regular / Seasonal / Normal | — |

`loader.Promotion.label` returns the **description**, which is why the Offer
dropdown reads "Diwali Special 25" and not a sixth "Buy3Get1".

**Data quality:** the file carries a **UTF-8 BOM** (`utf-8-sig` on read) and
stray leading spaces in some descriptions.

Full 18-row table: [03_DATA_ARCHITECTURE.md](../03_DATA_ARCHITECTURE.md) §7.

---

### `dim_date2425_corrected.csv`

| | |
|---|---|
| **Purpose** | **The authoritative calendar.** Business week ↔ calendar day ↔ month |
| **Rows** | **882** |
| **Grain** | `Date` |
| **Columns** | `Date`, `Year`, `Month`, `Quarter`, `Week`, `Day` |
| **Relationship** | `(fact.Year, fact.Week)` → the days of that business week |
| **Used by** | **The analytical month for every row**, the Calendar's week starts, Target Rescue's month calendar and day counts |

| Year | Days |
|---|---:|
| 2024 | 366 |
| 2025 | 365 |
| **2026** | **151 — no transactions** |

`Month` is **strictly calendar, 0 mismatches**. `Quarter` is **calendar**
(Q1 = Jan–Mar), which is why fiscal-year semantics are not implemented.

`promo_calendar.available_years()` reads years from the **fact** stream, so 2026
is never offered.

---

## 2. Static content data — `backend/app/data/`

Authored JSON served by `app/data_loader.py`, `lru_cache`d at first read.
**Not computed from the CSVs.**

| File | Size | Endpoint | Consumer | Status |
|---|---:|---|---|---|
| `nav.json` | 1.2 KB | `/api/nav` | `Sidebar` | Structure |
| `user.json` | 86 B | `/api/user` | `Topbar` | **Static persona** |
| `focus.json` | 174 B | `/api/focus` | Investigations, Intelligence | **Static; figures contradict the engine** |
| `settings.json` | 333 B | `/api/settings` | Settings | Display only |
| `connections.json` | 1.4 KB | `/api/connections` | Data Connections | **Authored statuses** |
| `calendar.json` | 853 B | `/api/calendar`, merged into `/promotion-calendar/upcoming` | Calendar | **6 events, Jun–Jul 2025 only** |
| `investigation-types.json` | 2.6 KB | `/api/investigation-types` | Investigations, Simulation | 4 archetypes + example questions |
| `investigations.json` | 37 KB | `/api/investigations/{type}`, `/legacy` | Investigations | **Static causal graph** |
| `pages-by-type.json` | 45 KB | `/api/{intelligence,simulation,decision}/{type}` | Intelligence | **Static** |
| `intelligence.json` | 15 KB | `/api/intelligence-default` | — | **Static, legacy** |
| `intelligence-answers.json` | 3.9 KB | `/api/intelligence-answers/{type}` | `AiAnswerCard` | **Static narrative** |
| `simulation.json` | 5.6 KB | `/api/simulation-default` | — | **Static, legacy** |
| `decision.json` | 4.8 KB | `/api/decision-default` | — | **Static, legacy** |
| `command.json` | 4.7 KB | `/api/command` | **none** | **Static, legacy** |
| `ai-watch.json` | 1.4 KB | `/api/ai-watch` | **none** | **Static** |
| `recommendations.json` | 990 B | `/api/recommendations` | **none** | **Static** |
| `reports.json` | 990 B | **none** | **none** | **DEAD FILE** — its endpoint was removed |

`reports.json` served six authored rows ("Sanjay Kumar", "4.2 MB", "Just now")
with no artifact behind any. It was removed from `misc.py` because `misc` is
registered first and would have **shadowed** the real Report Center listing.

## 3. Application storage — `backend/.store/tiq.db`

SQLite, WAL, gitignored. Created and migrated on first use.

| Table | Purpose | Mutability | Written by |
|---|---|---|---|
| `schema_meta` | `SCHEMA_VERSION` | — | `store/db.py` |
| `investigations` | One investigation, found again by `natural_key` | insert-only | `store/repository.py` |
| `scenarios` | Scenario identity (`name`, `current_version`) | limited update | `store/repository.py` |
| `scenario_results` | The whole `/simulate` payload per version | **APPEND-ONLY** | `store/repository.py` |
| `decisions` | Decision identity | limited update | `store/repository.py` |
| `decision_versions` | The B7 record verbatim per version | **APPEND-ONLY** | `store/repository.py` |
| `reports` | Report metadata + `.xlsx`/`.pdf` **BLOBs** | **deletable** | `store/reports.py` |

**Every row carries `owner = NULL`.** There is no authentication, so there is no
actor to attribute a row to and none has been invented.

Payloads are stored **whole**, as the JSON the frozen contracts produced — not
shredded into per-metric rows: *"a KPI band split across columns would be a
second representation of a number the engine already computed, and the first
time the two disagreed the store would be lying."*

## 4. Data lineage

```
Data/*.csv                      ← the analytical source of truth
   │  loader.py (once per process, cached)
   ▼
FactStore  (columnar, integer dimension codes)
   │  filters.rows_for / baseline_rows_for  (lru_cache 128)
   ▼
WeekRow[]  (product, channel, week, offer)
   │  aggregate.calculate_kpis
   ▼
KpiBundle → service payloads → API → React → screen
                              │
                              └→ reports/adapters → ReportDoc → xlsx/pdf
                                                              → store/reports.py → SQLite


backend/app/data/*.json  ← authored content, ungoverned by the above
   │  data_loader.load (cached)
   ▼
static page endpoints → React → screen
```

## 5. Data-generation and validation scripts — `scripts/`

Read-only:
`validate_fact_data.py` · `validate_promotion_schedule.py` ·
`audit_roi_realism.py` · `audit_seasonal_2024_vs_2025.py` ·
`diagnose_promotion_economics.py`

Historical writers (already applied to the CSVs):
`regenerate_ch001.py` · `fix_promotion_economics.py` ·
`represent_pb001_as_price_discount.py` ·
`correct_ch002_f25_buy3get1.py` (**SUPERSEDED — file says DO NOT RUN**)

One-off migration: `convert-data.mjs` (produced `backend/app/data/*.json` from
the predecessor app's `js/data.js`).

## 6. Data-quality register

| # | Issue | Handling |
|---|---|---|
| 1 | `fact_sales.Month` wrong on 22.6% of rows | Month derived from `(Year, Week) → dim_date`; the column is never read after load |
| 2 | `fact_sales.Date` scrambled on CH002/CH004/CH005 (51.9%) | Only the year is read; day-grain analysis is refused |
| 3 | Stray leading spaces in dim_product / dim_promotion | `loader._clean` |
| 4 | BOM in `dim_promotion_final.csv` | `utf-8-sig` |
| 5 | `Promotion_Name` not unique | `Promotion.label` uses `Promotion_Description` |
| 6 | Blank `Retailer` on B2B stores | `retailer_available: false` |
| 7 | Fact row referencing an absent dimension id | **Warned**, row kept under a blank label — it still carries real money |
| 8 | `(Year, Week)` with no dim_date match | **Raises at load** |
| 9 | dim_date covers 2026; the fact table does not | `available_years()` reads from the fact stream |
| 10 | `PS001` / `PB001` in the dimension but not the fact | Expected — they are the generic masters behind the dated seasonal ids |
