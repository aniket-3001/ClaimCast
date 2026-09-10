# ClaimCast — Round 2 Preparation

Written 10 September 2026, against `GE Demo ppt.pdf` (6 slides).
Companion to `ClaimCast.md`, which remains the reference for the mechanics themselves.

**How to read this.** Part 0 is what changed and what to fix before you stand up. Part 1 is data
and ML. Part 2 is the Q&A drill. Part 3 is every number on the deck and where it came from. Part 4
is the prototype and the non-AI engineering. Everything is marked `[VERIFIED]`, `[REPORTED]`
(credible secondary source, not primary) or `[SYNTHETIC]`. Nothing here is asserted without one of
those three labels.

---

# Part 0 — What changed, and three things to fix first

## 0.1 The diff, Round-1 deck → Demo deck

| Slide | Round 1 | Demo deck | Read |
|---|---|---|---|
| 1 | 5 slides total | 6 slides | Architecture split out of the references slide and given a full slide |
| 1 | "Team Rocket" | + `(aniket22073)` | Unstop handle added |
| 2 | — | **"2 Problems solved"** block: Base Bill Estimation, Insurance Analysis | Good addition. Names the two halves in the problem's own language before the solution slide does |
| 2 | "hospitalisation" | "hospitalization" | US spelling throughout now |
| 3 | Stage subtitles were 2–4 words ("network or not", "sub-limits & List I") | Full clauses ("gap between in-network and out-of-network payout", "cost of implants excluded under List I") | This is the biggest clarity win in the deck |
| 3 | **MATERIALITY FILTER** box — "stay silent unless it clears ₹10,000 … our answer to feature bloat" | **CONSTRAINT OPTIMIZATION** box — "re-runs your claim across every legal alternative and ranks them by what you keep, filtering out anything that breaks a constraint" | Buzzword removed, method named. But see §0.2 — materiality still appears on slide 5 |
| 4 | "We cannot tell you exactly what your bill will be. We can tell you exactly how much of it your policy will refuse." | "We estimate what you'll be billed. **We guarantee what won't be paid.**" | Punchier — and the one line in the deck I would change back. See §0.2 |
| 4 | Three parts: A Forecast, B Adjudication, **C Counterfactual** | **Two halves**: A Forecast, B Adjudication, with Counterfactual folded under B | Fixes the "TWO HALVES over three items" inconsistency flagged in `ClaimCast.md` §5.6 |
| 5 | Architecture crammed onto the references slide, no ML detail | **New slide: "Architecture & AI Pipeline"** with ML cost model (XGBoost quantile regression), LLM extract + cite (RAG, fail-safe), Memory / self-learning loop | The single most important addition. Round 1 had a box labelled "ML cost model" and no model |
| 5 | "5 DECISION SCREENS" | "DECISION SCREENS · filtered by materiality" | |
| 6 | Build/Simulate was a bare 7-row table of labels | Each of the 5 Build and 2 Simulate items now carries a two-line description | Answers "what does that actually mean" before it is asked |
| 6 | References on slide 5 | References on slide 6, unchanged (4 refs) | |

**Net effect.** Round 1 said what ClaimCast decides. The demo deck says how it computes it. The
30% "Innovative use of AI" criterion was the weakest-covered in Round 1 and is now the
best-covered. The 20% "Enterprise / commercial viability" criterion is now the weakest — there is
still no business model anywhere on the deck. See §2.F.

## 0.2 Three things to fix before you present

**1. The word "guarantee" on slide 4 contradicts slide 6 and the problem statement.**

- Slide 4 headline: "We estimate what you'll be billed. We **guarantee** what won't be paid."
- Slide 4 CONS, same slide: "An estimate, **never a guarantee**."
- Slide 6 footer: "outputs are labelled estimates, **never guarantees**."
- Problem statement constraint: the system must not provide *binding insurance advice*.

A judge reading slide 4 twice will find this, and "guarantee" is a regulated word in insurance.
The rhetorical structure is worth keeping. Suggested replacement, same length, same punch:

> **We estimate what you'll be billed. We compute exactly what won't be paid.**

or, if you want the contrast harder:

> **The bill is an estimate. The deduction is arithmetic.**

**2. "GPT-4o / Claude" on slide 5 dates the deck.** GPT-4o shipped in May 2024. Naming it in
September 2026 reads as a stale citation to anyone who follows the field. Say what the requirement
is, not which vendor met it two years ago:

> **A frontier LLM (GPT-class or Claude), swapped behind an interface — the money path never calls it.**

**3. Materiality is on slide 5 but no longer defined anywhere.** Slide 5's decision-screens box
still says "filtered by materiality", but the box that defined the ₹10,000 threshold was replaced
on slide 3. Either add three words to slide 5 ("filtered by materiality — ₹10,000") or be ready to
define it verbally. It is a genuinely good design decision; do not lose it by accident. It is also
implemented in the prototype (`MATERIALITY = ₹10,000` in `web/src/lib/case.ts`).

Two smaller ones, optional:

- Slide 3's `₹1.2 L / ₹2 L / ₹45,000 / ₹22,000` are still illustrative with no bill behind them.
  Only `₹78,400 / ₹1,26,900 / ₹48,500` are now derived (see Part 3). Have the answer in §2.C4.
- Slide 6 says "Cost model on NHA / CGHS rates" under **Build**, and "Live hospital tariff feed"
  under **Simulate**. Make sure you say the second sentence out loud — public tariffs are real and
  in hand; actual hospital chargemasters are not, anywhere in India, for anyone.

---

# Part 1 — Data and ML

## 1.1 The data you can actually get

Ordered by how load-bearing each source is. Everything here is public and free; nothing requires a
partnership, which is what the brief demands ("no data is provided by GE HealthCare").

### Tier 1 — The spine of the cost model

**1. NHA / PM-JAY Health Benefit Packages (HBP 2.2, and the HBP 2022 package master)** `[VERIFIED]`

- What: procedure-wise national package rates. **1,949 packages across 27 specialties** in HBP 2022.
- Where: `nha.gov.in` → Hospital → Health Benefit Packages. HBP 2.2 manual at
  `https://nha.gov.in/img/resources/HBP-2.2-manual.pdf`; "HBP 2022 package master and OM" is a
  separate ~1 MB download; "National Master Health Benefit packages 2.2" is ~7 MB.
- Fields: package code, specialty, package name, procedure name, rate, stratification, pre-auth
  flag, public-hospital-reserved flag.
- Caveats you should say before a judge does: these are **public-scheme** rates, materially below
  private-sector prices — HBP 2.2 raised roughly 400 packages by 20–400% precisely because the old
  rates were unrealistic. States may vary national rates **±10%** and add their own packages, so
  the national master is a floor, not a national price list.
- ClaimCast uses it for: the procedure axis. Relative cost between procedures, and the lower bound
  of the forecast range.

**2. CGHS city-wise rate lists** `[VERIFIED]`

- What: procedure-wise and investigation-wise rates for government-empanelled hospitals, published
  **per city**, currently on the 2024 revision (OM ref `Z15025/8/2023/DIR/CGHS`).
- Where: `cghs.mohfw.gov.in` — city PDFs plus an interactive rate-list tool that takes tier, NABH
  status and ward as inputs.
