# 10 — Deployment and Local Setup

Every command below is taken from the repository (`README.md`, `DEV.md`,
`package.json`, `requirements.txt`) or was executed during this audit.

> **Read this before hosting.** Every API route in this application is
> unauthenticated, including the writes. See §8.

## 1. Prerequisites

| | Version used |
|---|---|
| Python | 3.13.14 |
| Node.js | 18+ (Vite 8 requirement) |
| Git | any |

Platform note: this repository was developed on Windows and the documented
commands use `./.venv/Scripts/…`. On macOS/Linux substitute `.venv/bin/…`.

## 2. Install

### Backend

```bash
cd backend
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt
```

`requirements.txt`: `fastapi>=0.115`, `uvicorn[standard]>=0.32`,
`pydantic>=2.9`, `httpx>=0.28`, `openpyxl>=3.1`, `reportlab>=4.0`,
`pypdf>=4.0` (test only).

> This machine also carries a repository-root `venv/` used for the audit runs
> (`../venv/Scripts/python.exe`). Either is fine; `backend/.venv` is what
> `README.md` and `DEV.md` document.

### Frontend

```bash
cd frontend
npm install
```

## 3. Data

The five CSVs ship in the repository under `Data/`, so a clone is
self-contained. `app/tpo/config._resolve_data_dir()` resolves them in order:

1. `$TPO_DATA_DIR` — explicit override, always wins
2. `<repo>/Data` — the in-repo copy
3. `~/OneDrive/Desktop/TPO_FINAL` — where they were authored

Required files:

```
fact_sales_2024_2025_all_channels.csv
dim_product_reordered.csv
dim_geo_store_final.csv
dim_channel.csv
dim_promotion_final.csv
dim_date2425_corrected.csv
```

A missing file raises `FileNotFoundError` naming the path and telling you to set
`TPO_DATA_DIR`.

**There is no load step.** The CSVs are read on first request and cached for
the process lifetime (~15 MB, ~2 s once). Changing a CSV requires a **restart**
— there is no cache invalidation path.

## 4. Run — development (two terminals)

```bash
# Terminal 1
cd backend
./.venv/Scripts/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8100

# Terminal 2
cd frontend
npm run dev
```

Open the URL Vite prints. **Sign in with any email and any password** — the
login is a client-side stand-in.

Health check: <http://127.0.0.1:8100/api/health> → `{"ok": true, "service": "tiq-api"}`
API docs: `/docs` (Swagger) and `/redoc`.

### Why port 8100

8000 / 8001 / 8002 / 8010 / 8020 were all in use by other local projects when
this was scaffolded. To move it, change **both**:

- `backend/app/main.py` — the CORS `allow_origins` list
- `frontend/vite.config.ts` — the `/api` proxy `target`

### Machine-specific quirks (documented in `DEV.md`)

- Vite sometimes binds only `::1` (IPv6). Use `http://localhost:<port>` if
  `127.0.0.1:<port>` refuses.
- Ports 5173 **and** 5174 are permanently held on the development machine by an
  unrelated project at `C:\Users\TransOrg\Desktop\TPO-Platform\frontend` (note
  the different path). This app reliably lands on **5175** there. Always read
  the terminal rather than assuming 5173.
- `main.py` allow-lists 5173 and 5175 for CORS. A dev server on any other port
  making a **direct** API call (bypassing the Vite proxy) would be blocked;
  through the proxy it is same-origin and CORS never applies.

## 5. Run — production (one process)

```bash
cd frontend && npm run build
cd ../backend && ./.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8100
```

`npm run build` runs `tsc -b` then `vite build` into `frontend/dist/`.
`app/main.py` auto-mounts that folder at `/` once it exists, so this one process
serves the UI, the API and all connector proxies. No `--reload`, no Vite, no
separate connector proxy.

Open <http://127.0.0.1:8100/>.

The mount is guarded on the folder existing, so the backend still starts before
a build has ever been run.

## 6. Run the tests

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests/ -q          # ~11 minutes
../venv/Scripts/python.exe -m pytest tests/test_command_center.py -q

