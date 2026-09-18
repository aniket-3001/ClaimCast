"""
Run every source module, in order, and say what came out.

Fetching and parsing are separate commands on purpose. `python -m etl.fetch`
touches the network and is the slow, flaky half; this one touches only files
already on disk and verified, so it is reproducible and safe to re-run. The
seed reads etl/out/, never etl/raw/, and never the network.

    python -m etl.fetch     # once, or when a document is re-issued
    python -m etl.build     # after any parser change
"""

from __future__ import annotations

import sys

from etl.sources import (
    arogya_sanjeevani,
    cghs_rates,
    irdai_lists,
    mospi_cpi_health,
    nha_hbp,
    nha_hbp_2022,
    nsso_75_health,
)

MODULES = [
    ("CGHS rates", cghs_rates),
    ("IRDAI Lists I-IV", irdai_lists),
    ("PM-JAY scheme rules", nha_hbp),
    ("PM-JAY package master 2022", nha_hbp_2022),
    ("Arogya Sanjeevani", arogya_sanjeevani),
    ("NSS 75th round health expenditure", nsso_75_health),
    ("CPI health deflator", mospi_cpi_health),
]


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

    failed: list[str] = []
    for title, module in MODULES:
        print(title)
        try:
            module.main()
        except SystemExit as e:
            # A parser that cannot stand behind its output stops itself rather
            # than writing a file. Let the others run, then fail the build.
            print("  FAILED: " + str(e))
            failed.append(title)
        print("")

    if failed:
        print(str(len(failed)) + " of " + str(len(MODULES)) + " failed: " + ", ".join(failed))
        return 1
    print("all " + str(len(MODULES)) + " sources built into etl/out/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
