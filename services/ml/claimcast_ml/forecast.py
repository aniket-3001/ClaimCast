"""
One forecast, assembled from the pieces and honest about each of them.

    p50 = anchor tariff x multiplier x median band  +  implant midpoint
    p10, p90   the same with the band's tenth and ninetieth, and with the
               cheapest and dearest published implant option

**The implant is added rather than multiplied**, and it is the one part of the
forecast with a real spread rather than an inferred one. PM-JAY's knee package is
Rs 43,600 and a bilateral prosthesis is Rs 1.2 to 2.2 lakh; the package does not
carry the implant, so a forecast that multiplied the package would be predicting
a knee replacement without the knee. The four procedures the engine gives implant
options to were exactly the four that fell furthest below the app's own private
range before the implant was added, which is as close to a confirmation of this
structure as the available data permits.

**The band does not apply to the implant.** A patient's state and household
quintile do not change what a titanium cage costs; what changes it is which cage
is fitted, and the engine already makes that an explicit branch. So the implant's
own low and high are the published options, and the survey's band is applied to
the rest.

**What is deliberately not forecast.** Chemotherapy is anchored on a CGHS
administration fee, because PM-JAY prices chemotherapy by regimen across 287
codes and publishes no generic per-cycle package. The cytotoxic drug is therefore
not in the number at all, and the forecast says so rather than quietly implying
the figure is a whole cycle. HBP 2022's Annexure-2 lists high-end drugs and would
close this gap; it has not been parsed.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import split as split_mod
from . import tariff
from .coding import coding_for
from .model import Model
from .procedures import median_stay_days, name_of
from .survey import sector_for

#: Procedures whose anchor prices only part of what the admission costs, and what
#: it leaves out. Reported to the caller; never silently corrected for.
INCOMPLETE_ANCHOR = {
    "p-chemo": (
        "The anchor is the CGHS charge for administering a cycle and excludes the "
        "cytotoxic drug, which is the larger part of the cost. PM-JAY prices "
        "chemotherapy by regimen across 287 codes and publishes no generic package, "
        "so there is no whole-cycle tariff to anchor on."
    ),
}


@dataclass(frozen=True)
class Forecast:
    p10: int
    p50: int
    p90: int
    anchor: dict
    split: dict[str, int]
    model_version: str
    trained_on: str
    basis: str
    caveats: list[str]


def _bed_rates(procedure_id: str, tier: str, nabh: bool, days: int, icu_days: int) -> tuple[int, int]:
    """The ward and ICU day rates behind this admission, for dividing the room share."""
    try:
        ward = tariff.anchor_for(procedure_id, tier, nabh, "general", 1, 0).amount
        icu = tariff.anchor_for(procedure_id, tier, nabh, "icu", 1, 1).amount
    except SystemExit:
        return 0, 0
    return ward, icu


def forecast(
    model: Model,
    procedure_id: str,
    city_tier: str,
    nabh: bool,
    room_class: str,
    days: int,
    icu_days: int,
) -> Forecast:
    if icu_days > days:
        raise ValueError(
            "an admission of " + str(days) + " days cannot contain " + str(icu_days)
            + " days in intensive care."
        )

    coding = coding_for(procedure_id)
    sector = sector_for(city_tier)
    anchor = tariff.anchor_for(procedure_id, city_tier, nabh, room_class, days, icu_days)

    centre = anchor.amount * model.multiplier
    band = model.quantiles[sector]
    options = model.implant_options.get(procedure_id, [])
    implant_low = options[0] if options else 0
    implant_high = options[-1] if options else 0
    implant_mid = round((implant_low + implant_high) / 2) if options else 0

    body = round(centre * band["0.50"])
    ward_rate, icu_rate = _bed_rates(procedure_id, city_tier, nabh, days, icu_days)
    lines = split_mod.apply(
        model.shares[sector], body, implant_mid, ward_rate, icu_rate, days, icu_days
    )

    caveats = [
        "The band is a spread between stratum means, not between individual bills. "
        "The survey publishes no patient-level quantile, so the real spread of bills "
        "is wider than this interval, not narrower.",
        "A city tier is not the survey's rural/urban split. Tiers X and Y are read as "
        "urban and tier Z as rural, which is the coarsest join in the model.",
    ]
    if coding.note:
        caveats.append(coding.note)
    if coding.weak:
        caveats.append(coding.weak)
    if procedure_id in INCOMPLETE_ANCHOR:
        caveats.append(INCOMPLETE_ANCHOR[procedure_id])
    if options:
        caveats.append(
            "The implant is priced at the midpoint of the engine's published options, "
            "Rs " + format(implant_low // 100, ",") + " to Rs "
            + format(implant_high // 100, ",") + ", and the band's low and high use "
            "those two rather than the survey's spread. Which implant is fitted is a "
            "choice the journey makes explicitly."
        )
        allowance = tariff.implant_allowance(procedure_id)
        if allowance:
            caveats.append(
                "PM-JAY allows Rs " + format(allowance[0] // 100, ",") + " for this "
                "implant on top of the package -- the package master reads \""
                + allowance[1] + "\". That is the government's allowance, not a "
                "private price, and it is quoted as the only published figure for "
                "the same object."
            )
    if days != median_stay_days(procedure_id):
        caveats.append(
            "Length of stay reaches the estimate only through the tariff, which is the "
            "only source that published a per-day rate. The survey collected duration "
            "of stay and the Key Indicators report tabulates none of it."
        )

    return Forecast(
        p10=round(centre * band["0.10"]) + implant_low,
        p50=body + implant_mid,
        p90=round(centre * band["0.90"]) + implant_high,
        anchor={
            "scheme": anchor.scheme,
            "amount": anchor.amount,
            "sourceId": anchor.source_id,
            "code": anchor.code,
            "detail": anchor.detail,
        },
        split=lines,
        model_version=model.version,
        trained_on=model.trained_on,
        basis=(
            name_of(procedure_id) + ", coded to the survey's " + coding.category
            + " category. Anchored on the " + anchor.scheme + " rate of Rs "
            + format(anchor.amount // 100, ",") + " (" + anchor.code + ", "
            + anchor.detail + "). " + model.basis()
        ),
        caveats=caveats,
    )
