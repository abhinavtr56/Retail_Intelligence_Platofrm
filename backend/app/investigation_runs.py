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


def create_run(question: str, dataset_id: str, owner: str) -> dict[str, Any]:
    with _lock:
        _load()
        run_id = uuid.uuid4().hex[:12]
        run = {
            "id": run_id,
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


def list_runs(owner: str, limit: int = 20) -> list[dict[str, Any]]:
    """Summaries only — full results are large and the list view shows none of it."""
    with _lock:
        runs = [r for r in _load().values() if r.get("owner") == owner]
    runs.sort(key=lambda r: r["created_at"], reverse=True)
    return [
        {k: r[k] for k in ("id", "question", "dataset_id", "status", "stage", "created_at", "updated_at")}
        for r in runs[:limit]
    ]
