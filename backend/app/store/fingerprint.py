"""The dataset fingerprint -- B10.

ONE deterministic identifier for the source data a computation was made
against, so a record stored today can still say -- a month from now, after the
CSVs have been replaced -- which numbers it was actually derived from.

WHY A CONTENT HASH AND NOT A VERSION STRING. Nothing in this project stamps a
version on the data. A mtime would change when a file is copied and not change
when its contents are edited in place; a filename would never change at all.
The only thing that reliably identifies the data is the data, so the
fingerprint is a SHA-256 over the exact bytes of every source file, in a fixed
filename order.

READ ONCE, CACHED. Hashing 21 MB of fact rows takes a moment, so it happens
once per data directory per process -- the same lifetime as
`loader.get_store()`'s own cache, which is what the fingerprint describes.
Nothing recomputes it per request.

NEVER SUPPLIED BY A CLIENT. The fingerprint is computed here, server-side,
from the files on disk. A client-asserted value would be exactly the kind of
unverifiable claim the preceding phases removed, so no route accepts one: it
is recorded at write time and compared at read time, both times from this
module.

READ-ONLY WITH RESPECT TO B1-B9. This module opens the same files
`app/tpo/loader.py` reads and touches nothing else. No KPI, no filter and no
loader behaviour is involved.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.tpo import config

#: Bytes per read. Large enough that the 21 MB fact file is a handful of
#: iterations, small enough not to hold it all in memory at once.
_CHUNK = 1 << 20


@dataclass(frozen=True)
class DatasetVersion:
    """What the data was, when a computation was made against it."""

    #: The identifier. Short enough to print, long enough not to collide.
    fingerprint: str
    #: Which files it covers, and how big each was. Diagnostic only -- the
    #: fingerprint is the identity.
    files: tuple[tuple[str, int], ...]

    def as_dict(self) -> dict[str, object]:
        return {
            "fingerprint": self.fingerprint,
            "files": [{"name": name, "bytes": size} for name, size in self.files],
            "method": (
                "SHA-256 over the exact bytes of every source CSV, in fixed filename "
                "order. Computed server-side; never supplied by a client."
            ),
        }


def _source_files(data_dir: Path) -> list[Path]:
    """Every file the dataset is built from, in a fixed order.

    Named explicitly from `config`'s own file list rather than globbed: a stray
    CSV dropped into the folder must not silently change the identity of data
    the loader never reads.
    """
    names = [config.FACT_FILE, *sorted(config.DIM_FILES.values())]
    return [data_dir / name for name in names]


@lru_cache(maxsize=4)
def _compute(data_dir_str: str) -> DatasetVersion:
    digest = hashlib.sha256()
    files: list[tuple[str, int]] = []

    for path in _source_files(Path(data_dir_str)):
        # The name goes into the hash too, so moving content between two files
        # is a different dataset rather than the same one.
        digest.update(path.name.encode("utf-8"))
        if not path.is_file():
            digest.update(b"\0missing")
            files.append((path.name, -1))
            continue
        size = path.stat().st_size
        digest.update(str(size).encode("ascii"))
        with path.open("rb") as handle:
            while chunk := handle.read(_CHUNK):
                digest.update(chunk)
        files.append((path.name, size))

    return DatasetVersion(fingerprint=digest.hexdigest(), files=tuple(files))


def dataset_version(data_dir: Path | None = None) -> DatasetVersion:
    """The fingerprint of one data directory, computed once per process.

    `data_dir` defaults to the directory the loader is actually reading. It is
    a parameter only so the tests can fingerprint a directory they control --
    no route ever passes one.
    """
    return _compute(str(data_dir or config.DATA_DIR))


def current_fingerprint() -> str:
    """The fingerprint of the dataset this process has loaded."""
    return dataset_version().fingerprint
