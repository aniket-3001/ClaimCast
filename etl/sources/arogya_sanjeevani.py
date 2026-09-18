"""
Arogya Sanjeevani -- the policy IRDAI wrote itself.

Every other policy in ClaimCast is modelled. This one is not: Arogya Sanjeevani
is a standard product whose terms the regulator prescribes, so an insurer may
not vary them. That makes it the only policy in the app whose room cap, ICU cap,
co-pay and proportionate-deduction rule are quotable rather than plausible, and
it is the right thing to show a judge who asks where the numbers come from.

The most valuable line in the document is on page 143:

    "In case Room/ICU/ICCU rent exceeds the limits specified the claim shall be
    subject to the proportionate deduction."

That single sentence is the mechanism the whole journey screen exists to
explain, in the regulator's own words, attached to a real product. Page 143 is
the Customer Information Sheet, which states the same terms as the policy
wording in one page, so the clause text below is quoted from there.

Terms are transcribed and then checked against the PDF, the same way as
etl/sources/nha_hbp.py: each clause names the page it came from and a phrase
that must appear there. The one field that is *not* quoted is the pre-existing
disease waiting period, which the Arogya Sanjeevani section does not restate --
it inherits the standard Excl01 definition of forty-eight months, and it is
marked below as inherited rather than quoted.

    python -m etl.sources.arogya_sanjeevani    # -> etl/out/arogya-sanjeevani.json
"""

from __future__ import annotations

import json
import re
import sys

import fitz  # PyMuPDF

from etl.fetch import ROOT, checksum, path_for
from etl.sources import BY_SOURCE

OUT = ROOT / "out" / "arogya-sanjeevani.json"

SOURCE_ID = "arogya-sanjeevani"
KEY = "master-circular-standardization-2020"

RUPEE = 100

# The standard product as a Policy row. Sum insured is the prescribed maximum;
# the circular sets the range at ₹1,00,000 to ₹5,00,000 in multiples of fifty
# thousand, and the app opens on the top of that range because that is the
# version most comparable to the modelled policies beside it.
POLICY = {
    "id": "pol-arogya-sanjeevani",
    "insurer": "IRDAI standard product",
    "product": "Arogya Sanjeevani Policy",
    "sumInsured": 5_00_000 * RUPEE,
    "sumInsuredMin": 1_00_000 * RUPEE,
    "sumInsuredMax": 5_00_000 * RUPEE,
    "roomCapPerDay": 5_000 * RUPEE,
    "roomCapPctOfSI": 0.02,
    "icuCapPerDay": 10_000 * RUPEE,
    "icuCapPctOfSI": 0.05,
    "proportionateDeduction": True,
    "copayPct": 0.05,
    "implantSubLimit": None,
    "preHospDays": 30,
    "postHospDays": 60,
    "dayCareCovered": True,
    "monthsInForce": 0,
    "pedWaitingMonths": 48,
    # NOT from this circular. The Master Circular of 29 May 2024 supersedes the
    # 2020 one and resets the moratorium to "60 months of continuous coverage",
    # in its own words, so the eight years printed on page 107 below is no
    # longer the live figure. The clause is still transcribed, because the app
    # shows what the document said and this file's job is to be faithful to it;
    # the Policy row carries the figure in force.
    "moratoriumMonths": 60,
    "notes": (
        "Terms prescribed by IRDAI, not set by the insurer. Every figure here is "
        "quoted from the Master Circular of 22 July 2020 except two. The "
        "pre-existing waiting period is inherited from standard exclusion Excl01, "
        "which that section does not restate. The moratorium is 60 months, set by "
        "the Master Circular of 29 May 2024, which supersedes the 2020 circular; "
        "the standard products are expressly carried forward, so the product "
        "stands while the document it was quoted from does not."
    ),
}

