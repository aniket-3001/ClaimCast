"""
What Indian households actually paid a private hospital, as measured in 2017-18.

Everything else in this pipeline is a *tariff*: a price a government scheme has
declared it will pay. This is the only source in ClaimCast that reports what was
actually spent, and it is therefore the only thing the cost model can be
calibrated against. The NSS 75th round asked 1,13,823 households what a spell of
hospitalisation cost them, and the Key Indicators report prints the answers
broken down four ways, all four of which this module reads.

Four things about these numbers must travel with them, because a reader who
forgets any one of them will over-claim.

**They are means over strata, not bills.** Every figure here is an average for a
group -- a state, an ailment category, a sector. Nothing in this report is an
individual patient's bill, and no quantile of the patient-level distribution is
published anywhere in it. A band fitted to these cells is a band around a
*stratum mean*, which is narrower than the spread across patients. The model
that consumes this file has to say which one it is quoting, and ours does.

**"Public" is not a tariff.** The public-hospital column is what households paid
*out of pocket* at a government hospital, after whatever subsidy applied. It is
not the CGHS rate and it is not the PM-JAY package price. Dividing the private
column by the public column gives a ratio of two out-of-pocket figures, not a
private-to-tariff multiplier, and this module does no such division: it
transcribes the columns and leaves the joining to code that knows the difference.

**They are 2017-18 rupees.** Nothing here is inflated. The deflator lives in
etl/sources/mospi_cpi_health.py, is a single scalar, and is applied once, on the
model side, where it can be seen.

**They exclude childbirth, transport and food.** Table A17 says so in a footnote,
and the report says so in the prose above Statement 3.15. Childbirth is priced
separately in Tables A29 and A30, which this module does not read.

    python -m etl.sources.nsso_75_health   # -> etl/out/nsso-75-health.json
"""

from __future__ import annotations

import json
import re
import sys

import fitz  # PyMuPDF

from etl.fetch import ROOT, checksum, path_for
from etl.sources import BY_SOURCE

OUT = ROOT / "out" / "nsso-75-health.json"
SOURCE_ID = "nsso-75-health"
KEY = "ki-health-75th"

RUPEE = 100

P_STATEMENTS = 26  # Statements 3.15 and 3.16 share a page.
P_COMPONENTS = 27  # Statement 3.17.
P_AILMENT_SECTOR = 59  # Table A16, Appendix A.
P_STATES = 60  # Table A17, Appendix A.
P_QUINTILE = 61  # Table A18, Appendix A.

# The three axes along which this report lets private-hospital cost be observed
# varying, and the reason all three are read rather than just the headline one.
#
# Statement 3.16 gives ailment category and Table A17 gives geography, but each
# alone is a marginal. Tables A16 and A18 are joint with sector, and A18's axis
# -- quintile class of household expenditure -- is the only one in the report
# that varies *within* a place and a diagnosis. It is the closest published
# proxy for the spread between two patients who look otherwise alike, and
# without it any band fitted here would be a band across states and nothing
# more.
SECTORS = ("rural", "urban", "combined")

QUINTILES = [
    ("1st", "q1"),
    ("2nd", "q2"),
    ("3rd", "q3"),
    ("4th", "q4"),
    ("5th", "q5"),
    ("all", "all"),
]

# Each row label as the report prints it, paired with the name this project uses
# for it. The report's own wording is kept in `printed` so a reader can find the
# row; the slug is what the model joins on.
AILMENTS = [
    ("Cancers", "cancers"),
    ("Psychiatric and neurological ailments", "psychiatric-neurological"),
    ("Cardio-vascular ailments", "cardio-vascular"),
    ("Musculo-skeletal ailments", "musculo-skeletal"),
    ("Genito-urinary ailments", "genito-urinary"),
    ("Gastro-intestinal ailment", "gastro-intestinal"),
    ("Respiratory ailments", "respiratory"),
    ("Eye ailments", "eye"),
    ("Infections", "infections"),
    ("any ailment", "any"),
]

