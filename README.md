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

Not yet done: a real database, real authentication (login is a client-side
stand-in, matching the vanilla app), and full TypeScript strictness on a few
JSON-shaped `any`s. See `DEV.md` for specifics.