# Clause rows. `cite` is what the app prints beside a deduction; `text` is the
# document's own wording, lightly normalised for whitespace; `evidence` is the
# phrase asserted to be on `page`.
CLAUSES = [
    {
        "id": "as-room-cap",
        "cite": "Arogya Sanjeevani, Customer Information Sheet, Loss sharing 6(a)(i)(a)",
        "text": "Room Rent - Up to 2% of SI, subject to max of INR 5,000 per day.",
        "page": 143,
        "evidence": "Room Rent - Up to 2% of SI, subject to max of INR 5,000 per day",
    },
    {
        "id": "as-icu-cap",
        "cite": "Arogya Sanjeevani, Customer Information Sheet, Loss sharing 6(a)(i)(b)",
        "text": "ICU charges - Up to 5% of SI subject to max of INR 10,000 per day.",
        "page": 143,
        "evidence": "ICU charges - Up to 5% of SI subject to max of INR 10,000 per day",
    },
    {
        "id": "as-proportionate-deduction",
        "cite": "Arogya Sanjeevani, Customer Information Sheet, Loss sharing 6(a)(i)(c)",
        "text": (
            "In case Room/ICU/ICCU rent exceeds the limits specified the claim shall be "
            "subject to the proportionate deduction."
        ),
        "page": 143,
        "evidence": "the claim shall be subject to the proportionate deduction",
    },
    {
        "id": "as-copay",
        "cite": "Arogya Sanjeevani, Customer Information Sheet, Loss sharing 6(b)",
        "text": (
            "Each and every claim under the Policy shall be subject to a Copayment of 5% "
            "applicable to claim amount admissible and payable as per the terms and "
            "conditions of the Policy."
        ),
        "page": 143,
        "evidence": "subject to a Copayment of 5% applicable to claim amount admissible",
    },
    {
        "id": "as-cataract-sublimit",
        "cite": "Master Circular, Arogya Sanjeevani, Para C.13",
        "text": (
            "Limits on cataract Surgery: expenses incurred on treatment of Cataract shall "
            "be covered up to 25% of Sum insured or Rs.40,000/- whichever is lower, per eye."
        ),
        "page": 111,
        "evidence": "Rs.40,000/- whichever is lower, per eye",
    },
    {
        "id": "as-sum-insured-range",
        "cite": "Master Circular, Arogya Sanjeevani, Para 7",
        "text": (
            "The minimum sum insured under the standard product shall be Rs 1,00,000/-. "
            "Maximum limit shall be Rs 5 lakhs, in multiples of fifty thousand."
        ),
        "page": 111,
        "evidence": "minimum sum insured under standard product shall be Rs 1,00,000",
    },
    {
        "id": "as-pre-post-hospitalisation",
        "cite": "Master Circular, Arogya Sanjeevani, Paras 11 and 12",
        "text": (
            "Pre-hospitalisation medical expenses incurred for 30 days prior to the date of "
            "hospitalisation are admissible, and post-hospitalisation medical expenses for "
            "60 days from the date of discharge following an admissible claim are included."
        ),
        "page": 109,
        "evidence": "period of 60 days from the date of discharge",
    },
    {
        "id": "as-ayush",
        "cite": "Master Circular, Arogya Sanjeevani, Para 10",
        "text": (
            "Expenses incurred on hospitalisation under AYUSH systems of medicine shall be "
            "covered without any sub-limits."
        ),
        "page": 109,
        "evidence": "systems of medicine shall be covered without any sub-limits",
    },
    {
        "id": "as-moratorium",
        "cite": "Master Circular, Standard wordings, Moratorium Period",
        "text": (
            "After completion of eight continuous years under the policy no look back to be "
            "applied. This period of eight years is called as moratorium period."
        ),
        "page": 107,
        "evidence": "This period of eight years is called as moratorium period",
    },
]


def squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

    download = next(d for d in BY_SOURCE[SOURCE_ID] if d.key == KEY)
    pdf_path = path_for(download)
    sha = checksum(SOURCE_ID, KEY)
    if not pdf_path.exists() or sha is None:
        raise SystemExit("the circular has not been fetched. Run: python -m etl.fetch " + SOURCE_ID)

    with fitz.open(pdf_path) as doc:
        pages = [squash(doc[p].get_text()) for p in range(doc.page_count)]

    missing = [
        c["id"] + " (page " + str(c["page"]) + ")"
        for c in CLAUSES
        if squash(c["evidence"]) not in (pages[c["page"] - 1] if c["page"] <= len(pages) else "")
    ]
    if missing:
        raise SystemExit(
            "the circular no longer says what these clauses claim it says:\n  "
            + "\n  ".join(missing)
        )

    doc_out = {
        "source": {
            "id": SOURCE_ID,
            "name": "Arogya Sanjeevani standard product",
            "publisher": "Insurance Regulatory and Development Authority of India",
            "url": download.url,
            "checksum": sha,
            "caveat": (
                "Superseded document, product still in force. The Master Circular of "
                "29 May 2024 lists this circular in its Annexure-6 and supersedes it, "
                "but carries the standard products forward expressly, so Arogya "
                "Sanjeevani remains the mandated standard individual health product "
                "and these are still its prescribed terms. One figure has moved since: "
                "the moratorium is now 60 months, not eight years, and the Policy row "
                "carries the current figure while the clause below quotes what this "
                "document says."
            ),
            "document": (
                "IRDAI/HLT/REG/CIR/193/07/2020, 22 July 2020, Master Circular on "
                "Standardization of Health Insurance Products."
            ),
            "effectiveFrom": "2020-07-22",
        },
        "policy": POLICY,
        "clauses": [{k: v for k, v in c.items() if k != "evidence"} for c in CLAUSES],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc_out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        "1 policy and " + str(len(CLAUSES))
        + " clauses, each verified against its cited page -> "
        + str(OUT.relative_to(ROOT.parent))
    )
    for c in CLAUSES:
        print("  p" + str(c["page"]).rjust(3) + "  " + c["id"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
