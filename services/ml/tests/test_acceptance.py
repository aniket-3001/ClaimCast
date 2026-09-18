"""
The plan's acceptance check, and the sanity checks that found the bugs.

The plan's wording is: *assert every forecast falls within the procedure's
published `privateLow`/`privateHigh` spread or explains why not.* Both halves are
tested. `test_within_published_range` asserts the ones that land inside, and
`EXPLAINED` carries the ones that do not together with the reason, so that a
procedure cannot quietly start missing without someone writing down why.

`privateLow` and `privateHigh` are not a source. They are the app's own simulated
range, which slide 5 declares as simulated, and this test treats them as a
plausibility screen rather than as truth. The check that has real force is
`test_never_below_the_tariff`: PM-JAY rates sit at or below private cost, which
is why private hospitals object to them, so a forecast under the government's own
package price is wrong no matter what the app's range says. That check is what
caught the first construction of the model, which priced a bypass at 0.79 times
what PM-JAY pays for one.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from claimcast_ml import model as model_mod  # noqa: E402
from claimcast_ml import procedures, tariff  # noqa: E402
from claimcast_ml.coding import CODING  # noqa: E402
from claimcast_ml.forecast import forecast  # noqa: E402

#: The admissions each procedure is checked at. ICU days where the procedure
#: implies them, so the bed-day grid is exercised rather than assumed.
ICU_DAYS = {"p-sepsis": 4, "p-cabg": 2}
ROOM = {"p-sepsis": "icu"}

#: Procedures whose centre sits outside the app's simulated private range, and
#: why. A procedure may only be in here with a reason that names a source.
EXPLAINED = {
    "p-tkr": (
        "PM-JAY's SB039A is a primary total knee replacement for one knee and the "
        "ClaimCast procedure is bilateral; the scheme publishes no bilateral package. "
        "The anchor is therefore half the admission, which hbp-map.ts already records. "
        "The scheme's own implant allowance corroborates the gap: Rs 55,000 a knee, so "
        "Rs 1.1 lakh for the pair, against the engine's Rs 1.2 lakh domestic option."
    ),
    "p-delivery": (
        "Misses its simulated low by 8%, and the reason is the band rather than the "
        "level. The median stratum sits 13% below the published mean in urban India "
        "because the distribution is right-skewed, so a p50 compared against a range "
        "built around a mean reads low. The centre before the band, Rs 33,700, is "
        "inside the range."
    ),
    "p-chemo": (
        "The anchor is a CGHS administration fee and excludes the cytotoxic drug, "
        "which is most of the cost. HBP 2022 Annexure-2 lists high-end drugs and "
        "would close this; it has not been parsed."
    ),
    "p-sepsis": (
        "Anchored on PM-JAY's bed-day grid, which prices any medical admission the "
        "same per day whatever failed. The app's range is for septic shock "
        "specifically, which is the expensive end of that grid's population."
    ),
    "p-pneumonia": (
        "The same bed-day grid, for the same reason: PM-JAY publishes no package "
        "for pneumonia and prices it as a medical admission by bed category."
    ),
    "p-observation": (
        "A nineteen-hour observation the engine refuses outright for failing the "
        "definition of hospitalisation. The forecast is only ever the "
        "counterfactual, and no tariff prices a stay that is not an admission."
    ),
    "p-csection": (
        "The survey's childbirth figures exclude transport, food and lodging, and "
        "the app's range appears to be a whole out-of-pocket figure."
    ),
}


@pytest.fixture(scope="module")
def m():
    return model_mod.load()


def _centre(m, pid, tier="X"):
    p = procedures.procedures()[pid]
    return forecast(
        m, pid, tier, True, ROOM.get(pid, "semi_private"),
        p["medianStayDays"], ICU_DAYS.get(pid, 0),
    )


@pytest.mark.parametrize("pid", [p for p in CODING if p not in EXPLAINED])
def test_within_published_range(m, pid):
    p = procedures.procedures()[pid]
    f = _centre(m, pid)
    assert p["privateLow"] <= f.p50 <= p["privateHigh"], (
        pid + " forecasts Rs " + format(f.p50 // 100, ",") + " against a published "
        "range of Rs " + format(p["privateLow"] // 100, ",") + " to Rs "
        + format(p["privateHigh"] // 100, ",") + ". Either the model moved or the "
        "procedure belongs in EXPLAINED with a reason."
    )


@pytest.mark.parametrize("pid", sorted(EXPLAINED))
def test_explained_misses_still_miss(m, pid):
    """A procedure in EXPLAINED that starts passing should leave EXPLAINED."""
    p = procedures.procedures()[pid]
    f = _centre(m, pid)
    assert not (p["privateLow"] <= f.p50 <= p["privateHigh"]), (
        pid + " now lands inside its published range, so its entry in EXPLAINED is "
        "stale and should be deleted."
    )


@pytest.mark.parametrize("pid", sorted(CODING))
@pytest.mark.parametrize("tier", ["X", "Y", "Z"])
def test_never_below_the_tariff(m, pid, tier):
    """
    No forecast may fall below the government rate it is anchored on.

    PM-JAY and CGHS rates are at or below private cost. A private-hospital
    forecast under one of them is not a low estimate, it is a wrong one.
    """
    p = procedures.procedures()[pid]
    f = _centre(m, pid, tier)
    assert f.p50 > f.anchor["amount"], (
        pid + " at tier " + tier + " forecasts Rs " + format(f.p50 // 100, ",")
        + " against a " + f.anchor["scheme"] + " rate of Rs "
        + format(f.anchor["amount"] // 100, ",") + "."
    )
    assert p is not None


@pytest.mark.parametrize("pid", sorted(CODING))
def test_band_is_ordered_and_split_sums(m, pid):
    f = _centre(m, pid)
    assert f.p10 < f.p50 < f.p90, pid + " has a band that is not ordered."
    assert sum(f.split.values()) == f.p50, (
        pid + "'s split sums to Rs " + format(sum(f.split.values()) // 100, ",")
        + " against a p50 of Rs " + format(f.p50 // 100, ",") + ". The engine "
        "adjudicates the split, so a split that is not the total is a wrong claim."
    )


@pytest.mark.parametrize("pid", sorted(CODING))
def test_never_predicts_an_adjudication_outcome(m, pid):
    """
    `outside_window` and `non_payable` are the engine's to decide, not the model's.

    A line is outside the window because of when it was incurred and non-payable
    because List I names it. Forecasting either would be the cost model guessing
    at the thing the deterministic core exists to determine.
    """
    f = _centre(m, pid)
    assert f.split["outside_window"] == 0
    assert f.split["non_payable"] == 0


def test_icu_share_appears_only_with_icu_days(m):
    p = procedures.procedures()["p-sepsis"]
    with_icu = forecast(m, "p-sepsis", "X", True, "icu", p["medianStayDays"], 4)
    without = forecast(m, "p-sepsis", "X", True, "general", p["medianStayDays"], 0)
    assert with_icu.split["icu"] > 0
    assert without.split["icu"] == 0
    assert with_icu.p50 > without.p50, (
        "four days in intensive care must cost more than none. Days reach the "
        "estimate only through the tariff's bed-day grid, so if this fails the grid "
        "is not being read."
    )


def test_icu_days_cannot_exceed_the_stay(m):
    with pytest.raises(ValueError):
        forecast(m, "p-sepsis", "X", True, "icu", 3, 5)


def test_unknown_procedure_refuses_rather_than_guesses(m):
    with pytest.raises(KeyError):
        forecast(m, "p-not-a-procedure", "X", True, "general", 3, 0)


def test_implant_procedures_carry_the_implant(m):
    """The four implant procedures were exactly the four that fell furthest short."""
    for pid in ("p-tkr", "p-cataract", "p-angioplasty", "p-spine-fusion"):
        f = _centre(m, pid)
        assert f.split["implant"] > 0, pid + " lost its implant."
        assert any("implant is priced at the midpoint" in c for c in f.caveats)


def test_every_forecast_names_its_sources(m):
    for pid in CODING:
        f = _centre(m, pid)
        assert f.anchor["sourceId"], pid + " has an anchor with no source."
        assert f.model_version and f.trained_on
        assert "NSS" in f.basis or "survey" in f.basis


def test_the_multiplier_is_the_one_fitted_number(m):
    """
    The model has exactly one fitted scalar, and it is above 1.

    Below 1 would mean private hospitals charging less than the government pays,
    which is the artefact the first construction produced; see multiplier.py.
    """
    assert 1.0 < m.multiplier < 10.0
    assert m.raw["multiplier"]["estimatedFrom"] == "childbirth"


def test_the_denominator_is_the_catalogue_not_the_app(m):
    """
    Six of nine categories hold one ClaimCast procedure, so a denominator over the
    app's own list would make the shape factor 1 by construction. It is the
    published catalogue instead.
    """
    mean, n, _note = tariff.category_tariff_mean("genito-urinary", "X")
    assert n > 50 and mean > 0


@pytest.mark.parametrize("pid", ["p-tkr", "p-cataract", "p-angioplasty", "p-spine-fusion"])
def test_private_implant_exceeds_the_government_allowance(m, pid):
    """
    The published allowance is the one real check on the implant side.

    PM-JAY states an implant allowance on 349 of its 1,949 packages, paid on top
    of the package price. It is a government allowance rather than a market
    price, so a private implant costing less than it would be the same kind of
    inversion as a forecast below the package price.
    """
    allowance = tariff.implant_allowance(pid)
    assert allowance is not None
    options = m.implant_options[pid]
    assert options[0] >= allowance[0], (
        pid + "'s cheapest implant option is Rs " + format(options[0] // 100, ",")
        + " against a PM-JAY allowance of Rs " + format(allowance[0] // 100, ",") + "."
    )
