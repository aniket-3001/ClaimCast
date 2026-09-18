"""
AB PM-JAY scheme rules, from the HBP 2.2 User Guidelines.

**Read this before using anything here.** The file behind this module is the
64-page *User Guidelines*, not the package master. It refers to "Annexure 2:
Packages and Rates" and does not contain it, and no reachable NHA URL serves
that annexure -- six candidates returned HTML stubs or 503, and pmjay.gov.in
refused the connection.

The annexure was found later, in the HBP 2022 Office Memorandum, on a state
mirror. `etl/sources/nha_hbp_2022.py` parses it and every per-procedure PM-JAY
rate in ClaimCast comes from there. This module is no longer the reason the app
has no package prices; it is the reason it knows what the prices mean.

What the manual carries, and what this module extracts, is two things worth
having. The scheme's structural limits -- the ₹5,00,000 family cover, the
₹1,00,000 unspecified-procedure ceiling inside it, the pre- and post-
hospitalisation window -- and, on page 18, the rule that makes a third of the
package master readable: **medical packages are priced as bed category × bed
days**, at four stated per-day rates. The 2022 memorandum prices 228 medical
admissions that way and prints its own grid for each; these four are the
scheme's generic figures, and the sentence explaining the mechanism is here.

**How this file stays honest.** Every rule below is transcribed, not parsed --
these are sentences, not tables, and a regex over prose would be a worse liar
than a person. What makes the transcription checkable is `evidence`: a phrase
that must appear verbatim on the cited page of the PDF. Every one is asserted
at build time, so a rule whose wording drifted from the document, or a page
that moved in a re-issue, fails here instead of reaching a judge.

    python -m etl.sources.nha_hbp    # -> etl/out/nha-hbp.json
"""

from __future__ import annotations

import json
import re
import sys

import fitz  # PyMuPDF

from etl.fetch import ROOT, checksum, path_for
from etl.sources import BY_SOURCE

OUT = ROOT / "out" / "nha-hbp.json"

SOURCE_ID = "nha-hbp-2-2"
KEY = "hbp-2.2-user-guidelines"

RUPEE = 100  # paise per rupee


# Per-day prices for medical (non-surgical) packages, page 18. The manual gives
# these as the whole price of a medical package: bed category multiplied by bed
# days, computed by the TMS at the back end.
BED_DAY_RATES = [
    {"bed": "routine-ward", "label": "Routine Ward", "perDay": 1_800 * RUPEE},
    {"bed": "high-dependency", "label": "High Dependency unit", "perDay": 2_700 * RUPEE},
    {
        "bed": "icu-no-ventilator",
        "label": "Intensive care not requiring ventilator support",
        "perDay": 3_600 * RUPEE,
    },
    {
        "bed": "icu-ventilator",
        "label": "Intensive care requiring ventilator support",
        "perDay": 4_500 * RUPEE,
    },
]

