"""
Settled bills, read back against the forecasts that preceded them.

The multiplier in `multiplier.py` is fitted from a 2017-18 household survey and
deflated forward. It is the best public estimate available and it is still an
estimate about a country, made in a year, from one ailment category. A bill that
somebody actually paid is an observation of the exact quantity that estimate is a
proxy for, and one of them is worth a great deal more per row than the survey is.

So this module does the only thing that can honestly be done with them: it nudges.

**What is observed, and why it is the ratio to p50 rather than to the anchor.**

The obvious quantity is `actual / anchor` -- a private-to-tariff ratio, directly
comparable to the multiplier. It is the wrong one. A forecast is not
`anchor x multiplier`; it is `anchor x multiplier x the band's median, plus the
midpoint of the published implant options`, and the last two terms vary by city
tier and by procedure. Comparing `actual / anchor` against the multiplier would
therefore charge the multiplier for errors that belong to the band or to the
implant, and would read a knee replacement -- where the implant can exceed the
package -- as an enormous multiplier miss.

`actual / p50` asks the narrower and answerable question: given everything the
model already knew about this admission, how far out was the middle of the band?
Its one impurity is that the implant midpoint sits inside both numerator and
denominator, so a pure implant miss is diluted rather than excluded. That is
recorded in the caveat rather than corrected, because correcting it would mean
storing the implant term alongside every outcome and the dilution is toward
under-reacting, which is the safe direction for a factor applied to everybody.

**Why the geometric mean.**

These are multiplicative errors. A forecast that came in at half the bill and one
that came in at twice it are equal and opposite, and their arithmetic mean is
1.25 -- a 25% upward correction invented out of two errors that cancel. In log
space they cancel, which is what they should do.

**Why it is shrunk, and what the prior weight means.**

`PRIOR_WEIGHT` is how many settled bills the survey estimate is worth. At 12, the
first bill moves the forecast by about a twelfth of the distance to what it
implies, ten bills move it about half way, and a hundred bills effectively
replace the survey. That is a judgement and is written here as a single number so
that it can be argued with: it was chosen so that no one bill can visibly move a
figure in front of a patient, and so that the tens of bills a single hospital
partner could supply would genuinely take over. It is not fitted, because there
is nothing yet to fit it on.

**What this is not.** It is not the retrain. Nothing is refitted here and the
model version does not change. This is a correction factor computed from the rows
that exist at the moment of the request, so a bill reported one minute is felt by
the next forecast. The retrain (`build.py`, `POST /retrain`) is the slower path
that folds bills into the booster itself; once it has, `forecast.py` stops passing
those bills here, by their timestamps, so none is counted twice.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

#: How many settled bills the survey-fitted multiplier is worth. See the module
#: docstring; this is a judgement, deliberately a single named number.
PRIOR_WEIGHT = 12.0

#: Ratios outside this are discarded rather than shrunk. A bill eight times the
#: middle of the band is far more likely to be rupees typed where paise were
#: asked for, or a whole year of treatment reported against one admission, than a
#: real miss -- and a single one of them, even shrunk, would move every forecast
#: on the deployment. The bound is on the raw observation, never on the fitted
#: factor, so a genuine run of large misses still accumulates.
USABLE = (0.2, 5.0)

#: A last stop on the fitted factor. With shrinkage and the bound above, nothing
#: realistic reaches it; it exists so that no arrangement of rows can put an
#: absurd number in front of somebody.
CLAMP = (0.5, 2.0)


@dataclass(frozen=True)
class Calibration:
    #: Bills used. Zero on a deployment nobody has reported one on, which is the
    #: ordinary state, and which leaves the forecast exactly as the survey fitted
    #: it.
    n: int
    #: What `centre` is multiplied by. Exactly 1.0 when n is 0.
    factor: float
    #: Bills discarded as unusable, reported rather than hidden.
    dropped: int
    #: One sentence for the forecast's caveats, or "" when there is nothing to say.
    note: str


NONE = Calibration(n=0, factor=1.0, dropped=0, note="")


def from_outcomes(observed: list[tuple[int, int]]) -> Calibration:
    """
    `observed` is (p50, actual) in paise, for forecasts this model already gave.

    Both are as they stood when the forecast was made. Recomputing p50 now would
    compare a bill against a model that has already been moved by that same bill,
    which is a loop that converges on flattering itself.
    """
    ratios = []
    dropped = 0
    for p50, actual in observed:
        if p50 <= 0 or actual <= 0:
            dropped += 1
            continue
        r = actual / p50
        if r < USABLE[0] or r > USABLE[1]:
            dropped += 1
            continue
        ratios.append(r)

    if not ratios:
        return Calibration(n=0, factor=1.0, dropped=dropped, note=_dropped_note(dropped))

    n = len(ratios)
    # Geometric mean, then shrunk toward 1.0 in log space by the prior's weight.
    observed_log = sum(math.log(r) for r in ratios) / n
    factor = math.exp(observed_log * n / (n + PRIOR_WEIGHT))
    factor = min(max(factor, CLAMP[0]), CLAMP[1])

    direction = "above" if factor > 1 else "below"
    note = (
        str(n) + (" settled bill has " if n == 1 else " settled bills have ")
        + "been reported against forecasts from this model, and they came in "
        + format(abs(factor - 1) * 100, ".0f") + "% " + direction + " the middle of "
        "the band after the survey estimate is given the weight of "
        + format(PRIOR_WEIGHT, ".0f") + " bills. That correction is applied above. "
        "It is a single factor over every procedure, it moves with each bill "
        "reported, and the implant part of an estimate sits inside both sides of "
        "the comparison, so a miss that is purely the implant is under-counted here."
    )
    if dropped:
        note += " " + _dropped_note(dropped)
    return Calibration(n=n, factor=factor, dropped=dropped, note=note)


def _dropped_note(dropped: int) -> str:
    if not dropped:
        return ""
    return (
        str(dropped) + (" reported bill was " if dropped == 1 else " reported bills were ")
        + "outside " + format(USABLE[0], ".1f") + "x to " + format(USABLE[1], ".0f")
        + "x the forecast and treated as mis-entered rather than as evidence."
    )