- **This is the most valuable single source in the project, and here is why.** CGHS quotes its
  package rates against the **semi-private ward** and publishes the differential explicitly:

  | Ward entitlement | Rate |
  |---|---|
  | General | semi-private package rate **− 10%** |
  | Semi-private | base (as listed) |
  | Private | semi-private package rate **+ 15%** |
  | **Investigations / diagnostics** | **no ward differential at all** |

  Room rents in the same revision: general ₹1,500/day, semi-private ₹3,000, private ₹4,500; ICU
  ₹5,400 all-inclusive of accommodation. NABH-accredited hospitals carry a **+15%** loading over
  non-NABH.

  That table is a Government of India price list saying, in its own numbers, exactly what IRDAI's
  2020 circular says in words: **procedure charges vary with room class; diagnostics do not.** Two
  independent arms of the state, agreeing. When a judge asks where your room-class scaling comes
  from, this is the answer, and it is stronger than any model.

  One more gift: CGHS's own rule is that a beneficiary who voluntarily takes a **higher** ward is
  reimbursed only at the **entitled** ward's rate. That is structurally the same trap as a
  room-rent sub-limit, run by the government, on its own employees. It is a very good 20-second
  story if you need one.

- ClaimCast uses it for: the city axis, the room-class multiplier, the NABH/tier multiplier, and
  the separation of scalable from non-scalable heads.

**3. IRDAI List I — non-payable items** `[VERIFIED]`

- What: **68 items** (item 1 "Baby Food" through item 68) that are optional/consumable and
  chargeable to the patient, not the insurer.
- Lists II, III and IV are the other half of the rule and are the more useful half: those items
  **must be subsumed** into room charges (List II), procedure charges (List III) and cost of
  treatment including diagnostics (List IV), and insurers must ensure hospitals do not bill them
  separately. So Lists II–IV are not deductions — they are charges that should never appear.
- Origin: Annexure I, Chapter III, *Guidelines on Standardization in Health Insurance*
  (`IRDA/HLT/REG/CIR/146/07/2016`, 29 July 2016), revised subsequently.
- Where: `irdai.gov.in` document portal; also mirrored by every TPA (e.g. Paramount TPA's
  non-payable list PDF).
- ClaimCast uses it for: the fixed, unavoidable deduction block. This is the part of the bill that
  no room class, no hospital and no sum insured can move — which is exactly why it deserves its own
  node on the decision tree.

**4. IRDAI standard wordings — Arogya Sanjeevani, and the standard definitions** `[VERIFIED]`

- What: the regulator-mandated product wording. Gives you a real, citable policy structure — sum
  insured band, room cap as % of SI, ICU cap, co-payment, waiting periods — without touching a
  commercial insurer's document.
- ClaimCast uses it for: the default rule-pack, and the honest answer to "whose policy wording is
  this". Answer: the regulator's.

### Tier 2 — Evidence for the problem, not inputs to the model

**5. NSS 75th Round, Schedule 25.0 — Household Social Consumption: Health (July 2017 – June 2018)** `[VERIFIED]`

- Where: MoSPI microdata portal, `https://microdata.gov.in/NADA/index.php/catalog/152`; mirrored at
  ICSSR Data Service.
- What: household-level out-of-pocket hospitalisation expenditure. Merge **Levels 5 + 6 + 7** on
  household/person identifiers for OOP hospitalisation specifically. Fixed-width text; needs the
  layout file. **Apply the `MULT` weight** on every estimate — stratified multi-stage design.
- Use: the national distribution of out-of-pocket hospitalisation spend, by state, quintile,
  rural/urban, public/private. This is what lets you say "the median Indian hospitalisation costs
  X" rather than "a cancer hospitalisation costs ₹39,085", which is what slide 2 currently does.
- Caveat: 2017–18. Old. The 78th round covers a later period; check MoSPI for the current
  health schedule before quoting a level (a ratio ages better than a rupee figure).

**6. IRDAI Annual Report (Handbook on Indian Insurance Statistics)** `[REPORTED — figures below are widely reported from the FY24 annual report; verify against the PDF before putting any on a slide]`

FY 2023-24, health insurance:

| Metric | Value |
|---|---|
| Total health claims filed | ≈ **₹1.17 lakh crore** |
| **Paid** | ₹83,493 cr — **71.29%** by value |
| **Repudiated** (denied after review) | ₹10,937 cr — **9.34%** |
| **Disallowed** (deducted from an otherwise-approved claim) | ≈ **₹15,100 cr — 12.9%** |
| Disallowed + repudiated, YoY | ≈ ₹26,000 cr, **+19.10%** on ₹21,861 cr in FY23 |
| Claims by number | 3.26 cr filed, 2.69 cr settled = **82.46%** |
| Average claim paid | **₹31,086** |
| Health premium | ₹1,07,681 cr, **+20.32%**; 57 cr lives, 2.68 cr policies |
| Insurance penetration | 3.7%, down from 4.0% |

**Learn the disallowed/repudiated distinction and use it.** *Repudiation* is the claim being
denied. *Disallowance* is the deduction taken off a claim that was otherwise approved — the
room-rent proportionate cut, List I, sub-limits, co-pay. **Disallowance is precisely what ClaimCast
forecasts, and it is the larger of the two: ₹15,100 cr against ₹10,937 cr.** That single sentence
is the strongest quantitative case for the project that exists, it is from the regulator, and it is
not on the deck. Consider putting it there.

FY25, for currency `[REPORTED]`: health claims volume up ~21% while payouts grew 12.8%; industry
incurred claim ratio for health 88.2% → 87.0%, with public-sector insurers above 100%.

**7. NHA empanelled-hospital registry** `[VERIFIED]` — hospital name, city, state, specialties,
bed count, empanelment status. The hospital axis, and the only public list of which facilities are
bound to a published rate at all.

**8. Medical inflation** `[REPORTED, and contested — quote it carefully]`

Survey-based estimates (WTW, insurer and employer surveys, broker indices) put Indian medical
inflation at roughly **12–14% a year**, against headline CPI of 3–4%. MoSPI's official health CPI
was ~3.43% in late 2025 — the gap is a basket problem: the official index is weighted toward basic
items, while private-hospital procedure inflation is what the surveys measure. **Say which one you
mean.** If a judge challenges "14%", the correct response is: "That is the survey figure from
insurer and employer data, not CPI. Official health CPI is 3–4%. The two measure different
baskets, and the one that matters for a hospital bill is the survey figure."

### Tier 3 — Structure and vocabulary

- **ICD-10** (diagnosis) and **SNOMED CT** via ABDM's `snomedct.abdm.gov.in` — India runs a
  national SNOMED CT release. Use for procedure normalisation across HBP / CGHS / a hospital's own
  naming, which is a real and underrated engineering problem: the same operation is named three
  different ways in three sources.
- **State scheme tariffs** — MJPJAY (Maharashtra), Aarogyasri (Telangana/AP), Chief Minister's
  schemes elsewhere. A second, independent set of published rates for the same procedures; useful
  as a cross-check and for regional variance.
- **data.gov.in** health-infrastructure datasets — facility counts and beds. Thin, but public.

### What does not exist, and do not pretend otherwise

- **No Indian equivalent of the US CMS hospital price transparency files.** There is no dataset of
  what private hospitals actually charge. This is the single hardest data fact about the project and
  you should say it first, before a judge says it to you.
- **No public claim-level dataset** with policy terms, itemised bill and settled amount together.
  The Kaggle "Indian health insurance claims" sets are synthetic or generic; they will not survive
  ten seconds of scrutiny and should not be cited.
- Consequence: the forecast half is bounded by public tariffs and honestly labelled as such
  (slide 4 CONS already says this — good). The **adjudication half needs no such data at all**,
  which is why the deck separates them. That separation is not a presentational choice, it is the
  project's answer to India's data reality.

## 1.2 The cost model — what slide 5 commits you to

