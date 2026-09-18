"""
The trained artifact, loaded once and held.
The service reads an artifact rather than the ETL output, so that a running
instance cannot change its answers because someone re-ran the ETL underneath it.
The artifact is the fitted figures in `model.json` and, beside it, a `data/`
snapshot of every file a forecast reads -- see `paths.py`, which is where that
second half was missing until a container built cleanly and then failed on its
first request. The artifact names its own version and the checksum of every
document behind it; `/health` reports both.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .paths import ARTIFACTS


@dataclass(frozen=True)
class Model:
    version: str
    trained_on: str
    multiplier: float
    #: Quantile level as a two-decimal string -> multiple of the centre, by sector.
    quantiles: dict[str, dict[str, float]]
    #: Line-kind shares of the bill, by sector.
    shares: dict[str, dict[str, float]]
    #: Published implant option amounts in paise, ascending, by procedure.
    implant_options: dict[str, list[int]]
    coverage: dict[str, float]
    raw: dict

    def basis(self) -> str:
        """One paragraph a caller can put in front of a judge without hedging."""
        r = self.raw
        return " ".join([
            r["multiplier"]["basis"],
            r["dispersion"]["basis"],
            "Held-out coverage of the p10-to-p90 interval, leaving each state out in "
            "turn, is "
            + ", ".join(
                sector + " " + format(v * 100, ".0f") + "%"
                for sector, v in sorted(self.coverage.items())
            )
            + " against a nominal 80%.",
            r["split"]["basis"],
            "Figures are carried to December 2025 rupees by " + r["deflator"]["basis"]
            + ", a factor of " + format(r["deflator"]["factor"], ".3f") + ".",
            r["excludes"],
        ])


def _newest() -> Path:
    if not ARTIFACTS.exists():
        raise SystemExit(
            "no artifact directory at " + str(ARTIFACTS) + ". The service forecasts "
            "from a trained artifact and there is deliberately no untrained fallback; "
            "build one with `python -m training.train`."
        )
    dirs = sorted(d for d in ARTIFACTS.iterdir() if (d / "model.json").is_file())
    if not dirs:
        raise SystemExit(
            "no model.json under " + str(ARTIFACTS) + ". Build one with "
            "`python -m training.train`."
        )
    return dirs[-1]


@lru_cache(maxsize=1)
def load() -> Model:
    raw = json.loads((_newest() / "model.json").read_text(encoding="utf-8"))
    return Model(
        version=raw["modelVersion"],
        trained_on=raw["trainedOn"],
        multiplier=raw["multiplier"]["value"],
        quantiles=raw["dispersion"]["quantiles"],
        shares=raw["split"]["shares"],
        implant_options={k: sorted(v) for k, v in raw["implantOptions"].items()},
        coverage=raw["dispersion"]["coverage"],
        raw=raw,
    )
