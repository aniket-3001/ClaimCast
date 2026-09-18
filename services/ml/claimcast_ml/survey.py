"""
The survey, read back as a level and two axes of spread.

`etl/out/nsso-75-health.json` holds what households told the National Statistical
Office they paid a private hospital in 2017-18. This module turns that into the
two things the cost model needs, and refuses to turn it into anything else.

**The level** is the private-hospital mean for an ailment category in a sector,
carried forward to December 2025 rupees by the one deflator in `cpi-health.json`.
It is a published figure multiplied by a published figure. Nothing is fitted.

**The spread** is harder, and the honest version is narrower than it looks. The
report publishes no quantile of what individual patients paid -- not one, in 127
pages. Every cell is a mean over a stratum. So a band built from these cells is
a band around a stratum mean, and the only question it can answer is: *given
that you have not said which state you are in or what your household spends,
how far from the national average might your stratum sit?*

Two published axes answer exactly that, and they are the two the caller does not
supply:

* **State.** Table A17, 36 states and union territories, private hospitals, by
  sector. Ratio of each state to the all-India figure for the same sector.
* **Household expenditure quintile.** Table A18, five quintile classes by
  sector, and again in Table A29 for childbirth. Ratio of each class to the
  all-class figure for the same sector.

A patient sits in one state *and* one quintile, so the two combine. They are
combined by multiplication, which assumes the two are independent -- that being
in Kerala does not change how much richer households outspend poorer ones. The
report gives no way to test that, so it is an assumption, stated here, and it is
the single strongest assumption in the band. It is not a small one: if the two
axes reinforce each other the real spread is wider than this, and if they offset
it is narrower.

What this module deliberately does not do is treat the public-hospital column as
a tariff. It is out-of-pocket spending at a government hospital, which is neither
the CGHS rate nor the PM-JAY package price, and dividing private by public does
not give a private-to-tariff multiplier. The tariff comes from the tariff.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache

from .paths import ETL_OUT

#: The survey's own sectors. A city tier maps onto one of these; see `sector_for`.
Sector = str  # "rural" | "urban"


@dataclass(frozen=True)
class Deflator:
    factor: float
    frm: str
    to: str
    basis: str


@dataclass(frozen=True)
class Survey:
    #: Private-hospital mean per case, in December 2025 paise, by (category, sector).
    level: dict[tuple[str, Sector], int]
    #: Ratio of each state's private mean to the all-India private mean, by sector.
    state_ratio: dict[Sector, list[float]]
    #: Ratio of each quintile class's private mean to the all-class mean, by sector.
    quintile_ratio: dict[Sector, list[float]]
    #: Share of the private bill by survey expenditure component, by sector.
    component_share: dict[Sector, dict[str, float]]
    deflator: Deflator
    source_id: str
    source_url: str
    checksum: str
    survey_period: str


def _read(name: str) -> dict:
    path = ETL_OUT / name
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(
            "could not read " + str(path) + ". The ETL output is tracked in git, so "
            "this usually means the file was deleted rather than never built; rebuild "
            "it with `python -m etl.build` from the repository root."
        ) from None


def sector_for(city_tier: str) -> Sector:
    """
    Which survey sector a city tier stands in for.

    The survey splits India into rural and urban. The tariff splits it into three
    city tiers, and those tiers are about municipal population, not about the
    rural/urban boundary the survey uses. X and Y are metropolitan and large
    urban and map cleanly. Z is everything else, which is mostly but not entirely
    rural, so calling it rural understates the level for a small-town private
    hospital. That is a stated approximation and it is the coarsest join in the
    model.
    """
    return "urban" if city_tier in ("X", "Y") else "rural"


@lru_cache(maxsize=1)
def load() -> Survey:
    nss = _read("nsso-75-health.json")
    cpi = _read("cpi-health.json")
    factor = float(cpi["factor"])

    level: dict[tuple[str, Sector], int] = {}
    for row in nss["byAilmentAndSector"]:
        if row["sector"] == "combined":
            continue
        level[(row["category"], row["sector"])] = round(row["private"] * factor)

    # Childbirth is excluded from the ailment tables, so it carries its own level
    # off Table A29 -- the medical-expenditure one, not the table that adds
    # transport and food. See `coding.CHILDBIRTH`.
    for row in nss["childbirth"]["medical"]:
        if row["hospitalType"] != "private" or row["sector"] == "combined":
            continue
        level[("childbirth", row["sector"])] = round(row["all"] * factor)

    all_india = next(s for s in nss["byState"] if s["state"].lower().startswith("all-india"))
    state_ratio: dict[Sector, list[float]] = {}
    for sector in ("rural", "urban"):
        base = all_india["private"][sector]
        state_ratio[sector] = [
            s["private"][sector] / base
            for s in nss["byState"]
            if not s["state"].lower().startswith("all-india") and s["private"][sector] > 0
        ]

    quintile_ratio: dict[Sector, list[float]] = {}
    for sector in ("rural", "urban"):
        rows = {r["quintile"]: r["private"] for r in nss["byQuintile"] if r["sector"] == sector}
        base = rows["all"]
        ratios = [rows[q] / base for q in ("q1", "q2", "q3", "q4", "q5")]
        # Childbirth's own quintile axis, from Table A29, is the same measurement
        # on a population the ailment tables exclude, so it belongs in the same
        # pool rather than in one of its own.
        cb = next(
            r
            for r in nss["childbirth"]["medical"]
            if r["sector"] == sector and r["hospitalType"] == "private"
        )
        ratios += [cb[q] / cb["all"] for q in ("q1", "q2", "q3", "q4", "q5")]
        quintile_ratio[sector] = ratios

    component_share: dict[Sector, dict[str, float]] = {}
    for sector, col in (("rural", "privateRural"), ("urban", "privateUrban")):
        rows = {c["component"]: c[col] for c in nss["components"]}
        total = rows["total"]
        component_share[sector] = {
            k: v / total for k, v in rows.items() if k != "total"
        }

    src = nss["source"]
    period = nss["surveyPeriod"]
    return Survey(
        level=level,
        state_ratio=state_ratio,
        quintile_ratio=quintile_ratio,
        component_share=component_share,
        deflator=Deflator(
            factor=factor,
            frm=cpi["readings"][0]["label"],
            to=cpi["readings"][1]["label"],
            basis="CPI Health sub-group " + cpi["subgroup"] + ", base " + cpi["base"],
        ),
        source_id=src["id"],
        source_url=src["url"],
        checksum=src["checksum"],
        survey_period=period["from"] + " to " + period["to"],
    )
