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
P_STATES = 60  # Table A17, Appendix A.

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
        pages = {p: layout_lines(doc[p - 1]) for p in (P_STATEMENTS, P_COMPONENTS, P_STATES)}
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

    verify(by_type, by_ailment, components, by_state)

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
                "Table A17 of Appendix A."
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
        "components": components,
        "byState": by_state,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc_out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    private = by_type["private"]["combined"] // RUPEE
    print(
        "  " + str(len(by_ailment) - 1) + " ailment categories, "
        + str(len(components) - 1) + " bill components, "
        + str(len(by_state) - 1) + " states"
    )
    print("  private hospital mean, all-India: Rs " + f"{private:,}" + " per case (2017-18)")
    print("  -> " + str(OUT.relative_to(ROOT.parent)))
    return 0


def verify(by_type, by_ailment, components, by_state) -> None:
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
