"""
The band: how far from the national average a particular admission might sit.

**What the band is a band around, stated before anything else.** The survey
publishes no quantile of what individual patients paid -- not one, in 127 pages.
Every cell in it is a mean over a stratum. So this is not a distribution of
bills. It is a distribution of *stratum means*, and the only question it can
honestly answer is the one the caller has not answered: you have not told me
which state you are in or what your household spends, so how far from the
national average might your stratum sit?

A real bill varies for reasons on top of this -- the individual hospital, the
surgeon, the complication that did or did not happen. None of that is in any
public source, so none of it is in this band, and the band is therefore narrower
than the spread of actual bills. That is the opposite of the usual failure and it
still needs saying, because a p10-to-p90 quoted to a patient reads like a promise.

**The two axes.** Table A17 gives private-hospital expenditure for 36 states and
union territories by sector; Table A18 and Table A29 give it for five household
expenditure quintile classes by sector. Each is expressed as a ratio to its own
all-India or all-class figure, so each says "a stratum like this sits k times the
average". A patient is in one state and one quintile, so the two are combined by
multiplying, over every pairing -- 36 states by 10 quintile ratios, 360 points per
sector.

Multiplying assumes the two axes are independent: that being in Kerala does not
change how much more the richest fifth outspends the poorest. The report gives no
way to test that, and it is the strongest assumption in the model. If the axes
reinforce each other the true spread is wider than this; if they offset, narrower.

**Empirical quantiles here; the booster learns from them.** The quantiles are
read straight off the empirical sample, a lognormal is fitted alongside purely as
a description of shape, and the two are reported together so the gap between them
is visible rather than hidden. The XGBoost booster in `booster.py` does not
replace this: it takes this sample as the labels of its tariff rows. The ETL
reads the Key Indicators report -- about a hundred published cells and no patient
records -- so a booster trained on those rows alone learns this band and nothing
the multiplication had not already decided, and `booster.py` says so. What it
adds is somewhere for settled bills to land: they are the rows with real labels,
and they are what can move the range for one procedure without moving it for all.

**The median sits below 1.** Urban p50 is 0.87, rural 0.96, because the mean of a
right-skewed distribution sits above its median: a few expensive states and the
richest quintile pull the average up. Normalising that away would make the
forecast's centre disagree with the published mean it is anchored on, so it is
left alone and the asymmetry is visible in the band.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

#: The quantiles the contract asks for. `ForecastResponse` is p10/p50/p90.
QUANTILES = (0.10, 0.50, 0.90)


@dataclass(frozen=True)
class Fit:
    #: Quantile level -> multiple of the centre, by sector.
    quantiles: dict[str, dict[str, float]]
    #: Lognormal parameters of the same sample, reported as a description of shape.
    lognormal: dict[str, dict[str, float]]
    #: Largest gap between the empirical and the fitted quantile, per sector.
    lognormal_gap: dict[str, float]
    #: Share of held-out state strata landing inside p10..p90, per sector.
    coverage: dict[str, float]
    #: Number of points the sample was built from, per sector.
    points: dict[str, int]


def quantile(sample: list[float], q: float) -> float:
    """
    The q-th quantile by linear interpolation between order statistics.

    Written out rather than taken from numpy because this runs at training time
    and at test time and the two must agree exactly; a version difference in a
    percentile convention would move a published band without anyone noticing.
    """
    if not sample:
        raise ValueError("no sample to take a quantile of")
    ordered = sorted(sample)
    if len(ordered) == 1:
        return ordered[0]
    pos = q * (len(ordered) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)


def _lognormal(sample: list[float]) -> dict[str, float]:
    logs = [math.log(x) for x in sample if x > 0]
    mu = sum(logs) / len(logs)
    var = sum((x - mu) ** 2 for x in logs) / (len(logs) - 1)
    return {"mu": mu, "sigma": math.sqrt(var)}


def _lognormal_quantile(p: dict[str, float], q: float) -> float:
    # The inverse normal CDF by Acklam's rational approximation, to about seven
    # decimal places -- enough for three quantiles and it keeps scipy out of the
    # runtime image.
    a = (-39.69683028665376, 220.9460984245205, -275.9285104469687,
         138.3577518672690, -30.66479806614716, 2.506628277459239)
    b = (-54.47609879822406, 161.5858368580409, -155.6989798598866,
         66.80131188771972, -13.28068155288572)
    c = (-0.007784894002430293, -0.3223964580411365, -2.400758277161838,
         -2.549732539343734, 4.374664141464968, 2.938163982698783)
    d = (0.007784695709041462, 0.3224671290700398, 2.445134137142996,
         3.754408661907416)
    plow, phigh = 0.02425, 1 - 0.02425
    if q < plow:
        t = math.sqrt(-2 * math.log(q))
        z = (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / (
            (((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1)
    elif q > phigh:
        t = math.sqrt(-2 * math.log(1 - q))
        z = -(((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / (
            (((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1)
    else:
        t = q - 0.5
        r = t * t
        z = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (
            ((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    return math.exp(p["mu"] + p["sigma"] * z)


def _coverage(states: list[float], quintiles: list[float]) -> float:
    """
    Leave-one-state-out coverage of the p10-to-p90 interval.

    Each state in turn is held out, the band is rebuilt from the remaining 35,
    and the held-out state's own quintile strata are checked against it. A band
    that is right should swallow 80% of them. This is the only backtest the data
    supports: there is no held-out year, because there is one survey round, and
    no held-out patient, because there are no patients.
    """
    inside = total = 0
    for i in range(len(states)):
        rest = [s * q for j, s in enumerate(states) if j != i for q in quintiles]
        lo, hi = quantile(rest, 0.10), quantile(rest, 0.90)
        for q in quintiles:
            total += 1
            if lo <= states[i] * q <= hi:
                inside += 1
    return inside / total if total else 0.0


def fit(state_ratio: dict[str, list[float]], quintile_ratio: dict[str, list[float]]) -> Fit:
    quantiles: dict[str, dict[str, float]] = {}
    lognormal: dict[str, dict[str, float]] = {}
    gap: dict[str, float] = {}
    coverage: dict[str, float] = {}
    points: dict[str, int] = {}

    for sector in sorted(state_ratio):
        states, quints = state_ratio[sector], quintile_ratio[sector]
        sample = [s * q for s in states for q in quints]
        points[sector] = len(sample)
        empirical = {format(q, ".2f"): quantile(sample, q) for q in QUANTILES}
        params = _lognormal(sample)
        quantiles[sector] = empirical
        lognormal[sector] = params
        gap[sector] = max(
            abs(empirical[format(q, ".2f")] - _lognormal_quantile(params, q))
            for q in QUANTILES
        )
        coverage[sector] = _coverage(states, quints)

    return Fit(
        quantiles=quantiles,
        lognormal=lognormal,
        lognormal_gap=gap,
        coverage=coverage,
        points=points,
    )