> "XGBoost quantile regression — predicts a cost range, not a point estimate. Trained on: NHA/PM-JAY
> rates (≈1,900 procedures) · CGHS city-wise tariffs · past forecast-vs-actual outcomes."

**Why quantile regression is the right call, in one sentence:** a point estimate of a hospital bill
is a number that will be wrong, and a family cannot plan against a number that will be wrong; an
interval with stated coverage is a number they can.

**Implementation facts** `[VERIFIED]`

- `reg:quantileerror` landed in **XGBoost 2.0.0** (Python, R, C packages only — not JVM).
- Pass `quantile_alpha=[0.1, 0.5, 0.9]` to `XGBRegressor` and one model returns all three; with the
  Booster API, `inplace_predict` gives a 2-D array of shape `(n_samples, n_quantiles)`.
- Use `QuantileDMatrix` for the training data.
- Evaluate with **pinball loss** per quantile — it is the proper scoring rule for this objective —
  plus **empirical coverage** (what fraction of held-out actuals fell inside the 10–90 band; you
  want 80%).
- **Known failure mode, and a judge may know it: quantile crossing.** The α=0.1 model can predict
  above the α=0.9 model. It is rare in a well-trained model but not impossible, and the median is
  not guaranteed to sit inside the interval.

**The fix, and the answer that will impress an ML judge: conformalized quantile regression (CQR).**
Romano, Patterson & Candès, NeurIPS 2019 (arXiv:1905.03222), reference code at
`github.com/yromano/cqr`. CQR wraps any quantile regressor with a calibration split and yields a
**distribution-free, finite-sample coverage guarantee** — genuinely 90% coverage at 90% nominal,
without assuming anything about the error distribution, and with shorter intervals than earlier
conformal methods. Two things to be precise about if you say this: the guarantee is **marginal**,
not conditional (you get 90% coverage overall, not 90% for every subgroup), and it costs you a
calibration split.

Saying "XGBoost quantile regression, conformalized, validated on pinball loss and empirical
coverage" is a materially stronger answer than "XGBoost", and it costs you one sentence.

**Why not a neural network.** Healthcare cost data is non-negative, heavily right-skewed and
heavy-tailed. The literature is clear that gradient-boosted trees and random forests are strong on
this shape — a simulation study on Oncology Care Model data found random forests beat Gamma GLM and
penalised additive quantile regression on both overall and top-decile cost prediction (BMC Health
Serv Res, 2020). And the practical constraint dominates: **you will have hundreds of labelled
cases, not millions.** GBDT is the correct model class at that sample size, and it is auditable —
you can show a family which features moved their estimate, which you cannot do with an MLP.

**Adjacent methods worth knowing by name**, in case the ML judge is a statistician:

- **Tweedie / compound-Poisson GLM** — the standard actuarial answer for semicontinuous cost data
  with a point mass at zero; unifies frequency and severity in one regression, and avoids the
  well-documented under-forecasting bias of log-transforming the response (Kurz, *BMC Med Res
  Methodol*, 2017). Available in XGBoost as `reg:tweedie`.
- **Two-part models** — logistic for zero/non-zero, then Gamma-with-log-link on the positives.
  Known weakness: the two decisions are not actually independent.
- Note ClaimCast's zero-inflation problem is mild, because it conditions on an admission having
  happened. Say so — it shows you know why the actuarial machinery exists and why you need less
  of it.

**Features you would actually use:** procedure (HBP/CGHS code), specialty, hospital tier and city
band, NABH status, room class, length of stay, ICU days, implant flag and implant class, age band,
comorbidity flag. Not: name, policy number, diagnosis narrative, or anything identifiable.

**The cold-start answer.** Before you have a single outcome, the model is not a model — it is the
public tariff plus a published spread, which is why slide 4 says "Forecast bounded by published
tariffs" under CONS. That is honest and it works from case one. The learned model replaces the
spread as outcomes arrive. Do not claim accuracy you cannot have on day one; claim a *bound* you
can defend on day one.

## 1.3 The policy extractor — what slide 5 commits you to

> "RAG over the uploaded policy PDF. Extracts: sum insured, sub-limits, co-pay %, exclusions,
> waiting periods — each field cited to its source clause. Extraction only, never adjudication — a
> misread field fails safe, flagged for user confirmation."

That last sentence is the best sentence on the slide. It is the whole safety argument in eleven
words, and it is the answer to at least four different judge questions.

**How to talk about the design:**

- It is a **schema-constrained extraction** task, not open-ended generation. Define the target
  schema (sum insured, room cap absolute and %-of-SI, ICU cap, co-pay %, implant sub-limit,
  waiting periods, PED wait, moratorium months, exclusion list), validate the model's output
  against it, and reject anything that does not conform. This is the pattern from the legal
  structured-extraction literature: generate to a schema, validate against the schema, then
  **diff every citation in the output against the citations actually present in the source and
  drop any that are not there.** Set-difference-against-source transfers cleanly to policy
  clause IDs. `[REPORTED — arXiv 2607.03325 and related work]`
- **Temperature 0, top-p 1.** This is the convention in the ISDA 2025 CSA clause-extraction
  benchmark and it is the right default for any extraction eval. `[REPORTED]`
- **Every extracted field is user-confirmed before it can affect a rupee.** Already on slides 5
  and 6. This is what makes a hallucinated sub-limit a UI annoyance rather than a wrong number in
  front of a frightened family.
- **Evaluation:** field-level precision/recall on a hand-labelled set of policy documents, plus
  citation-grounding accuracy (does the cited clause actually contain the value). Build the labelled
  set from IRDAI standard wordings and publicly-filed product documents — you can do maybe 30–50
  policies by hand, and that is enough to report a number.
