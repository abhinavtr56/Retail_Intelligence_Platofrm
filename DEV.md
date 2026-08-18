# Running TIQ locally

Two processes, two terminals.

## 1. Backend (FastAPI)

```
cd backend
python -m venv .venv                      # first time only
./.venv/Scripts/pip install -r requirements.txt   # first time only
./.venv/Scripts/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8100
```
Health check: http://127.0.0.1:8100/api/health

Port 8100, not 8000 — 8000/8001/8002/8010/8020 were all already in use by other
local projects on this machine when this was scaffolded. Change it in both
`app/main.py`'s CORS origins and `frontend/vite.config.ts`'s proxy target if
you need to move it back.

## 2. Frontend (Vite + React)

```
cd frontend
npm install       # first time only
npm run dev
```
Opens on http://localhost:5173 — or the next free port if that one's taken
(check the terminal output; this machine landed on 5174 during scaffolding).
Vite proxies everything under `/api/*` to the backend, so the browser only
ever talks to one origin.

## Production build (Phase 7 — cutover, complete)

```
cd frontend && npm run build
cd ../backend && ./.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8100
```
Builds `frontend/dist/`, then runs the backend alone (no `--reload`, no Vite,
no separate connector proxy) — `app/main.py` auto-mounts `dist/` once it
exists, so this one process is the entire app: UI, API, and all 6 data
connectors. Confirmed working end-to-end at http://127.0.0.1:8100/ — sign
in, every page, and a real connector fetch (NielsenIQ → a live REST API)
all verified with the Vite dev server not even running.

This supersedes `TPO_Sushane_Frontend/TPO-New-Frontend-tpo-focused/`, the
original vanilla HTML/CSS/JS app this was migrated from — every page, the
design system, and all 6 connectors (Azure/Databricks/SAP/Power BI/
NielsenIQ/OpenAI advisor) have a verified equivalent here. That folder was
left untouched throughout the migration and hasn't been deleted; nothing
in this repo depends on it.

## Known local quirks (this machine, not the app)

- Vite sometimes only binds `::1` (IPv6 loopback), not `127.0.0.1` (IPv4) —
  use `http://localhost:<port>` if `127.0.0.1:<port>` refuses to connect.
- If `npm run dev` logs "Port 5173 is in use, trying another one," something
  else already holds it — check the terminal for which port it actually
  picked before assuming the app is down.
- Port 5173 *and* 5174 are both permanently held on this machine by an
  unrelated project (`C:\Users\TransOrg\Desktop\TPO-Platform\frontend` —
  note the different path, not this repo). Don't kill that process assuming
  it's leftover cruft. This app's dev server reliably lands on **5175**
  here; always check the terminal output rather than assuming 5173.

## Routing (Phase 3)

`HashRouter` (routes are `#/command`, `#/investigations`, ... — matches `nav.json`'s
route strings verbatim, ported straight from the vanilla app's hand-rolled hash
router). `frontend/src/App.tsx` is the route table; `pages/CommandCenter.tsx` is the
first real page, the rest are `pages/PlaceholderPage.tsx` until Phase 4.

Floating menus (`components/ui/Dropdown.tsx`) portal to `document.body` with
`position: fixed`, deliberately matching the vanilla app's `UI.openDropdown` — an
`absolute`-positioned menu gets trapped behind later sibling cards because our
`.fade-in`/`.fade-in-up` entrance animations establish a stacking context (animating
`opacity`/`transform` does that per spec) wherever they're used as an ancestor. If a
future floating element (tooltip, popover) needs the same treatment, portal it too
rather than trying to out-z-index the animation.

## Portal (Phase 5)