cd ../frontend
npx tsc -b
npm run lint
npm run build
```

## 7. Environment variables

| Variable | Default | Effect |
|---|---|---|
| `TPO_DATA_DIR` | unset | Dataset folder; wins over every fallback |
| `TPO_USD_PER_INR` | `0.0115` | Display-only exchange rate |
| `TPO_STORE_PATH` | `backend/.store/tiq.db` | SQLite file location |

There is **no `.env` file** and no dotenv loader. Set these in the shell.
Nothing else in `app/tpo/` reads `os.environ`.

## 8. Deployment safety — read before hosting

Reproduced from `README.md`, and verified against the code:

> **Every API route is unauthenticated, including the two that write.** There is
> no identity provider, no session, no token and no route guard anywhere in the
> application, so anyone who can reach the process can:
> - store a scenario or a decision (`POST /api/store/scenarios`,
>   `POST /api/store/decisions`),
> - append versions to records they did not create,
> - read every stored decision (`GET /api/store/decisions`).

To that list, this audit adds the Report Center, which arrived after that note
was written:

- generate a report into the shared library (`POST /api/reports`),
- read every stored report and its artifacts (`GET /api/reports…`),
- **delete any report, or the entire library** (`DELETE /api/reports/{id}`,
  `DELETE /api/reports`).

Nothing in the store is private and nothing is attributable: every record
carries `owner: null`, because there is no verified actor to attribute it to.

Adding access control on top of the current sign-in — which accepts any email
with any password and checks neither — would be an enforcement claim with
nothing behind it, so it has deliberately **not** been added (B11, Deferred).

**This is fine on a single-user localhost deployment and is not fine on a
shared or public one.** Until authentication exists, host it behind something
that authenticates, or do not expose it.

Additional exposure worth naming:

- The **connector proxies** (`/api/proxy/*`) forward caller-supplied
  credentials to arbitrary third-party hosts. `POST /api/proxy/generic/rest`
  will call any URL it is given. On an exposed host that is an open forwarder.
  Credentials are not persisted or logged, but they do transit the process.
- `/docs` and `/openapi.json` are served unguarded.

## 9. Persistent state and backups

| Path | Contents | Gitignored |
|---|---|---|
| `backend/.store/tiq.db` (+ `-wal`, `-shm`) | Scenarios, decisions, report metadata **and report artifact BLOBs** | yes |
| `frontend/dist/` | Build output | yes |
| `frontend/node_modules/`, `backend/.venv/` | Dependencies | yes |

**A backup is a copy of `tiq.db`.** That was the stated reason for choosing
SQLite (`store/db.py`: "it is a single file, so a deployment is a copy") and the
reason report artifacts are stored as BLOBs in the row rather than as loose
files — a delete is then atomic and cannot orphan a file.

The database is created and migrated on first use; there is nothing to run by
hand. WAL journal mode is enabled.

Browser-side state (`localStorage`, per browser, not synced):
`tiq.activeInvestigation`, the portal user, saved record ids, sidebar collapsed
state.

## 10. Operational notes

| | |
|---|---|
| Startup | ~2 s on first request (CSV load), then in-memory |
| Concurrency | One process; SQLite with WAL. `db.py` states the assumption: one process, one dataset, no concurrent writer beyond a handful of browser tabs |
| Scaling out | **Not supported as configured.** Multiple workers each hold their own copy of the 15 MB store, and would contend on one SQLite file |
| Logging | None configured beyond Uvicorn's default and the loader's stdout warnings |
| Monitoring / metrics | None |
| Migrations | `SCHEMA_VERSION = 1`; tables created with `CREATE TABLE IF NOT EXISTS` on first use. **No migration tool** |
| Containerisation | **No Dockerfile, no compose file** |
| CI | **No CI configuration** in the repository |

## 11. Common problems

| Symptom | Cause | Fix |
|---|---|---|
| `FileNotFoundError: TPO dataset not found` | CSVs not resolvable | Set `TPO_DATA_DIR` |
| `ValueError: … (Year, Week) pair(s) … have no match` | Fact carries a week dim_date does not cover, or dim_date is truncated | Fix the dataset — the loader refuses to guess a month |
| `[tpo] warning: N product id(s) … missing from its dimension` | Fact references an id absent from a dimension | Non-fatal; the row is kept under a blank label |
| Frontend loads but every panel errors | Backend not running, or the proxy target is wrong | Check `/api/health`; check `vite.config.ts` |
| `127.0.0.1:<port>` refuses but `localhost:<port>` works | Vite bound `::1` only | Use `localhost` |
| Port 5173 "in use" | Another project holds it | Read the terminal for the actual port |
| Report download is empty | Stored artifact has no bytes | The API returns 500 rather than sending an empty file; regenerate |
| A stored scenario reads `stale: true` | The dataset fingerprint changed since the write | Expected; nothing is recomputed |
