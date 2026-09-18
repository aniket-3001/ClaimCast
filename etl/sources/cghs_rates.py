"""
Annexure I of the CGHS Office Memorandum -- 1,998 published procedure rates.

This is the one real per-procedure price list in the project, and it turned out
to be a better document than the plan assumed. The file that could be retrieved
is not a 2023 city list but OM F.No. 5-16/CGHS(HQ)/HEC/2024(PartI) of 3 October
2025, issued "in supersession of all previous memoranda" -- the schedule in
force nationally. So the CGHS caveat goes from "no rate document retrieved" to
"mirror-hosted copy of the current OM". It does not go away: see the note in
etl/sources/__init__.py for why the copy is a Delhi Jal Board mirror.

**What the table actually is.** Every printed rate is one cell in a grid the OM
only fills in once: semi-private ward, in an X (Tier I) city. The three columns
are the accreditation axis -- non-NABH, NABH, super-speciality -- and those are
read, never derived. The super-speciality column is 1.15x NABH on 482 rows and
equal to NABH on the other 1,516, because the 15% uplift applies only within a
hospital's own super-specialities; a parser that computed it would invent 1,516
wrong numbers.

The rest of the grid is arithmetic the OM states in prose, captured in RULES
below. Annexure I announces itself as "divided into three parts, A Tier 1, B
Tier 2, C Tier III cities" and then prints only part A -- parts B and C do not
exist in the document, because the 10% and 20% reductions replace them. Worth
knowing before someone goes looking for the missing pages.

    python -m etl.sources.cghs_rates    # -> etl/out/cghs-rates.json
"""

from __future__ import annotations

import json
import logging
import re
import sys
from pathlib import Path

# pdfplumber's backend logs "CropBox missing from /Page" for all 124 pages.
# It is true and it does not matter, and it drowns anything that does.
logging.getLogger("pdfminer").setLevel(logging.ERROR)
logging.getLogger("pdfplumber").setLevel(logging.ERROR)

import pdfplumber  # noqa: E402

from etl.fetch import ROOT, checksum, path_for  # noqa: E402
from etl.sources import BY_SOURCE  # noqa: E402

OUT = ROOT / "out" / "cghs-rates.json"

SOURCE_ID = "cghs-rates"
KEY = "cghs-om-2025-10-03"

# Annexure I runs from the method note to the start of Annexure-II. Page numbers
# are 0-based and were read off the document, not guessed; the page count is
# asserted below so a re-issued OM with different pagination fails loudly.
FIRST_PAGE = 4
ANNEXURE_END = 109

# A CGHS code: two to four letters then three digits -- CN001, LB001, DP035.
# Used as the test for "is this row a rate or is it prose", because Annexure I
# sets its explanatory paragraphs in the same table grid as the rates.
CODE = re.compile(r"^[A-Z]{2,4}\d{3}[A-Za-z]?$")

# Everything the OM says about how a printed rate becomes a payable one. Kept
# here as data rather than prose so the engine and the deck read the same
# numbers, and so a change in the next OM is a diff rather than a reread.
RULES = {
    "basis": {
        "ward": "semi-private",
        "cityTier": "X",
        "note": (
            "Every rate in this file is the semi-private, Tier I figure. "
            "Everything else is derived."
        ),
    },
    # Ward entitlement, from the method note on page 5 of the OM.
    "wardFactor": {"general": 0.95, "semiPrivate": 1.00, "private": 1.05},
    # City classification, from clause (c) of the covering memorandum. Y rates
    # also apply to the North-East, the Union Territories, Jammu & Kashmir and
    # Ladakh regardless of the city's own tier.
    "cityFactor": {"X": 1.00, "Y": 0.90, "Z": 0.80},
    "yAlsoApplies": [
        "North-East region",
        "Union Territories",
        "Jammu & Kashmir",
        "Ladakh",
    ],
    # X (Tier I) cities, all as urban agglomerations, per DoE OM No. 2/5/2017-E.II(B).
    "tierXCities": [
        "Hyderabad (UA)",
        "Delhi (UA)",
        "Ahmedabad (UA)",
        "Bengaluru (UA)",
        "Mumbai (UA)",
        "Pune (UA)",
        "Chennai (UA)",
        "Kolkata (UA)",
    ],
    # Categories the OM pays at one rate whatever the ward entitlement.
    "wardInvariantSpecialtyKeywords": [
        "Consultation",
        "Investigation",
        "Radiotherapy",
        "Chemotherapy",
        "Physiotherapy",
    ],
    # A second procedure inside the same package period is paid at 75%.
    "subsequentProcedureFactor": 0.75,
    "citation": (
        "CGHS OM F.No. 5-16/CGHS(HQ)/HEC/2024(PartI), 3 October 2025, "
        "effective 13 October 2025, in supersession of all previous memoranda."
    ),
}


