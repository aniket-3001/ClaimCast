"""
The one number that carries 2017-18 rupees to the present.

ClaimCast's cost model is anchored on published government tariffs, which are
current, and calibrated against what households actually paid private hospitals,
which was measured in 2017-18 by the NSS 75th round. Those two are eight years
apart, and the gap is not small: health prices in India rose roughly half again
over that period. So exactly one scalar in the model is a deflator, and this
module is where it comes from, so that it can be argued with rather than assumed.

Two constraints shaped the choice of documents.

**Both ends have to sit on one base.** MoSPI rebased CPI from 2012=100 to
2024=100 with the January 2026 release. Splicing across that break needs a
linking factor published separately, and every splice is an assumption. The
December 2025 release is the last month printed on 2012=100, so both ends of the
deflator are taken from that base and no linking is done. The consequence is
stated rather than hidden: costs come out in December 2025 rupees, not today's.

**The near end is the survey midpoint, not its start.** The NSS 75th round
collected between July 2017 and June 2018. January 2018 is the month that period
straddles at its centre, so that is the index used, and not the first or last
month of the round.

    python -m etl.sources.mospi_cpi_health   # -> etl/out/cpi-health.json
"""

from __future__ import annotations

import json
import re
import sys

import fitz  # PyMuPDF

from etl.fetch import ROOT, checksum, path_for
from etl.sources import BY_SOURCE

OUT = ROOT / "out" / "cpi-health.json"
SOURCE_ID = "mospi-cpi-health"

# Sub-group 6.1.02 in the CPI classification. The code is matched rather than
# the word "Health" alone, because "Health" also appears in prose on these pages.
SUBGROUP = "6.1.02"

# Annexure I prints, in this order: rural weight, rural index for the previous
# month and for this one, then the same triple for urban, then for combined.
# The weights are fixed by the series and identical in both releases, which is
# what makes them usable as a column check: if the three weights do not come
# back 6.83 / 4.81 / 5.89, the columns have moved and every index read off this
# row would be the wrong cell.
WEIGHTS = (6.83, 4.81, 5.89)

READINGS = [
    {
        "key": "cpi-2018-01",
        "label": "January 2018",
        "month": "2018-01",
        "page": 2,
        "why": "midpoint of the NSS 75th round field period",
        "expect": 133.3,
    },
    {
        "key": "cpi-2025-12",
        "label": "December 2025",
        "month": "2025-12",
        "page": 5,
        "why": "last month published on base 2012=100 before the 2024=100 rebase",
        "expect": 204.8,
    },
]


def layout_lines(page: "fitz.Page") -> list[str]:
    """Text as visual rows, so a table row reads left to right in one string."""
    rows: dict[int, list[tuple[float, str]]] = {}
    for x0, y0, _x1, _y1, word, *_ in page.get_text("words"):
        rows.setdefault(round(y0 / 3), []).append((x0, word))
    return [" ".join(w for _, w in sorted(rows[k])) for k in sorted(rows)]


def read_health_row(pdf_path, page_no: int) -> tuple[float, list[float]]:
    with fitz.open(pdf_path) as doc:
        page = doc[page_no - 1]
        lines = layout_lines(page)
        base = any("Base: 2012=100" in ln for ln in lines)
        row = next((ln for ln in lines if ln.strip().startswith(SUBGROUP + " Health")), None)

    if not base:
        raise SystemExit(
            "page " + str(page_no) + " does not declare 'Base: 2012=100'. The series "
            "has been rebased or the page moved; this module refuses to read an index "
            "whose base it cannot see."
        )
    if row is None:
        raise SystemExit("no sub-group " + SUBGROUP + " Health row on page " + str(page_no))

    # The sub-group code leads the row and is itself dotted, so "6.1.02" would
    # otherwise be read as the figure 6.1. Drop the label before counting.
    figures = row.strip()[len(SUBGROUP + " Health"):]
    nums = [float(n) for n in re.findall(r"\d+\.\d+", figures)]
    if len(nums) != 9:
        raise SystemExit(
            "expected 9 figures on the Health row (a weight and two indices for each "
            "of rural, urban and combined) but found " + str(len(nums)) + ": " + row
        )
    got = (nums[0], nums[3], nums[6])
    if got != WEIGHTS:
        raise SystemExit(
            "the Health sub-group weights read as " + str(got) + " but the series "
            "prints " + str(WEIGHTS) + ". The columns are not where this parser "
            "thinks they are, so the indices beside them would be the wrong cells."
        )
    # Column 8 is the combined index for the month the release is about; column 7
    # is the month before, printed as final beside this one's provisional. The
    # later of the two is the reading.
    return nums[8], nums


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

    out = []
    for r in READINGS:
        download = next(d for d in BY_SOURCE[SOURCE_ID] if d.key == r["key"])
        sha = checksum(SOURCE_ID, r["key"])
        pdf = path_for(download)
        if not pdf.exists() or sha is None:
            raise SystemExit(
                "the " + r["label"] + " CPI release has not been fetched. "
                "Run: python -m etl.fetch " + SOURCE_ID
            )
        index, row = read_health_row(pdf, r["page"])
        if abs(index - r["expect"]) > 1e-9:
            raise SystemExit(
                "the Health index for " + r["label"] + " reads " + str(index)
                + " but this module was written against " + str(r["expect"])
                + ". Either the release was revised or the parse is wrong, and both "
                "need a human before the deflator moves."
            )
        out.append(
            {
                "month": r["month"],
                "label": r["label"],
                "why": r["why"],
                "index": index,
                "rural": row[2],
                "urban": row[5],
                "url": download.url,
                "checksum": sha,
                "page": r["page"],
            }
        )

    near, far = out[0], out[1]
    factor = far["index"] / near["index"]

    doc_out = {
        "source": {
            "id": SOURCE_ID,
            "name": "CPI Health sub-group index (base 2012=100)",
            "publisher": "Ministry of Statistics and Programme Implementation",
            "url": far["url"],
            "checksum": far["checksum"],
            "caveat": (
                "Two monthly press releases, not a time series. The deflator is the "
                "ratio of the all-India combined Health sub-group index between "
                + near["label"] + " and " + far["label"] + ", both read off base "
                "2012=100. December 2025 is where it stops because the January 2026 "
                "release rebased the series to 2024=100, and splicing the two needs a "
                "linking factor rather than a division. Every rupee the cost model "
                "states is therefore a December 2025 rupee, and is that much behind "
                "the present."
            ),
            "document": (
                "CPI press releases of 12 February 2018 and 12 January 2026, "
                "Annexure I, sub-group 6.1.02 Health, all-India combined."
            ),
            "effectiveFrom": "2025-12-01",
        },
        "subgroup": SUBGROUP,
        "base": "2012=100",
        "readings": out,
        "factor": round(factor, 6),
        "note": (
            "Multiply a rupee figure measured in the NSS 75th round by `factor` to "
            "state it in December 2025 rupees. Health prices rose "
            + str(round((factor - 1) * 100, 1)) + "% over that span."
        ),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc_out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        "  Health index " + str(near["index"]) + " (" + near["label"] + ")"
        + " -> " + str(far["index"]) + " (" + far["label"] + ")"
    )
    print("  deflator " + str(round(factor, 4)) + " -> " + str(OUT.relative_to(ROOT.parent)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