`/login` and `/home` — ported from login.html/home.html + js/portal.js. Client-side
auth stand-in (Zustand + localStorage, `store/portalUser.ts`) same as the vanilla app —
no real identity provider yet. `/` redirects to `/login`; the live "Trade Promotion
Optimization" module card on Home links straight to `/command` via React Router
(a same-app navigation now, vs. the vanilla app's full page load to `index.html`).

`components/portal/` — `ModuleGrid`, `ConnectorRail`, `AdvisorCard` (OpenAI capability
chat), `modals/` (Upload, Azure, Databricks, SAP, PowerBI, Nielsen).

Connector backends were intentionally left unchanged in this phase — see Phase 6 below
for where that logic moved.

## Connectors (Phase 6)

`backend/app/routers/connectors.py` — Databricks/SAP/Power BI/NielsenIQ/OpenAI proxy
logic ported from the standalone `connector_proxy.py` (stdlib `urllib`) onto
FastAPI + `httpx.AsyncClient`, same request/response shapes and error semantics
(`_upstream_error`'s heuristics, the Databricks "got an HTML login page back" check,
etc.) — mounted at `/api/proxy/*` alongside the rest of the API.

`frontend/src/lib/portalConnectors.ts`'s `PROXY_BASE` now points at `/api` instead of
`http://127.0.0.1:8020` — same-origin via the Vite dev proxy in dev, and genuinely
same-origin in prod once FastAPI serves the built frontend (Phase 7). No separate
`python connector_proxy.py` process to start anymore; the 5 connector modals'
user-facing copy was updated to stop mentioning it. Azure Blob Storage is unaffected —
it never went through the proxy (CORS-native, direct browser fetch).

One behavior difference worth knowing: FastAPI's `HTTPException` serializes errors as
`{"detail": "..."}`, not the old proxy's `{"error": "..."}` — `proxyFetch()` checks
both keys so nothing broke, but new connector work should follow the `detail` shape.

Run `./.venv/Scripts/pip install -r requirements.txt` again after pulling this phase —
it added `httpx`.

## Pages (Phase 4)

All 9 routes are real pages now — `pages/{CommandCenter,Investigations,Intelligence,
Simulation,Decision,Calendar,Reports,Connections,Settings}.tsx`. `pages/PlaceholderPage.tsx`
is no longer used by any route but is left in place as a template if a 10th page is
ever needed.

- **Investigations**: radial causal graph (`components/investigations/`), node detail
  side-popover, staged multi-agent "build" choreography, query bar with keyword-based
  type inference.
- **Intelligence**: 8 tabs (`components/intelligence/`), streaming AI-synthesis answer
  with `[g]/[r]/[n]` tone markup (`useStreamedAnswer`, once per investigation type per
  session via a module-level `Set`).
- **Simulation**: the deterministic scenario engine (`components/simulation/
  simulationEngine.ts` — `compute()`, `buildRisk()`) ported verbatim; multi-scenario
  compare mode, lever dirty-tracking, the 5s "engine warmup" / recompute overlay.
- **Decision**: approval workflow stepper, governance/strategy/impact cards.
- Active investigation state (type + question + recent list) lives in a Zustand store,
  `store/activeInvestigation.ts`, persisted to localStorage — carries across all 4
  investigation-linked pages exactly like the vanilla app's `window.getActiveInvType()`
  globals did.
- Deliberate simplification, applied consistently: connector/source logos (AI-answer
  source pills, Data Connections cards) use the existing icon set with tinted badges
  instead of porting ~10 bespoke brand SVG marks pixel-for-pixel.

## Design system (Phase 2)

`frontend/src/icons/` — ported icon set (`ICON_PATHS` + `<Icon name="..."/>`).
`frontend/src/components/ui/` — Button, Pill, Badge, Chip, Card, IconButton,
Spinner, Kpi, Tabs, Field/Input/Select/Textarea, Modal, Toast (`useToast()`).
`frontend/src/components/charts/` — Sparkline, Donut, DonutBreakdown,
GroupedBar, DualLine, Waterfall, Forecast, ComboBarLine — hand-rolled SVG,
ported 1:1 from `js/components/charts.js` et al. in the vanilla app.
`frontend/src/components/layout/` — Sidebar, Topbar, AppShell (wired to
`useNav`/`useUser`). All ported from `css/components.css` + `css/layout.css`
rules onto Tailwind utilities that reference the tokens in `tokens.css` —
no new colors/spacing invented, only translated.
