# ClaimCast — The Complete Reference

**GE HealthCare Precision Care Challenge 2026 · Phase 1, Idea Submission**
**Team Rocket · Indraprastha Institute of Information Technology, Delhi (IIIT-Delhi)**
**Track: Hospitality — Holistic Optimization System for Policy-Integrated Admission & Treatment Intelligence**

---

## How to read this document

This is the single explanatory companion to the five-slide concept paper submitted as
`Team Rocket_IIIT Delhi.pptx` / `.pdf`.

It is written for someone who has **never** read an Indian health-insurance policy and does not
know what a "sub-limit" or a "TPA" is. Every term used on the slides is defined here before it is
used in an argument. Every number on the slides is traced back to its source, and where a number
could **not** be traced, this document says so explicitly rather than quietly asserting it.

It has seven parts:

| Part | What it covers |
|---|---|
| 0 | The competition: what was asked for, and how it is scored |
| 1 | The glossary — every term on the slides, defined |
| 2 | The core mechanic: proportionate deduction, worked out in full |
| 3 | Slide-by-slide walkthrough, every number explained |
| 4 | The research dossier — full citations and what each source actually says |
| 5 | **Known problems in the submitted deck** — read this one |
| 6 | How the deck is built (the code in `src/`) |

A note on confidence. Throughout, claims are tagged:

- **[VERIFIED]** — a primary or reliable secondary source was retrieved and read.
- **[PARTIAL]** — the substance is confirmed, but an exact figure or exact wording is not.
- **[UNVERIFIED]** — could not be confirmed. Treat as a liability until checked.

---

# Part 0 — The competition

## 0.1 What the track asks for

The Hospitality problem statement is titled, in full:

> **Hospitality: Holistic Optimization System for Policy-Integrated Admission & Treatment
> Intelligence**

It concerns building a system that helps patients and caregivers navigate hospital admission and
treatment decisions with their insurance policy integrated into the decision, rather than
discovered afterwards.

Two constraints from the problem statement shape everything ClaimCast does:

1. **The system must not provide medical diagnoses, clinical treatment recommendations, or binding
   insurance advice.** This is why ClaimCast is deliberately *only* a money tool. It never says
   "have this procedure" or "your claim will be paid". It says "under this wording, this many
   rupees are refused, and here is the clause that refuses them". The last line of slide 5 —
   *"no medical advice, money only"* — is a direct answer to this constraint.

2. **Use only synthetic or user-provided mock data**, and publicly available or simulated hospital
   datasets. **No data is provided by GE HealthCare.** This is why slide 4's PROS column says
   *"Runs entirely on public data"*, and why slide 5 separates what the team **builds** from what
   it **simulates**. It is not a hedge; it is compliance with the brief.

## 0.2 How it is scored

| Weight | Criterion |
|---|---|
| 30% | Working solution |
| 30% | Innovative use of AI |
| 20% | Vision and pathway |
| 20% | Enterprise / commercial viability |

The deck is laid out against this rubric. Slides 3 and 4 carry the 30% + 30%; slide 5's
build-vs-simulate table and architecture diagram carry the 20% vision-and-pathway; the rule-pack
line (*"private, PM-JAY, ESI"*) and the comparison table carry the 20% enterprise.

## 0.3 Why the track number is absent from the deck

The official problem-statement PDFs carry **no numbers**. Ordering on the Unstop listing page is
not a stable identifier and differs from the order of the files in the distributed ZIP. Rather
than assert a number that could be wrong on a submitted document, slide 1 names the track by its
**official title, verbatim**:

> `TRACK: HOSPITALITY · Holistic Optimization System for Policy-Integrated Admission & Treatment Intelligence`

This is unambiguous regardless of how the organisers number the tracks. It was a deliberate
decision, not an omission.

---

# Part 1 — Glossary

Everything below appears somewhere on the slides or in the research. Read this once and the rest
of the document is plain English.

## 1.1 The regulator and the rulebook

**IRDAI** — the **Insurance Regulatory and Development Authority of India**. The statutory body
that licenses insurers and writes the rules they must follow, created by the IRDA Act, 1999. When
IRDAI issues a *circular*, it is binding on every insurer in India.

**Circular** — a binding instruction from IRDAI to insurers. Cited by a reference number of the
form `IRDAI/HLT/REG/CIR/151/06/2020`, which decodes as: IRDAI / Health department / Regulation /
Circular / serial 151 / month 06 / year 2020.

**Master Circular** — a consolidation. IRDAI's **Master Circular on Health Insurance Business,
dated 29 May 2024**, replaced 55 separate earlier circulars with a single rulebook. This is
reference 4 on slide 5.

**Bima Lokpal / Insurance Ombudsman** — a free, government-established grievance forum where a
policyholder can escalate a rejected or short-paid claim without going to court. *Bima* is Hindi
for insurance. IRDAI's Chairman spoke at Bima Lokpal Day 2025, which is the setting for the
quotation on slide 2.

## 1.2 The anatomy of a policy

**Sum insured (SI)** — the maximum total the insurer will pay in a policy year. A "₹5 lakh policy"
has a sum insured of ₹5,00,000.

> *Indian number notation:* one **lakh** = 100,000; one **crore** = 10,000,000. Indian digit
> grouping writes 500,000 as `5,00,000` and 3,310,000 as `33,10,000`. "₹3.31 L" on slide 2 means
> ₹3,31,000 — three lakh thirty-one thousand rupees.

**Premium** — what you pay annually for the cover.

**Sub-limit** — a cap *inside* the sum insured, applying to one category of expense. Even with
₹5 lakh of cover a policy may cap the room at ₹5,000 a day, cataract surgery at ₹40,000 an eye, and
an ambulance at ₹2,000. Sub-limits are where most unexpected shortfalls originate.

**Room rent capping** — the specific sub-limit on the daily room charge. Expressed either as a flat
rupee amount or as a percentage of sum insured (commonly 1% or 2% per day).

**Co-payment (co-pay)** — a fixed percentage of the *admissible* claim that the policyholder pays
regardless of everything else. A 5% co-pay on a ₹4,00,000 admissible claim is ₹20,000 out of pocket
even though the claim was fully approved.

**Deductible** — an amount you pay first, before the policy responds at all. Distinct from a co-pay,
which is a share of the whole.

**Waiting period** — a span at the start of a policy during which certain conditions are not
covered. Typically 30 days for anything but accidents, 2–4 years for named ailments, and 3–4 years
for pre-existing disease.

**Pre-existing disease (PED)** — a condition diagnosed or treated before the policy began.

**Moratorium period** — after a set number of months of continuous cover, the insurer loses the
right to reject a claim on the ground that you failed to disclose something. The **2024 Master
Circular fixed this at 60 months (5 years)**; only proven fraud and permanent contractual
exclusions survive it. **[VERIFIED]**

**Free-look period** — a window after purchase in which you can cancel for a refund. Set at
**30 days** by the 2024 Master Circular. **[VERIFIED]**

**Policy wording** — the actual legal contract, typically 30–60 pages. Almost nobody reads it. This
is the document ClaimCast asks the user to upload.

## 1.3 How a hospital bill is settled

**Cashless** — the insurer pays the hospital directly; you walk out without settling the bill
yourself. Requires the hospital to be in the insurer's **network** and requires
**pre-authorisation**.

**Reimbursement** — you pay the hospital in full from your own money, then file a claim and wait
weeks to be paid back. This is why slide 3's decision 3 is captioned *"what you must float"* —
"float" meaning money you must find up front even though it is ultimately owed back to you. For a
₹2 lakh admission this is a cash-flow event even for a fully insured household.

