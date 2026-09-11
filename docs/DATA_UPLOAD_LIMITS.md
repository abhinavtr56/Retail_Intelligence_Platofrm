# Data upload: limits, configuration and the empty state

How much data a user can load through each connector, where those limits are
written down, what actually constrains the platform in practice, and what the
app does before any data exists.

Every figure in the "measured" sections was measured on this machine against the
shipped dataset — none is an estimate. The loader table below was re-measured
after the dataset grew to 325,260 fact rows (2026 January–August added); the
connector figures further down were measured on the earlier 243,360-row file.

Related: [`CODEBASE_GUIDE.md`](CODEBASE_GUIDE.md) §9 for module layout.

---

## 1. The rules every connector shares

All three sources produce the same thing — six `(filename, bytes)` pairs — and
hand them to `app/star_dataset.py`, which applies the same rules regardless of
where the bytes came from:

- **Identified by column headers, never by filename.** An Excel export called
  `Book1.xlsx` says nothing about which table it holds.
- **All six, or nothing.** A new fact table joined against last week's
  `dim_product` is a different dataset with silently wrong joins.
- **Locked while a complete set is installed.** Uploading is a
  replace-the-world operation, so it is allowed only from the empty state — the
  user must Reset first (`is_locked()`).
- **Staged, then swapped.** Each CSV is written to `.<name>.incoming` and only
  then `os.replace()`d in, so a crash mid-write cannot leave the loader reading
  half a fact table.
- **A failed install clears the folder.** There is no backup to roll back to,
  because the previous contents are not a valid fallback. Empty is a state the
  user can see and fix.

---

## 2. Limits per connector

### 2.1 Excel / CSV upload — `POST /api/datasets`

The **only** path with an explicit size cap:

```python
MAX_STAR_UPLOAD_BYTES = 512 * 1024 * 1024   # backend/app/routers/datasets.py
```

**512 MB per file**, applied per file, not to the batch.

Two things worth knowing about how it is enforced:

- It is checked **after** `content = await upload.read()`, so the whole file is
  already resident in server memory before it can be rejected. Six files at the
  ceiling is roughly 3 GB transient.
- There is **no browser-side check**, so a user uploads the entire file before
  being told it is too big.

**Excel is the weaker option at scale.** `.xlsx`/`.xls` is converted by
`pandas.read_excel` into a DataFrame and back out to CSV (`_to_csv_bytes`),
which costs several times the file size in memory, and Excel's own sheet limit
is 1,048,576 rows. For a large fact table, upload CSV.

### 2.2 Azure Blob — `POST /api/datasets/azure/install`

**No size cap at all.** `MAX_STAR_UPLOAD_BYTES` is not applied on this path.
Bounded only by time (`app/azure_blob.py`):

| Constant | Value | Covers |
| --- | --- | --- |
| `DOWNLOAD_TIMEOUT` | 300 s | fetching one blob |
| `LIST_TIMEOUT` | 30 s | listing a container |
| `maxresults` | 5000 | blobs shown per container |

Server-to-server: the bytes never pass through the browser.

### 2.3 Databricks Unity Catalog — `POST /api/datasets/databricks/install`

**No size cap either.** Uses the `EXTERNAL_LINKS` disposition — pre-signed URLs
to CSV chunks (~20 MB each) in cloud storage, concatenated with the header kept
from chunk 0 only. That choice is deliberate: the inline disposition caps out
well below even the current 205,920-row fact table, and with external links the
bytes never pass through the Databricks control plane or get re-encoded as JSON.

Bounded by time (`app/databricks_catalog.py`):

| Constant | Value | Covers |
| --- | --- | --- |
| `STATEMENT_TIMEOUT` | 300 s | the SQL statement |
| `CHUNK_TIMEOUT` | 300 s | one ~20 MB chunk download |
| `META_TIMEOUT` | 45 s | catalog/schema/table metadata |
| `POLL_ATTEMPTS` × `POLL_INTERVAL` | 40 × 5 s = 200 s | waiting out a cold serverless warehouse |

---

## 3. How the limits are configured

All of them are **plain module constants**. None is read from the environment,
none lives in `app/tpo/config.py`, and none is settable at runtime:

| Limit | File |
| --- | --- |
| `MAX_STAR_UPLOAD_BYTES` | `backend/app/routers/datasets.py` |
| Azure timeouts | `backend/app/azure_blob.py` |
| Databricks timeouts and polling | `backend/app/databricks_catalog.py` |