# Statement 3.17's rows. "Package component" is the hospital's own bundled
# charge, which is the closest thing in this survey to a procedure package, and
# it is by far the largest single line in a private bill.
# Appendix Table A16 lists the same nine categories as Statement 3.16 but in a
# different order, so the two cannot share one list. The words are carried here
# as well as the slugs: the rows are taken positionally, and the label is then
# required to contain the expected word, which turns a silent misalignment into
# a stop.
A16_AILMENTS = [
    ("Infections", "infections"),
    ("Cardio-vascular", "cardio-vascular"),
    ("Gastro-intestinal", "gastro-intestinal"),
    ("Respiratory", "respiratory"),
    ("Genito-urinary", "genito-urinary"),
    ("Musculo-skeletal", "musculo-skeletal"),
    ("Psychiatric", "psychiatric-neurological"),
    ("Eye", "eye"),
    ("Cancers", "cancers"),
    ("Any ailment", "any"),
]

COMPONENTS = [
    ("Package component", "package"),
    ("surgeon", "doctor-surgeon-fee"),  # printed with a curly apostrophe
    ("Medicines", "medicines"),
    ("Diagnostic tests", "diagnostics"),
    ("Bed charges", "bed"),
    ("others", "other"),
    ("total", "total"),
]

HOSPITAL_TYPES = [
    ("government/public", "public"),
    ("private", "private"),
    ("all (incl. charitable/NGO/trust-run)", "all"),
]

# Phrases asserted to appear on their page, so that a re-issued PDF whose tables
# have moved fails here rather than producing plausible wrong numbers.
EVIDENCE = [
    (P_STATEMENTS, "Statement 3.15"),
    (P_STATEMENTS, "private 27,347 38,822 31,845"),
    (P_STATEMENTS, "Cancers 22,520 93,305 61,216"),
    (P_COMPONENTS, "Package component 427 867 6,631 15,380"),
    (P_STATES, "Table A17"),
    (P_STATES, "excluding hospitalization for childbirth"),
    (P_AILMENT_SECTOR, "Table A16"),
    (P_AILMENT_SECTOR, "a. Infections 2149 14102 8005"),
    (P_QUINTILE, "Table A18"),
    (P_QUINTILE, "2nd (next 20% of population) 4387 27383 15622"),
]


def layout_lines(page: "fitz.Page") -> list[str]:
    """Text as visual rows, so a table row reads left to right in one string."""
    rows: dict[int, list[tuple[float, str]]] = {}
    for x0, y0, _x1, _y1, word, *_ in page.get_text("words"):
        rows.setdefault(round(y0 / 3), []).append((x0, word))
    return [" ".join(w for _, w in sorted(rows[k])) for k in sorted(rows)]


def money(tok: str) -> int:
    """A printed rupee figure to paise. The report writes them with commas."""
    return int(tok.replace(",", "")) * RUPEE


def numbers(line: str) -> list[str]:
    return re.findall(r"\d[\d,]*", line)


def find_row(lines: list[str], label: str, count: int) -> list[str]:
    """
    The one line carrying `label` and exactly `count` figures.

    Some rows in this report wrap, putting the label on one visual line and the
    figures on the next, so a label match alone is not enough and a figure count
    alone is ambiguous. Both together identify the row, and anything else is an
    error worth stopping for.
    """
    hits = [ln for ln in lines if label.lower() in ln.lower() and len(numbers(ln)) == count]
    if len(hits) == 1:
        return numbers(hits[0])
    # The wrapped case: the label sits alone, its figures on the following line.
    for i, ln in enumerate(lines[:-1]):
        if label.lower() in ln.lower() and not numbers(ln):
            nxt = numbers(lines[i + 1])
            if len(nxt) == count:
                return nxt
    raise SystemExit(
        "could not find a row for " + repr(label) + " with " + str(count)
        + " figures on it. The table has moved or been re-typeset; "
        + str(len(hits)) + " candidate lines matched the label."
    )


def read_states(lines: list[str]) -> list[dict]:
    """
    Table A17: nine figures per state, three sectors for each of three hospital
    types. Several state names are set on their own line with the figures
    beneath, so a label is carried forward until a figure row consumes it.
    """
    out: list[dict] = []
    pending = ""
    for ln in lines:
        nums = numbers(ln)
        if len(nums) == 9:
            label = re.sub(r"\d[\d,]*", "", ln).strip(" .*")
            name = label if label else pending
            if not name:
                continue
            vals = [money(n) for n in nums]
            out.append(
                {
                    "state": name,
                    "public": dict(zip(("rural", "urban", "combined"), vals[0:3])),
                    "private": dict(zip(("rural", "urban", "combined"), vals[3:6])),
                    "all": dict(zip(("rural", "urban", "combined"), vals[6:9])),
                }
            )
            pending = ""
        elif not nums and ln.strip():
            pending = ln.strip()
    return out


