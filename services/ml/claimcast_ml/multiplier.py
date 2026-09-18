"""
The private-to-tariff multiplier: how much more a private hospital charges than
the government pays for the same admission.

This is the one fitted number in the cost model, and it is isolated here for the
same reason the CPI deflator is isolated in its own module: a single scalar that
someone can disagree with is worth more than a scalar buried inside a pipeline.

**Why it is a multiplier on the tariff and not a level from the survey.**

The obvious construction is the other one. The survey publishes a private-hospital
mean for each ailment category; multiply it by where this procedure sits inside
its category and you have an estimate. That was built first and it fails, in a way
worth recording because the failure is what justifies this module.

The survey's category mean is an average over *admissions*: the cardio-vascular
cell is mostly chest pain, arrhythmia and heart failure, because that is what
cardiac admissions mostly are. The PM-JAY catalogue is a list of *packages*, one
row each, and the cardiac specialties MC and SV are mostly major surgery, because
that is what a surgical catalogue mostly is. Dividing one by the other compares
two different populations, and the ratio comes out at:

    cardio-vascular          0.79      musculo-skeletal        3.55
    psychiatric-neurological 1.38      eye                     3.36
    gastro-intestinal        1.67      cancers                 3.58
    genito-urinary           1.78      childbirth              3.37

A ratio of 0.79 says a private hospital charges less for a cardiac admission than
PM-JAY pays for one. That is not a finding, it is an artefact: PM-JAY rates are
below private cost, which is the entire reason private hospitals complain about
them. The ratio is depressed exactly where the catalogue is richer than the
admission mix, and it is depressed by an amount nobody can measure without claim
volumes per package, which the National Health Authority does not publish in
anything this project has verified.

**Where the number comes from.**

Childbirth is the one category where the two sources price the same population.
The survey's Table A29 gives private-hospital expenditure on a delivery. The
tariff's denominator for childbirth is not a specialty catalogue but the two
delivery packages themselves, SO074A and SO057A, averaged -- which assumes a
caesarean rate of 50%, and the private-sector caesarean rate in NFHS-5 is close
to that. So the numerator and the denominator describe the same event, and their
ratio is a multiplier rather than an artefact:

    Rs 42,175 (Table A29, private, urban, deflated) / Rs 12,500 (mean of the two
    packages at tier X) = 3.37

Eye lands at 3.36 off an unrestricted catalogue, which is a pleasing coincidence
and is treated as one. Ophthalmology's 58 packages average Rs 10,765 against a
cataract package of Rs 5,700, so that catalogue is *not* cataract-weighted and
its agreement is luck, not corroboration. The estimate rests on childbirth alone.

**So n = 1, and that is the honest description of it.** One category, one number,
applied to every procedure. It is reported in every forecast's `basis` with the
table above, so that a reader can see both what was used and what was rejected.

**What the multiplier deliberately does not do** is bend with the size of the
procedure. Childbirth also shows that the tariff compresses the gap between a
cheap procedure and an expensive one -- a caesarean is 1.50x a normal delivery in
PM-JAY and about 2.2x to 2.5x in the survey. Correcting that would mean an
exponent, and the exponent implied by that single pair is 2.1, which applied to a
lumbar fusion's position in its own category would forecast about Rs 10 lakh. An
exponent fitted to one point is a worse error than the compression it fixes, so
the compression is reported and not corrected. See `tariff.py`.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import tariff
from .survey import Survey

#: The category the multiplier is estimated from, and the tier and sector it is
#: estimated at. Childbirth because it is the only category where the survey and
#: the tariff price the same clinical population; see the module docstring.
ESTIMATED_FROM = "childbirth"
ESTIMATED_AT_TIER = "X"
ESTIMATED_AT_SECTOR = "urban"


@dataclass(frozen=True)
class Multiplier:
    #: The fitted ratio of private charge to government tariff.
    value: float
    #: Every category's implied ratio, as evidence for and against the fitted one.
    by_category: dict[str, float]
    #: What each category's denominator was, so a reader can see which are
    #: catalogue means over a mismatched population and which are not.
    denominator: dict[str, str]
    basis: str


def estimate(survey: Survey) -> Multiplier:
    by_category: dict[str, float] = {}
    denominator: dict[str, str] = {}
    for category, sector in survey.level:
        if sector != ESTIMATED_AT_SECTOR or category == "any":
            continue
        mean, _n, note = tariff.category_tariff_mean(category, ESTIMATED_AT_TIER)
        if mean <= 0:
            mean, note = tariff._peer_mean(category, ESTIMATED_AT_TIER, True, "semi_private")
        if mean <= 0:
            continue
        by_category[category] = survey.level[(category, sector)] / mean
        denominator[category] = note

    if ESTIMATED_FROM not in by_category:
        raise SystemExit(
            "the private-to-tariff multiplier is estimated from the " + ESTIMATED_FROM
            + " category and that category produced no ratio. It is the only category "
            "where the survey and the tariff price the same population, so there is "
            "deliberately no second choice to fall back to."
        )

    value = by_category[ESTIMATED_FROM]
    ranked = sorted(by_category.items(), key=lambda kv: kv[1])
    return Multiplier(
        value=value,
        by_category=by_category,
        denominator=denominator,
        basis=(
            "Private charge estimated at " + format(value, ".2f") + "x the government "
            "tariff, from the one ailment category where the survey and the tariff "
            "price the same event: private-hospital expenditure on a delivery (NSS 75th "
            "round, Table A29, deflated to December 2025) against the mean of the two "
            "PM-JAY delivery packages. The same ratio computed for the other categories "
            "ranges from " + format(ranked[0][1], ".2f") + " (" + ranked[0][0] + ") to "
            + format(ranked[-1][1], ".2f") + " (" + ranked[-1][0] + "), but those "
            "compare a survey average over admissions with an unweighted average over "
            "catalogue rows, which are different populations; they are reported as "
            "evidence, not used. One category is one observation."
        ),
    )