**Pre-authorisation (pre-auth)** — the request a hospital sends the insurer before or during
admission, asking it to confirm it will pay. The **2024 Master Circular requires the insurer to
decide within 1 hour** of receiving the request, and to grant **final discharge authorisation
within 3 hours**; cost caused by delay beyond that is charged to the insurer's shareholder funds,
not to the policyholder. **[VERIFIED]**

> A caveat worth knowing: these clocks bind the **insurer**, not the hospital — IRDAI does not
> regulate hospitals. A TPA, however, is the insurer's agent, so a TPA delay still puts the insurer
> in breach. And the rule governs the **speed** of the decision, never its **outcome**: a claim can
> still be reduced for sub-limits, co-pay, waiting periods or proportionate deduction inside the
> one-hour window. That distinction is precisely the gap ClaimCast addresses — fast approval of a
> smaller number than you expected is still a shock.

**TPA — Third Party Administrator** — a company that processes claims on the insurer's behalf. The
"TPA desk" in a hospital lobby is staffed by, or on behalf of, the *insurer*. Slide 4's comparison
table makes this point in the row *"Acts for"*: the hospital/TPA desk acts for the hospital, policy
chatbots act for no one, ClaimCast acts for **you**.

**Network hospital / empanelled hospital** — a hospital with an agreement with the insurer (or,
under PM-JAY, with the government scheme) allowing cashless treatment at agreed rates.

**Adjudication** — the process of applying the policy's rules line by line to a submitted bill to
determine what is payable. This is the word insurers use internally. ClaimCast's central claim is
that adjudication is *arithmetic*, and arithmetic can be run before the bill exists.

## 1.4 What gets refused

**Non-payable items / non-medical expenses** — items on a hospital bill that health policies do not
pay for. IRDAI standardised these into **four lists**: **[VERIFIED]**

| List | Meaning |
|---|---|
| **List I** | **Items not payable at all.** ~68 optional / non-medical items — gloves, admission and record fees, attendant charges, toiletries, television, food for relatives. The patient pays these in every case. |
| **List II** | Items **subsumed into room charges** — deemed already included in the room rent, so not separately billable. |
| **List III** | Items **subsumed into procedure charges** — deemed included in the surgical or procedure fee. |
| **List IV** | Items **subsumed into the cost of treatment** generally. |