def section(lines: list[str], table: str) -> list[str]:
    """
    The lines belonging to one appendix table, where a page holds two.

    Table A18 shares page 61 with the start of Table A19, whose rows carry nine
    figures each and would otherwise be counted as data. The table is bounded by
    its own heading and the next "Table A.." heading rather than by the page.
    """
    start = next((i for i, ln in enumerate(lines) if table + ":" in ln), None)
    if start is None:
        raise SystemExit("no heading for " + table + " on the page it is read from")
    end = next(
        (i for i in range(start + 1, len(lines)) if re.match(r"\s*Table A\d+:", lines[i])),
        len(lines),
    )
    return lines[start:end]


def triples(lines: list[str]) -> list[tuple[str, list[int]]]:
    """
    Every data row on a page, as its last three figures, in printed order.

    Tables A16 and A18 are laid out as stacked sector blocks with the sector
    named once, vertically, beside the middle of its block -- which puts the
    word on a visual row of its own, between two data rows, rather than at the
    head of the block. Reading the label is therefore worse than counting, so
    these tables are taken positionally and then checked against a row whose
    value is already known from Statement 3.15.

    Two things on these pages look like data and are not. The running footer
    "NSS KI (75/25.0)" yields three numbers, and Table A18 labels its rows "1st
    (lowest 20% of population)", which contributes two more before the figures
    begin. So the footer is excluded by name and the figures are taken as the
    last three on the row rather than the only three.
    """
    out: list[tuple[str, list[int]]] = []
    pending = ""
    for ln in lines:
        if "NSS KI" in ln:
            continue
        nums = numbers(ln)
        if len(nums) >= 3:
            vals = [money(n) for n in nums[-3:]]
            label = ln[: ln.rfind(nums[-3])].strip(" .*") if nums[-3] in ln else ""
            out.append(((label or pending), vals))
            pending = ""
        elif not nums and ln.strip():
            pending = ln.strip()
    return out


def read_by_ailment_sector(lines: list[str]) -> list[dict]:
    """Table A16: nine ailment categories plus a total, for each of three sectors."""
    rows = triples(section(lines, "Table A16"))
    if len(rows) != 30:
        raise SystemExit(
            "Table A16 should be three sectors of ten rows but yielded "
            + str(len(rows)) + " rows of three figures"
        )
    out: list[dict] = []
    for block, sector in enumerate(SECTORS):
        for i, (label, vals) in enumerate(rows[block * 10 : block * 10 + 10]):
            word, slug = A16_AILMENTS[i]
            if word.lower() not in label.lower():
                raise SystemExit(
                    "Table A16 row " + str(i) + " of the " + sector + " block reads "
                    + repr(label) + ", which is not the " + word + " row this parser "
                    "expected there. The rows are taken in printed order, so an "
                    "inserted or dropped row would put every figure under the wrong "
                    "heading."
                )
            out.append(
                {
                    "category": slug,
                    "sector": sector,
                    "printed": label,
                    **dict(zip(("public", "private", "all"), vals)),
                }
            )
    return out


