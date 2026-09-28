"""
Build a versioned cost-model artifact, with or without settled bills.

Two callers, one function. `training/train.py` runs it from the repository to
build the artifact an image ships with; `POST /retrain` runs it inside the
service, from the snapshot the running artifact carries, on the combined pool of
published tariffs and every settled bill the API hands it. Either way the result
is a new version directory -- the figures, the booster, and the documents they
came from -- and the version a forecast reports names exactly one of them.

**Why a retrain is a new version and not an update.** A figure shown to someone
has to stay traceable to what produced it. Settled bills change what the booster
learned, so they change the version; the artifact records how many bills went in
and the newest one's timestamp, and `calibration.py` only ever corrects a forecast
with bills newer than that, so no bill is counted twice.
"""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

from . import booster, dispersion, multiplier, procedures, split, survey, tariff
from .calibration import USABLE
from .paths import ARTIFACTS, ETL_OUT, ROOT, SNAPSHOT, version_key

#: The ETL outputs a forecast depends on, and what each one supplies.
SOURCES = {
    "nsso-75-health.json": "the band the tariff rows are labelled with, and the component split",
    "cpi-health.json": "the deflator from 2017-18 to December 2025 rupees",
    "nha-hbp-2022.json": "the PM-JAY package prices: training rows, and the anchor of each forecast",
    "cghs-rates.json": "the CGHS rates: training rows, and the anchor where PM-JAY has no package",
}


@dataclass(frozen=True)
class Outcome:
    """A settled bill, as the API stores it."""

    procedure_id: str
    city_tier: str
    nabh: bool
    room_class: str
    days: int
    icu_days: int
    actual: int
    at: str | None


def _provenance() -> dict:
    out = {}
    for name, supplies in SOURCES.items():
        doc = json.loads((ETL_OUT / name).read_text(encoding="utf-8"))
        src = doc.get("source", {})
        out[name] = {
            "id": src.get("id"),
            "name": src.get("name"),
            "publisher": src.get("publisher"),
            "url": src.get("url"),
            "checksum": src.get("checksum"),
            "fetchedAt": src.get("fetchedAt"),
            "supplies": supplies,
        }
        if not src.get("checksum"):
            raise SystemExit(
                name + " carries no checksum. Every figure in a forecast has to be "
                "traceable to the document it came from, so an artifact is not built "
                "from an un-checksummed source."
            )
    return out


def _implant_mid(procedure_id: str, implants: dict[str, list[int]]) -> int:
    options = implants.get(procedure_id, [])
    return round((options[0] + options[-1]) / 2) if options else 0


def outcome_rows(
    outcomes: list[Outcome],
    implants: dict[str, list[int]],
    prior_median: dict[str, float],
) -> tuple[list[tuple[booster.Row, float]], int]:
    """
    Settled bills as training rows: (the anchored row, the observed multiple).

    A bill whose multiple is outside `calibration.USABLE` of the prior median for
    its sector is dropped, for the reason `calibration.py` gives: rupees typed
    where paise were asked for is far likelier than a real 8x miss.
    """
    rows: list[tuple[booster.Row, float]] = []
    dropped = 0
    for o in outcomes:
        try:
            a = tariff.anchor_for(o.procedure_id, o.city_tier, o.nabh, o.room_class, o.days, o.icu_days)
        except (SystemExit, KeyError):
            dropped += 1
            continue
        body = o.actual - _implant_mid(o.procedure_id, implants)
        if a.amount <= 0 or body <= 0:
            dropped += 1
            continue
        multiple = body / a.amount
        rel = multiple / prior_median[survey.sector_for(o.city_tier)]
        if not USABLE[0] <= rel <= USABLE[1]:
            dropped += 1
            continue
        rows.append((
            booster.Row(a.amount, a.scheme, tariff.specialty_of(a), o.city_tier, o.nabh),
            multiple,
        ))
    return rows, dropped


