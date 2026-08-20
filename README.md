# TIQ — Retail Intelligence Platform

React + TypeScript + Tailwind CSS frontend, Python FastAPI backend. This is the
migrated version of the original vanilla HTML/CSS/JS app at
`TPO_Sushane_Frontend/TPO-New-Frontend-tpo-focused/` — same design, same data,
same 6 live connectors, new stack. See `DEV.md` for the full phase-by-phase
migration notes (design system, routing, data connectors, portal, cutover).

## Quick start

```
# Backend
cd backend
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt
./.venv/Scripts/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8100

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```
Open the URL Vite prints (usually http://localhost:5173, sometimes the next
free port — check the terminal). Sign in with any email/password.

## Production

```
cd frontend && npm run build
cd ../backend && ./.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8100
```
One process, serving both the UI and the API — no separate connector proxy,
no Vite dev server.

## Structure

- `frontend/` — React 18 + TypeScript + Vite + Tailwind CSS v4
- `backend/` — FastAPI, JSON files standing in for a database (no DB yet)
- `scripts/` — the one-time `convert-data.mjs` that generated `backend/app/data/*.json`
  from the vanilla app's `js/data.js`

Not yet done: real authentication (login is a client-side stand-in, matching
the vanilla app) and full TypeScript strictness on a few JSON-shaped `any`s.
See `DEV.md` for specifics. Saved scenarios and decisions now persist to SQLite
(`backend/.store/tiq.db`, override with `TPO_STORE_PATH`); the JSON files under
`app/data/` are still read-only page content.

## Deployment safety — read before hosting this

**Every API route is unauthenticated, including the two that write.** There is
no identity provider, no session, no token and no route guard anywhere in the
application, so anyone who can reach the process can:

- store a scenario or a decision (`POST /api/store/scenarios`, `POST /api/store/decisions`),
- append versions to records they did not create,
- read every stored decision (`GET /api/store/decisions`).

Nothing in the store is private and nothing is attributable: every record
carries `owner: null`, because there is no verified actor to attribute it to.
Adding access control on top of the current sign-in — which accepts any email
with any password and checks neither — would be an enforcement claim with
nothing behind it, so it has deliberately not been added.

**This is fine on a single-user localhost deployment and is not fine on a
shared or public one.** Until authentication exists, host it behind something
that authenticates, or don't expose it.
