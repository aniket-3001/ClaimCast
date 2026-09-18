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

from .categories import LOOSE, SPECIALTIES, UNMAPPED
from .coding import CODING
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


def category_tariff_mean(category: str, tier: str) -> tuple[float, int, str]:
    """
    What PM-JAY pays for a typical admission in an ailment category.

    The mean flat package price across every package in the specialties mapped to
    the category. Bed-day and prose-priced packages are left out: a bed-day grid
    is a rate rather than a price, and averaging one into a list of prices would
    compare a day with an episode.
    """
    hbp, _cghs, _h, _c = _tables()
    prefixes = SPECIALTIES.get(category)
    if not prefixes:
        return 0.0, 0, UNMAPPED.get(category, "no specialty mapped")
    key = tier.lower()
    prices = [
        p["pricing"]["tiers"][key]
        for p in hbp["packages"]
        if p["specialtyCode"] in prefixes and p["pricing"]["kind"] == "flat"
    ]
    if not prices:
        return 0.0, 0, "no flat-priced packages in " + "/".join(prefixes)
    note = "mean of " + str(len(prices)) + " packages in " + "/".join(prefixes)
    if category in LOOSE:
        note += ", loosely mapped: " + LOOSE[category]
    return sum(prices) / len(prices), len(prices), note


def _peer_mean(category: str, tier: str, nabh: bool, room_class: str) -> tuple[float, str]:
    """The fallback denominator: the ClaimCast procedures coded into the category."""
    from .procedures import median_stay_days

    amounts = []
    for peer, coding in CODING.items():
        if coding.category != category:
            continue
        try:
            amounts.append(
                anchor_for(peer, tier, nabh, room_class, median_stay_days(peer), 0).amount
            )
        except SystemExit:
            continue
    if not amounts:
        return 0.0, "no priced procedure in this category"
    return sum(amounts) / len(amounts), (
        "mean tariff of the " + str(len(amounts)) + " ClaimCast procedure(s) coded as "
        + category + ", because " + UNMAPPED.get(category, "no specialty is mapped to it")
    )


def shape_factor(
    procedure_id: str, tier: str, nabh: bool, room_class: str, days: int, icu_days: int
) -> tuple[float, str]:
    """
    How this procedure sits against a typical admission in its ailment category.

    The numerator is this admission's tariff, stay and all. The denominator is
    the category's mean package price at the same city tier, so the tier cancels
    and what is left is the procedure.

    Six of the nine categories contain exactly one ClaimCast procedure, so a
    denominator taken over the app's own list would be that same procedure and
    the factor would be 1 by construction -- which would have priced a single
    dialysis session at the survey's mean for every kidney admission in India.
    The denominator is therefore the published catalogue, not the app's subset.
    """
    category = CODING[procedure_id].category
    mine = anchor_for(procedure_id, tier, nabh, room_class, days, icu_days).amount
    mean, _n, note = category_tariff_mean(category, tier)
    if mean <= 0:
        mean, note = _peer_mean(category, tier, nabh, room_class)
    if mean <= 0:
        return 1.0, "no denominator for this category, so no within-category adjustment"
    return mine / mean, "this admission's tariff against the " + note


def implant_allowance(procedure_id: str) -> tuple[int, str] | None:
    """
    What PM-JAY allows for the implant, where the package master states one.

    349 of the 1,949 packages carry an implant line -- "Implant for Total Knee
    Replacement - 55000" and the like -- which is an allowance paid on top of the
    package price rather than inside it. It is not what a private hospital
    charges, and the forecast does not price the implant from it. It is here
    because it is the only published figure for the same object, so it is worth
    reporting beside the private one and worth asserting against in the tests:
    a private implant price below the government's own allowance would be wrong.

    Where a line names more than one device -- a bare-metal and a drug-eluting
    stent on the same row -- the larger is taken, because that is the one the
    engine's implant options describe.
    """
    hbp, _cghs, hbp_codes, _c = _tables()
    code = hbp_codes.get(procedure_id)
    if not code:
        return None
    pkg = next((p for p in hbp["packages"] if p["code"] == code), None)
    if pkg is None or not pkg.get("implant"):
        return None
    figures = [int(n) for n in re.findall(r"\d+", pkg["implant"])]
    if not figures:
        return None
    return max(figures) * 100, pkg["implant"]
