"""
The forecast split by line kind, without which the number is useless.

The engine adjudicates by `LineKind`. The room-rent circular's proportionate
deduction bites on room and on associated medical expenses and must not bite on
anything else; the implant sub-limit bites on the implant alone; List I bites on
non-payables. A single predicted total tells the engine nothing it can act on, so
the forecast has to arrive already divided.

**Where the division comes from.** NSS Statement 3.17 gives the composition of
private-hospital expenditure by component, separately for rural and urban:
package, doctor's and surgeon's fee, medicines, diagnostics, bed charges, other.
Those are survey categories, not the circular's categories, and mapping between
them is a judgement:

* *bed charges* -> `room`. Direct.
* *doctor's and surgeon's fee* -> `associated`. The 2020 circular names the fees
  of the surgeon, anaesthetist and consultants as associated medical expenses,
  because they are the charges that move with the room category.
* *medicines*, *diagnostics*, *other* -> `independent`. The circular is explicit
  that pharmacy, consumables, medical devices and diagnostics are excluded from
  associated medical expenses, which is precisely what makes them independent of
  the room and immune to the proportionate deduction. Putting them anywhere else
  would hand the insurer a deduction the wording does not allow.

**The package problem.** The largest component, at 40% of the urban private bill,
is "package" -- a hospital that billed the episode as one bundled figure. A
package is by construction not itemised, so the survey cannot say what is in it
and neither can this module. It is redistributed across the other five in their
own observed proportions, which assumes a packaged bill is made of the same
things as an itemised one in the same proportions. That is an assumption, it is
the second largest in the model after the independence of the two band axes, and
it is stated in every forecast rather than buried here.

**ICU** is not a survey component and is not taken from the survey. When the
admission has ICU days, the room share is divided between `room` and `icu` by the
published bed-day rates for the two, which is the tariff measuring the thing it
actually measures.

**`outside_window` and `non_payable` are always zero**, and that is deliberate
rather than an omission. Neither is a property of what a hospital charges. A line
is outside the policy window because of when it was incurred, and non-payable
because List I names it -- both are adjudication outcomes the engine derives from
the itemised bill and the wording. A cost model that guessed at them would be
inventing the very thing the deterministic core exists to decide.
"""

from __future__ import annotations

#: Survey component -> the line kind it is charged as. `package` is absent
#: because it is redistributed rather than mapped; see the module docstring.
KIND_FOR_COMPONENT = {
    "bed": "room",
    "doctor-surgeon-fee": "associated",
    "medicines": "independent",
    "diagnostics": "independent",
    "other": "independent",
}

#: Redistributed rather than mapped, because a package is not itemised.
BUNDLED = "package"

#: Every line kind the contract defines, so the split is always complete.
KINDS = (
    "room", "associated", "icu", "independent",
    "implant", "outside_window", "non_payable",
)


def shares(component_share: dict[str, float]) -> dict[str, float]:
    """
    Line-kind shares of a private hospital bill, before ICU and implant.

    The bundled component is spread over the rest in their own proportions, which
    is the same as simply dropping it and renormalising -- written out as a
    redistribution because that is what it means, and because a reader checking
    this against Statement 3.17 should see the step rather than infer it.
    """
    itemised = {k: v for k, v in component_share.items() if k != BUNDLED}
    total = sum(itemised.values())
    if total <= 0:
        raise SystemExit(
            "Statement 3.17's itemised components sum to nothing, so the bundled "
            "`package` component cannot be redistributed over them and the forecast "
            "cannot be split by line kind."
        )
    out = {k: 0.0 for k in KINDS}
    for component, value in itemised.items():
        kind = KIND_FOR_COMPONENT.get(component)
        if kind is None:
            raise SystemExit(
                "Statement 3.17 carries a component " + repr(component) + " that this "
                "module has no line kind for. Deciding which kind a component is "
                "charged as changes what the room-rent circular deducts, so it is a "
                "judgement to be made in split.py rather than guessed at here."
            )
        out[kind] += value / total
    return out


def apply(
    base: dict[str, float],
    total: int,
    implant: int,
    room_rate: int,
    icu_rate: int,
    days: int,
    icu_days: int,
) -> dict[str, int]:
    """
    The split in paise, with ICU carved out of room and the implant added on top.

    `total` is the forecast for the admission excluding the implant, because the
    implant is priced from its own published options rather than from the survey.
    The returned figures sum to `total + implant`.
    """
    out = {k: 0 for k in KINDS}
    for kind, share in base.items():
        out[kind] = round(total * share)

    ward_days = max(days - icu_days, 0)
    if icu_days > 0 and room_rate > 0 and icu_rate > 0:
        ward_weight = ward_days * room_rate
        icu_weight = icu_days * icu_rate
        denominator = ward_weight + icu_weight
        if denominator > 0:
            room = out["room"]
            out["icu"] = round(room * icu_weight / denominator)
            out["room"] = room - out["icu"]

    out["implant"] = implant

    # Rounding seven shares independently loses or gains a paisa or two, and a
    # split that does not sum to the total is a bug the engine would surface as a
    # one-paisa discrepancy in the patient's figure. The largest kind absorbs it.
    drift = (total + implant) - sum(out.values())
    if drift:
        largest = max((k for k in KINDS if k != "implant"), key=lambda k: out[k])
        out[largest] += drift
    return out
