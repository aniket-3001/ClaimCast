"""
IRDAI Lists I-IV, from Annexure-I of the 2019 Modification Guidelines.

These four lists are the backbone of the deductions screen. List I is what the
patient pays whatever their policy says; Lists II, III and IV are items the
hospital may not bill separately at all, and a separate line for one of them is
a billing error rather than a deduction. The app already explains that
distinction -- this module makes it explain the published lists rather than a
hand-written subset of them.

**What this file does and does not carry.** It carries the items exactly as
printed: the list they sit in, their serial number, and their label. It carries
no prices and no groupings, because IRDAI publishes neither. The illustrative
rupee figures the bill breakdown shows, and the Administrative / Comfort /
Appliance groupings it sorts by, are ClaimCast's own modelling and live in the
seed where the other modelled figures live. Mixing them in here would let a
number IRDAI never published inherit IRDAI's provenance row, which is the exact
failure this pipeline exists to prevent.

**The scan.** This PDF's text layer is OCR of a scanned circular, and the OCR
reads "LIST - III" as "LIST - Ill" -- capital I, lowercase L, lowercase L. The
heading patterns below match what is actually in the file, not what is on the
page. Serial numbers sit on their own line, and labels wrap freely across
lines, so an item runs from its serial to the next one.

    python -m etl.sources.irdai_lists    # -> etl/out/irdai-lists.json
"""

from __future__ import annotations

import json
import re
import sys

import fitz  # PyMuPDF

from etl.fetch import ROOT, checksum, path_for
from etl.sources import BY_SOURCE

OUT = ROOT / "out" / "irdai-lists.json"

SOURCE_ID = "irdai-lists"
KEY = "modification-guidelines-2019"

# Page 0 is the covering circular. The lists themselves start on page 1.
FIRST_PAGE = 1

# What each list does. This is IRDAI's own wording from the classification
# paragraph on the first page of the annexure, compressed to one line each,
# and it is what the app prints beside the list.
FRAMEWORK = [
    {
        "id": "I",
        "title": "List I - Optional Items",
        "effect": (
            "Items that may be retained as it is as optional items. Billed by the "
            "hospital and settled by the patient unless the insurer offers cover for them."
        ),
    },
    {
        "id": "II",
        "title": "List II - Items that are to be subsumed into Room Charges",
        "effect": "Items specified in the list shall form part of room charges.",
    },
    {
        "id": "III",
        "title": "List III - Items that are to be subsumed into Procedure Charges",
        "effect": "Items specified in the list shall be considered as part of procedure charges.",
    },
    {
        "id": "IV",
        "title": "List IV - Items that are to be subsumed into costs of treatment",
        "effect": (
            "Items specified in the list shall be considered as part of the costs "
            "of treatment, including the costs of diagnostics."
        ),
    },
]

# Where each list begins in the text. "Ill" is the OCR of "III"; the leading
# List/LIST and the separator both vary between the classification paragraph
# and the list headings themselves.
HEADINGS = [
    ("I", re.compile(r"List\s*I\s*-\s*Optional Items", re.I)),
    ("II", re.compile(r"List\s*II\s*-\s*Items that are to be subsumed into Room", re.I)),
    ("III", re.compile(r"List\s*(?:III|Ill)\s*-\s*Items that are to be subsumed into Proc", re.I)),
    ("IV", re.compile(r"List\s*IV\s*-\s*Items that are to be subsumed into costs", re.I)),
]

SERIAL = re.compile(r"^\s*(\d{1,3})\s*$")

# The page footer, which otherwise trails the last item of the last list.
FOOTER = re.compile(r"Page\s*\d+\s*of\s*\d+", re.I)

# Header rows repeat on every page and are not items.
NOISE = re.compile(r"^\s*(SI|Sl|S\.?I\.?|Item|No\.?|No)\s*$", re.I)


