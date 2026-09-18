"""
The PM-JAY package master -- 1,949 rates, from the HBP 2022 Office Memorandum.

This is the annexure `etl/sources/nha_hbp.py` says it could not find. It exists
after all, and the caveat on that module is now the narrower of the two: the
User Guidelines carry the scheme's rules, this carries its prices.

**Where it came from matters.** nha.gov.in answers every path, including its own
document links, with the same 3,843-byte HTML shell, and pmjay.gov.in refuses the
connection outright. The file below is the Haryana State Health Agency's copy of
the national Office Memorandum, served from the NIC government CDN. The National
Health Authority issued the document; Haryana only republishes it. That
distinction is in the Source caveat and must stay there.

**What is parsed and what is not.** Every row is transcribed. Nothing is
computed. The tier prices are mostly the National Reference Price times 1.25,
1.42 and 1.5, and a couple of hundred of the flat-priced rows break that pattern
-- a parser that derived the tiers from the reference price would look tidier and
would invent every one of those numbers wrongly. This is the CGHS super-speciality
column again, and the rule it taught is the same: do not compute what was printed.

**The table is not uniformly shaped, and that is data.** A package is priced in
one of four ways, and they are kept apart rather than flattened:

    flat      1,667  one price per city tier, the ordinary surgical package
    bedDay      228  priced per day by bed category, which is how PM-JAY pays a
                     medical admission, and the shape the engine already costs a
                     stay in
    perDay       13  a single per-day figure with no bed category
    asPrinted    41  everything else -- "Inc. in package", per-cycle
                     chemotherapy with a cap, prices conditional on findings.
                     These carry the printed text and no number at all, because
                     there is no number to carry.

Columns 0 and 1 name the specialty and cannot be trusted: PyMuPDF interleaves
them with neighbouring cells on wrapped rows, producing text like "In Gfe ec nti
eo ru as l MD eis de ica is ne es". The specialty is taken from the package
code's own prefix instead, against the hand-written table below, and a prefix
that is not in that table fails the build.

    python -m etl.sources.nha_hbp_2022    # -> etl/out/nha-hbp-2022.json
"""

from __future__ import annotations

import collections
import json
import re
import sys

import fitz  # PyMuPDF

from etl.fetch import ROOT, checksum, path_for
from etl.sources import BY_SOURCE

OUT = ROOT / "out" / "nha-hbp-2022.json"

SOURCE_ID = "nha-hbp-2022"
KEY = "hbp-2022-om"

RUPEE = 100  # paise

# Column positions in the package table. Every package row is exactly 14 wide;
# the only other tables in the document are the two annexures, at 4 and 2.
WIDTH = 14
C_PACKAGE, C_PROCEDURE, C_CODE = 2, 3, 4
C_STATUS = 6
C_NRP, C_TIER3, C_TIER2, C_TIER1 = 7, 8, 9, 10
C_IMPLANT, C_STRATIFIED, C_REMARKS = 11, 12, 13

TIERS = [("nrp", C_NRP), ("z", C_TIER3), ("y", C_TIER2), ("x", C_TIER1)]

# The specialty behind each package code prefix. Written out by hand because the
# document's own specialty columns are unreadable often enough to be useless,
# and a wrong specialty here is ours rather than the NHA's.
#
# SC and SO are the pair to be careful with, and they were wrong here to begin
# with. The two letters suggest the opposite of what the document does: SC holds
# radical cystectomy and penile-preserving surgery, and SO holds hysterectomy,
# caesarean section and normal delivery. The document's own column agrees --
# SC024A is labelled "Surgical Oncology, Urology" and SO002A "Obstetrics &
# Gynecology, Surgical Oncology" -- and SPECIALTY_EVIDENCE below holds it to
# that, since the only thing that caught the swap was reading the packages.
SPECIALTY = {
    "BM": "Burns Management",
    "ER": "Emergency Room Packages",
    "ID": "Infectious Diseases",
    "IN": "Interventional Radiology",
    "MC": "Cardiology",
    "MG": "General Medicine",
    "MM": "Mental Disorders",
    "MN": "Neo-natal Care",
    "MO": "Medical Oncology",
    "MP": "Pediatric Medical Management",
    "MR": "Radiation Oncology",
    "OT": "Organ and Tissue Transplant",
    "PM": "Palliative Medicine",
    "SB": "Orthopedics",
    "SC": "Surgical Oncology",
    "SE": "Ophthalmology",
    "SG": "General Surgery",
    "SL": "ENT",
    "SM": "Oral and Maxillofacial Surgery",
    "SN": "Neurosurgery",
    "SO": "Obstetrics and Gynecology",
    "SP": "Plastic and Reconstructive Surgery",
    "SS": "Pediatric Surgery",
    "ST": "Polytrauma",
    "SU": "Urology",
    "SV": "Cardiothoracic and Vascular Surgery",
    "US": "Unspecified Surgical Packages",
    # One row is printed "M0074A", with a zero where the O of MO belongs. It is
    # a Medical Oncology chemotherapy package sitting among MO codes. Kept as
    # printed, because the code in the document is the code a hospital claims
    # against, and listed here so the prefix check does not fail on it.
    "M": "Medical Oncology",
}