Slide 3's decision 4 (*"sub-limits & List I"*) and slide 5's data line (*"IRDAI List I
non-payables"*) refer to List I specifically, because it is the list that creates cash the patient
must find and is entirely predictable in advance — which makes it perfect input for a forecast.

**Proportionate deduction** — the single most important mechanic in this project. Part 2, in full.

## 1.5 When cover applies

**In-patient / hospitalisation** — treatment requiring admission. The classical condition is the
**24-hour rule**: the policy responds only if the patient is admitted for at least 24 continuous
hours.

**Day-care procedure** — a defined exception. Procedures that modern medicine completes in under 24
hours (cataract, dialysis, chemotherapy, lithotripsy and so on) are covered despite the 24-hour
rule — **if they appear on the policy's day-care list**. Whether a given procedure is on a given
insurer's list is not obvious and varies between insurers. This is slide 3's decision 5: the
difference between a stay classified as day-care and one classified as in-patient can be the
difference between a paid and an unpaid claim, and it is often decided by how the hospital writes
the admission note.

**OPD (out-patient department)** — treatment without admission. Usually not covered at all by
standard indemnity policies.

## 1.6 Public schemes and public price lists

**NHA — National Health Authority** — the government body that runs PM-JAY.

**PM-JAY — Ayushman Bharat Pradhan Mantri Jan Arogya Yojana** — India's government health assurance
scheme, providing ₹5 lakh per family per year of secondary and tertiary hospitalisation cover to
eligible households.

**HBP — Health Benefit Package** — PM-JAY's master price list. It defines bundled ("case-bundled")
package rates: one price covering pre-procedure diagnostics, the procedure itself, the
hospitalisation, and 15 days of follow-up medicines. The 2022 revision brought the count to
**1,949 procedures across 27 specialties** — the "≈1,900 procedure rates" on slide 5. Version 2.2
of the HBP had earlier revised roughly 400 rates upward by 20–400%. Procedures absent from the
schedule are payable as an "Unspecified Procedure" up to ₹1,00,000 within the overall ₹5,00,000
cover. **[VERIFIED]**

**CGHS — Central Government Health Scheme** — the health scheme for central government employees
and pensioners. CGHS publishes **city-wise rate lists** for procedures and investigations, with
cities graded into tiers. These lists are public and granular, and are widely used across the
industry as a price benchmark. They are the second pillar of ClaimCast's cost model.
**[PARTIAL — the existence and public availability of CGHS city-wise rates is well established;
no single authoritative rate document was retrieved during this research pass. Pull the current
schedule from the CGHS portal before Phase 2.]**

**ESI — Employees' State Insurance** — the statutory scheme covering lower-income formal-sector
workers. Named on slide 4 as a third rule-pack, to show the engine generalises beyond private
insurance.

**Arogya Sanjeevani** — IRDAI's **standard** health policy. Every general and standalone health
insurer is required to offer it, and its terms are **prescribed by the regulator**, so the wording
is essentially identical across companies. Its published structure: **[VERIFIED]**

- Room rent: up to **2% of sum insured**, capped at **₹5,000/day**
- ICU: up to **5% of sum insured**, capped at **₹10,000/day**
- Mandatory **5% co-payment** on every claim
- Cataract: 25% of SI or ₹40,000 per eye, whichever is lower
- Ambulance: ₹2,000 per hospitalisation
- Cumulative bonus: 5% per claim-free year, to a maximum of 50%
- **Room or ICU rent above these limits triggers proportionate deduction**

Arogya Sanjeevani matters to ClaimCast for a specific engineering reason: because its wording is
regulator-standardised and identical across insurers, it is the one real policy the team can build
and test a constraint parser against without needing any commercial insurer's cooperation. It is
the reference implementation — and it conveniently demonstrates the room-rent trap, because the 2%
rule bites hardest exactly where cover is thinnest. At ₹5 lakh SI the room cap is ₹10,000/day; at
₹3 lakh it is ₹6,000; at ₹1 lakh it is ₹2,000 — below the general-ward rate of many private
hospitals.

## 1.7 The economics vocabulary

**OOPE — out-of-pocket expenditure** — money the patient's household actually pays from its own
funds, after any insurance or scheme has paid.

**Catastrophic health expenditure (CHE)** — a standard health-economics threshold: health spending
exceeding a defined share (commonly 10% or 25%) of household consumption or income. A household
crossing it is being financially damaged by the illness, irrespective of the clinical outcome.

**Distress financing** — paying for treatment by selling assets, borrowing at interest, or
liquidating savings, rather than from income. A recognised indicator of financial harm.

**Financial toxicity** — the health-economics term for the harm the *cost* of treatment does to the
patient, treated as a side effect of care in its own right, alongside the clinical side effects.
Borrowed from oncology, where it originated.

**Treatment abandonment** — stopping a course of treatment before completion for financial reasons.
The most severe endpoint on this scale, and the one slide 2 closes on: cost shock *"decides whether
treatment finishes."*

## 1.8 The AI vocabulary

**LLM — Large Language Model** — a model such as Claude or GPT that reads and writes natural
language. Excellent at reading a 40-page policy PDF and finding the room-rent clause. **Not**
reliable at arithmetic you must be able to defend to a regulator.

**RAG — Retrieval-Augmented Generation** — the standard pattern behind "policy chatbots": find the
relevant chunk of the document, put it in the prompt, let the model answer from it. It **retrieves
and paraphrases**. It does not compute. Slide 3's closing claim — *"Retrieval → Simulation"* — is
the assertion that ClaimCast changes the category of the task, not just its quality.

**Deterministic** — given the same inputs, always produces exactly the same output, by a rule you
can print. The opposite of a probabilistic model, which may answer differently on two runs.
ClaimCast's adjudication engine is deterministic *on purpose*: every rupee it refuses must be
reproducible and traceable to a clause. This is also what makes it auditable, which is what makes
it saleable to an insurer.

**Counterfactual** — "what would have happened if you had chosen differently". ClaimCast's
counterfactual solver re-runs the same claim under each legal alternative (this room instead of
that one, this hospital instead of that one) and ranks them by how much money the patient keeps.

**Constraint parser** — the component that turns prose in a policy PDF ("Room rent shall be limited
to 1% of the Sum Insured per day") into a machine-checkable rule (`room_rate_cap = 0.01 * SI`).

**Materiality filter** — ClaimCast's own term, introduced on slide 3. The system computes the money
at stake for every decision it *could* comment on, and stays silent unless it exceeds ₹10,000. It
is the answer to feature bloat: a caregiver at 2 a.m. should be shown three things that matter, not
thirty that might.

---

# Part 2 — Proportionate deduction, in full

This is the mechanic the entire project is built on. If you read only one section of this document,
read this one.

## 2.1 The rule

**Source: IRDAI Circular `IRDAI/HLT/REG/CIR/151/06/2020`, dated 11 June 2020. [VERIFIED]**

Your policy caps your room at, say, ₹5,000 a day. You are admitted to a room costing ₹10,000 a day.
Two things then happen — and most people only know about the first.

**First**, and obviously: you pay the ₹5,000/day difference on the room itself. Nobody disputes
this.

**Second**, and this is the part that surprises people: the insurer computes a **ratio** —

```
        eligible room rent      ₹5,000
ratio = ──────────────────  =  ────────  =  50%
         actual room rent      ₹10,000
```

— and then pays only **50% of certain other charges on the bill**, charges that have nothing to do
with which bed you slept in.

Nobody at the admission counter tells you this. The room upgrade that looked like it would cost
₹25,000 extra over five days can cost several times that once the ratio propagates through the rest
of the bill.

## 2.2 What the ratio applies to — and what it does not

This is where precision matters, and where the 2020 circular is doing its real work. The circular
**restricts** proportionate deduction. It applies **only** to what the policy defines as
**"associated medical expenses"** — charges that genuinely **vary with the room category**.

**Subject to proportionate deduction** (where the policy so defines them):

- Surgeon and anaesthetist professional fees
- Operation theatre charges
- Nursing charges
- Consultation and visit fees

**Explicitly excluded from proportionate deduction by the 2020 circular:** **[VERIFIED]**

- **Pharmacy and medicines**
- **Consumables**
- **Implants and medical devices**
- **Diagnostics and investigations**
- **ICU charges** (ICU carries its own separate sub-limit instead)

The logic is straightforward: the price of a stent, an MRI, or a vial of antibiotic does not change
because you are in a nicer room, so it is not an "associated" expense and may not be scaled. Before
June 2020 some insurers were scaling the whole bill. The circular stopped that.

> **This caught an error in the deck.** An earlier revision of slide 2 read *"Surgeon, OT, ICU,
> diagnostics: every associated charge is scaled down by that same ratio."* **ICU and diagnostics
> are exactly the two categories the circular excludes** — and the sentence sat directly above a
> caption citing that circular. It now reads *"Surgeon, OT, anaesthesia, nursing: every charge your
> policy ties to room category…"*. See §5.1.

## 2.3 A worked example, end to end

A five-day admission for a planned surgery.

- **Sum insured:** ₹5,00,000
- **Room rent sub-limit:** ₹5,000/day → eligible room = ₹25,000 for five days
- **Room actually occupied:** private, ₹10,000/day → actual room = ₹50,000
- **Proportionate ratio:** ₹5,000 ÷ ₹10,000 = **50%**

The bill:

| Bill line | Amount | Category |
|---|---:|---|
| Room and nursing (5 × ₹10,000) | ₹50,000 | Room |
| Surgeon and anaesthetist fees | ₹1,20,000 | Associated — **scaled** |
| Operation theatre charges | ₹60,000 | Associated — **scaled** |
| Investigations and diagnostics | ₹40,000 | **Not scaled** |
| Pharmacy and consumables | ₹70,000 | **Not scaled** |
| Implant | ₹50,000 | **Not scaled** |
| List I non-payables (gloves, admission fee, attendant) | ₹10,000 | **Never payable** |
| **Total bill** | **₹4,00,000** | |

Now settle it:

| Step | Calculation | Patient pays |
|---|---|---:|
| Room excess | ₹50,000 actual − ₹25,000 eligible | **₹25,000** |
| Proportionate deduction on associated expenses | 50% × (₹1,20,000 + ₹60,000) = 50% × ₹1,80,000 | **₹90,000** |
| Diagnostics, pharmacy, consumables, implant | Paid in full — the circular protects these | ₹0 |
| List I non-payables | Never covered | **₹10,000** |
| | **Total out of pocket** | **₹1,25,000** |

**The insurer pays ₹2,75,000. The patient pays ₹1,25,000 — 31% of the bill, on a policy with
₹5,00,000 of cover against a ₹4,00,000 claim that was fully approved.**

And now the counterfactual, which is the entire product: had the same patient taken the ₹5,000/day
semi-private room, the ratio would have been 100%. No room excess, no proportionate deduction, and
the out-of-pocket cost would have been the ₹10,000 of List I items alone.

**Same treatment, same hospital, same surgeon. ₹1,15,000 of difference, decided in ninety seconds
at a counter by someone who was never told the ratio exists.**

That sentence is the product.

## 2.4 Where the "50% of the bill can be refused" figure comes from

Slide 2's large number — **50% of the bill can be refused** — is captioned on the slide itself as
*"maximal case; scope varies by policy wording"*. That caption is doing necessary work; here is
exactly what it means.

The 50% is the **ratio**, not the share of the total bill. In the worked example above the ratio is
50% but the realised patient share is 31%, because the circular protects diagnostics, pharmacy and
implants. The patient share approaches 50% only when the bill is dominated by professional and
theatre fees — a surgical admission with little pharmacy and no implant — and under a policy whose
wording defines "associated medical expenses" broadly.

So the figure is defensible **because of the caption**. Without the caption it would be an
overstatement. **Do not remove the caption.**

---

# Part 3 — The slides, one by one

Verbatim slide text is quoted in blockquotes; the explanation follows.

## Slide 1 — Title

> PRECISION CARE CHALLENGE 2026 · PHASE 1, IDEA SUBMISSION
> **ClaimCast**
> Know what your hospital bill will actually cost you. Before you are admitted, not after you are
> discharged.
> TRACK: HOSPITALITY · Holistic Optimization System for Policy-Integrated Admission & Treatment
> Intelligence
> Team Rocket
> Indraprastha Institute of Information Technology, Delhi (IIIT-Delhi)

**The name.** *ClaimCast* — a forecast of a claim. "Cast" as in *forecast*, the way a weather
service casts ahead of the weather. The whole thesis is in the name: the claim is a knowable future
event, and it can be computed before it happens.

**The tagline** does two jobs in one sentence. "What your bill will actually cost **you**" fixes the
unit of analysis on the patient's own money, not the hospital's total. "Before you are admitted,
not after you are discharged" states the temporal shift that is the innovation. Slide 3 restates
the same claim more sharply: *"Same arithmetic. Different timestamp."*

**Track line.** The official title verbatim — see §0.3.

## Slide 2 — The problem

> India's most expensive healthcare decision is made in ninety seconds, at an admission counter, by
> someone who has never read their policy.

The framing sentence. It locates the problem at a **specific moment** rather than describing a
diffuse systemic issue, which is what makes it addressable by a product. Three claims are packed
into it: the decision is *expensive*, it is *fast*, and it is made *uninformed*.

> IRDAI's chairman has said claim payouts often fall short of what policyholders expect.
> — **AJAY SETH, CHAIRMAN, IRDAI · NOV 2025**

**Who he is.** Ajay Seth is the Chairman of IRDAI, appointed in 2025 — the head of India's
insurance regulator. He made remarks to this effect at a Bima Lokpal Day event around 11 November
2025, reported by Business Standard under the headline *"Irdai monitoring gaps in health insurance
claim settlements: Chairman Seth"*, which paraphrases him as saying claim payouts often fall short
of expectations, citing sub-limits and co-pays.

**Why the regulator and not a statistic.** It pre-empts the most dangerous objection a judge can
raise: *"isn't this a fringe problem?"* When the regulator himself names the gap, the problem is
established by authority rather than argued. The follow-on line then converts that into the market
gap: *"The regulator has named the gap. Policy bots explain the wording; none of them price the
decision in front of you."*

**Status: [VERIFIED as reported speech].** An earlier revision of this slide rendered a sentence in
quotation marks. The substance and attribution were right, but the Business Standard article
returned HTTP 403 and the exact wording could not be matched to a primary transcript, so the slide
now states the substance as reported speech with no quotation marks and carries the date of the
address. See §5.2 for the reasoning and for the stronger figure available as a backup.

> **THE ROOM-RENT TRAP · 50% of the bill can be refused**
> Your policy caps the room at ₹5,000 a day. The hospital gave you one at ₹10,000. Surgeon, OT,
> anaesthesia, nursing: every charge your policy ties to room category is scaled down by that same
> ratio.
> *Proportionate deduction · IRDAI/HLT/REG/CIR/151/06/2020 · maximal case; scope varies by policy
> wording*

The mechanic, explained in full in Part 2. The circular number is real and correctly cited
**[VERIFIED]**. The 50% is the ratio, correctly hedged by the caption (§2.4). All four named
charges are genuine associated medical expenses, and the phrase *"your policy ties to room
category"* matches the circular's own framing — deduction applies to expenses that vary with the
room category **as defined in the policy**. An earlier revision named ICU and diagnostics here,
which the circular excludes; see §5.1.

> **₹39,085** — mean out-of-pocket per cancer hospitalisation
> *12,148-patient multi-centre Indian study*
> **₹3.31 L** — out-of-pocket per cancer patient, per year
> *diagnostics 36% · medicines 45%*

All four figures come from a single study, fully verified — Prinja, Dixit et al., *Frontiers in
Public Health*, 2023 (full citation in Part 4.2):

| Deck figure | Study figure | Note |
|---|---|---|
| ₹39,085 | ₹39,085 (US$492) mean OOPE per hospitalisation episode | **cancer patients** — the slide caption says so |
| ₹3.31 L | ₹3,31,177 (US$4,171) annual OOPE per patient | cancer patients |
| diagnostics 36% | 36.4% of OOPE | |
| medicines 45% | 45% of OOPE | |
| n = 12,148 | 12,148 patients, seven centres | led by PGIMER Chandigarh |

**Why the composition split (36% / 45%) is on the slide and not just the totals.** It is doing
strategic work, not decorative work. Diagnostics and medicines together are **81%** of
out-of-pocket cost — and they are *precisely the categories the 2020 circular protects from
proportionate deduction and that PM-JAY HBP and CGHS rate lists publish prices for*. That is the
bridge from "here is a problem" to "here is why our data sources can actually forecast it". The two
percentages are the reason slide 5's data strategy is credible.

**The cancer qualification.** These figures are **cancer-specific** — this is a study of cancer
patients at oncology centres, not an all-cause hospitalisation average. Both captions now say so
("per cancer hospitalisation", "per cancer patient, per year"). This costs nothing rhetorically:
cancer is the single largest driver of catastrophic health expenditure in India, so naming it
strengthens the slide. An earlier revision left the first caption unqualified; see §5.3.

> Cost shock drives distress financing, delayed care and outright treatment abandonment. It decides
> whether treatment finishes.

The escalation from money to clinical outcome, using the three defined terms from §1.7. The last
sentence is the emotional close of the slide: this is not a convenience problem.

## Slide 3 — The idea

> Insurers compute what you are owed after discharge. ClaimCast computes it before admission.
> **Same arithmetic. Different timestamp. That is the whole idea.**

The thesis in twelve words. It is deliberately modest about novelty of *method* — the arithmetic is
the insurer's own — and aggressive about novelty of *timing*. That is a strong position, because it
means the computation is already known to be correct and already legally grounded; only its
placement in time is new. A judge cannot attack the method without attacking the insurer's own
adjudication logic.

**The five-decision journey strip.** Each entry names a decision, the stage of care it falls in,
and the money at stake:

| # | Stage | Decision | At stake | What it turns on |
|---|---|---|---:|---|
| 1 | ADMISSION | Which hospital — network or not | ₹1.2 L | Cashless vs reimbursement; network tariff vs rack rate |
| 2 | ADMISSION | Which room class — proportionate deduction | ₹78,400 | The mechanic in Part 2 |
| 3 | INVESTIGATION | Cashless or reimburse — what you must float | ₹2 L | Cash-flow exposure, not final cost |
| 4 | PROCEDURE | Implant / consumable — sub-limits & List I | ₹45,000 | Implant sub-limits; non-payable items |
| 5 | RECOVERY | 24-hour admission rule — day-care vs in-patient | ₹22,000 | Whether the claim is admissible at all |

> THE CARE JOURNEY THE PROBLEM STATEMENT NAMES — we price the decision at every stage, and each
> fork closes permanently the moment it passes

Two things are happening here. First, the strip maps directly onto the care journey named in the
problem statement, so the solution is visibly answering the brief rather than an adjacent problem.
Second — *"each fork closes permanently the moment it passes"* — is the argument for why timing is
not a nicety. A room-class decision cannot be revisited on discharge day. An irreversible decision
with a five-figure consequence and no information is the exact shape of problem a decision-support
tool exists for.

**Status of the five rupee figures: [SYNTHETIC, BUT DERIVED].** These are synthetic figures for a
representative admission, not measured values from a dataset — appropriate for a concept paper and
consistent with the "synthetic or mock data" instruction in the brief. They are not, however,
asserted: the itemised bill they come out of is in Part 5.4 and is reproduced by the prototype's
adjudication engine on demand.

> **MATERIALITY FILTER · OUR ANSWER TO FEATURE BLOAT**
> We compute the money at stake and stay silent unless it clears ₹10,000. A caregiver at 2 a.m.
> sees only what is worth their attention.

The strongest product-design idea on the deck, and the one most likely to be remembered. Most
health-tech submissions add features; this one adds a **suppression rule**. It converts restraint
into an engineered component with a threshold, which is a much stronger claim than "we kept the UI
simple". It also implicitly answers "how do you avoid alert fatigue?" before it is asked.

> **IS THIS UNIQUE, OR AN IMPROVISATION?**
> Unique. Existing tools retrieve policy text. ClaimCast simulates the claim and optimises the
> decision. Retrieval → Simulation.

A direct answer to a question the evaluation rubric asks. The `Retrieval → Simulation` formulation
names the technical category shift in three words: existing tools are RAG systems over policy
documents; this is a simulation engine with a solver on top. Different category, not better
execution of the same category.

> **YOU WALK IN KNOWING WHAT YOU WILL OWE.** Same admission, ₹78,400 less out of pocket, because
> the caregiver was told before the decision closed.

The slide closes by restating decision 2's figure as a realised outcome, which is what carries it
into slide 4's prototype screen.

## Slide 4 — The solution

> We cannot tell you exactly what your bill will be. We can tell you exactly how much of it your
> policy will refuse.

**This is the most important sentence in the entire deck.** It is an admission of a limit that
converts into the product's defining strength. Forecasting a hospital bill is genuinely hard and
inherently uncertain. Computing what a written policy refuses, *given* a bill, is arithmetic — it
is exact, and it is the half that actually determines the patient's exposure. By conceding the
uncertain half explicitly, the deck earns the right to claim exactness on the other half.

It is also the honesty requirement from the brief ("no binding insurance advice") restated as a
design principle rather than a disclaimer.

> AI where uncertain. Arithmetic where known. **The LLM never decides the money.**

The architectural principle in three lines. The last is the safety guarantee: a language model may
*read* the policy and propose what a clause means, but the rupee figures are produced by
deterministic code. This is what makes the output auditable, reproducible, and defensible — and it
is what an insurer or hospital would require before deploying it.

> **TWO HALVES, DELIBERATELY SEPARATED · PLUS A SOLVER**
> **A · FORECAST** — Predicts the itemised bill from published tariff data. Uncertain, so it returns
> a range.
> **B · ADJUDICATION** — Computes what the policy refuses, line by line. Exact, with every ₹ cited
> to its clause.
> **C · COUNTERFACTUAL** — Re-runs the claim for every legal alternative and ranks them by what you
> keep.

A and B are the two halves — uncertain and exact — and C is the solver built on top of them.

- **A — Forecast** is the ML component. It predicts what the hospital will charge, using PM-JAY HBP
  and CGHS rates as the price base. It returns a **range**, not a point estimate, because the
  underlying uncertainty is real and a point estimate would be a false promise.
- **B — Adjudication** is deterministic code implementing exactly the arithmetic in Part 2 —
  sub-limits, proportionate deduction, List I, co-pay, waiting periods — with each deduction
  carrying a citation to the clause that produced it.
- **C — Counterfactual** is the optimiser. Given A and B, it enumerates the legal alternatives at a
  given decision point and ranks them by patient retention of money. This is what makes ClaimCast a
  *decision* tool rather than a calculator.

**The comparison table:**

| | Hospital / TPA desk | Policy bots · Ditto/PB | **ClaimCast** |
|---|---|---|---|
| **Speaks** | after admission | any time, no context | **at each decision** |
| **Returns** | a verbal estimate | a text summary | **itemised ₹ + clause** |
| **Acts for** | the hospital | no one | **you** |

*Ditto* and *PB (PolicyBazaar)* are the two best-known Indian policy-explanation and
insurance-marketplace services — the natural comparators a judge would think of. Naming them
directly is a confidence move: it says the team knows the competitive landscape and is not
pretending the space is empty.

The three rows are chosen to be the three axes on which ClaimCast wins, and the **"Acts for"** row
is the sharpest. It reframes the whole category as a question of *agency* rather than features: no
existing tool in this space is on the patient's side of the table.

> **PROS** — Deterministic and auditable · Runs entirely on public data · Rule-packs: private,
> PM-JAY, ESI
> **CONS** — Forecast bounded by published tariffs · Needs the policy document up front · An
> estimate, never a guarantee

Listing genuine cons is a credibility instrument. All three are real limitations, and all three are
stated in a form that shows they were designed around rather than discovered late. *"Rule-packs:
private, PM-JAY, ESI"* is the enterprise-viability claim (20% of the rubric): the same engine
serves private insurance, the government scheme and the statutory workers' scheme by swapping a
rule-pack.

**The prototype screen** (`DECISION 2 OF 5 · ROOM CLASS · STAGE: ADMISSION`):

| Option | Rate | Your share |
|---|---|---|
| Private room | ₹10,000 / day | ₹1,26,900 |
| **Semi-private** ← recommended | ₹5,000 / day | **₹48,500** |

> ✓ **You keep ₹78,400** — Room Rent Sub-limit, Clause 3.2 · proportionate deduction on the
> associated charges

This is the entire product rendered as one screen: two options, the patient's own exposure under
each, a recommendation, the delta, and — critically — **the clause citation**. The `Clause 3.2`
reference is the visible proof of the "every ₹ cited to its clause" promise. Without it the screen
is a calculator; with it, it is auditable advice. ₹1,26,900 − ₹48,500 = ₹78,400, matching decision
2 on slide 3. **[Synthetic, but derived — the bill behind these figures is in Part 5.4.]**

## Slide 5 — Architecture, scope and references

**The architecture flow.** Two input streams converge into a deterministic core:

```
Policy PDF                    Procedure · Hospital · City
(insurer wording)             (the care plan)
     |                                |
     v                                v
LLM extract + cite            ML cost model
(user confirms every field)   (NHA / CGHS tariffs)
     |                                |
     +--------------+-----------------+
                    v
        ADJUDICATION ENGINE · deterministic
        every ₹ refused, cited to its clause
                    |
                    v
          COUNTERFACTUAL SOLVER
          cheapest fully-covered path
                    |
                    v
     5 DECISION SCREENS · filtered by materiality
```

Read left to right, the design principle from slide 4 is visible in the topology itself: the two
probabilistic components (LLM extraction, ML cost model) sit at the **edges**, feeding a
deterministic **core**. The LLM's output passes through a human confirmation gate before it can
influence any number. *"user confirms every field"* is a hard control, not a courtesy — it means an
extraction error cannot silently propagate into a rupee figure.

**Build vs. simulate.** The honesty table:

| Component | Status |
|---|---|
| Policy → constraint parser | **Build** |
| Adjudication + deduction engine | **Build** |
| Cost model on NHA / CGHS rates | **Build** |
| Counterfactual solver + screens | **Build** |
| Live hospital tariff feed | *Simulate* |
| Insurer cashless API / HIS bill feed | *Simulate* |

> The two simulated feeds need an insurer and a hospital to open them, not more engineering.

This is the vision-and-pathway argument (20% of the rubric), and it is well constructed. Everything
that is intellectually hard is in the Build column. The two Simulate items are blocked by
**commercial access**, not by technical difficulty — no student team can obtain a live HIS
(Hospital Information System) bill feed or an insurer's cashless API. Saying so plainly converts an
apparent gap into a partnership requirement, which is exactly what a Phase-2 or pilot conversation
is about.

> **DATA WE SOURCE OURSELVES · ALL PUBLIC**
> NHA / PM-JAY Health Benefit Packages (≈1,900 procedure rates) · CGHS city-wise rate lists · IRDAI
> List I non-payables · IRDAI standard wordings (Arogya Sanjeevani) · NHA empanelled-hospital
> registry

Five public sources, each defined in §1.6, and together they are sufficient to run the whole system
without any private data — which is what makes the "no data from GE HealthCare" constraint a
non-issue. Note how they map onto the components: HBP and CGHS give **prices**, List I gives
**exclusions**, Arogya Sanjeevani gives a **real, standardised policy wording** to parse, and the
empanelled-hospital registry gives **network membership** for decision 1.

**The four references:**

1. **IRDAI, Circular IRDAI/HLT/REG/CIR/151/06/2020, room-rent proportionate deduction.**
   **[VERIFIED]** — Part 4.1.
2. **Financial toxicity of cancer treatment in India, Front. Public Health, 2023 (n = 12,148).**
   **[VERIFIED]** — Part 4.2.
3. **Catastrophic expenditure & treatment attrition, Lancet Reg. Health SE Asia, 2022;6:100058.**
   **[VERIFIED]** — Part 4.3. (This replaced an earlier, unverifiable reference; see Part 5.5.)
4. **IRDAI Master Circular on Health Insurance Business, 2024.** **[VERIFIED]** — Part 4.4.

> **SAFE BY CONSTRUCTION** — every field is user-confirmed · outputs are labelled estimates, never
> guarantees · no medical advice, money only · no identifiable patient data

The closing line, and a direct point-by-point answer to the brief's constraints (§0.1). "Safe by
construction" is a deliberate phrase: the safety comes from the architecture — the deterministic
core, the confirmation gate, the money-only scope — not from a disclaimer bolted on at the end.

---

# Part 4 — The research dossier

## 4.1 IRDAI Circular IRDAI/HLT/REG/CIR/151/06/2020 — proportionate deduction

**Status: [VERIFIED]** — real circular, correctly cited, dated **11 June 2020**.

**What it does.** It standardises and *restricts* the practice of proportionate deduction.
Deduction may be applied **only** to "associated medical expenses" as defined in the policy —
expenses that vary with the room category occupied — and the ratio is eligible room rent ÷ actual
room rent. Room rent in excess of the eligible limit is borne by the policyholder in full and
separately.

**What it excludes from deduction.** Pharmacy and medicines, consumables, implants and medical
devices, diagnostics and investigations, and **ICU charges** (ICU is governed by its own sub-limit).

**Why it is the anchor of the whole project.** It is the rule that makes the room-class decision
worth five figures; it is binding on every insurer, so the arithmetic generalises; and because it
is *published*, the adjudication engine can implement it exactly and cite it. The project's core
computation is not proprietary insight — it is a public rule nobody applies at the right moment.

## 4.2 Financial toxicity of cancer treatment in India — Frontiers in Public Health, 2023

**Status: [VERIFIED]** — every figure on slide 2 traced to this paper.

**Full citation:** Prinja S, Dixit J, et al. *Financial toxicity of cancer treatment in India:
towards closing the cancer care gap.* **Frontiers in Public Health** 2023;11:1065737.
doi:10.3389/fpubh.2023.1065737. PubMed ID 37404274.

**Design:** multi-centre study across **seven** Indian cancer centres, led by the Postgraduate
Institute of Medical Education and Research (PGIMER), Chandigarh. **n = 12,148 patients.**

**Findings used on the deck:**

| Finding | Value |
|---|---|
| Mean OOPE per outpatient consultation | ₹8,053 (US$101) |
| **Mean OOPE per hospitalisation episode** | **₹39,085 (US$492)** |
| **Mean annual OOPE per patient** | **₹3,31,177 (US$4,171)** ≈ ₹3.31 L |
| Share of OOPE spent on **diagnostics** | **36.4%** |
| Share of OOPE spent on **medicines** | **45%** |
| Patients experiencing financial toxicity | ~68% |

**Caveats to hold.** (a) The cohort is **cancer patients**; the figures are not general-hospitalisation
averages. (b) A preprint version of the same work reports a 9,897-patient subsample for some
analyses, so if a judge cites 9,897 rather than 12,148 they are not wrong — n = 12,148 is the
published figure for the full study.

**Why this study and not a national survey (e.g. NSSO).** Two reasons. It is recent, and it breaks
OOPE down **by category** — and that breakdown (diagnostics + medicines = 81%) is what makes
ClaimCast's public-tariff data strategy credible. A national average total tells you the problem is
big; a category split tells you it is *computable*.

## 4.3 Catastrophic expenditure and treatment attrition — Lancet Reg. Health SE Asia, 2022

**Status: [VERIFIED].**

**Full citation:** CROCODILE study group. *Catastrophic expenditure and treatment attrition in
patients seeking comprehensive colorectal cancer treatment in India: a prospective multicentre
study.* **The Lancet Regional Health – Southeast Asia** 2022;**6**:100058.
doi:10.1016/j.lansea.2022.100058. PubMed ID 36408078.

**Design:** prospective, multicentre, conducted across Indian tertiary centres in 2020. It measures
**out-of-pocket payments (OOPP)** at time of service, applies the standard 25%-of-annual-income
threshold for catastrophic expenditure, and tracks **treatment attrition** — defined as unplanned
interruption of a treatment course not recommended by the clinical team.

**Findings:** most colorectal cancer treatment cost in India is paid out of pocket, and catastrophic
expenditure is common. Attrition rates *at tertiary centres* were low, which the authors read as
evidence that greater attrition happens **earlier in the care pathway** — before patients reach a
tertiary centre at all.

**Why it is on the deck.** It is the citation for slide 2's closing sentence: *"Cost shock drives
distress financing, delayed care and outright treatment abandonment. It decides whether treatment
finishes."* Reference 2 (§4.2) establishes the **size** of the out-of-pocket burden; this one
establishes that the burden **changes clinical behaviour**. That is the step from a money problem to
a care problem, and it is the argument for why a decision-support tool belongs at the point of
admission rather than in a claims department.

The finding that attrition concentrates *earlier* in the pathway is a direct argument for
ClaimCast's timing thesis, and worth having ready for Q&A.

**Supporting context from the same literature:** cancer is the leading driver of catastrophic health
expenditure in India, with medicines making up more than 60% of out-of-pocket expenditure; cancer
shows the highest incidence of CHE (~79%) and the highest prevalence of distress financing,
affecting ~43% of affected households.

**Note on what this replaced.** Slide 5's reference 3 previously read *"Out-of-pocket payment &
financial risk protection, Lancet Reg. Health SE Asia, 2024"*, which could not be matched to any
locatable paper. See §5.5.

## 4.4 IRDAI Master Circular on Health Insurance Business, 2024

**Status: [VERIFIED].** Dated **29 May 2024**. Consolidates **55** earlier circulars into a single
rulebook. Issued under s.14(2)(e) of the IRDAI Act 1999 and s.34 of the Insurance Act 1938, read
with Regulation 7 of Schedule III of the IRDAI (Insurance Products) Regulations 2024. Applies to
every general and standalone health insurer and to the health portfolios of life insurers.

> **One thing to check before quoting the reference number.** Secondary sources give it
> inconsistently — `IRDAI/HLT/CIR/MISC/77/05/2024` in one place and `IRDAI/HLT/CIR/PRO/84/5/2024`
> in another. The deck wisely cites it by **name and year only**, which is correct and safe. If
> anyone adds a number later, verify it against the primary document on irdai.gov.in first.

**Provisions relevant to ClaimCast:**

| Provision | Detail |
|---|---|
| Cashless authorisation | Insurer must decide within **1 hour** of the hospital's request |
| Final discharge authorisation | Within **3 hours**; delay cost borne by insurer's shareholder funds |
| Moratorium | **60 months** of continuous cover, after which non-disclosure cannot be contested (fraud and permanent exclusions excepted) |
| Repudiation | No claim rejection without sign-off by the Product Management Committee or a three-member Claims Review Committee |
| Free-look | **30 days** |

**Why it is on the deck.** It is the current consolidated rulebook, so it establishes that
ClaimCast's rule engine is built against live regulation rather than legacy practice. It also
sharpens the problem: the 2024 circular made claims *fast*, but did nothing to make the **amount**
predictable. A one-hour approval of a number that is ₹1.25 lakh lower than the family expected is
still a shock. Speed was regulated; predictability was not. **That unregulated gap is ClaimCast's
market.**

## 4.5 IRDAI's four lists of non-payable items

**Status: [VERIFIED]** as to structure and the four-list framework; the ~68-item count for List I
is widely reported but should be checked against the current annexure before Phase 2.

Framework recap (detail in §1.4): **List I** — not payable at all (optional / non-medical items);
**List II** — subsumed into room charges; **List III** — subsumed into procedure charges;
**List IV** — subsumed into the cost of treatment. The lists are standardised across insurers,
which is what makes them programmable once and reusable for every policy.

## 4.6 PM-JAY Health Benefit Packages

**Status: [VERIFIED].** The April 2022 revision brought the HBP to **1,949 procedures across 27
specialties**, up from 1,394 across ~24 specialties in earlier versions. HBP 2.2 (2021) had revised
around 400 procedure rates upward by 20–400% and added a medical-management package for
mucormycosis ("black fungus").

Payment is **case-bundled**: one package price covers outpatient diagnostics before the procedure,
the procedure itself, the subsequent hospitalisation, and medicines for 15 days after discharge.
Procedures not on the schedule are payable as an "Unspecified Procedure" up to ₹1,00,000 within the
₹5,00,000 family cover.

**Primary source:** HBP 2.2 User Guidelines, National Health Authority —
`https://nha.gov.in/img/resources/HBP-2.2-manual.pdf` (Annexure 2 carries the full package-and-rate
listing).

The deck's "≈1,900 procedure rates" is accurate and appropriately rounded.

**Why case-bundling matters to the cost model.** A bundled package price is a *single number for a
whole episode*, which is far easier to forecast against than an itemised tariff — and it gives the
ML cost model a public, government-published anchor for the procedure component of the bill.

## 4.7 Arogya Sanjeevani

**Status: [VERIFIED].** Structure and sub-limits as set out in §1.6.

Its role in the project is specific: it is the **reference policy**. Because IRDAI prescribes its
wording, it is the one policy document the team can obtain, parse, test against, and demo with,
where the parsed constraints are known-correct and identical across every insurer selling it. It is
also a natural demonstration of the room-rent trap, since it both caps room rent (2% of SI, max
₹5,000/day) and explicitly applies proportionate deduction when the cap is breached.

## 4.8 Ajay Seth / IRDAI Chairman remarks

**Status: [PARTIAL].** Attribution and substance confirmed; exact wording not.

**Confirmed:** Ajay Seth is IRDAI Chairman (appointed 2025). He spoke at a Bima Lokpal Day event
around **11 November 2025**. Business Standard reported it on 11 November 2025 (by Subrata Panda)
under *"Irdai monitoring gaps in health insurance claim settlements: Chairman Seth"*, paraphrasing
him to the effect that claim payouts often fall short of policyholder expectations, and citing
sub-limits and co-pays as causes. He also noted that complaints to the ombudsmen rose from ~52,300
in FY 2022–23 to ~53,230 in FY 2023–24, with **54% relating to health insurance** — a figure that
independently supports slide 2's framing and would make a good backup citation.

**Not confirmed:** the exact sentence rendered in quotation marks on slide 2. The Business Standard
article returned **HTTP 403 Forbidden** and could not be read directly. Other coverage of the same
address exists (Cafemutual, Insurance Business Asia) and IRDAI published the Chairman's Bima Lokpal
Day 2025 address on YouTube — the video is the definitive source for the verbatim wording. See
Part 5.2.

---

# Part 5 — Corrections applied, and what remains open

Corrections were applied to the deck after the research in Part 4 was completed; §§5.1–5.6 record
what was wrong, what it was changed to, and why, so the reasoning survives.
**§5.7 is still open and needs your attention.**

## 5.1 Slide 2 listed ICU and diagnostics as subject to proportionate deduction — they are not

**Severity: was high. A factual error, on the same slide that cites the circular. RESOLVED.**

Previous wording:

> Your policy caps the room at ₹5,000 a day. The hospital gave you one at ₹10,000. **Surgeon, OT,
> ICU, diagnostics:** every associated charge is scaled down by that same ratio.

IRDAI/HLT/REG/CIR/151/06/2020 **explicitly excludes diagnostics and ICU charges** from proportionate
deduction (§2.2). ICU has its own separate sub-limit; diagnostics do not vary with room category and
so are not "associated medical expenses". Two of the four items named were wrong, and the sentence
sat directly above a caption citing the very circular that excludes them — anyone in the room who
works in health insurance would have caught it.

**Now reads:**

> Your policy caps the room at ₹5,000 a day. The hospital gave you one at ₹10,000. **Surgeon, OT,
> anaesthesia, nursing:** every charge your policy ties to room category is scaled down by that same
> ratio.

All four named charges are genuine associated medical expenses. The phrase *"your policy ties to
room category"* also matches the circular's own framing ("as defined in the policy") and is
consistent with the caption *"scope varies by policy wording"* beneath it.

## 5.2 The Ajay Seth quotation was presented as verbatim but could not be verified

**Severity: was high — a direct quotation attributed to a named sitting regulator. RESOLVED.**

Slide 2 previously rendered in quotation marks: *"Claims are approved, but the amounts paid are
lower than customers expect."* The substance was right and the attribution was right, but the exact
sentence could not be matched to a primary source (§4.8) — the Business Standard article returns
HTTP 403.

**Now reads**, as reported speech with no quotation marks, and dated:

> IRDAI's chairman has said claim payouts often fall short of what policyholders expect.
> **AJAY SETH, CHAIRMAN, IRDAI · NOV 2025**

This keeps the rhetorical position — the regulator naming the gap — while claiming only what can be
defended. Two things are still worth doing:

1. **If you want the quotation back**, IRDAI published the Chairman's Bima Lokpal Day 2025 address
   on YouTube. Watch it, capture his actual sentence, and you can restore quotation marks with a
   citable source.
2. **A stronger backup exists.** From the same address: *54% of all complaints to the Insurance
   Ombudsman relate to health insurance* (FY 2023–24, ~53,230 complaints, up from ~52,300 the year
   before). If anyone challenges the framing in Q&A, that is a countable fact and a better answer
   than any quotation.

## 5.3 ₹39,085 was a cancer-specific figure presented as a general one

**Severity: was medium. RESOLVED.**

Slide 2 previously captioned ₹39,085 as *"mean out-of-pocket per hospitalisation episode"*. The
study is entirely a **cancer** cohort (§4.2), so a reader would have taken it as an all-cause
hospitalisation average.

**Now reads:** *"mean out-of-pocket per cancer hospitalisation"* — consistent with the ₹3.31 L
figure beside it, which was already captioned *"per cancer patient, per year"*.

## 5.4 The rupee figures on slides 3 and 4 had no written bill behind them — **RESOLVED**

**Severity: was medium — not an error, but an unprepared question.**

₹1.2 L, ₹78,400, ₹2 L, ₹45,000, ₹22,000, ₹1,26,900 and ₹48,500 are synthetic illustrative figures.
That is legitimate for a concept paper and consistent with the brief's "synthetic or mock data"
instruction. The risk is narrower: **there is currently no written bill behind them.** If a judge
asks "show me how you got ₹78,400", the team needs an answer in ten seconds.

**Now built.** The reference admission exists, is itemised, and reconciles. It is `RC-2401` in
`web/src/data/admissions.ts`: a single-level lumbar spinal fusion, five days, private room at
₹10,000 a day against a ₹5,000 sub-limit, on a ₹5,00,000 policy.

| | Private room | Semi-private |
|---|---:|---:|
| Hospital bill | ₹3,53,900 | ₹3,28,900 |
| Room rent above the sub-limit | ₹25,000 | — |
| Proportionate reduction on room-linked charges | ₹53,400 | — |
| Implant above its sub-limit | ₹25,000 | ₹25,000 |
| Outside the pre/post-hospitalisation window | ₹11,600 | ₹11,600 |
| List I non-payables | ₹11,900 | ₹11,900 |
| **Patient pays** | **₹1,26,900** | **₹48,500** |

₹1,26,900 − ₹48,500 = ₹78,400, which is decision 2 on slide 3. The room rate is the only thing that
changes between the two columns; everything else follows from it.

The bill is not stored as those totals — it is assembled line by line from the procedure's cost
model and the hospital's tariff, then put through the same adjudication engine the prototype runs
on, so the figures are derived rather than asserted. `npm run check` in `web/` asserts all three
against the engine and fails the build if the deck and the arithmetic ever disagree.

## 5.5 Reference 3 could not be verified

**Severity: was medium. RESOLVED.**

*"Out-of-pocket payment & financial risk protection, Lancet Reg. Health SE Asia, 2024"* did not
match any paper found during this research (§4.3). An unverifiable citation on a submitted document
is a liability.

**Now reads:** *"Catastrophic expenditure & treatment attrition, Lancet Reg. Health SE Asia,
2022;6:100058."*

This is the CROCODILE study group's prospective multicentre study of colorectal cancer patients in
India (PMID 36408078, DOI 10.1016/j.lansea.2022.100058) — fully verified, and a **better** fit than
the reference it replaced. It measures exactly the two things slide 2 closes on: that most
colorectal cancer treatment cost in India is paid out of pocket and catastrophic expenditure is
common, and that this drives **treatment attrition** — unplanned interruption of a treatment course
not recommended by the clinical team. Slide 2's final sentence, *"It decides whether treatment
finishes,"* now has a citation that measured precisely that.

## 5.6 Minor: "TWO HALVES" heading over three items

**Severity: was cosmetic. RESOLVED.** Slide 4's heading read *"TWO HALVES, DELIBERATELY SEPARATED"*
above three labelled blocks A, B and C. It now reads *"TWO HALVES, DELIBERATELY SEPARATED · PLUS A
SOLVER"*, which keeps the point — A and B are the two halves, uncertain and exact; C is the solver
built on top — without the momentary friction.

## 5.7 Open items unrelated to content — **STILL OPEN**

- Whether individual team-member names should appear on slide 1 alongside "Team Rocket" — check the
  submission rules.
- PAN cards were required at registration for all four team members.

---

# Part 6 — How the deck is built

The deck is generated from code, not edited by hand. This matters because it means a correction
from Part 5 is applied by editing one line and re-running, and the layout cannot drift.

The repository root is `ClaimCast/`.

```
ClaimCast\
├── README.md                               <- what this project is
├── ClaimCast.md                            <- this document
├── Team Rocket_IIIT Delhi.pptx             <- THE SUBMISSION
├── Team Rocket_IIIT Delhi.pdf              <- THE SUBMISSION (PDF)
├── Team Rocket_IIIT Delhi - C Poster.pptx  <- build output (gitignored)
├── finalize.ps1                            <- copies build output to the submission names
├── src\
│   ├── deckkit.py                          <- shared helpers, palette, template loader
│   └── build_poster.py                     <- builds the five slides
└── reference\
    ├── PCC 2026 TEMPLATE.pptx              <- the official template, source of truth
    ├── Hospitality problem statement.pdf
    └── Hospitality problem statement.txt
```

**To rebuild:**

```powershell
python src/build_poster.py
.\finalize.ps1
```

`build_poster.py` produces only the `.pptx`; the `.pdf` is exported from PowerPoint itself (COM
automation, `SaveAs(path, 32)`), so run that step before `finalize.ps1` if the PDF needs to change
too.

`build_poster.py` opens the official `PCC 2026 TEMPLATE.pptx` from `reference/`, so the organisers'
master layout, page numbering and footer are preserved exactly; the script only fills the content
frames. `deckkit.py` locates the template by searching the repository tree, so the scripts run
correctly regardless of where the repository is checked out.

**Typography and colour.** The palette is defined once in `build_poster.py`:

- `TITLE` `#14181C` — slide headings
- `BODY` `#23282D` — **all** running text, near-black
- `MUTED` = `BODY` — there is deliberately **no faded tier**
- `BLUE` `#005EB8` — labels and the page number
- `RED` — the track line on slide 1

An earlier revision used a lighter grey (`#6E7B8B`) for captions. It was removed entirely:
low-contrast grey text is hard to read on a projector and in print, and it reads as unfinished.
Hierarchy is now carried by **size, weight and the blue label colour** rather than by fading text
out. If the deck is ever revised, keep it that way.

One implementation detail worth recording: the page number on each slide is an OOXML **field**
(`<a:fld>`), not a text run, so setting `run.font.color.rgb` on it does nothing. Recolouring it
requires painting `a:solidFill` onto every `rPr` / `defRPr` in the shape's text body directly.

---

# Appendix — Every number on the deck, at a glance

| Figure | Where | Meaning | Source | Status |
|---|---|---|---|---|
| 50% | S2 | Proportionate-deduction ratio, maximal case | IRDAI 2020 circular | **[VERIFIED]** (caption required) |
| 54% | — | Ombudsman complaints that are health-insurance | Seth, Bima Lokpal Day 2025 | **[VERIFIED]** — not on the deck; backup for Q&A (§5.2) |
| ₹5,000 / ₹10,000 | S2, S4 | Room cap vs actual room rate | Illustrative; matches Arogya Sanjeevani cap | **[VERIFIED]** as realistic |
| ₹39,085 | S2 | Mean OOPE per cancer hospitalisation | Prinja/Dixit 2023 | **[VERIFIED]** |
| ₹3.31 L | S2 | Annual OOPE per cancer patient | Prinja/Dixit 2023 (₹3,31,177) | **[VERIFIED]** |
| 12,148 | S2 | Study sample size | Prinja/Dixit 2023 | **[VERIFIED]** |
| 36% | S2 | Diagnostics share of OOPE | Prinja/Dixit 2023 (36.4%) | **[VERIFIED]** |
| 45% | S2 | Medicines share of OOPE | Prinja/Dixit 2023 | **[VERIFIED]** |
| ₹1.2 L | S3 | At stake — hospital choice | Synthetic | **[UNVERIFIED]** illustrative |
| ₹78,400 | S3, S4 | At stake — room class | Synthetic | **[UNVERIFIED]** illustrative |
| ₹2 L | S3 | At stake — cashless vs reimbursement float | Synthetic | **[UNVERIFIED]** illustrative |
| ₹45,000 | S3 | At stake — implant / consumable | Synthetic | **[UNVERIFIED]** illustrative |
| ₹22,000 | S3 | At stake — day-care vs in-patient | Synthetic | **[UNVERIFIED]** illustrative |
| ₹10,000 | S3 | Materiality threshold | Design choice | n/a |
| 24 hours | S3 | In-patient admission rule | Standard policy definition | **[VERIFIED]** |
| ₹1,26,900 | S4 | Patient share, private room | Synthetic | **[UNVERIFIED]** illustrative |
| ₹48,500 | S4 | Patient share, semi-private | Synthetic | **[UNVERIFIED]** illustrative |
| Clause 3.2 | S4 | Room-rent sub-limit citation | Illustrative clause reference | n/a |
| ≈1,900 | S5 | PM-JAY HBP procedure rates | NHA HBP 2022: 1,949 / 27 specialties | **[VERIFIED]** |
| 5 | S3, S5 | Decision screens | Design choice | n/a |

---

*Compiled 9 September 2026; revised the same day to reflect the five corrections applied to the
deck (Part 5). Every source cited above was retrieved and read during compilation except where
marked [PARTIAL] or [UNVERIFIED], which record exactly what could not be confirmed.*
