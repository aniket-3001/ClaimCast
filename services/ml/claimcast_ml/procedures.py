"""
The procedure list, read from the engine rather than copied out of it.

`packages/engine/src/data/procedures.ts` is where a procedure's name and its
median stay are defined, and the engine is the authority on both. The cost model
needs the median stay to compare procedures at a like-for-like length of
admission, and needs the name only to say in words what it priced.

Reading TypeScript with a regular expression is not elegant. The alternative is
a second copy of the same thirteen facts, and a second copy drifts -- which here
would mean the model quietly pricing a five-day stay for a procedure the engine
had since moved to three. The parse is deliberately narrow: it takes the id, the
name and the median stay, and it raises rather than guessing if the shape it
expects is not there.
"""

from __future__ import annotations

import re
from functools import lru_cache

from .paths import ROOT

SOURCE = ROOT / "packages" / "engine" / "src" / "data" / "procedures.ts"


@lru_cache(maxsize=1)
def procedures() -> dict[str, dict]:
    text = SOURCE.read_text(encoding="utf-8")
    # A procedure id, then that procedure's fields up to the next procedure id.
    # Implant options carry an `id` too, but never one beginning `p-`.
    starts = [(m.start(), m.group(1)) for m in re.finditer(r'\bid:\s*"(p-[a-z-]+)"', text)]
    if not starts:
        raise SystemExit(
            "read no procedures out of " + str(SOURCE) + ". The cost model takes the "
            "procedure list from the engine rather than keeping a second copy of it."
        )
    out: dict[str, dict] = {}
    for i, (pos, pid) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else len(text)
        block = text[pos:end]
        name = re.search(r'\bname:\s*"([^"]+)"', block)
        stay = re.search(r"\bmedianStayDays:\s*(\d+)", block)
        low = re.search(r"\bprivateLow:\s*r\((\d+)\)", block)
        high = re.search(r"\bprivateHigh:\s*r\((\d+)\)", block)
        implants = re.findall(
            r"\blabel:\s*\"([^\"]+)\",\s*amount:\s*r\((\d+)\)", block
        )
        if not name or not stay:
            raise SystemExit(
                "procedure " + pid + " in " + str(SOURCE) + " has no name or no "
                "medianStayDays where this parser expects them."
            )
        out[pid] = {
            "name": name.group(1),
            "medianStayDays": int(stay.group(1)),
            # The app's own simulated private range, in paise. Not a source --
            # it is the modelled spread slide 5 declares as simulated -- but it
            # is the only per-procedure private range in the project, so it is
            # what the forecast is sanity-checked against.
            "privateLow": int(low.group(1)) * 100 if low else None,
            "privateHigh": int(high.group(1)) * 100 if high else None,
            # The implant options as the engine publishes them. The forecast
            # cannot know which one a patient will be given, so it prices the
            # midpoint and says so; the engine prices the actual choice.
            "implantOptions": [(l, int(a) * 100) for l, a in implants],
        }
    return out


def median_stay_days(procedure_id: str) -> int | None:
    """None for a catalogue package: the catalogue publishes no length of stay."""
    if ":" in procedure_id:
        return None
    return procedures()[procedure_id]["medianStayDays"]


def name_of(procedure_id: str) -> str:
    if ":" in procedure_id:
        from .tariff import catalogue_entry

        entry = catalogue_entry(procedure_id) or {}
        name = entry.get("package") or entry.get("name") or procedure_id
        return name + " (" + procedure_id + ")"
    return procedures()[procedure_id]["name"]
