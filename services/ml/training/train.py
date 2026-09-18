"""
Build a versioned cost-model artifact from the ETL output.

The service does not read `etl/out/` at request time. It loads an artifact that
this script wrote, and that artifact carries the checksum of every source it was
built from. So a forecast can always be traced to the exact documents behind it,
and re-running the ETL cannot silently change a number that has already been
shown to someone.

    python -m training.train              # writes artifacts/<today>/model.json
    python -m training.train --check      # rebuilds and diffs against the current
                                          # artifact without writing anything

There is no model file in the machine-learning sense because there is no model in
the machine-learning sense: no weights, no trees, no training loop. What gets
frozen is one fitted scalar, two empirical quantile sets, a component split and
the provenance of all of it. The reasons are in `multiplier.py` and
`dispersion.py`, and they are reasons about the data rather than about effort.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import date, timezone, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Training reads the repository; the service reads the snapshot training writes.
# This has to be set before claimcast_ml is imported, because paths.py resolves its
# root once at import -- otherwise a rebuild would read the artifact it is about to
# replace and every run after the first would be a fixed point.
os.environ["CLAIMCAST_SOURCE_ROOT"] = str(Path(__file__).resolve().parents[3])

from claimcast_ml import dispersion, multiplier, procedures, split, survey  # noqa: E402
from claimcast_ml.paths import ARTIFACTS, ETL_OUT, ROOT, SNAPSHOT  # noqa: E402

#: The ETL outputs a forecast depends on, and what each one supplies.
SOURCES = {
    "nsso-75-health.json": "the level, the band and the component split",
    "cpi-health.json": "the deflator from 2017-18 to December 2025 rupees",
    "nha-hbp-2022.json": "the PM-JAY package price that anchors each forecast",
    "cghs-rates.json": "the CGHS rate, for procedures PM-JAY does not package",
}


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


def build() -> dict:
    s = survey.load()
    m = multiplier.estimate(s)
    band = dispersion.fit(s.state_ratio, s.quintile_ratio)
    shares = {sector: split.shares(s.component_share[sector]) for sector in s.component_share}

    implants = {
        pid: sorted(o[1] for o in p["implantOptions"])
        for pid, p in procedures.procedures().items()
        if p["implantOptions"]
    }

    return {
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
                "quantile anywhere."
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


def current() -> Path | None:
    """The newest artifact directory, which is the one the service loads."""
    if not ARTIFACTS.exists():
        return None
    dirs = sorted(d for d in ARTIFACTS.iterdir() if (d / "model.json").is_file())
    return dirs[-1] if dirs else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--check",
        action="store_true",
        help="rebuild and report whether anything moved, without writing",
    )
    args = ap.parse_args()

    artifact = build()
    comparable = {k: v for k, v in artifact.items() if k not in ("modelVersion", "trainedOn", "builtAt")}

    if args.check:
        live = current()
        if live is None:
            print("no artifact to check against; run without --check to build one")
            return 1
        have = json.loads((live / "model.json").read_text(encoding="utf-8"))
        before = {k: v for k, v in have.items() if k not in ("modelVersion", "trainedOn", "builtAt")}
        if before == comparable:
            print("artifact " + have["modelVersion"] + " is up to date with the ETL output")
            return 0
        moved = [k for k in comparable if before.get(k) != comparable[k]]
        print("artifact " + have["modelVersion"] + " is stale; these would change: " + ", ".join(moved))
        return 1

    out = ARTIFACTS / artifact["modelVersion"]
    out.mkdir(parents=True, exist_ok=True)
    (out / "model.json").write_text(
        json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    band = artifact["dispersion"]

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
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)

    print("wrote " + str(out / "model.json"))
    print("  snapshot              " + str(len(SNAPSHOT)) + " source files frozen under " + str(out / "data"))
    print("  multiplier            " + format(artifact["multiplier"]["value"], ".3f")
          + "x tariff, from " + artifact["multiplier"]["estimatedFrom"])
    for sector in sorted(band["quantiles"]):
        q = band["quantiles"][sector]
        print("  band " + sector.ljust(6)
              + "  p10 " + format(q["0.10"], ".3f")
              + "  p50 " + format(q["0.50"], ".3f")
              + "  p90 " + format(q["0.90"], ".3f")
              + "   held-out coverage " + format(band["coverage"][sector] * 100, ".1f") + "%"
              + "   lognormal gap " + format(band["lognormalGap"][sector], ".3f"))
    for sector in sorted(artifact["split"]["shares"]):
        sh = artifact["split"]["shares"][sector]
        print("  split " + sector.ljust(5) + " "
              + "  ".join(k + " " + format(v * 100, ".1f") + "%"
                          for k, v in sh.items() if v > 0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