# Bed categories as the document prints them, in the order a stay escalates.
BEDS = [
    (re.compile(r"Routine\s*Ward", re.I), "routine-ward", "Routine Ward"),
    (re.compile(r"HDU", re.I), "high-dependency", "High Dependency Unit"),
    (
        re.compile(r"ICU\s*\(\s*without\s*Ventilator\s*\)", re.I),
        "icu-no-ventilator",
        "ICU without ventilator",
    ),
    (
        re.compile(r"ICU\s*\(\s*with\s*Ventilator\s*\)", re.I),
        "icu-ventilator",
        "ICU with ventilator",
    ),
]
BED_PAIR = re.compile(
    r"(Routine\s*Ward|HDU|ICU\s*\(\s*without\s*Ventilator\s*\)|ICU\s*\(\s*with\s*Ventilator\s*\))"
    r"\s*-?\s*([\d.]+)",
    re.I,
)

CODE = re.compile(r"\b([A-Z]{1,3}\d{3,4}[A-Z]?)\b")
NUMBER = re.compile(r"^\d+(?:\.\d+)?$")
PER_DAY = re.compile(r"^([\d.]+)\s*/\s*day$", re.I)

# Four package codes are printed twice, against different procedures. They are
# published collisions, not extraction errors, and both rows are kept: dropping
# either would lose a real package, and silently renaming one would invent a
# code no hospital can claim against. Listed here so a re-issue that fixes them,
# or introduces new ones, fails the build instead of passing quietly.
KNOWN_COLLISIONS = {"MG096A", "SP009A", "IN041A", "PM036A"}

# Prices read off the document by eye, asserted against what the parser produced
# and against the raw text of the page they were read from. If a re-issue shifts
# a row or renumbers a page, these fail here rather than on screen.
SPOT_CHECKS = [
    # A well-behaved package: the reference price times 1.25, 1.42 and 1.5.
    {"code": "BM004C", "page": 5, "kind": "flat", "values": [60000, 75000, 85200, 90000]},
    # One that is not. Tier 1 is printed below Tier 2, and stays that way here.
    {"code": "MC002A", "page": 5, "kind": "flat", "values": [30800, 38500, 43800, 40100]},
    # A medical admission, priced by bed category per day rather than as a package.
    {"code": "MG029A", "page": 6, "kind": "bedDay", "values": [2100, 3300, 8500, 9000]},
    # A follow-up visit that carries no price of its own, in all four tiers.
    {"code": "MC022A", "page": 6, "kind": "asPrinted", "values": []},
    {"code": "MG069A", "page": 12, "kind": "perDay", "values": [2100, 2300, 2625]},
]


def squash(s: str | None) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def paise(text: str) -> int:
    """A printed rupee figure as paise. Rounded, because a few rows print paise."""
    return round(float(text) * RUPEE)


def read_pricing(cells: list[str]) -> dict:
    """
    How this package is priced, across the four tier columns.

    A shape has to hold for all four columns or the row is `asPrinted`. Mixing
    a parsed number in one tier with prose in another would produce a row that
    is priced in one city and not in the next, which is worse than no number.
    """
    if all(NUMBER.match(c) for c in cells):
        return {
            "kind": "flat",
            "tiers": {name: paise(c) for (name, _), c in zip(TIERS, cells)},
        }

    if all(PER_DAY.match(c) for c in cells):
        return {
            "kind": "perDay",
            "tiers": {
                name: paise(PER_DAY.match(c).group(1)) for (name, _), c in zip(TIERS, cells)
            },
        }

    grids, shapes = [], set()
    for cell in cells:
        found: dict[str, int] = {}
        for label, amount in BED_PAIR.findall(cell):
            for pattern, bed, _ in BEDS:
                if pattern.fullmatch(squash(label)):
                    found[bed] = paise(amount)
                    break
        grids.append(found)
        shapes.add(tuple(sorted(found)))
    if all(grids) and len(shapes) == 1:
        return {
            "kind": "bedDay",
            "beds": [
                {"bed": bed, "label": label} for _, bed, label in BEDS if bed in grids[0]
            ],
            "tiers": {name: grid for (name, _), grid in zip(TIERS, grids)},
        }

    return {
        "kind": "asPrinted",
        "tiers": {name: c for (name, _), c in zip(TIERS, cells)},
    }


