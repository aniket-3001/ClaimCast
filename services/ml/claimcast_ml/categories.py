"""
Which PM-JAY specialties stand in for which survey ailment category.

The survey's level is for a *category* of ailment. The tariff prices a
*procedure*. To get from one to the other the model needs to know where the
procedure sits inside its category, and that needs a denominator: what the
government pays for a typical admission in that category.

This file is that denominator, and it is the weakest joint in the model, so it
is worth being precise about what it is and is not.

**What it is.** For each ailment category, the PM-JAY specialties whose packages
belong to it, and the mean package price across every one of those packages at a
given city tier. Urology's 125 packages are the denominator for genito-urinary,
Orthopaedics' 141 plus Polytrauma's 21 for musculo-skeletal, and so on.

**What it is not: a frequency-weighted average.** The catalogue lists a kidney
transplant and a cystoscopy on one row each, while real admissions are mostly
cystoscopies. So this mean sits above what the government actually pays per
admission, probably well above. That biases every shape factor downward by the
same rough proportion within a category, which is why the model reports the
factor rather than burying it, and why the check that matters is not this number
in isolation but whether the finished forecast lands inside the private range the
app already carries.

Getting the denominator right would need PM-JAY claim volumes by package. The
National Health Authority publishes claim counts, but not per package in
anything this project has verified, so the frequency weighting is an open item
rather than a solved one.

**Four categories have no clean specialty**, and they fall back to the mean over
the ClaimCast procedures coded into them, which is a much smaller and much
rougher denominator:

* *respiratory* -- pneumonia lives in General Medicine, which is 159 packages of
  everything from dengue to diabetic ketoacidosis. Filing all of it under
  respiratory would be worse than not mapping it.
* *childbirth* -- Obstetrics and Gynecology mixes deliveries with hysterectomies
  and fibroid surgery, and childbirth is the narrower thing.
* *infections* -- Infectious Diseases holds four packages, too few to average.
* *gastro-intestinal* -- General Surgery is mostly abdominal and is used, but it
  also carries hernias, thyroids and varicose veins, so the mapping is marked
  loose rather than clean.
"""

from __future__ import annotations

#: Ailment category -> the PM-JAY specialty prefixes that belong to it.
SPECIALTIES: dict[str, tuple[str, ...]] = {
    "cardio-vascular": ("MC", "SV"),
    "musculo-skeletal": ("SB", "ST"),
    "eye": ("SE",),
    "genito-urinary": ("SU",),
    "cancers": ("MO", "MR", "SC"),
    "psychiatric-neurological": ("SN", "MM"),
    "gastro-intestinal": ("SG",),
}

#: Categories whose mapping is defensible but not tight, reported to the caller.
LOOSE = {
    "gastro-intestinal": (
        "General Surgery is mostly abdominal but also carries hernias, thyroids "
        "and varicose veins"
    ),
    "psychiatric-neurological": (
        "Neurosurgery and Mental Disorders together, which is the survey's own "
        "pairing but an unusual one for a tariff"
    ),
}

#: Categories with no specialty to average over, and why.
UNMAPPED = {
    "respiratory": "pneumonia sits in General Medicine, which is 159 packages of everything",
    "infections": "Infectious Diseases holds four packages, too few to average",
    "childbirth": "Obstetrics and Gynecology mixes deliveries with gynaecological surgery",
}