- Nearest public benchmarks if asked what you would compare against: **CUAD** and **ContractNLI**
  (the latter's evidence-span requirement is exactly the citation-grounding property you want),
  and **ContractEval** (ACL NLLP 2025, arXiv:2508.03080) for clause-level risk identification.
  **There is no public benchmark for span-grounded extraction on insurance *policy* documents** —
  a real gap, and a fair thing to say you would have to build.

**Be careful with hallucination rate numbers.** Published figures vary enormously by task shape,
and vendor blogs are unreliable. If pushed, the defensible framing is: rates are low for
short-answer extraction against a supplied document and rise sharply for open-ended generation and
multi-step tool chains; ClaimCast is deliberately at the low-risk end of that spectrum, and then
puts a human confirmation step and a deterministic engine downstream of it anyway.

## 1.4 The adjudication engine — the part with no ML in it

Deterministic. Every deduction cites a clause. No model in the money path. This is what makes the
output auditable, reproducible and arguable in front of an ombudsman, and it is why "AI where
uncertain, arithmetic where known" is the honest description of the system rather than a slogan.

The engine implements: room-rent sub-limit and proportionate deduction (scoped correctly — see
Part 3), ICU sub-limit, List I, implant sub-limits, pre/post-hospitalisation windows, the 24-hour
in-patient rule against the day-care list, PED waiting periods, the 60-month moratorium,
co-payment applied last on the admissible balance, and the sum-insured ceiling. It is ~230 lines
in the prototype (`web/src/lib/engine.ts`) and it is fully tested.

If a judge asks "where is the AI?" — the answer is that two-thirds of the pipeline is AI
(extraction and forecasting, both genuinely uncertain problems) and the third that decides money
is deliberately not, because a family arguing with a TPA needs a citation, not a probability.

## 1.5 The counterfactual solver

Slide 3 now calls this **constraint optimization**, which is the right name. It is a small
combinatorial search: enumerate the legal alternatives (hospital × room class × route, filtered by
what the policy and the hospital actually permit), re-adjudicate **the whole claim** for each, rank
by what the patient keeps, discard anything violating a hard constraint (room cap, waiting period,
network membership, sum insured).

Two things to be precise about:

- **The search space is tiny and exhaustive.** Ten hospitals × five room classes × two routes is
  100 evaluations, each a few hundred arithmetic operations. There is no heuristic, no relaxation,
  no local optimum. Say "exhaustive" — it is a strength, and it means the answer is provably the
  best available, not the best found.
- **Every branch is a full re-adjudication, not a delta.** The prototype does exactly this. It
  matters because deductions interact — co-pay applies to the admissible balance, so a change in
  room class changes the co-pay, and a delta model would get it wrong.

## 1.6 The memory loop — and its real weakness

> "Logs (procedure, hospital, city, forecast, actual billed amount) per case. Retrains the cost
> model on the combined historical + incoming pool — the range narrows as volume grows."

**Prepare for this question, because it is the sharpest one available to an ML judge:**

> *"Your system tells people to choose the cheaper hospital. So you only ever observe the outcomes
> of cases where people took your advice. Your training set is censored by your own
> recommendations. How do you not spiral?"*

This is selection bias / feedback-loop bias, and it is real. Answers, in order of strength:

1. **The label is the billed amount, not the recommendation's outcome.** You observe the actual bill
   at whatever hospital and room class the patient chose. Cases where the user ignored the
   recommendation are the *most* informative and are still logged. There is no filter on which
   outcomes enter the pool.
2. **Log the counterfactual too.** Store what the model predicted for every branch, not just the
   chosen one. The chosen branch gets a label; the others become a record of what was on offer,
   and let you measure whether recommendations were actually followed.
3. **Hold out an unrecommended slice** — a small fraction of cases where the ranking is shown
   without a highlighted recommendation — to keep an uncontaminated estimate of coverage. This is
   the standard fix and it is cheap.
4. **Public tariffs anchor the model regardless.** The floor does not move with usage.

Second question to expect: *"How many cases before it beats the public-tariff baseline?"* Do not
invent a number. The correct answer is that it is an empirical question, you would measure it with
pinball loss and coverage on a rolling holdout against the tariff-plus-spread baseline, and you
would keep the baseline in production until the learned model beats it — which is a design
decision you can state now.

## 1.7 Data protection — have this ready

India's **Digital Personal Data Protection Act, 2023** is in force and health data is personal
data. ClaimCast's answers:

- The policy PDF and the case parameters are the user's own data, uploaded by the user, for the
  user's own decision. Purpose limitation is trivially satisfied.
- The memory loop stores **procedure, hospital, city, forecast, actual billed amount** — no name, no
  policy number, no diagnosis narrative, no identifier. Slide 6 already says "no identifiable
  patient data". That is not a hedge; it is the schema.
- Nothing is shared with an insurer or hospital. ClaimCast acts for the patient — slide 4's
  comparison table says exactly this, and it is also the data-governance answer.

---

# Part 2 — The Q&A drill

Grouped by where the question comes from. For each: the question as a judge would ask it, then the
answer. The ones marked **⚠** are the ones that can actually hurt you.

## A · The problem and the idea

**A1. "Isn't this just an insurance calculator?"**
No. A calculator prices a premium. ClaimCast prices a *decision* — it takes a specific admission,
a specific policy and a specific hospital, runs the insurer's own adjudication arithmetic, and
returns what will be refused and why, with the clause. Then it re-runs the whole claim across every
legal alternative. Nothing on the market computes a deduction before admission.

**A2. "Why would a family in a crisis use software at an admission counter?"**
They wouldn't, if it took more than a minute. That is why the decision tree exists and why the
materiality filter exists: the output is one screen, one number, and the branches that move more
than ₹10,000. And the primary use is not at the counter — it is the night before, or in the
outpatient department when the surgery is scheduled. Only decision 3 (cashless or reimbursement)
is genuinely counter-time.

**A3. "The hospital already tells you this at the TPA desk."**
The TPA desk speaks *after* admission, when four of the five decisions have already closed, and it
acts for the hospital, not for you. That is the "Acts for" row on slide 4. The information is not
secret — the *timestamp* is the problem.

**A4. "What if the family has no choice of hospital — emergency, or one hospital in town?"** ⚠
Then decision 1 is closed and ClaimCast says so. This is why the prototype's tree marks branches as
blocked rather than hiding them, and why the "refused whichever path you take" node exists at all —
it tells you what is fixed *before* it tells you what is choosable. Decisions 2 (room class), 3
(route), 4 (implant choice) and 5 (admission classification) survive in almost every emergency, and
room class alone is the largest single lever in the reference case.

**A5. "Isn't the cheapest hospital the worst hospital? Are you sending people to bad care?"** ⚠
**This is the most dangerous question on the list and you must not fumble it.** ClaimCast never
recommends a hospital on price. It prices decisions the patient or clinician has already put on the
table. The problem statement forbids clinical recommendations and the system takes that literally —
it is a money tool, it says so on slide 6, and quality of care is not an input, an output, or a
ranking term. What it does is make the *financial* consequence of a clinical choice visible at the
moment the choice is made, instead of six weeks later. If you want the sharpest version: *we do not
tell anyone where to be treated; we make sure nobody finds out the price after it is too late to
matter.*

**A6. "Why the Hospitality track?"**
The track is *Holistic Optimization System for Policy-Integrated Admission & Treatment
Intelligence*. Policy-integrated admission decisions is the literal brief. ClaimCast integrates the
policy into the admission decision rather than discovering it at discharge.

## B · AI and ML

**B1. "Where is the AI? This looks like a rules engine."**
Two of three stages are AI on genuinely uncertain problems — extracting structured constraints from
an unstructured policy PDF with citations, and forecasting a bill as a calibrated range. The third
stage is deliberately arithmetic, because a family disputing a deduction needs a clause reference,
not a confidence score. "AI where uncertain, arithmetic where known" is a design decision, not an
absence.

**B2. "Why XGBoost and not a transformer / deep model?"**
Sample size and data shape. Cost data is right-skewed and heavy-tailed; gradient-boosted trees are
the strongest model class on tabular data of that shape, and the literature bears it out (random
forests beat Gamma GLM and penalised quantile regression on Oncology Care Model data). We will have
hundreds of labelled outcomes, not millions. And GBDT is inspectable — we can show a family which
features moved their estimate.

**B3. "How do you validate a range? What does 'accurate' even mean here?"**
Pinball loss per quantile, which is the proper scoring rule for quantile regression, plus empirical
coverage on a held-out set: if we quote a 10–90 band, 80% of actual bills should land inside it.
Coverage is the number that matters — an interval that is wide but honest beats a narrow one that
lies.

**B4. "Quantile regression can produce crossing quantiles."** *(An ML judge asking this is testing
you. Do not bluff.)*
Correct — the low-quantile model can predict above the high-quantile model, and the median is not
guaranteed to fall inside the interval. The standard fix is conformalized quantile regression
(Romano et al., NeurIPS 2019), which adds a calibration split and gives a distribution-free
finite-sample coverage guarantee. The guarantee is marginal rather than conditional, which is a
real limitation worth naming.

**B5. "Your LLM will hallucinate a sub-limit and cost someone money."** ⚠
It cannot reach the money. The LLM only extracts; every field it extracts is shown to the user for
confirmation before it is used; and the adjudication engine that computes rupees is deterministic
and never calls a model. A misread field is a UI correction, not a wrong payout. Structurally: the
extraction output is schema-validated, and every citation in the output is diffed against the
citations actually present in the source document, so a clause reference that does not exist in the
PDF is dropped rather than displayed.

**B6. "How do you know the citation is real?"**
Set-difference against source. Extract every clause reference present in the policy text, extract
every reference the model emitted, and discard anything in the second set that is not in the first.
This is the pattern from the structured legal-extraction literature and it transfers directly to
policy clause IDs.

**B7. "The self-learning loop will feed on its own recommendations."** ⚠
See §1.6 — the four-part answer. Lead with: the label is the actual billed amount at whatever
hospital the patient actually chose, including when they ignored us; and we log the predictions for
the branches not taken, so we can measure whether advice was followed.

**B8. "Cold start. What is it worth on day one, with zero training data?"**
On day one it is the published tariff plus the published private-sector spread, which is exactly
what slide 4's CONS row admits. That is a defensible bound from case one, and it is honest. The
learned model replaces the spread as outcomes arrive, and stays behind the tariff baseline in
production until it demonstrably beats it.

**B9. "What is the actual innovation? Every part of this exists."**
The composition and the timestamp. Insurers have adjudication engines. Cost models exist. RAG over
documents exists. Nobody has pointed adjudication *backwards in time* and run it *for the patient*.
Every existing product retrieves policy text; ClaimCast simulates the claim and optimises the
decision. Retrieval → simulation.

## C · Data

**C1. "Where does your cost data come from, really?"**
NHA/PM-JAY Health Benefit Packages — 1,949 packages, 27 specialties. CGHS city-wise rate lists,
2024 revision. Both are Government of India publications. Neither is a private hospital's
chargemaster, and slide 4 says so under CONS.

**C2. "Public scheme rates are far below private prices. Your forecast is useless."** ⚠
Correct on the premise, wrong on the conclusion. Public rates give us the *relative* structure —
which procedures cost more than which, how a city band shifts the price, how NABH status shifts it
— and CGHS gives us the room-class differential explicitly: general is −10%, semi-private is base,
private is +15%, and investigations carry no ward differential at all. We calibrate the *level*
against observed bills as the memory loop fills. And the forecast is returned as a range precisely
because we do not have the level yet.

**C3. "Where does the room-class scaling come from? Did you make it up?"**
No — it is published. The CGHS package rate list is quoted against the semi-private ward with a
−10% / base / +15% differential by ward entitlement, and explicitly no differential for
investigations. That is the Government of India stating in its own price list exactly what IRDAI's
2020 circular states in words: procedure charges vary with room category, diagnostics do not.

**C4. "Slide 3's ₹1.2 L, ₹2 L, ₹45,000, ₹22,000 — where are those from?"** ⚠
Illustrative, for a five-day spinal fusion in a metro corporate hospital on a ₹5 lakh policy with a
₹5,000 room cap. They are the magnitudes the mechanics produce on a realistic admission; they are
not measured. The one figure that *is* fully derived is ₹78,400 (and its components ₹1,26,900 and
₹48,500) — there is a written itemised bill behind it in `ClaimCast.md` §5.4, and the prototype's
test suite fails the build if the engine and the deck ever disagree. **Say "illustrative" before
you are asked. Do not let a judge catch you claiming a measurement.**

**C5. "Why should we believe a bill you generated yourself?"**
You should not believe the level; you should check the mechanics. Every deduction in the worked
example cites a clause, the arithmetic reconciles (insurer share + patient share = bill total,
exactly, in integer paise), and the whole thing is reproducible — `npm run check` in the repo
re-derives every rupee on the deck from the engine and fails if they diverge.

**C6. "Where does a normal person get their policy PDF?"**
Three routes today: the insurer's own portal or app, the email issued at purchase, and DigiLocker,
where an increasing number of insurers push policy documents. If none of those work, the fields we
need — sum insured, room cap, co-pay, waiting periods — sit on the policy schedule, which is the
first two pages, and can be entered by hand in under a minute. The extractor is a convenience, not
a dependency. *(The prototype demonstrates exactly this: no upload, structured inputs only.)*

**C7. "What about NHCX?"** *(If a judge raises this, they know the sector. Take it seriously.)*
The National Health Claims Exchange went live in June 2024, built by NHA with IRDAI, FHIR-based. It
is a **router, not a repository** — payloads are encrypted end to end and the exchange reads only
routing headers. By 2026 roughly 160 insurers and TPAs and 12,600+ hospitals are on it, though
participation remains voluntary. Two implications for us: it is the obvious eventual source for the
"Insurer cashless API" we currently list under Simulate, and it standardises pre-authorisation into
a machine-readable format, which is exactly the interface a pre-admission forecaster wants. It does
not compete with us — NHCX moves claims between institutions; it does not tell a patient what a
claim will cost before it is filed.

## D · Regulation and law

**D1. "Didn't IRDAI abolish room-rent proportionate deduction?"** ⚠⚠
**Expect this. It is the question that could unravel slide 2 if you get it wrong.** The accurate
answer, in three parts:

1. The 2020 circular (`IRDAI/HLT/REG/CIR/151/06/2020`) did not abolish it — it **scoped** it. The
   ratio may be applied only to "associated medical expenses" that genuinely vary with room
   category, and never to pharmacy, consumables, implants, diagnostics or ICU. Before that
   circular, insurers were scaling whole bills.
2. Under the post-2024 product regime, many new **retail** plans are filed without room-rent caps
   at all, and market lists of "no room rent cap" products are now common. Where there is no cap,
   there is no trigger.
3. But sub-limits remain entirely legal and remain widespread where most Indians are actually
   covered: **legacy retail policies still in force, budget plans, and group/corporate cover**,
   where 1% of sum insured for a normal room and 2% for ICU is the standard structure. On a ₹5 lakh
   corporate policy that is ₹5,000/day against metro private rooms at ₹9,000–₹15,000/day. `[REPORTED]`

Then close it: **and even where the room cap is gone, the other four decisions are not.** Network
vs non-network payout, cashless vs reimbursement float, implant sub-limits and List I, and the
24-hour rule are untouched by any of this. ClaimCast prices five decisions, not one.

**D2. "Are you giving insurance advice? Is that regulated?"** ⚠
No. ClaimCast does not sell, recommend, or place a policy, and it does not tell anyone whether to
claim. It computes what a given wording refuses on a given bill and cites the clause. It is the
same category of thing as a tax calculator: arithmetic on a document the user already holds.
Outputs are labelled estimates, never guarantees — which is exactly why the word "guarantee" should
come off slide 4 (§0.2).

**D3. "Are you giving medical advice?"**
No, and the problem statement forbids it. No diagnosis, no treatment recommendation, no clinical
ranking. Quality of care is not an input or an output. Money only. Slide 6, last line.

**D4. "What if you are wrong and someone relies on it?"**
Three structural protections. The forecast is a range with stated coverage, not a promise. Every
adjudication line cites the clause it comes from, so it is checkable against the policy the user is
holding. And every extracted field is user-confirmed, so the inputs are the user's own assertion,
not the model's. The deterministic half is reproducible: same inputs, same output, every time,
which is what makes an error findable rather than mysterious.

**D5. "DPDP Act — you are handling health data."**
See §1.7. Short version: user's own document, user's own decision, and the memory loop stores no
identifier — procedure, hospital, city, forecast, actual. Nothing is shared with an insurer or a
hospital.

## E · Product and UX

**E1. "Five decisions is a lot for a stressed caregiver."**
That is what the materiality filter is for: we compute the money at stake at each fork and stay
silent unless it clears ₹10,000. Most admissions surface two live decisions, not five. And the
prototype presents them as a single top-to-bottom path, not a form — the choices appear in the
order they are actually faced.

**E2. "How long does it take to get an answer?"**
From structured inputs, instantly — the adjudication is a few hundred arithmetic operations and the
counterfactual search is exhaustive over about a hundred combinations. With a policy PDF upload,
the extraction step and the user's confirmation of the extracted fields dominate; call it a couple
of minutes, once, per policy, and it is cached thereafter.

**E3. "What if the user's hospital is not in your database?"**
Then the tariff comes from the city band and NABH status rather than the specific facility, and the
forecast range widens accordingly — which is visible to the user, because it is a range. The
adjudication half is unaffected; it depends on the policy and the bill structure, not on which
hospital.

**E4. "Language? Most of your users don't read English policy documents."**
Fair, and unaddressed on the deck. The adjudication output is structurally simple — item, amount,
reason, clause — which makes it far easier to localise than free text. The policy documents
themselves are in English by regulation, which is precisely part of the problem we are solving.

## F · Commercial viability — the weakest part of the deck

**This is 20% of the score and the deck says nothing about it. Prepare answers; consider adding a line.**

**F1. "Who pays for this?"**
Three routes, in order of realism:

- **B2B2C through the employer / broker.** Corporate group policies are exactly where room-rent
  sub-limits are still standard (1% of SI normal, 2% ICU), so the pain is concentrated in a channel
  that already buys software. An HR benefits platform or a broker embeds ClaimCast; the employer
  pays per covered life.
- **B2B through the insurer.** Counter-intuitive, but a disallowance is a service failure: it is
  the moment the policyholder learns their cover was smaller than they believed. Insurers with high
  NPS ambitions have a reason to tell people first. IRDAI's direction of travel — 1-hour cashless
  authorisation, 3-hour discharge, the 60-month moratorium, the Claims Review Committee requirement
  — is all toward pre-emptive transparency.
- **B2C freemium.** One free forecast, paid for a policy-portfolio view or family cover. Weakest of
  the three: low willingness to pay, and the moment of need is not a moment of purchase.

**F2. "What is the market?"** `[REPORTED — IRDAI FY24]`
Health insurance premium ₹1,07,681 crore, covering 57 crore lives under 2.68 crore policies, growing
20% a year. **₹15,100 crore was disallowed from otherwise-approved claims in FY24, and ₹10,937
crore repudiated — ₹26,000 crore in total, up 19% year on year.** The disallowed figure is the one
ClaimCast addresses directly. It is not a niche.

**F3. "Who else is doing this?"** ⚠ *(Know these names. Being surprised by them is worse than any answer.)*

| Company | What they do | How ClaimCast differs |
|---|---|---|
| **Vitraya Technologies** | AI auto-adjudication of health claims for insurers; approved under the IRDAI Regulatory Sandbox; ~$12.8M raised | Adjudicates **for the insurer**, **after** the claim is filed. Same arithmetic; opposite principal, opposite timestamp |
| **ClaimBuddy** | Hospital- and patient-side claims desk, services + software; 250+ hospitals, ~35,000 patients, ~₹14.6 Cr revenue FY25 | Helps you **file** a claim well. Does not tell you what a decision costs **before** you make it |
| **Ditto, PolicyBazaar** | Policy explanation, comparison and sale | Retrieval and sales. On the deck's own comparison table: "any time, no context", "acts for no one" |
| **Care.fi, IHX** | Hospital revenue-cycle and claims infrastructure | Institutional plumbing, not patient decision support |
| **NHCX (NHA)** | Public claims exchange — routes claims between hospitals, insurers, TPAs | Infrastructure we would consume, not a competitor. Routes claims; does not price decisions |

Sector context worth having: fraud and abuse are estimated at 10–15% of Indian healthcare costs,
and over 90% of Indian hospitals are individually owned with no in-house insurance expertise — which
is the founding thesis of the whole claims-tech category. `[REPORTED]`

**F4. "What is your moat? Anyone can read the IRDAI circular."**
The circular is public; the encoding is not. The moat is the rule-pack library — every product's
wording reduced to executable, clause-cited constraints, with the edge cases found by running real
admissions through it — plus the forecast-vs-actual outcome pool, which is the only dataset in
India that pairs a predicted bill with the settled amount at the decision level. Neither is
buyable. Both compound.

**F5. "How does this scale beyond private insurance?"**
Slide 4 says it: rule-packs for private, PM-JAY and ESI. The engine is the same; the constraint set
changes. PM-JAY has package rates and a no-out-of-pocket promise that is frequently breached —
telling a beneficiary what should be free is the same computation with a different rule-pack.

## G · Team and execution

**G1. "What have you actually built?"** — See Part 4. A working prototype: adjudication engine,
counterfactual solver, decision tree UI, and a synthetic database of 10 hospitals, 14 procedures,
6 policy structures and 16 settled admissions chosen for their edge cases. ~3,400 lines of
TypeScript, self-testing, no network calls.

**G2. "What is the hardest unsolved problem?"** — Answer honestly: getting real billed amounts.
Everything else is engineering. There is no public dataset of what Indian private hospitals
actually charge, and the memory loop is the only path to one. That is why the loop is on slide 5
and why the first deployment matters more than the model.

**G3. "What would you do with three months?"** — Encode 20 real policy wordings as rule-packs;
build the labelled extraction eval set from IRDAI standard wordings; get 50–100 real anonymised
bills through one hospital or one employer to calibrate the level of the forecast; ship the
conformal calibration layer. In that order — data before model.

## H · The five questions most likely to hurt

Ranked. If you only rehearse five, rehearse these.

1. **D1** — "IRDAI abolished proportionate deduction, didn't they?" — three-part answer, then pivot
   to the other four decisions.
2. **A5** — "Are you steering patients to cheap, bad hospitals?" — never recommends on price;
   prices decisions already on the table; money only.
3. **C4 / C2** — "Your numbers are made up." — one figure is fully derived and build-tested; four
   are illustrative and you say so first; public tariffs give structure, not level, which is why
   the output is a range.
4. **B7** — "Your self-learning loop eats its own output." — label is the actual bill regardless of
   compliance; log the untaken branches; hold out an unrecommended slice.
5. **F1** — "Who pays?" — employer/broker channel first, because that is where sub-limits and
   procurement budgets coincide.

---

# Part 3 — Every figure on the deck, and where it came from

## 3.1 Slide 2 — the problem

| Figure | Meaning | Source | Status |
|---|---|---|---|
| **50%** | Proportionate-deduction ratio, maximal case | Derived from `IRDAI/HLT/REG/CIR/151/06/2020` — a ₹5,000 cap against a ₹10,000 room is a 50% ratio | **[VERIFIED]** — the caption "maximal case; scope varies by policy wording" is doing necessary work. Keep it |
| **₹5,000 / ₹10,000** | Room cap vs actual room rate | Illustrative; matches the Arogya Sanjeevani cap structure and real metro private-room rates (₹9,000–₹15,000/day) | **[VERIFIED as realistic]** |
| **₹39,085** | Mean out-of-pocket per **cancer** hospitalisation | Prinja S, Dixit J, et al., *Financial toxicity of cancer treatment in India*, Front. Public Health 2023;11:1065737 | **[VERIFIED]** — the slide correctly labels it "per cancer hospitalization". It is **not** a general figure |
| **₹3.31 L** | Mean annual out-of-pocket per cancer patient | Same study (₹3,31,177) | **[VERIFIED]** |
| **12,148** | Study sample size | Same study | **[VERIFIED]** |
| **36%** | Diagnostics share of out-of-pocket | Same study (36.4%) | **[VERIFIED]** |
| **45%** | Medicines share of out-of-pocket | Same study | **[VERIFIED]** |
| Ajay Seth quotation | "IRDAI's chairman has said claim payouts often fall short of what policyholders expect" | IRDAI Chairman, Bima Lokpal Day, Nov 2025 | **[PARAPHRASE, deliberately]** — the exact wording could not be verified, so the deck italicises a paraphrase rather than quoting. **Do not quote it verbatim in the Q&A.** Backup fact if pressed: ~54% of the ~53,230 ombudsman complaints in FY23-24 were health insurance |

**The one exposure on slide 2:** ₹39,085 and ₹3.31 L are cancer-specific, and the slide's headline
narrative is general. The slide labels them correctly in small type. If a judge notices, agree
immediately — "yes, those are the cancer cohort; it is the best-sourced Indian financial-toxicity
study we could cite, and we labelled it rather than generalising it" — and offer the general source
you *would* use: NSS 75th Round, Schedule 25.0.

## 3.2 Slide 3 — the five decisions

| Figure | Meaning | Status |
|---|---|---|
| **₹1.2 L** | At stake — hospital choice | **[SYNTHETIC]** illustrative |
| **₹78,400** | At stake — room class | **[SYNTHETIC, BUT DERIVED]** — full itemised bill in `ClaimCast.md` §5.4; reproduced by `npm run check` |
| **₹2 L** | At stake — cashless vs reimbursement float | **[SYNTHETIC]** illustrative |
| **₹45,000** | At stake — implant / consumable | **[SYNTHETIC]** illustrative |
| **₹22,000** | At stake — day-care vs in-patient | **[SYNTHETIC]** illustrative |
| **₹10,000** | Room-rent cap in the constraint-optimization example | Design/illustrative |
| **1 yr** | Waiting period in the same example | Illustrative; real PED waits are typically 24–48 months, and the 2024 regime caps PED waiting at 36 months. **A ₹1 yr example is fine but do not defend it as typical** |
| **24 hours** | In-patient admission rule | **[VERIFIED]** — standard policy definition |
| **5** | Decision points | Design choice, mapped to the problem statement's care journey |

## 3.3 Slide 4 — the solution

| Figure | Meaning | Status |
|---|---|---|
| **₹1,26,900** | Patient share, private room | **[SYNTHETIC, BUT DERIVED]** — `ClaimCast.md` §5.4 |
| **₹48,500** | Patient share, semi-private | **[SYNTHETIC, BUT DERIVED]** |
| **₹78,400** | The difference | **[SYNTHETIC, BUT DERIVED]** — and `48,500 + 78,400 = 1,26,900` exactly |
| **Clause 3.2** | Room-rent sub-limit citation | Illustrative clause number, on an illustrative policy |
| **₹10,000 / ₹5,000 per day** | The two room tariffs | Illustrative, realistic |

If asked to walk through the derivation live: bill total ₹3,53,900 for the private room admission,
insurer pays ₹2,27,000, patient pays ₹1,26,900. In semi-private the bill total falls to ₹3,28,900
(the room line is cheaper) and the patient share falls to ₹48,500, because the proportionate
deduction disappears entirely once the room is within the cap. The saving is larger than the room
price difference — that is the whole point of the slide.

## 3.4 Slides 5 and 6 — architecture and references

| Figure | Meaning | Status |
|---|---|---|
| **≈1,900 procedures** | PM-JAY HBP procedure rates | **[VERIFIED]** — NHA HBP 2022: 1,949 packages across 27 specialties |
| **XGBoost quantile regression** | The cost model | **[VERIFIED as available]** — `reg:quantileerror`, XGBoost ≥ 2.0.0, Python/R/C only |
| **GPT-4o / Claude** | The extractor | Available, but **dated** — see §0.2 |
| **IRDAI List I** | Non-payables | **[VERIFIED]** — 68 items; Lists II–IV are subsumed, not billable |
| Reference 1 | `IRDAI/HLT/REG/CIR/151/06/2020` | **[VERIFIED]** |
| Reference 2 | Front. Public Health 2023, n = 12,148 | **[VERIFIED]** |
| Reference 3 | Lancet Reg. Health SE Asia 2022;6:100058 | **[UNVERIFIED]** — flagged in `ClaimCast.md` §5.5; the volume/article number could not be confirmed. **If a judge asks for reference 3 specifically, say you will send the DOI rather than reciting it.** Consider verifying or replacing it before the round |
| Reference 4 | IRDAI Master Circular on Health Insurance Business, 29 May 2024 | **[VERIFIED]** — 1-hour cashless authorisation, 3-hour discharge, 60-month moratorium, 30-day free-look, Claims Review Committee sign-off required for repudiation |

## 3.5 Figures NOT on the deck that you should have in your pocket

Use these in Q&A, not on slides — they are the strongest ammunition you have and they are all from
the regulator.

- **₹15,100 crore disallowed** from otherwise-approved health claims in FY24 (12.9% of claims filed
  by value) — this is precisely what ClaimCast forecasts. `[REPORTED — IRDAI FY24]`
- **₹10,937 crore repudiated** (9.34%). Disallowed exceeds repudiated.
- **₹26,000 crore total**, up **19.10%** year on year.
- **71.29%** of health claims paid by value; **82.46%** settled by number. The gap between those two
  numbers *is* the deduction problem.
- Average claim paid **₹31,086**. Health premium **₹1,07,681 crore**, 57 crore lives.
- **Medical inflation 12–14%** by survey, against ~3–4% official health CPI. Name which one.
- **CGHS ward differential**: general −10%, semi-private base, private +15%, investigations
  unchanged. Room rents ₹1,500 / ₹3,000 / ₹4,500; ICU ₹5,400. NABH +15%.
- **NHCX**: live June 2024, FHIR, ~160 insurers/TPAs, 12,600+ hospitals by 2026, voluntary.
- **Group policy norm**: room cap 1% of sum insured, ICU 2%.

---

# Part 4 — The prototype, and the non-AI engineering

Repository: `github.com/aniket-3001/ClaimCast`, branch `dev-aniket`, directory `web/`.

## 4.1 What it is, in one breath

A local, front-end-only working model of the whole system. No server, no network calls, no real
data. Everything runs in the browser against synthetic data held in the repository, which means it
cannot break during a demo and it cannot leak anything.

```
cd web
npm install
npm run dev      # http://localhost:5174
```

## 4.2 The stack, and why

| Choice | Why, in judge-facing terms |
|---|---|
| **React 18 + TypeScript 5.6** | TypeScript because every quantity in this system is money; the type system is what stops a rupee value being handed to a function expecting paise |
| **Vite 5** | Instant dev server and a ~200 kB production bundle. No framework ceremony |
| **Two runtime dependencies — `react` and `react-dom`. That is all.** | Deliberate. No UI kit, no chart library, no state library. The whole interface is hand-written CSS. It means nothing on screen is a component someone else designed for a different problem |
| **No backend** | The brief says synthetic or user-provided data. A backend would imply data we do not have and should not claim |
| **~3,400 lines of TypeScript** | Engine 226, case/journey model 401, database view 389, bill view 190, decision tree 202, plus the data |

## 4.3 The three tabs

**The path** — the decision tree. The admission at the top, then a gate ("Is this a claim at all?"
— the 24-hour rule), then the choices in the order they are faced along the care journey: *where*
and *which bed* at admission, *how you claim* at investigation. Below them, the deductions that no
choice moves. At the bottom, what the family pays, as a figure and as a range.

Every branch is clickable and every branch is a **complete re-adjudication** — the rupee figure
under "Navjeevan Hospital" is what would actually be paid there, not this case adjusted. Branches
that are illegal (a hospital with no private room, cashless at a hospital outside the network) are
shown as blocked rather than hidden, because knowing a door is shut is information.

**The working** — the same admission as arithmetic. The itemised bill line by line, every deduction
citing its clause, then every room class and every hospital re-adjudicated in full. This is the tab
for a judge who wants to check the tree rather than believe it.

**Database** — six tables: 16 settled admissions, 10 hospitals, 14 procedures, 6 policy structures,
IRDAI Lists I–IV, and the clause registry. Click any admission to load it into the tree.

## 4.4 Engineering decisions worth mentioning if asked

**Money is stored in integer paise, never floats.** Every amount in the system is an integer number
of paise. There is no floating-point arithmetic anywhere in the money path, so there is no rounding
drift, and `insurer share + patient share == bill total` exactly, always. The proportionate split
function is written so that the two halves are guaranteed to sum to the input. This is the sort of
thing that separates a demo from a system.

**Indian digit grouping.** ₹1,26,900, not ₹126,900. Written by hand because no standard formatter
gets the lakh/crore grouping right.

**The build fails if the deck is wrong.** `npm run check` runs two things: a self-check that
re-derives every rupee figure on slide 4 from the engine and asserts them against the deck's
numbers, and a server-side render of all three tabs over 76 different cases plus the database. If
someone changes the engine and the deck's ₹78,400 no longer follows, the build breaks. The deck and
the code cannot silently diverge.

There is also an assertion that the "refused whichever path you take" node is literally true — it
crosses every hospital with every room class and fails if any supposedly-unavoidable deduction
turns out to be avoidable.

**Edge cases are the point of the synthetic data.** The 16 admissions were not generated; each was
written because of what it breaks. The room priced exactly at the sub-limit. The intensive-care
stay with nothing scalable to apply a ratio to. The claim refused five hours short of 24. The sum
insured that ran out in March. The nursing home with one room class and therefore no cheaper bed to
move to. A judge who asks "what happens if…" can usually be shown it.

**Accessibility and responsiveness.** The tree is drawn with CSS, not SVG, so the connectors reflow
and the branches stay real buttons — keyboard-navigable, screen-reader-legible. Dark mode follows
the system setting. It degrades to two-up and then one-up on narrow screens.

## 4.5 What is real in the prototype and what is not

| Real | Mocked |
|---|---|
| The adjudication engine — every deduction, every clause, the full IRDAI rule set | The hospitals, insurers, products, patients and bills. All invented |
| The counterfactual solver — exhaustive, full re-adjudication per branch | The cost model. The prototype uses a cost index per hospital, not a trained model |
| The proportionate-deduction scoping (correct: not applied to ICU, diagnostics, pharmacy, consumables or implants) | The LLM extractor. No upload; structured inputs only |
| The money arithmetic, to the paise | Live tariff and cashless feeds. Both are on slide 6 under Simulate |

**Say this before you demo, not after:** the engine is real, the data is synthetic, and the
synthetic data is where the edge cases live.

## 4.6 Likely questions about the prototype

**"Did you build this or generate it?"** — Both, and say so plainly. It was built in a session with
an AI assistant, which is the normal way software is written in 2026, and the parts that matter —
the IRDAI rule scoping, the paise arithmetic, the decision-tree model, the edge-case admissions —
were specified deliberately and are covered by tests that would catch a wrong answer.

**"Why is there no backend / login / database?"** — Because the brief forbids real data and a
backend would imply we have some. Everything the system needs for a decision fits in the browser.

**"Can we see it?"** — `npm run dev`, port 5174, works offline. Have it running before you walk in.

**"How would this ship?"** — The engine is a pure function with no I/O; it moves to a server or an
edge function unchanged. The extractor and the cost model become services behind interfaces the
engine already assumes. The front end is already the shape of the product.

---

## Sources

Regulatory and public data

- [IRDAI document portal](https://irdai.gov.in/) — Circular `IRDAI/HLT/REG/CIR/151/06/2020`; Master Circular on Health Insurance Business, 29 May 2024; Guidelines on Standardization in Health Insurance (`IRDA/HLT/REG/CIR/146/07/2016`), Annexure I Lists I–IV
- [NHA — Health Benefit Packages](https://nha.gov.in/PM-JAY) · [HBP 2.2 manual (PDF)](https://nha.gov.in/img/resources/HBP-2.2-manual.pdf) · [HBP 2022 package master and OM](https://snomedct.abdm.gov.in/node/3615)
- [CGHS rate lists](https://www.cghs.mohfw.gov.in/) · [CGHS interactive rate tool](https://cghs.mohfw.gov.in/AHIMSG5/hissso/cghsRateListLogin?tier=tier_i&spaciality=nabh&ward=general_ward) · [CGHS differential rates OM (PDF)](https://aibsnlrea.org/imporders/cghsdifferentialrates.pdf)
- [MoSPI microdata — NSS 75th Round, Schedule 25.0](https://microdata.gov.in/NADA/index.php/catalog/152)
- [NHCX brochure, ABDM (PDF)](https://abdm.gov.in/strapicms/uploads/NHCX_Brochure_ffdb63d9bc.pdf) · [NHCX overview](https://en.wikipedia.org/wiki/National_Health_Claims_Exchange)
- [Paramount TPA — IRDAI non-payable list (PDF)](https://www.paramounttpa.com/Home/images/Download/IRDA_Non_Payable_List.pdf)
- [Open Government Data — health infrastructure](https://www.data.gov.in/dataset-group-name/Health%20Infrastructure)

Industry figures (secondary — verify against the IRDAI annual report before slide use)

- [Business Standard — health insurers reject claims worth ₹15,100 cr in FY24](https://www.business-standard.com/finance/personal-finance/health-insurers-reject-claims-worth-rs-15-100-crore-in-fy24-irdai-124123100615_1.html)
- [Business Standard — health insurance claims rejection up 19.10% in FY24](https://www.business-standard.com/finance/personal-finance/health-insurance-claims-rejection-up-19-10-in-fy24-irdai-report-124122700754_1.html)
- [Milliman — measuring medical inflation in India](https://www.milliman.com/en/insight/measuring-medical-inflation-in-india)

Machine learning

- [XGBoost — quantile regression](https://xgboost.readthedocs.io/en/stable/python/examples/quantile_regression.html)
- [Romano, Patterson & Candès — Conformalized Quantile Regression, NeurIPS 2019](https://arxiv.org/abs/1905.03222) · [reference implementation](https://github.com/yromano/cqr)
- [Kurz — Tweedie distributions for semicontinuous health care cost data, BMC Med Res Methodol 2017](https://link.springer.com/article/10.1186/s12874-017-0445-y)
- [Comparison of statistical and ML models for healthcare cost data (OCM simulation), BMC Health Serv Res 2020](https://link.springer.com/article/10.1186/s12913-020-05148-y)
- [ContractEval — clause-level legal risk identification, ACL NLLP 2025](https://aclanthology.org/2025.nllp-1.19/)
- [ISDA — Benchmarking Generative AI for CSA Clause Extraction, May 2025 (PDF)](https://www.isda.org/a/vufgE/Benchmarking-Generative-AI-for-CSA-Clause-Extraction-and-CDM-Representation.pdf)

Market

- [Vitraya Technologies](https://vitraya.com/about) · [ClaimBuddy](https://claimbuddy.in/)