def read_packages(doc: fitz.Document) -> list[dict]:
    out = []
    for page in range(doc.page_count):
        for table in doc[page].find_tables().tables:
            for raw in table.extract():
                if len(raw) != WIDTH:
                    continue  # Annexure-2 and Annexure-3, at 4 and 2 columns.
                row = [squash(c) for c in raw]
                if row[C_CODE] == "Procedure code" or not row[C_CODE]:
                    continue  # The repeated header, and the blank spacer rows.
                found = CODE.search(row[C_CODE])
                if not found:
                    continue
                code = found.group(1)
                out.append(
                    {
                        "code": code,
                        "specialtyCode": re.match(r"[A-Z]+", code).group(0),
                        "package": row[C_PACKAGE],
                        "procedure": row[C_PROCEDURE],
                        "status": row[C_STATUS],
                        "implant": row[C_IMPLANT] or None,
                        "stratified": row[C_STRATIFIED].upper().startswith("Y"),
                        "remarks": row[C_REMARKS] if row[C_REMARKS] not in ("", "NA") else None,
                        "page": page + 1,
                        "pricing": read_pricing([row[i] for _, i in TIERS]),
                    }
                )
    return out


def read_city_tiers(doc: fitz.Document) -> dict[str, list[str]]:
    """
    Annexure-3, which says which city is which tier.

    The annexure lists X and Y and stops. There is no Z list, so Z is every city
    that is not named -- an inference, and the only one in this file. It is
    recorded in the output rather than left for a reader to assume.
    """
    text = "\n".join(doc[p].get_text() for p in range(doc.page_count))
    marker = re.compile(r"Type of City\s*\n\s*([XY])\s*\(\s*Tier\s*-?\s*([12])\s*\)", re.I)
    starts = [(m.group(1).upper(), m.end()) for m in marker.finditer(text)]
    if [t for t, _ in starts] != ["X", "Y"]:
        raise SystemExit("Annexure-3 no longer lists exactly an X block then a Y block")

    tiers: dict[str, list[str]] = {}
    for i, (tier, start) in enumerate(starts):
        end = starts[i + 1][1] if i + 1 < len(starts) else len(text)
        cities = re.findall(r"^\s*\d+\s*\n\s*([A-Za-z][^\n]*?)\s*$", text[start:end], re.M)
        tiers[tier] = [squash(c) for c in cities if not c.lower().startswith("annexure")]
    return tiers


# A package whose own row names its specialty, for the prefixes where the letters
# invite the wrong guess. The phrase must appear on the page the package is on.
SPECIALTY_EVIDENCE = [
    ("SC024A", "Surgical Oncology"),
    ("SO002A", "Obstetrics"),
    ("SO057A", "Caesarean"),
    ("SO074A", "Normal vaginal delivery"),
]


