"""
Investigation run state.

Runs are persisted so a browser reload doesn't re-run the pipeline — which
would mean paying OpenAI twice for the same answer. The frontend polls
GET /api/investigations/runs/{id} and renders whatever stage it's at.

In-memory dict is the live view; the JSON file is what survives a restart.
"""
import json
import threading
import time
import uuid
from typing import Any

from app.data_loader import DATA_DIR

RUNS_PATH = DATA_DIR / "investigation-runs.json"
KEEP_RUNS = 50

_lock = threading.Lock()
_runs: dict[str, dict[str, Any]] = {}


def _load() -> dict[str, Any]:
    global _runs
    if _runs:
        return _runs
    if RUNS_PATH.is_file():
        try:
            _runs = json.loads(RUNS_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            _runs = {}
    return _runs


def _persist() -> None:
    # Keep only the most recent runs — results carry full findings and grow.
    ordered = sorted(_runs.values(), key=lambda r: r["created_at"], reverse=True)[:KEEP_RUNS]
    trimmed = {r["id"]: r for r in ordered}
    _runs.clear()
    _runs.update(trimmed)
    RUNS_PATH.write_text(json.dumps(trimmed, indent=2), encoding="utf-8")


def create_run(question: str, dataset_id: str | None, owner: str, kind: str = "investigation") -> dict[str, Any]:
    with _lock:
        _load()
        run_id = uuid.uuid4().hex[:12]
        run = {
            "id": run_id,
            # Investigation and Promotion Intelligence runs share this store;
            # without `kind` each endpoint would list the other's runs.
            "kind": kind,
            "question": question,
            "dataset_id": dataset_id,
            "owner": owner,
            "status": "running",
            "stage": "planning",
            "specialists": [],
            "result": None,
            "error": None,
            "created_at": int(time.time() * 1000),
            "updated_at": int(time.time() * 1000),
        }
        _runs[run_id] = run
        _persist()
        return run


def update_run(run_id: str, **fields: Any) -> dict[str, Any] | None:
    with _lock:
        _load()
        run = _runs.get(run_id)
        if not run:
            return None
        run.update(fields)
        run["updated_at"] = int(time.time() * 1000)
        _persist()
        return run


def get_run(run_id: str) -> dict[str, Any] | None:
    with _lock:
        return _load().get(run_id)


def run_kind(run: dict[str, Any]) -> str:
    """A run's kind, inferred from its result when the field predates it.

    Defaulting missing values to "investigation" put old Promotion Intelligence
    runs into the investigations picker, offering "What is driving promotion
    performance…" as something to deepen. The two results are structurally
    distinct — investigations carry an `orchestration`, analyses carry
    `analysis`/`recommendations` — so the shape is a reliable discriminator.
    """
    kind = run.get("kind")
    if kind:
        return str(kind)
    result = run.get("result") or {}
    if "orchestration" in result:
        return "investigation"
    if "analysis" in result or "recommendations" in result:
        return "intelligence"
    return "investigation"


def list_runs(owner: str, limit: int = 20, kind: str | None = None) -> list[dict[str, Any]]:
    """Summaries only — full results are large and the list view shows none of it."""
    with _lock:
        runs = [r for r in _load().values() if r.get("owner") == owner]
    if kind:
        runs = [r for r in runs if run_kind(r) == kind]
    runs.sort(key=lambda r: r["created_at"], reverse=True)
    return [
        {
            **{k: r.get(k) for k in ("id", "question", "dataset_id", "status", "stage", "created_at", "updated_at")},
            "kind": run_kind(r),
        }
        for r in runs[:limit]
    ]


def latest_completed(owner: str, kind: str = "investigation") -> dict[str, Any] | None:
    """Most recent finished run of one kind — how Promotion Intelligence finds
    the investigation it is meant to deepen."""
    with _lock:
        runs = [
            r for r in _load().values()
            if r.get("owner") == owner and run_kind(r) == kind and r.get("status") == "done"
        ]
    return max(runs, key=lambda r: r["created_at"], default=None)
