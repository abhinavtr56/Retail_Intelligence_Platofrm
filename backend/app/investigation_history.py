"""
Recent-investigations history — the first bit of state this backend actually
writes (everything else in data_loader.py is read-only seed data loaded once
and cached forever). Deliberately kept separate from data_loader.load(): that
function's whole contract is "immutable, cached at import time," and mixing
a mutable file into it would mean either busting the cache on every write or
serving stale reads.

Storage is still just a JSON file (matching the rest of the app's "JSON
files stand in for a database" approach for Phase 1) but read fresh and
written back on every call, guarded by a lock since FastAPI runs sync route
functions in a thread pool and two submissions could race.
"""
import json
import threading
from pathlib import Path

from app.data_loader import DATA_DIR

HISTORY_PATH = DATA_DIR / "investigation-history.json"
HISTORY_LIMIT = 8

_lock = threading.Lock()


def read_history() -> list[dict]:
    if not HISTORY_PATH.is_file():
        return []
    return json.loads(HISTORY_PATH.read_text(encoding="utf-8"))


def append_history(entry: dict) -> list[dict]:
    """Prepend `entry`, de-duping on (type, question) and capping at
    HISTORY_LIMIT — same rule the frontend's Zustand store used to apply
    client-side before this moved server-side."""
    with _lock:
        history = read_history()
        history = [h for h in history if not (h["type"] == entry["type"] and h["question"] == entry["question"])]
        history = [entry, *history][:HISTORY_LIMIT]
        HISTORY_PATH.write_text(json.dumps(history, indent=2), encoding="utf-8")
        return history