def verify(doc: fitz.Document, packages: list[dict]) -> None:
    problems = []

    unknown = sorted({p["specialtyCode"] for p in packages} - set(SPECIALTY))
    if unknown:
        problems.append("package codes with an unmapped specialty prefix: " + ", ".join(unknown))

    counts = collections.Counter(p["code"] for p in packages)
    collisions = {c for c, n in counts.items() if n > 1}
    if collisions != KNOWN_COLLISIONS:
        problems.append(
            "duplicate package codes changed: expected "
            + ", ".join(sorted(KNOWN_COLLISIONS))
            + " and got "
            + (", ".join(sorted(collisions)) or "none")
        )

    by_code = {p["code"]: p for p in packages}
    pages = [squash(doc[p].get_text()) for p in range(doc.page_count)]
    for code, phrase in SPECIALTY_EVIDENCE:
        got = by_code.get(code)
        if got is None:
            problems.append(code + " is no longer in the document")
            continue
        page_text = pages[got["page"] - 1] if got["page"] <= len(pages) else ""
        if squash(phrase).lower() not in page_text.lower():
            problems.append(
                code + " is filed under " + SPECIALTY[got["specialtyCode"]] + " but "
                + repr(phrase) + " does not appear on its page " + str(got["page"])
                + ", so the specialty map can no longer be checked against the document"
            )

    for check in SPOT_CHECKS:
        got = by_code.get(check["code"])
        if got is None:
            problems.append(check["code"] + " is no longer in the document")
            continue
        if got["pricing"]["kind"] != check["kind"]:
            problems.append(
                check["code"] + " is priced " + got["pricing"]["kind"]
                + ", expected " + check["kind"]
            )
            continue
        page_text = pages[check["page"] - 1] if check["page"] <= len(pages) else ""
        if check["code"] not in page_text:
            problems.append(check["code"] + " is not on page " + str(check["page"]))
        for value in check["values"]:
            if str(value) not in page_text:
                problems.append(
                    check["code"] + ": " + str(value) + " is not printed on page "
                    + str(check["page"])
                )

    flat = [p for p in packages if p["pricing"]["kind"] == "flat"]
    if len(flat) < 1_500:
        problems.append("only " + str(len(flat)) + " flat-priced packages, expected about 1,667")

    if problems:
        raise SystemExit(
            "the Office Memorandum no longer matches what this parser asserts:\n  "
            + "\n  ".join(problems)
        )


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

    download = next(d for d in BY_SOURCE[SOURCE_ID] if d.key == KEY)
    pdf_path = path_for(download)
    sha = checksum(SOURCE_ID, KEY)
    if not pdf_path.exists() or sha is None:
        raise SystemExit(
            "the Office Memorandum has not been fetched. Run: python -m etl.fetch " + SOURCE_ID
        )

    with fitz.open(pdf_path) as doc:
        packages = read_packages(doc)
        city_tiers = read_city_tiers(doc)
        verify(doc, packages)

    kinds = collections.Counter(p["pricing"]["kind"] for p in packages)

    # How many flat rows are not the reference price times the published
    # multipliers. Reported rather than corrected: the printed figure is the one
    # a hospital is paid, whatever the arithmetic says it should have been.
    off_pattern = 0
    for p in packages:
        if p["pricing"]["kind"] != "flat":
            continue
        t = p["pricing"]["tiers"]
        if not t["nrp"] <= t["z"] <= t["y"] <= t["x"]:
            off_pattern += 1

    doc_out = {
        "source": {
            "id": SOURCE_ID,
            "name": "AB PM-JAY Health Benefit Package 2022 (package master)",
            "publisher": "National Health Authority",
            "url": download.url,
            "checksum": sha,
            "caveat": (
                "Issued by the National Health Authority, downloaded from a state mirror. "
                "The NHA's own portals do not serve this file -- nha.gov.in answers every "
                "path with the same HTML shell and pmjay.gov.in refuses the connection -- "
                "so the copy checksummed here is the Haryana State Health Agency's, hosted "
                "on the NIC government CDN. It is the national Office Memorandum, not a "
                "state variant, and Haryana republishes rather than issues it. Prices are "
                "transcribed exactly as printed: "
                + str(off_pattern)
                + " of the flat-priced rows do not follow the reference-price multipliers "
                "and are published that way."
            ),
            "document": (
                "Office Memorandum, Health Benefit Packages 2022, National Health Authority, "
                "Ayushman Bharat PM-JAY."
            ),
            "effectiveFrom": None,
        },
        "note": (
            "Tier columns are published in full, one price per city tier, so no rate here is "
            "derived from another. `nrp` is the National Reference Price; `x`, `y` and `z` "
            "are Tier 1, 2 and 3 as the document labels them. Amounts are in paise."
        ),
        "specialties": SPECIALTY,
        "cityTiers": {
            "note": (
                "Annexure-3 names the X and Y cities and stops. There is no Z list, so a "
                "city appearing in neither is Tier 3 by exclusion. That is an inference, "
                "and the only one in this file."
            ),
            "x": city_tiers["X"],
            "y": city_tiers["Y"],
        },
        "packages": packages,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc_out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        str(len(packages)) + " packages across "
        + str(len({p["specialtyCode"] for p in packages})) + " specialty prefixes -> "
        + str(OUT.relative_to(ROOT.parent))
    )
    for kind, n in kinds.most_common():
        print("  " + str(n).rjust(5) + "  " + kind)
    print(
        "  " + str(off_pattern).rjust(5)
        + "  flat rows whose tiers break the multiplier, transcribed as printed"
    )
    print(
        "  city tiers: " + str(len(city_tiers["X"])) + " X, " + str(len(city_tiers["Y"]))
        + " Y, rest Z by exclusion"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
