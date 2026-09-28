"""
Where the model's inputs live, and the difference between training and serving.

**Training reads the repository.** `etl/out/` is the tracked JSON the database
seed also reads, built by `python -m etl.build` from documents already
downloaded, magic-byte checked and checksummed. The procedure list and the two
procedure-to-code maps are read out of the TypeScript that defines them, so the
model never keeps a second copy of a coding judgement.

**Serving reads a snapshot.** Training copies every one of those files into
`artifacts/<version>/data/`, keeping their paths, and the service reads that
instead. Three reasons, in the order they matter:

1. A running service must not change its answers because someone re-ran the ETL
   or edited a procedure. The version `/health` reports then means something.
2. The container has no repository in it. This was found the way these things
   are found: the image built, `/health` answered with four checksums, and the
   first real forecast returned a 500 -- because `tariff.py` was still reaching
   for `etl/out/` at request time while the comment above it said it did not.
3. An artifact is then self-contained: a version, the figures fitted from it,
   and the documents those came from, in one directory.

The snapshot is preferred wherever one exists, on a developer's machine as much
as in a container, because a guarantee that only holds in production is not one.
`CLAIMCAST_SOURCE_ROOT` is how training opts out; `training/train.py` sets it to
the repository before importing anything else, and nothing else sets it.
"""

from __future__ import annotations

import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVICE = HERE.parent
REPO = SERVICE.parent.parent

ARTIFACTS = Path(os.environ.get("CLAIMCAST_ARTIFACTS", SERVICE / "artifacts"))

#: The files a forecast reads at request time, as paths relative to the
#: repository root. Training copies exactly these into the artifact and the
#: image copies nothing else, so a file added to the model without being added
#: here fails loudly in the container rather than working on whichever machine
#: happens to have a checkout.
SNAPSHOT = (
    "etl/out/nsso-75-health.json",
    "etl/out/cpi-health.json",
    "etl/out/nha-hbp-2022.json",
    "etl/out/cghs-rates.json",
    "packages/engine/src/data/procedures.ts",
    "apps/api/prisma/hbp-map.ts",
    "apps/api/prisma/cghs-map.ts",
)


def version_key(d: Path) -> tuple[str, int]:
    """
    Order artifact directories by version: the date, then the build number as a
    number. A retrained service can build ten versions in a day, and as strings
    `2026-09-28.10` sorts before `2026-09-28.9`.
    """
    stamp, _, n = d.name.rpartition(".")
    return (stamp, int(n)) if n.isdigit() else (d.name, 0)


def _snapshot() -> Path | None:
    """The newest artifact's data directory, if an artifact carries one."""
    if not ARTIFACTS.is_dir():
        return None
    for d in sorted(ARTIFACTS.iterdir(), key=version_key, reverse=True):
        if (d / "data").is_dir():
            return d / "data"
    return None


def _root() -> Path:
    override = os.environ.get("CLAIMCAST_SOURCE_ROOT")
    if override:
        return Path(override)
    snapshot = _snapshot()
    return snapshot if snapshot is not None else REPO


#: What everything else reads from: the frozen snapshot when there is one, the
#: repository when there is not. Resolved once at import, so a forecast cannot
#: change its source mid-process.
ROOT = _root()
ETL_OUT = Path(os.environ.get("CLAIMCAST_ETL_OUT", ROOT / "etl" / "out"))