def build(outcomes: list[Outcome] | None = None) -> tuple[dict, "booster.xgb.Booster"]:
    outcomes = outcomes or []
    s = survey.load()
    m = multiplier.estimate(s)
    band = dispersion.fit(s.state_ratio, s.quintile_ratio)
    shares = {sector: split.shares(s.component_share[sector]) for sector in s.component_share}

    implants = {
        pid: sorted(o[1] for o in p["implantOptions"])
        for pid, p in procedures.procedures().items()
        if p["implantOptions"]
    }

    stratum = {
        sector: [a * b for a in s.state_ratio[sector] for b in s.quintile_ratio[sector]]
        for sector in s.state_ratio
    }
    prior_median = {sector: m.value * dispersion.quantile(v, 0.5) for sector, v in stratum.items()}

    vocab = booster.vocabulary()
    rows = booster.tariff_rows()
    settled, dropped = outcome_rows(outcomes, implants, prior_median)
    p = booster.pool(rows, vocab, m.value, stratum, settled)
    coverage = booster.held_out_coverage(p)
    fitted = booster.fit(p)

    stamps = [o.at for o in outcomes if o.at]
    artifact = {
        "modelVersion": _version(),
        "trainedOn": date.today().isoformat(),
        "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "multiplier": {
            "value": m.value,
            "estimatedFrom": multiplier.ESTIMATED_FROM,
            "byCategory": m.by_category,
            "denominator": m.denominator,
            "basis": m.basis,
        },
        "booster": {
            "file": "booster.json",
            "library": "xgboost " + booster.xgb.__version__,
            "objective": booster.PARAMS["objective"],
            "quantiles": [float(a) for a in booster.ALPHAS],
            "features": list(booster.FEATURES),
            "vocabulary": vocab,
            "rounds": booster.ROUNDS,
            "maxDepth": booster.PARAMS["max_depth"],
            "learningRate": booster.PARAMS["learning_rate"],
            "support": booster.SUPPORT,
            "outcomeWeight": booster.OUTCOME_WEIGHT,
            "trainingRows": {
                "tariff": p.tariff_rows,
                "labels": int(len(p.y)),
                "outcomes": p.outcome_rows,
                "outcomesDropped": dropped,
            },
            "heldOutCoverage": coverage,
            "basis": (
                "XGBoost quantile regression (p10, p50, p90) of the private charge as a "
                "multiple of the published tariff, over " + format(p.tariff_rows, ",")
                + " tariff rows -- every numerically priced PM-JAY HBP 2022 package and "
                "every CGHS rate, at each city tier -- labelled with the survey's "
                "state-by-quintile spread around the fitted multiplier, plus "
                + str(p.outcome_rows) + (" settled bill" if p.outcome_rows == 1 else " settled bills")
                + " weighted " + format(booster.OUTCOME_WEIGHT, ".0f") + "x. Held-out "
                "coverage of p10-to-p90 on one tariff row in five is "
                + ", ".join(k + " " + format(v * 100, ".0f") + "%" for k, v in sorted(coverage.items()))
                + " against a nominal 80%. Until bills are reported the tariff rows "
                "share their labels, so the range is the survey's and the same for "
                "every procedure; only settled bills make it procedure-specific."
            ),
        },
        "outcomes": {"n": p.outcome_rows, "through": max(stamps) if stamps else None},
        "dispersion": {
            "quantiles": band.quantiles,
            "lognormal": band.lognormal,
            "lognormalGap": band.lognormal_gap,
            "coverage": band.coverage,
            "points": band.points,
            "basis": (
                "Ratios of each state's and each household expenditure quintile's "
                "private-hospital mean to its own all-India figure (NSS 75th round, "
                "Tables A17, A18 and A29), combined across the two axes on an "
                "assumption of independence. These are spreads between stratum means, "
                "not between individual bills; the survey publishes no patient-level "
                "quantile anywhere. They are the labels the booster's tariff rows carry."
            ),
        },
        "split": {
            "shares": shares,
            "basis": (
                "NSS Statement 3.17, private hospitals, by sector. The bundled "
                "`package` component -- 40% of the urban private bill -- is not "
                "itemised by the survey and is redistributed across the itemised "
                "components in their own proportions."
            ),
        },
        "implantOptions": implants,
        "deflator": {
            "factor": s.deflator.factor,
            "from": s.deflator.frm,
            "to": s.deflator.to,
            "basis": s.deflator.basis,
        },
        "surveyPeriod": s.survey_period,
        "excludes": (
            "The survey's expenditure figures exclude childbirth, which is carried "
            "separately, and exclude transport, food and lodging throughout."
        ),
        "sources": _provenance(),
    }
    return artifact, fitted


def _version() -> str:
    """
    A version that says when, and disambiguates two builds on the same day.

    Artifacts are directories named for the version, so the next free suffix is
    simply the first one that does not already exist.
    """
    today = date.today().isoformat()
    n = 1
    while (ARTIFACTS / (today + "." + str(n))).exists():
        n += 1
    return today + "." + str(n)


def write(artifact: dict, fitted, root: Path | None = None) -> Path:
    """Write the artifact, its booster and the snapshot of every file it read."""
    out = (root or ARTIFACTS) / artifact["modelVersion"]
    out.mkdir(parents=True, exist_ok=True)
    booster.save(fitted, out / artifact["booster"]["file"])
    (out / "model.json").write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # The inputs, frozen beside the figures fitted from them. The service reads
    # these and not the repository, so the artifact is the whole of what a running
    # container knows and a version number identifies a set of documents rather
    # than a moment in someone's working tree.
    for relative in SNAPSHOT:
        src = ROOT / relative
        if not src.is_file():
            raise SystemExit(
                str(src) + " is missing. The forecast reads it at request time, so an "
                "artifact built without it would serve until the first request and fail "
                "on it."
            )
        dst = out / "data" / relative
        if src.resolve() == dst.resolve():
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
    return out


def current(root: Path | None = None) -> Path | None:
    """The newest artifact directory, which is the one the service loads."""
    root = root or ARTIFACTS
    if not root.exists():
        return None
    dirs = sorted((d for d in root.iterdir() if (d / "model.json").is_file()), key=version_key)
    return dirs[-1] if dirs else None


def outcomes_from_json(rows: list[dict]) -> list[Outcome]:
    """Settled bills in the shape `POST /retrain` and `--outcomes` accept."""
    out = []
    for r in rows:
        q = r["request"]
        out.append(Outcome(
            procedure_id=q["procedureId"],
            city_tier=q["cityTier"],
            nabh=bool(q["nabh"]),
            room_class=q["roomClass"],
            days=int(q["days"]),
            icu_days=int(q["icuDays"]),
            actual=int(r["actual"]),
            at=r.get("at"),
        ))
    return out

