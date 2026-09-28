"""
Which NSS ailment category each ClaimCast procedure belongs to.

The same split as `apps/api/prisma/hbp-map.ts` and `cghs-map.ts`, for the same
reason. The survey figures come out of `etl/out/nsso-75-health.json` exactly as
the National Statistical Office printed them; deciding that a lumbar spinal
fusion is a musculo-skeletal ailment is a coding judgement ClaimCast is making,
and it lives here so the two never blur. A wrong survey figure would be the
NSO's error. A wrong category is ours.

Three of these judgements are worth arguing with.

**Dialysis is filed under genito-urinary**, which is where the survey's ailment
list puts kidney disease. It is not obviously wrong and it is not obviously
right: a chronic haemodialysis session is a recurring outpatient-shaped event
priced as an admission, and the survey's genito-urinary cell is dominated by
one-off admissions. The forecast for dialysis is the weakest in the set and is
marked as such.

**Chemotherapy is filed under cancers**, whose private-hospital mean is the
highest of the nine categories -- Rs 93,305 per case against Rs 15,208 for
infections. But the survey's cancer cell is a mean over every cancer admission,
including surgery and radiotherapy, while ClaimCast's procedure is one cycle of
chemotherapy. The tariff-shape factor is doing unusually heavy lifting here,
and PM-JAY publishes no generic chemotherapy package to anchor it with, which
is already recorded in `hbp-map.ts`.

**The two deliveries are not in the main tables at all.** The survey excludes
childbirth from every ailment category, so they are anchored on Tables A29 and
A30 instead, through `CHILDBIRTH`. That is a different level and a different
caveat, and the forecast says so rather than quietly folding them in.
"""

from __future__ import annotations

from dataclasses import dataclass

#: Sentinel category for the two procedures the ailment tables exclude.
CHILDBIRTH = "childbirth"


@dataclass(frozen=True)
class Coding:
    #: An NSS ailment category slug as `nsso-75-health.json` spells it, or
    #: `CHILDBIRTH` for the two procedures the ailment tables leave out.
    category: str
    #: Why this category, where the choice was not the obvious one.
    note: str | None = None
    #: Set where the category is a poor fit for the procedure, which the
    #: forecast repeats to the caller rather than keeping to itself.
    weak: str | None = None


CODING: dict[str, Coding] = {
    "p-spine-fusion": Coding("musculo-skeletal"),
    "p-cabg": Coding("cardio-vascular"),
    "p-angioplasty": Coding("cardio-vascular"),
    "p-tkr": Coding("musculo-skeletal"),
    "p-chole": Coding("gastro-intestinal"),
    "p-appendix": Coding("gastro-intestinal"),
    "p-pneumonia": Coding("respiratory"),
    "p-sepsis": Coding(
        "infections",
        note=(
            "Septic shock is filed under infections rather than under the organ "
            "system that failed, which is how the survey's ailment list is built."
        ),
    ),
    "p-cataract": Coding("eye"),
    "p-dialysis": Coding(
        "genito-urinary",
        note="Where the survey's ailment list puts kidney disease.",
        weak=(
            "The survey's genito-urinary cell is a mean over admissions, mostly "
            "one-off. A chronic dialysis session is a recurring event priced as an "
            "admission, so the level it is anchored on is the least apt of the set."
        ),
    ),
    "p-chemo": Coding(
        "cancers",
        weak=(
            "The survey's cancer cell averages every cancer admission, surgery and "
            "radiotherapy included, while this procedure is one chemotherapy cycle. "
            "PM-JAY publishes no generic chemotherapy package to anchor it against "
            "either, so both halves of the estimate are unusually soft here."
        ),
    ),
    "p-observation": Coding(
        "gastro-intestinal",
        note=(
            "Acute gastroenteritis. The engine refuses this admission outright for "
            "failing the 24-hour definition, so the forecast is only ever the "
            "counterfactual -- what it would have cost had it been an admission."
        ),
    ),
    "p-csection": Coding(
        CHILDBIRTH,
        note="Table A29, not the ailment tables, which exclude childbirth entirely.",
    ),
    "p-delivery": Coding(CHILDBIRTH, note="As for the caesarean."),
}


def coding_for(procedure_id: str) -> Coding:
    if ":" in procedure_id:
        return _catalogue_coding(procedure_id)
    try:
        return CODING[procedure_id]
    except KeyError:
        raise KeyError(
            "no NSS ailment category is recorded for procedure " + repr(procedure_id)
            + ". Deciding which category a procedure falls in is a judgement, not a "
            "lookup, so this service refuses to guess one: add it to coding.py."
        ) from None


def _catalogue_coding(procedure_id: str) -> Coding:
    """
    A catalogue package's category, from its specialty.

    The category only names the survey cell a forecast's basis refers to; the
    booster reads the specialty itself. Where a specialty belongs to no single
    category the forecast says so rather than choosing one.
    """
    from .categories import SPECIALTIES
    from .tariff import catalogue_entry

    entry = catalogue_entry(procedure_id)
    if entry is None:
        raise KeyError(
            "no package or rate " + repr(procedure_id) + " in the published catalogues."
        )
    specialty = entry.get("specialtyCode") or entry.get("specialty", "")
    for category, prefixes in SPECIALTIES.items():
        if specialty in prefixes:
            return Coding(category)
    return Coding(
        "any",
        weak=(
            "The package's specialty (" + specialty + ") maps to no single survey "
            "ailment category, so the basis refers to the all-ailment figure."
        ),
    )
