"""
Build a versioned cost-model artifact from the ETL output.

The service does not read `etl/out/` at request time. It loads an artifact that
this script wrote, and that artifact carries the checksum of every source it was
built from. So a forecast can always be traced to the exact documents behind it,
and re-running the ETL cannot silently change a number that has already been
shown to someone.

    python -m training.train                        # writes artifacts/<today>.<n>/
    python -m training.train --outcomes bills.json  # the same, retrained on the
                                                    # combined tariff + settled-bill pool
    python -m training.train --check               # rebuilds and diffs against the
                                                    # current artifact without writing

What gets frozen is an XGBoost quantile booster (`booster.json`) and the figures
around it: the fitted multiplier, the survey band its tariff rows are labelled
with, the component split and the provenance of all of it. `claimcast_ml/build.py`
does the work, so that `POST /retrain` in the service builds exactly the same
thing from the snapshot it carries.

`--outcomes` takes a JSON list of settled bills in the shape the API stores them:
`[{"request": {procedureId, cityTier, nabh, roomClass, days, icuDays}, "actual": paise, "at": iso}]`.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Training reads the repository; the service reads the snapshot training writes.
# This has to be set before claimcast_ml is imported, because paths.py resolves its
# root once at import -- otherwise a rebuild would read the artifact it is about to
# replace and every run after the first would be a fixed point.
os.environ["CLAIMCAST_SOURCE_ROOT"] = str(Path(__file__).resolve().parents[3])

from claimcast_ml import build as build_mod  # noqa: E402
from claimcast_ml.paths import SNAPSHOT  # noqa: E402

#: Keys that change on every build and say nothing about what was fitted.
VOLATILE = ("modelVersion", "trainedOn", "builtAt")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--check",
        action="store_true",
        help="rebuild and report whether anything moved, without writing",
    )
    ap.add_argument(
        "--outcomes",
        type=Path,
        help="JSON file of settled bills to train on alongside the tariffs",
    )
    args = ap.parse_args()

    outcomes = (
        build_mod.outcomes_from_json(json.loads(args.outcomes.read_text(encoding="utf-8")))
        if args.outcomes
        else []
    )
    artifact, fitted = build_mod.build(outcomes)
    comparable = {k: v for k, v in artifact.items() if k not in VOLATILE}

    if args.check:
        live = build_mod.current()
        if live is None:
            print("no artifact to check against; run without --check to build one")
            return 1
        have = json.loads((live / "model.json").read_text(encoding="utf-8"))
        before = {k: v for k, v in have.items() if k not in VOLATILE}
        if before == comparable:
            print("artifact " + have["modelVersion"] + " is up to date with the ETL output")
            return 0
        moved = [k for k in comparable if before.get(k) != comparable[k]]
        print("artifact " + have["modelVersion"] + " is stale; these would change: " + ", ".join(moved))
        return 1

    out = build_mod.write(artifact, fitted)
    b = artifact["booster"]
    print("wrote " + str(out / "model.json") + " and " + str(out / b["file"]))
    print("  snapshot              " + str(len(SNAPSHOT)) + " source files frozen under " + str(out / "data"))
    print("  booster               " + b["library"] + ", " + b["objective"] + " at "
          + ", ".join(format(q, ".2f") for q in b["quantiles"]) + ", "
          + str(b["rounds"]) + " rounds, depth " + str(b["maxDepth"]))
    print("  training rows         " + format(b["trainingRows"]["tariff"], ",") + " tariff rows ("
          + format(b["trainingRows"]["labels"], ",") + " labels), "
          + str(b["trainingRows"]["outcomes"]) + " settled bills, "
          + str(b["trainingRows"]["outcomesDropped"]) + " dropped")
    print("  held-out coverage     " + ", ".join(
        k + " " + format(v * 100, ".1f") + "%" for k, v in sorted(b["heldOutCoverage"].items())
    ) + " (nominal 80%)")
    print("  multiplier            " + format(artifact["multiplier"]["value"], ".3f")
          + "x tariff, from " + artifact["multiplier"]["estimatedFrom"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