def read_by_quintile(lines: list[str]) -> list[dict]:
    """Table A18: five quintile classes plus a total, for rural and urban."""
    rows = triples(section(lines, "Table A18"))
    if len(rows) != 12:
        raise SystemExit(
            "Table A18 should be two sectors of six rows but yielded "
            + str(len(rows)) + " rows of three figures"
        )
    out: list[dict] = []
    for block, sector in enumerate(("rural", "urban")):
        for i, (label, vals) in enumerate(rows[block * 6 : block * 6 + 6]):
            out.append(
                {
                    "quintile": QUINTILES[i][1],
                    "sector": sector,
                    "printed": label,
                    **dict(zip(("public", "private", "all"), vals)),
                }
            )
    return out


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

    download = next(d for d in BY_SOURCE[SOURCE_ID] if d.key == KEY)
    pdf = path_for(download)
    sha = checksum(SOURCE_ID, KEY)
    if not pdf.exists() or sha is None:
        raise SystemExit(
            "the NSS report has not been fetched. Run: python -m etl.fetch " + SOURCE_ID
        )

    with fitz.open(pdf) as doc:
        wanted = (P_STATEMENTS, P_COMPONENTS, P_AILMENT_SECTOR, P_STATES, P_QUINTILE)
        pages = {p: layout_lines(doc[p - 1]) for p in wanted}
        flat = {p: " ".join(ls) for p, ls in pages.items()}

    missing = [
        "p" + str(p) + ": " + phrase
        for p, phrase in EVIDENCE
        if phrase.lower() not in flat[p].lower()
    ]
    if missing:
        raise SystemExit(
            "the report no longer reads the way this parser expects:\n  " + "\n  ".join(missing)
        )

    # Statement 3.15 -- three figures a row, rural / urban / combined.
    by_type = {
        slug: dict(
            zip(("rural", "urban", "combined"), [money(n) for n in find_row(pages[P_STATEMENTS], label, 3)])
        )
        for label, slug in HOSPITAL_TYPES
    }

    # Statement 3.16 -- three figures a row, public / private / all hospitals.
    by_ailment = [
        {
            "category": slug,
            "printed": label,
            **dict(
                zip(("public", "private", "all"), [money(n) for n in find_row(pages[P_STATEMENTS], label, 3)])
            ),
        }
        for label, slug in AILMENTS
    ]

    # Statement 3.17 -- four figures a row, public R/U then private R/U.
    components = [
        {
            "component": slug,
            **dict(
                zip(
                    ("publicRural", "publicUrban", "privateRural", "privateUrban"),
                    [money(n) for n in find_row(pages[P_COMPONENTS], label, 4)],
                )
            ),
        }
        for label, slug in COMPONENTS
    ]

    by_state = read_states(pages[P_STATES])
    by_ailment_sector = read_by_ailment_sector(pages[P_AILMENT_SECTOR])
    by_quintile = read_by_quintile(pages[P_QUINTILE])

    verify(by_type, by_ailment, components, by_state, by_ailment_sector, by_quintile)

    doc_out = {
        "source": {
            "id": SOURCE_ID,
            "name": "NSS 75th Round, Household Social Consumption: Health (Key Indicators)",
            "publisher": "National Statistical Office, Ministry of Statistics and Programme Implementation",
            "url": download.url,
            "checksum": sha,
            "caveat": (
                "A household survey, not a price list, and eight years old. Every "
                "figure is an average over a stratum -- a state, a sector, an ailment "
                "category -- and the report publishes no quantile of the patient-level "
                "distribution, so a band fitted to these cells describes the spread of "
                "average cost across strata and not the spread across patients. The "
                "public-hospital column is out-of-pocket spending at a government "
                "hospital, which is neither the CGHS rate nor the PM-JAY package price. "
                "Figures are July 2017 - June 2018 rupees and exclude hospitalisation "
                "for childbirth, transport to hospital, and food."
            ),
            "document": (
                "NSS Report KI(75/25.0), Key Indicators of Social Consumption in India: "
                "Health, July 2017 - June 2018. Statements 3.15, 3.16 and 3.17, and "
                "Tables A16, A17 and A18 of Appendix A."
            ),
            "effectiveFrom": "2018-06-30",
        },
        "note": (
            "Paise, in 2017-18 prices. Multiply by the factor in cpi-health.json to "
            "state any of these in December 2025 rupees."
        ),
        "surveyPeriod": {"from": "2017-07-01", "to": "2018-06-30", "households": 113823},
        "byHospitalType": by_type,
        "byAilment": by_ailment,
        "byAilmentAndSector": by_ailment_sector,
        "byQuintile": by_quintile,
        "components": components,
        "byState": by_state,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc_out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    private = by_type["private"]["combined"] // RUPEE
    print(
        "  " + str(len(by_ailment) - 1) + " ailment categories, "
        + str(len(components) - 1) + " bill components, "
        + str(len(by_state) - 1) + " states, "
        + str(len(by_quintile)) + " quintile cells, "
        + str(len(by_ailment_sector)) + " ailment-by-sector cells"
    )
    print("  private hospital mean, all-India: Rs " + f"{private:,}" + " per case (2017-18)")
    print("  -> " + str(OUT.relative_to(ROOT.parent)))
    return 0


def verify(by_type, by_ailment, components, by_state, by_ailment_sector, by_quintile) -> None:
    """
    Cross-checks that the report itself makes available.

    These are not assertions about the world. They are four places where the
    document prints the same quantity twice, so a parser that has drifted onto
    the wrong column is caught by the document disagreeing with itself.
    """
    fail: list[str] = []

    # The component rows must add up to the total row the statement prints, in
    # each of its four columns. A one-rupee slack is rounding; more is a column
    # read wrong.
    parts = {c["component"]: c for c in components}
    total = parts["total"]
    for col in ("publicRural", "publicUrban", "privateRural", "privateUrban"):
        summed = sum(c[col] for c in components if c["component"] != "total")
        if abs(summed - total[col]) > 2 * RUPEE:
            fail.append(
                "Statement 3.17 " + col + ": components sum to " + str(summed // RUPEE)
                + " but the printed total is " + str(total[col] // RUPEE)
            )

    # Statement 3.15's private column and Statement 3.16's "any ailment" row are
    # the same number printed on the same page in two different tables.
    any_row = next(a for a in by_ailment if a["category"] == "any")
    for slug, key in (("private", "private"), ("public", "public"), ("all", "all")):
        if by_type[slug]["combined"] != any_row[key]:
            fail.append(
                "Statement 3.15 " + slug + " combined is " + str(by_type[slug]["combined"] // RUPEE)
                + " but Statement 3.16 'any ailment' says " + str(any_row[key] // RUPEE)
            )

    # Table A17's All-India row is Statement 3.15 again, in the appendix.
    all_india = next((s for s in by_state if s["state"].lower().startswith("all-india")), None)
    if all_india is None:
        fail.append("Table A17 has no All-India row")
    else:
        for slug in ("public", "private", "all"):
            if all_india[slug]["combined"] != by_type[slug]["combined"]:
                fail.append(
                    "Table A17 All-India " + slug + " is "
                    + str(all_india[slug]["combined"] // RUPEE)
                    + " but Statement 3.15 says " + str(by_type[slug]["combined"] // RUPEE)
                )

    # Statement 3.17's total row is Statement 3.15 a second time, by sector.
    for col, slug, sector in (
        ("publicRural", "public", "rural"),
        ("publicUrban", "public", "urban"),
        ("privateRural", "private", "rural"),
        ("privateUrban", "private", "urban"),
    ):
        if total[col] != by_type[slug][sector]:
            fail.append(
                "Statement 3.17 total " + col + " is " + str(total[col] // RUPEE)
                + " but Statement 3.15 says " + str(by_type[slug][sector] // RUPEE)
            )

    # Table A16 and Table A18 each print a total row per sector, and each of
    # those is Statement 3.15 again. This is what makes it safe to read those
    # two tables positionally: if a block boundary were off by a row, the row
    # landing on the total would not match.
    for row in by_ailment_sector:
        if row["category"] == "any":
            for slug in ("public", "private", "all"):
                if row[slug] != by_type[slug][row["sector"]]:
                    fail.append(
                        "Table A16 " + row["sector"] + " total " + slug + " is "
                        + str(row[slug] // RUPEE) + " but Statement 3.15 says "
                        + str(by_type[slug][row["sector"]] // RUPEE)
                    )
    for row in by_quintile:
        if row["quintile"] == "all":
            for slug in ("public", "private", "all"):
                if row[slug] != by_type[slug][row["sector"]]:
                    fail.append(
                        "Table A18 " + row["sector"] + " total " + slug + " is "
                        + str(row[slug] // RUPEE) + " but Statement 3.15 says "
                        + str(by_type[slug][row["sector"]] // RUPEE)
                    )

    # Table A16's combined column is Statement 3.16, printed a second time.
    for row in by_ailment_sector:
        if row["sector"] != "combined":
            continue
        printed = next(a for a in by_ailment if a["category"] == row["category"])
        for slug in ("public", "private", "all"):
            if row[slug] != printed[slug]:
                fail.append(
                    "Table A16 combined " + row["category"] + " " + slug + " is "
                    + str(row[slug] // RUPEE) + " but Statement 3.16 says "
                    + str(printed[slug] // RUPEE)
                )

    # Enough states to be the table rather than a fragment of it.
    if len(by_state) < 30:
        fail.append("Table A17 yielded only " + str(len(by_state)) + " rows")

    # Every private figure should exceed its public counterpart. This is the
    # report's headline finding and holds in every state; if it ever fails, the
    # two blocks of columns have been swapped.
    swapped = [s["state"] for s in by_state if s["private"]["combined"] < s["public"]["combined"]]
    if swapped:
        fail.append("private below public in: " + ", ".join(swapped))

    if fail:
        raise SystemExit(
            "the parsed tables disagree with each other:\n  " + "\n  ".join(fail)
        )


if __name__ == "__main__":
    sys.exit(main())
