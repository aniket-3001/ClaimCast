"""
The published price, which is the half of the estimate that is not a guess.

The survey says what a private hospital costs on average for a category of
ailment. It says nothing about which procedure, because it never asked. The
tariff says the opposite: it prices the procedure exactly and says nothing about
what anyone actually paid. So each source is used for what it knows -- the
survey carries the level of the category, and the tariff carries the shape
*within* the category, meaning how a knee replacement sits against an
appendicectomy.

That shape factor is the tariff for this procedure divided by the average tariff
across every procedure ClaimCast codes into the same ailment category, both at
the same city tier and NABH status so the divisions cancel.

**This is the assumption in the model that can actually be tested, and it does
not pass cleanly.** Childbirth is the one category where the survey publishes
two procedures separately: Table A30 gives a normal delivery and a caesarean in
private hospitals. Their ratio is 2.27 rural and 2.09 urban. The same ratio in
PM-JAY is 1.50 to 1.60. Netting out non-medical spend, which is roughly flat per
case and so compresses the ratio, the survey's medical-only figure is nearer 2.2
to 2.5. The tariff therefore understates the gap between a cheap procedure and
an expensive one by something like a third to a half: private hospitals price
the expensive operation relatively higher than the government does.

One category is one observation and this module does not correct for it -- an
exponent fitted to a single point would be a worse error than the one it fixes.
It is reported instead, in every forecast's `basis`, and it is the most useful
thing in this file for anyone deciding how much to trust the number.

Length of stay enters here and nowhere else. The survey collected duration of
stay and the Key Indicators report publishes no table of it, so there is no
honest way to scale a survey level by days. The tariff does publish per-day
rates: PM-JAY prices a medical admission as a bed-day grid by bed category, and
CGHS prices a ward class. Days therefore move the estimate only through the
tariff, which is the source that actually measured them.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache

from .coding import CODING, CHILDBIRTH
from .paths import ETL_OUT, REPO

#: Which PM-JAY bed category a ClaimCast room class is billed against. The room
#: classes above semi-private have no counterpart in the scheme, which prices a
#: routine ward and nothing grander, so they anchor on the routine ward and the
#: gap between a suite and a routine ward shows up as the forecast sitting well
#: above the anchor -- which is the comparison the app exists to make.
BED_FOR_ROOM = {
    "general": "routine-ward",
    "semi_private": "routine-ward",
    "private": "routine-ward",
    "deluxe": "routine-ward",
    "suite": "routine-ward",
    "icu": "icu-no-ventilator",
}

#: CGHS prices a ward class directly, and the OM states the other two as
#: arithmetic off the semi-private figure every rate in the file is quoted at.
WARD_FOR_ROOM = {
    "general": "general",
    "semi_private": "semiPrivate",
    "private": "private",
    "deluxe": "private",
    "suite": "private",
    "icu": "private",
}


@dataclass(frozen=True)
class Anchor:
    scheme: str  # "PMJAY" | "CGHS"
    amount: int  # paise
    source_id: str
    code: str
    detail: str


def _read(name: str) -> dict:
    return json.loads((ETL_OUT / name).read_text(encoding="utf-8"))


def _codes_from_ts(filename: str, const: str) -> dict[str, str]:
    """
    The procedure-to-code mapping as the TypeScript seed records it.

    The mapping is a coding judgement and it already exists, in
    `apps/api/prisma/{cghs,hbp}-map.ts`. Restating it in Python would mean two
    copies that can drift, and a drift would silently price the wrong operation.
    So it is read from the TypeScript rather than retyped, by the one pattern
    those files are guaranteed to hold: a procedure id, then a code before the
    next procedure id. If the shape of those files changes this raises, which is
    the correct outcome -- a mapping that cannot be read is not a mapping that
    should be assumed.
    """
    path = REPO / "apps" / "api" / "prisma" / filename
    text = path.read_text(encoding="utf-8")
    body = text[text.index(const) :]
    pairs = re.findall(r'"(p-[a-z-]+)"\s*:\s*\{(.*?)\}', body, re.S)
    out: dict[str, str] = {}
    for pid, block in pairs:
        m = re.search(r'code:\s*"([A-Z0-9]+)"', block)
        if m:
            out[pid] = m.group(1)
    if not out:
        raise SystemExit(
            "read no procedure-to-code mappings out of " + str(path) + ". The cost "
            "model takes that mapping from the seed rather than keeping a second copy, "
            "so it cannot proceed without it."
        )
    return out


@lru_cache(maxsize=1)
def _tables() -> tuple[dict, dict, dict[str, str], dict[str, str]]:
    return (
        _read("nha-hbp-2022.json"),
        _read("cghs-rates.json"),
        _codes_from_ts("hbp-map.ts", "HBP_MAP"),
        _codes_from_ts("cghs-map.ts", "CGHS_MAP"),
    )


def _hbp_amount(pkg: dict, tier: str, room_class: str, days: int, icu_days: int) -> tuple[int, str]:
    pricing = pkg["pricing"]
    key = tier.lower()
    if pricing["kind"] == "flat":
        return pricing["tiers"][key], "package price at tier " + tier
    if pricing["kind"] == "perDay":
        nights = max(days, 1)
        return pricing["tiers"][key] * nights, str(nights) + " days at the per-day rate"
    if pricing["kind"] == "bedDay":
        grid = pricing["tiers"][key]
        ward = grid[BED_FOR_ROOM[room_class]]
        icu = grid.get("icu-no-ventilator", ward)
        ward_days = max(days - icu_days, 0)
        total = ward_days * ward + icu_days * icu
        if total == 0:
            total = ward
        return total, (
            str(ward_days) + " ward days and " + str(icu_days) + " ICU days on the "
            "bed-category grid at tier " + tier
        )
    raise SystemExit(
        "package " + pkg["code"] + " is priced as " + pricing["kind"] + ", which is "
        "prose rather than a number. It cannot anchor a forecast."
    )


def _cghs_amount(rate: dict, rules: dict, tier: str, nabh: bool, room_class: str) -> tuple[int, str]:
    base = rate["nabh"] if nabh else rate["nonNabh"]
    ward = rules["wardFactor"][WARD_FOR_ROOM[room_class]]
    city = rules["cityFactor"][tier]
    amount = round(base * ward * city / 100) * 100
    return amount, (
        ("NABH" if nabh else "non-NABH") + " rate, " + WARD_FOR_ROOM[room_class]
        + " ward, tier " + tier
    )


def anchor_for(
    procedure_id: str, tier: str, nabh: bool, room_class: str, days: int, icu_days: int
) -> Anchor:
    """
    The government price for this admission, preferring PM-JAY.

    PM-JAY comes first because it prices a whole admission -- the package is what
    the scheme pays for the episode, which is the same object the survey measured
    and the same object a private bill totals to. CGHS prices a procedure and
    leaves the stay to be added separately, so it is the fallback for the
    procedures the package master has no entry for.
    """
    hbp, cghs, hbp_codes, cghs_codes = _tables()
    code = hbp_codes.get(procedure_id)
    if code:
        pkg = next((p for p in hbp["packages"] if p["code"] == code), None)
        if pkg is None:
            raise SystemExit(
                "the seed maps " + procedure_id + " to PM-JAY package " + code + ", "
                "which is not in the package master. One of the two has moved."
            )
        amount, detail = _hbp_amount(pkg, tier, room_class, days, icu_days)
        return Anchor("PMJAY", amount, hbp["source"]["id"], code, detail)

    code = cghs_codes.get(procedure_id)
    if code:
        rate = next((r for r in cghs["rates"] if r["code"] == code), None)
        if rate is None:
            raise SystemExit(
                "the seed maps " + procedure_id + " to CGHS code " + code + ", which "
                "is not in the rate list. One of the two has moved."
            )
        amount, detail = _cghs_amount(rate, cghs["rules"], tier, nabh, room_class)
        return Anchor("CGHS", amount, cghs["source"]["id"], code, detail)

    raise SystemExit(
        "neither PM-JAY nor CGHS prices " + procedure_id + ". The forecast is anchored "
        "on a published tariff and there is deliberately no estimate without one; "
        "ClaimCast's generic chemotherapy is the known case, because HBP 2022 prices "
        "287 oncology codes by regimen and none of them generically."
    )


def shape_factor(
    procedure_id: str, tier: str, nabh: bool, room_class: str, days: int, icu_days: int
) -> tuple[float, str]:
    """
    How this procedure sits against the average of its ailment category.

    The comparison is made at the same tier, NABH status and room class for every
    procedure in the category, and at each procedure's own median stay, so the
    only thing left in the ratio is the procedure.
    """
    from .procedures import median_stay_days

    category = CODING[procedure_id].category
    peers = [p for p, c in CODING.items() if c.category == category]
    amounts = []
    for peer in peers:
        try:
            stay = median_stay_days(peer)
            amounts.append(anchor_for(peer, tier, nabh, room_class, stay, 0).amount)
        except SystemExit:
            continue  # a peer with no published tariff cannot inform the average
    mine = anchor_for(procedure_id, tier, nabh, room_class, days, icu_days).amount
    if not amounts:
        return 1.0, "no priced peers in this category, so no within-category adjustment"
    mean = sum(amounts) / len(amounts)
    label = CHILDBIRTH if category == CHILDBIRTH else category
    return mine / mean, (
        "tariff for this procedure against the mean tariff of the "
        + str(len(amounts)) + " procedure(s) ClaimCast codes as " + label
    )