Changing one means editing that line. There is also **no server-level or proxy
limit** anywhere in the repo — no nginx config, no Dockerfile, and neither
FastAPI nor uvicorn imposes a request-body ceiling by default. The 512 MB check
is the only size limit in the system.

The one environment variable that matters here is `TPO_DATA_DIR`, which
overrides where the six CSVs are read from and written to (`config._resolve_data_dir`).

---

## 4. What actually constrains you — measured

### Memory is not the bottleneck

The loader's in-memory representation is compact — roughly 0.09 KB per fact row:

| | |
| --- | ---: |
| fact rows | 325,260 |
| CSV on disk | 33 MB |
| resident Python heap | **28 MB** |
| peak during parse | 28 MB |
| load time | 2.4 s |

Projected, at the same row width:

| Dataset | Resident heap |
| --- | ---: |
| 2× (4 years) | ~41 MB |
| 4.5× (4 years / 10 channels / 50 products) | ~92 MB |
| 10× | ~205 MB |

A multi-million-row upload fits in memory comfortably. Load time scales roughly
linearly.

### Query time is the bottleneck

`service.breakdown()` partitions an already-filtered row set for dimensions
carried on the `WeekRow` itself, but **geography dimensions live on the store**
and take a re-filter path costing one full engine pass *per group*:

| Breakdown | Groups | Time |
| --- | ---: | ---: |
| by channel | 6 | 0.3 s |
| by product | 36 | 0.1 s |
| **by retailer** | 36 | **2.3 s** |

Retailer, region, state, city and distributor all take the slow path, and it
scales with rows × stores. Promotion Intelligence already takes ~40 s to compute
every section eagerly, which is why sections are memoised per `(section, scope)`.

**This will bite long before any size limit does.**

---

## 5. Before any data exists

The `Data/` folder ships empty, so "no dataset yet" is the expected state of a
fresh checkout, not an error condition. It is handled in three layers:

**The loader** raises `DatasetNotLoaded` (a distinct `FileNotFoundError`
subclass) naming the missing file and how to fix it.

**The API** turns that into a clean `503` carrying `dataset_missing: true`, via
an app-wide exception handler in `app/main.py` — 503 rather than an empty 200 so
a caller cannot mistake "not loaded yet" for "loaded, and genuinely zero".
Verified: every data-backed route answers this way, including
`/api/command-center/*`, `/api/promotion-calendar/*` and
`/api/promotion-intelligence/facts`. Startup warmup catches it separately and
logs a single line instead of a traceback.

**The UI** gates on it before any page renders. `RequireDataset` wraps every
data-backed route in `App.tsx` (`/command`, `/investigations`, `/intelligence`,
`/simulation`, `/decision`, `/calendar`, `/reports`) and reads
`GET /api/datasets/star`:

- `complete: false` → an "Upload your dataset to continue" card listing all six
  tables with present/missing ticks, the required columns for each, an
  *n of 6 present* count, and an upload button.
- Cannot reach the endpoint at all → a different card saying the backend is not
  responding, because telling the user to upload files would be the wrong
  instruction.
- The gate lifts the moment an upload succeeds — the mutation invalidates every
  query, `complete` flips true and children render. No reload, no restart.

Blocking once, centrally, is why a dozen screens do not each need their own
empty state.

---

## 6. Known gaps

Neither is urgent at current data volumes; both are recorded rather than fixed.

1. **The size cap protects the least exposed connector.** Excel/CSV upload is
   capped at 512 MB; Azure and Databricks can pull an unbounded table straight
   into the process with no ceiling at all.

2. **The cap is checked after the body is in memory**, which is not what a size
   limit is usually for, and there is no client-side pre-check.

3. ~~`dataset_missing` is never read by the frontend.~~ **Fixed.** `ApiError`
   now carries `datasetMissing`, a failed query anywhere re-checks the dataset
   status so `RequireDataset` flips to the upload screen on its own, and a
   missing dataset is no longer retried. Only reachable when a dataset is
   removed *while* a page is open — a connector Reset in another tab — which
   previously showed "Unable to load data / Retry", an action that could not
   work.

4. **Deep links 404 on the prod static mount.** `StaticFiles(html=True)` serves
   `index.html` for `/` but has no SPA fallback, so `GET /login` returns 404
   against a built frontend. The app uses a hash router (`/#/command`), so this
   does not bite in normal use, and Vite handles it in dev.
