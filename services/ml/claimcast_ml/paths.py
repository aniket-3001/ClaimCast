"""
Where the model's inputs and artifacts live.

The service reads `etl/out/`, the same tracked JSON the database seed reads, and
never `etl/raw/` and never the network. Those files are built by
`python -m etl.build` from documents that have already been downloaded,
magic-byte checked and checksummed, so a forecast can always be traced back to
the exact file a figure came from.

`CLAIMCAST_ETL_OUT` overrides the location for a container, where the repository
layout is not what it is on a developer's machine.
"""

from __future__ import annotations

import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVICE = HERE.parent
REPO = SERVICE.parent.parent

ETL_OUT = Path(os.environ.get("CLAIMCAST_ETL_OUT", REPO / "etl" / "out"))
ARTIFACTS = Path(os.environ.get("CLAIMCAST_ARTIFACTS", SERVICE / "artifacts"))