def paise(cell: str | None) -> int:
    """A printed rupee figure to integer paise. Money never becomes a float."""
    return int((cell or "").replace(",", "").strip()) * 100


def clean(cell: str | None) -> str:
    """Table cells wrap mid-word with a newline; the document means one string."""
    return re.sub(r"\s+", " ", (cell or "").replace("\n", " ")).strip()


def rows(pdf_path: Path) -> list[dict]:
    out: list[dict] = []
    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) < ANNEXURE_END:
            raise SystemExit(
                "expected at least "
                + str(ANNEXURE_END)
                + " pages, got "
                + str(len(pdf.pages))
                + " -- this is not the OM this parser was written for"
            )
        for n in range(FIRST_PAGE, ANNEXURE_END):
            for table in pdf.pages[n].extract_tables():
                for r in table:
                    if len(r) != 7:
                        continue
                    code = clean(r[1])
                    if not CODE.match(code):
                        continue  # a header repeat or a paragraph set in the grid
                    out.append(
                        {
                            "code": code,
                            "name": clean(r[2]),
                            "specialty": clean(r[6]),
                            "nonNabh": paise(r[3]),
                            "nabh": paise(r[4]),
                            "superSpecialty": paise(r[5]),
                            "page": n + 1,
                        }
                    )
    return out


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

    download = next(d for d in BY_SOURCE[SOURCE_ID] if d.key == KEY)
    pdf_path = path_for(download)
    sha = checksum(SOURCE_ID, KEY)
    if not pdf_path.exists() or sha is None:
        raise SystemExit("the OM has not been fetched. Run: python -m etl.fetch " + SOURCE_ID)

    rates = rows(pdf_path)

    # Two things worth failing on rather than shipping quietly. A duplicate code
    # means the page loop double-counted a table; a collapse in the row count
    # means the document changed shape underneath the page numbers above.
    seen = [r["code"] for r in rates]
    dupes = sorted({c for c in seen if seen.count(c) > 1})
    if dupes:
        raise SystemExit("duplicate CGHS codes: " + ", ".join(dupes[:10]))
    if len(rates) < 1900:
        raise SystemExit("only " + str(len(rates)) + " rates parsed -- expected ~1,998")

    doc = {
        "source": {
            "id": SOURCE_ID,
            "name": "CGHS rate list (Annexure I)",
            "publisher": "Central Government Health Scheme, Ministry of Health and Family Welfare",
            "url": download.url,
            "checksum": sha,
            "caveat": (
                "Retrieved from a Delhi Jal Board mirror of the CGHS Office Memorandum, "
                "not from a CGHS domain: cghs.gov.in did not resolve and cghs.mohfw.gov.in "
                "is banner-marked a test environment with its rate-list links disabled."
            ),
            "document": RULES["citation"],
            "effectiveFrom": "2025-10-13",
        },
        "rules": RULES,
        "rates": rates,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    specialties = sorted({r["specialty"] for r in rates})
    print(
        str(len(rates))
        + " rates, "
        + str(len(specialties))
        + " specialties -> "
        + str(OUT.relative_to(ROOT.parent))
    )
    for code in ("CN001", "LB001", "DP035"):
        r = next((x for x in rates if x["code"] == code), None)
        if r:
            print(
                "  "
                + code
                + "  "
                + r["name"][:52]
                + "  non-NABH "
                + str(r["nonNabh"] // 100)
                + " / NABH "
                + str(r["nabh"] // 100)
                + " / SS "
                + str(r["superSpecialty"] // 100)
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