def sections(text: str) -> dict[str, str]:
    """
    Split the annexure into the four list bodies, in the order they appear.

    A body runs from the end of its own heading to the *start* of the next one.
    Slicing to the end of the next heading instead leaves that heading dangling
    on the previous list's final item, where it reads as part of the item.
    """
    found = []
    for list_id, pattern in HEADINGS:
        matches = list(pattern.finditer(text))
        if not matches:
            raise SystemExit("could not find the heading for List " + list_id)
        # The classification paragraph names each list before the list itself
        # appears, so the heading that opens the body is the last match.
        found.append((list_id, matches[-1].start(), matches[-1].end()))
    found.sort(key=lambda p: p[1])

    out: dict[str, str] = {}
    for i, (list_id, _, start) in enumerate(found):
        end = found[i + 1][1] if i + 1 < len(found) else len(text)
        out[list_id] = FOOTER.sub("", text[start:end])
    return out


def items(body: str) -> list[dict]:
    """
    Read one list body into numbered items.

    A serial is only accepted if it is exactly one more than the last, which is
    what keeps the page numbers printed in the footer out of the list: a bare
    "11" appearing while the list is at 47 is a page number, not an item.
    """
    out: list[dict] = []
    expected = 1
    buffer: list[str] = []

    def flush() -> None:
        if out and buffer:
            label = re.sub(r"\s+", " ", " ".join(buffer)).strip()
            out[-1]["label"] = label

    for line in body.splitlines():
        m = SERIAL.match(line)
        if m and int(m.group(1)) == expected:
            flush()
            buffer = []
            out.append({"serial": expected, "label": ""})
            expected += 1
            continue
        if NOISE.match(line) or not line.strip():
            continue
        if out:
            buffer.append(line.strip())
    flush()

    return [i for i in out if i["label"]]


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

    download = next(d for d in BY_SOURCE[SOURCE_ID] if d.key == KEY)
    pdf_path = path_for(download)
    sha = checksum(SOURCE_ID, KEY)
    if not pdf_path.exists() or sha is None:
        raise SystemExit("the circular has not been fetched. Run: python -m etl.fetch " + SOURCE_ID)

    with fitz.open(pdf_path) as doc:
        text = "\n".join(doc[p].get_text() for p in range(FIRST_PAGE, doc.page_count))

    lists = {list_id: items(body) for list_id, body in sections(text).items()}

    # The four lists as published run to 68, 37, 23 and 18 items. A list
    # that came back nearly empty means the OCR or the headings moved, and a
    # silently short List I would quietly under-report what a patient owes.
    for list_id, rows in lists.items():
        if len(rows) < 15:
            raise SystemExit(
                "List " + list_id + " parsed to only " + str(len(rows))
                + " items -- the document layout has changed"
            )

    doc_out = {
        "source": {
            "id": SOURCE_ID,
            "name": "IRDAI Lists I-IV (Annexure-I)",
            "publisher": "Insurance Regulatory and Development Authority of India",
            "url": download.url,
            "checksum": sha,
            "caveat": None,
            "document": (
                "IRDAI/HLT/REG/CIR/176/09/2019, 27 September 2019, Modification "
                "Guidelines on Standardization in Health Insurance, Annexure-I."
            ),
            "effectiveFrom": "2019-09-27",
        },
        "note": (
            "Items as published. IRDAI lists them without prices or groupings, so "
            "this file carries neither; the illustrative amounts and groupings the "
            "app shows are ClaimCast's own modelling and are labelled as such there."
        ),
        "framework": FRAMEWORK,
        "lists": lists,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc_out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        "lists -> "
        + str(OUT.relative_to(ROOT.parent))
        + "  "
        + ", ".join("List " + k + ": " + str(len(v)) for k, v in lists.items())
    )
    for list_id in ("I", "II", "III", "IV"):
        rows = lists[list_id]
        print("  " + list_id + "  1. " + rows[0]["label"][:44] + "   ... " + str(rows[-1]["serial"])
              + ". " + rows[-1]["label"][:44])
    return 0


if __name__ == "__main__":
    sys.exit(main())