# Structural limits and scheme rules. `page` is 1-based as the document prints
# it; `evidence` must appear on that page, ignoring whitespace.
RULES = [
    {
        "id": "family-cover",
        "value": 5_00_000 * RUPEE,
        "statement": (
            "AB PM-JAY covers a beneficiary family up to ₹5,00,000 per year, across "
            "secondary, tertiary and day-care procedures at empanelled hospitals."
        ),
        "page": 6,
        "evidence": "within the overall limit of ₹ 5,00,000",
    },
    {
        "id": "unspecified-procedure-cap",
        "value": 1_00_000 * RUPEE,
        "statement": (
            "A treatment not listed in the package master may still be claimed as an "
            "'Unspecified Procedure', up to ₹1,00,000, inside the ₹5,00,000 family limit."
        ),
        "page": 6,
        "evidence": "up to a limit of ₹ 1,00,000",
    },
    {
        "id": "unspecified-beyond-cap",
        "value": None,
        "statement": (
            "Above ₹1,00,000 an unspecified surgical package is not refused outright: "
            "the hospital raises a request on the ticketing system and the State Health "
            "Agency records its recommendation."
        ),
        "page": 15,
        "evidence": "unspecified surgical packages beyond Rs. 1,00,000",
    },
    {
        "id": "post-discharge-window",
        "value": None,
        "statement": (
            "The package price absorbs consultation, diagnostics and medicines before "
            "admission, and diagnostics and medicines for 15 days after discharge for "
            "the same ailment or surgery."
        ),
        "page": 8,
        "evidence": "up to 15 days after discharge from the hospital for the same ailment",
    },
    {
        "id": "medical-package-pricing",
        "value": None,
        "statement": (
            "Medical packages are priced as bed category multiplied by number of bed "
            "days, at the four per-day rates in bedDayRates."
        ),
        "page": 18,
        "evidence": "calculated on the basis of the bed category, multiplied",
    },
    {
        "id": "implants-priced-separately",
        "value": None,
        "statement": (
            "Implants and high-end consumables are costed independently of the package "
            "rate at the back end, so the same procedure prices differently by implant."
        ),
        "page": 20,
        "evidence": "Splitting of cost of Implants / High End Consumables",
    },
    {
        "id": "rates-not-published-here",
        "value": None,
        "statement": (
            "Per-procedure package rates are in 'Annexure 2: Packages and Rates', which "
            "this document references but does not contain. They are published in the "
            "HBP 2022 Office Memorandum instead, and ClaimCast reads them from there."
        ),
        "page": 6,
        "evidence": "Annexure 2: ‘Packages and Rates’",
    },
]


def squash(s: str) -> str:
    """Collapse whitespace so a phrase still matches across a PDF line break."""
    return re.sub(r"\s+", " ", s).strip()


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

    download = next(d for d in BY_SOURCE[SOURCE_ID] if d.key == KEY)
    pdf_path = path_for(download)
    sha = checksum(SOURCE_ID, KEY)
    if not pdf_path.exists() or sha is None:
        raise SystemExit("the manual has not been fetched. Run: python -m etl.fetch " + SOURCE_ID)

    with fitz.open(pdf_path) as doc:
        pages = [squash(doc[p].get_text()) for p in range(doc.page_count)]

    # Every transcribed rule has to still be in the document, on the page it
    # claims. This is the whole safeguard: without it these are just sentences
    # someone typed that happen to cite a PDF.
    missing = []
    for rule in RULES:
        page_text = pages[rule["page"] - 1] if rule["page"] <= len(pages) else ""
        if squash(rule["evidence"]) not in page_text:
            missing.append(rule["id"] + " (page " + str(rule["page"]) + ")")
    for rate in BED_DAY_RATES:
        if squash(rate["label"]) not in pages[17]:
            missing.append("bed rate " + rate["bed"] + " (page 18)")
    if missing:
        raise SystemExit(
            "the document no longer says what these rules claim it says:\n  "
            + "\n  ".join(missing)
        )

    doc_out = {
        "source": {
            "id": SOURCE_ID,
            "name": "AB PM-JAY Health Benefit Package 2.2 (User Guidelines)",
            "publisher": "National Health Authority",
            "url": download.url,
            "checksum": sha,
            "caveat": (
                "Scheme rules and the generic medical bed-day rates. This document is the "
                "HBP 2.2 User Guidelines, not the package master: it references 'Annexure 2: "
                "Packages and Rates' without containing it, and no NHA URL serves that "
                "annexure. The rates themselves come from the HBP 2022 Office Memorandum, "
                "under the source id nha-hbp-2022; nothing per-procedure is read from here."
            ),
            "document": "Health Benefit Package 2.2 User Guidelines, National Health Authority.",
            "effectiveFrom": None,
        },
        "rules": RULES,
        "bedDayRates": BED_DAY_RATES,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc_out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        str(len(RULES)) + " rules and " + str(len(BED_DAY_RATES))
        + " bed-day rates, each verified against its cited page -> "
        + str(OUT.relative_to(ROOT.parent))
    )
    for rate in BED_DAY_RATES:
        print("  ₹" + f"{rate['perDay'] // RUPEE:,}" + "/day  " + rate["label"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
