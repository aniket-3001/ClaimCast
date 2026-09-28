"""
XGBoost quantile regression: the range, predicted rather than looked up.

    features   the published tariff anchor (log), the scheme that published it,
               its specialty, city tier, NABH status and survey sector
    target     log(private charge / tariff anchor)
    objective  reg:quantileerror at 0.10, 0.50 and 0.90, one booster, three heads

**What it is trained on, and what each part of the pool can and cannot teach it.**

1. *Every priced row of both published tariffs.* All 1,909 numerically priced
   PM-JAY packages in HBP 2022 at the three city tiers, and every CGHS rate at
   the three tiers with and without NABH. These define the feature space -- the
   booster has seen every procedure either scheme prices -- and they carry the
   prior. Their labels are not observed bills, because no public source publishes
   what a private hospital charged for a named procedure. Each tariff row is
   labelled with the survey's own spread instead: the fitted private-to-tariff
   multiplier times twenty evenly spaced points of the state-by-quintile stratum
   sample for its sector (`dispersion.py`). So on the tariff rows alone the
   booster learns the survey band, the same for every procedure, and it is said
   so here rather than dressed up as a finding.

2. *Every settled bill reported back through the app.* These are the only rows
   with a real label -- what an admission actually came to against the tariff it
   was anchored on -- and they are the only rows that can teach the booster
   anything procedure-, tier- or specialty-specific. Each is weighted
   `OUTCOME_WEIGHT` times a tariff row against a minimum leaf weight of twelve,
   so that one bill cannot visibly move a figure in front of a patient but tens
   of bills in one part of the tariff will take that part over. `training/train.py --outcomes` and `POST /retrain` both
   rebuild the booster on the combined pool; see `build.py`.

**The implant is not in the target.** A forecast adds the implant separately
(`forecast.py` explains why), so a settled bill's label is its total less the
midpoint of the procedure's published implant options, and a bill that does not
exceed that is discarded rather than read as a negative charge.

**Crossing.** Three independently fitted quantile heads can cross on an input far
from the data. Predictions are sorted before they are used, so p10 <= p50 <= p90
always holds, and the held-out coverage below is measured after sorting.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import xgboost as xgb

from . import tariff
from .dispersion import QUANTILES, quantile
from .survey import sector_for

#: The heads, in the order the booster predicts them.
ALPHAS = np.array(QUANTILES, dtype=float)

#: Label points per tariff row. Twenty evenly spaced quantiles of the stratum
#: sample reproduce its p10 and p90 to within a point or two, at a twentieth of
#: the rows the full 360-point sample would cost.
SUPPORT = 20

#: How many tariff rows one settled bill is worth, read together with
#: `min_child_weight` below: a leaf has to hold the weight of twelve tariff rows,
#: so it takes about twenty-four bills at one point of the tariff to outweigh the
#: survey there. Measured on a knee replacement with bills at 1.8x the band, one
#: bill moves p50 by 0.2%, ten by a quarter of the way, twenty by 60% and sixty
#: all the way. A judgement, written as two numbers so it can be argued with, in
#: the same spirit as `calibration.PRIOR_WEIGHT`.
OUTCOME_WEIGHT = 0.5

#: Tree settings. Shallow and slow, because most of the pool shares its labels
#: and a deep tree would split on noise in the few rows that do not.
PARAMS = {
    "objective": "reg:quantileerror",
    "quantile_alpha": ALPHAS,
    "tree_method": "hist",
    "max_depth": 4,
    "learning_rate": 0.1,
    "min_child_weight": 12.0,
    "subsample": 1.0,
    "seed": 0,
    "nthread": 1,
}
ROUNDS = 150

FEATURES = ("logAnchor", "scheme", "specialty", "tier", "nabh", "sector")
TIER_CODE = {"X": 0, "Y": 1, "Z": 2}
TIERS = ("X", "Y", "Z")


@dataclass(frozen=True)
class Row:
    anchor: int
    scheme: str
    specialty: str
    tier: str
    nabh: bool


def vocabulary() -> list[str]:
    """Every specialty either tariff uses, in a fixed order, so a code is stable."""
    hbp, cghs, _h, _c = tariff._tables()
    names = {"PMJAY:" + p["specialtyCode"] for p in hbp["packages"]}
    names |= {"CGHS:" + r.get("specialty", "") for r in cghs["rates"]}
    return sorted(names)


def encode(rows: list[Row], vocab: list[str]) -> np.ndarray:
    index = {v: i for i, v in enumerate(vocab)}
    out = np.empty((len(rows), len(FEATURES)), dtype=np.float32)
    for i, r in enumerate(rows):
        out[i] = (
            math.log(max(r.anchor, 1)),
            0.0 if r.scheme == "PMJAY" else 1.0,
            float(index.get(r.scheme + ":" + r.specialty, -1)),
            float(TIER_CODE[r.tier]),
            1.0 if r.nabh else 0.0,
            0.0 if sector_for(r.tier) == "urban" else 1.0,
        )
    return out


def tariff_rows() -> list[Row]:
    """Every row of both published tariffs that carries a number."""
    hbp, cghs, _h, _c = tariff._tables()
    rows: list[Row] = []
    for pkg in hbp["packages"]:
        if pkg["pricing"]["kind"] == "asPrinted":
            continue
        for tier in TIERS:
            # Three days where the package is priced per day, which is the
            # median stay the engine's own medical admissions use.
            amount, _ = tariff._hbp_amount(pkg, tier, "semi_private", 3, 0)
            if amount > 0:
                rows.append(Row(amount, "PMJAY", pkg["specialtyCode"], tier, True))
    for rate in cghs["rates"]:
        for tier in TIERS:
            for nabh in (True, False):
                amount, _ = tariff._cghs_amount(rate, cghs["rules"], tier, nabh, "semi_private")
                if amount > 0:
                    rows.append(Row(amount, "CGHS", rate.get("specialty", ""), tier, nabh))
    return rows


def support(sample: list[float]) -> list[float]:
    """`SUPPORT` evenly spaced quantiles of a sample, as label points."""
    return [quantile(sample, (i + 0.5) / SUPPORT) for i in range(SUPPORT)]


@dataclass(frozen=True)
class Pool:
    X: np.ndarray
    y: np.ndarray
    w: np.ndarray
    #: Which tariff row each label came from, for a grouped hold-out.
    group: np.ndarray
    tariff_rows: int
    outcome_rows: int


def pool(
    rows: list[Row],
    vocab: list[str],
    multiplier: float,
    stratum: dict[str, list[float]],
    outcomes: list[tuple[Row, float]],
) -> Pool:
    """
    The combined training pool.

    `stratum` is the state-by-quintile sample per sector; `outcomes` are settled
    bills as (the row their forecast was anchored on, label multiple).
    """
    points = {s: [math.log(multiplier * r) for r in support(v)] for s, v in stratum.items()}
    X_t = encode(rows, vocab)
    X = np.repeat(X_t, SUPPORT, axis=0)
    y = np.concatenate([points[sector_for(r.tier)] for r in rows]).astype(np.float32)
    w = np.full(len(y), 1.0 / SUPPORT, dtype=np.float32)
    group = np.repeat(np.arange(len(rows)), SUPPORT)

    if outcomes:
        X_o = encode([o[0] for o in outcomes], vocab)
        y_o = np.array([math.log(o[1]) for o in outcomes], dtype=np.float32)
        w_o = np.full(len(outcomes), OUTCOME_WEIGHT, dtype=np.float32)
        X = np.vstack([X, X_o])
        y = np.concatenate([y, y_o])
        w = np.concatenate([w, w_o])
        group = np.concatenate([group, -1 - np.arange(len(outcomes))])

    return Pool(X, y, w, group, len(rows), len(outcomes))


def fit(p: Pool, mask: np.ndarray | None = None) -> xgb.Booster:
    sel = slice(None) if mask is None else mask
    d = xgb.DMatrix(p.X[sel], label=p.y[sel], weight=p.w[sel], feature_names=list(FEATURES))
    return xgb.train(PARAMS, d, num_boost_round=ROUNDS)


def predict(b: xgb.Booster, X: np.ndarray) -> np.ndarray:
    """(n, 3) multiples of the anchor at p10, p50, p90, sorted per row."""
    raw = b.predict(xgb.DMatrix(X, feature_names=list(FEATURES)))
    raw = np.asarray(raw).reshape(len(X), len(ALPHAS))
    return np.exp(np.sort(raw, axis=1))


def held_out_coverage(p: Pool) -> dict[str, float]:
    """
    Share of held-out labels inside the predicted p10..p90, by sector.

    One tariff row in five is held out, chosen by a hash of its index so the
    split is the same on every build, and the booster is refitted without it.
    What this measures is the quantile fit on rows it did not see; because the
    tariff rows share their labels, it cannot measure per-procedure accuracy,
    and only settled bills will ever be able to.
    """
    held = np.array(
        [int(hashlib.sha256(str(g).encode()).hexdigest(), 16) % 5 == 0 for g in p.group]
    )
    held &= p.group >= 0
    b = fit(p, ~held)
    q = np.log(predict(b, p.X[held]))
    inside = (p.y[held] >= q[:, 0]) & (p.y[held] <= q[:, 2])
    sector = p.X[held][:, FEATURES.index("sector")]
    return {
        name: float(inside[sector == code].mean()) if (sector == code).any() else 0.0
        for name, code in (("urban", 0.0), ("rural", 1.0))
    }


def save(b: xgb.Booster, path: Path) -> None:
    b.save_model(str(path))


def load(path: Path) -> xgb.Booster:
    b = xgb.Booster()
    b.load_model(str(path))
    return b
