# ClaimCast — Answers for the Judges' Round

Everything here is a question a judge might ask and the answer you would give out loud.
Written to be spoken, not read off a slide. Nothing needs memorising — read it twice and the
answers will be yours.

**Five things to know before anything else.** If you remember only this much, you can hold the room:

1. **We do the insurer's own arithmetic, but before admission instead of after discharge.** Same
   maths, different timestamp. That is the whole idea.
2. **The bill is a guess; the deduction is not.** We estimate what you'll be charged. We compute
   exactly what your policy will refuse — and cite the clause that refuses it.
3. **The AI never decides money.** It reads your policy document and it forecasts a cost range.
   The part that decides rupees is plain arithmetic with a clause reference next to every line.
4. **Our data is government data.** PM-JAY package rates and CGHS city rate lists. Public, free, and
   nobody can accuse us of using data we shouldn't have.
5. **We act for the patient.** Everyone else in this chain — the TPA, the hospital desk, the
   insurer's software — acts for someone else.

---

## Contents

- [Part 1 — The data](#part-1--the-data) — where our numbers come from
- [Part 2 — The AI and the machine learning](#part-2--the-ai-and-the-machine-learning)
- [Part 3 — The idea itself](#part-3--the-idea-itself)
- [Part 4 — Rules, law and safety](#part-4--rules-law-and-safety)
- [Part 5 — Money and competition](#part-5--money-and-competition)
- [Part 6 — The numbers on our slides](#part-6--the-numbers-on-our-slides)
- [Part 7 — The website we built](#part-7--the-website-we-built)
- [Part 8 — The five questions most likely to hurt](#part-8--the-five-questions-most-likely-to-hurt)

---

# Part 1 — The data

### Q. Where does your cost data actually come from?

Two government sources, both free and public.

The first is **PM-JAY**, the national health scheme. It publishes a price list of about **1,900
medical procedures** — what the government will pay a hospital for a knee replacement, a bypass, a
delivery. It's called the Health Benefit Packages list and it's on the National Health Authority's
website.

The second is **CGHS**, the government employees' health scheme. It publishes the same kind of
price list but **separately for each city** — Delhi, Mumbai, Kolkata and so on.

Between them we know roughly what a procedure costs and how that changes by city.

### Q. Those are government rates. Private hospitals charge far more. Isn't your forecast useless?

The premise is right, the conclusion isn't.

We don't use those rates as the answer. We use them for the **shape** of the answer — which
procedures cost more than which, how much a city changes the price, how much an ICU day adds. The
actual level for a private hospital, we calibrate as we see real bills.

And this is exactly why our forecast is a **range and not a single number**. We'd rather say
"between ₹2.8 lakh and ₹3.6 lakh" and be right than say "₹3.2 lakh" and be wrong. Our slide says
this plainly under CONS: forecast bounded by published tariffs.

### Q. You claim a private room costs more than a semi-private room for the same operation. Where's your evidence?

This is the best thing in our data and it's worth knowing properly.

The CGHS price list doesn't just give one price per procedure. It gives a price **and a rule for
how it changes with the ward you're in**:

- General ward — **10% less** than the listed price
- Semi-private ward — the listed price
- Private ward — **15% more**
- **Tests and scans — no change at all**

So the Government of India, in its own published price list, says the same surgery costs more in a
better room, and that the blood test costs the same either way.

That matters because **that's exactly what the insurance rule says too**. IRDAI's 2020 circular
says a room-rent deduction may only be applied to charges that vary with room category — never to
diagnostics, medicines or ICU. Two different arms of government saying the same thing, one in a
price list and one in a regulation.

So when a judge asks "did you invent the room-class scaling?" — no. It's published, twice.

*(A nice extra: CGHS's own rule is that if an employee takes a fancier ward than they're entitled
to, they're only reimbursed at their entitled ward's rate. That's the same trap as a room-rent
sub-limit — run by the government, on its own staff.)*

### Q. What's the "List I" you keep mentioning?

IRDAI publishes a list of **68 items** that a hospital may bill you but insurance will never pay
for. Gloves, syringes, baby food, an attendant's meals, admission paperwork, and so on.

It's one of the most useful things in our system because it is **completely fixed**. No room class,
no hospital, no policy changes it. When our decision tree shows a box saying "refused whichever path
you take" — that's mostly List I.

There are three more lists, and they're arguably more interesting. Lists II, III and IV name charges
a hospital is **not allowed to bill separately at all** — they're supposed to be included in the
room charge, the procedure charge and the treatment cost. So those aren't deductions; they're line
items that shouldn't be on your bill in the first place.

### Q. Where do you get policy documents? Whose policy wording are you using?

The regulator's own. IRDAI mandates a standard product called **Arogya Sanjeevani** and publishes
the exact wording every insurer must use. So we can build against a real, citable policy structure —
sum insured, room cap, co-pay, waiting periods — without touching any private company's document.

For the demo, all six policies are invented. Every field in them is a field that appears on a real
policy schedule, but the insurer names and products are made up.

### Q. Do you have data proving the problem is real?

Yes, from the regulator's own annual report. In FY24, of all the health insurance claims filed in
India:

- About **₹15,100 crore was "disallowed"** — the claim was approved, but chunks were cut off it
- About **₹10,937 crore was "repudiated"** — the claim was rejected outright

Learn that distinction, because it's our whole pitch. **Rejection is what everyone talks about.
Deduction is bigger** — ₹15,100 crore against ₹10,937 crore — and deduction is exactly what we
predict. Together they're about ₹26,000 crore, growing roughly 19% a year.

Two more from the same report if you need them: insurers paid about **71% of claims by value** but
settled about **82% by number**. That gap between the two figures *is* the deduction problem — most
claims get approved, just not for the full amount.

*(These are widely reported from the IRDAI annual report. Verify against the actual PDF before
putting any on a slide.)*

### Q. Is there any data you wish you had and can't get?

Yes, and we should say it before a judge says it to us.

**There is no public dataset of what Indian private hospitals actually charge.** No equivalent of
the American price-transparency rules. Nobody has it — not us, not a startup, not a research group.

**And there is no public dataset of settled claims** where you can see the policy, the bill and the
final payout together. The ones floating around on Kaggle are fake or generic.

Which is precisely why we split the product in two. The **forecast** half is limited by this and we
say so. The **deduction** half needs none of that data — it needs the policy wording and the bill
structure, both of which we have. That split isn't a design flourish; it's our answer to India's
data reality.

### Q. How would you get real bill data eventually?

The self-learning loop on slide 5. Every time someone uses ClaimCast and later tells us what they
were actually billed, that's one real data point pairing a prediction with an outcome. Nobody in
India has that dataset, and it can't be bought — it can only be accumulated. That's our moat.

### Q. Have you heard of NHCX?

*(If a judge asks this, they know the industry. Take it seriously.)*

Yes — the **National Health Claims Exchange**, live since June 2024, built by the National Health
Authority with IRDAI. It's a pipe that moves claims between hospitals, insurers and TPAs in a
standard digital format. Around 160 insurers and TPAs and over 12,000 hospitals are on it, though
joining is still voluntary. It's a **router, not a database** — it passes claims along encrypted and
doesn't store them.

It doesn't compete with us. It moves claims between institutions *after* they're filed. It doesn't
tell a family what a claim will cost *before* they're admitted. If anything it helps us — it's the
obvious eventual source for the live insurer connection we currently list under "Simulate".

---

# Part 2 — The AI and the machine learning

### Q. Where's the AI? This looks like a rules engine.

Three stages, and two of them are AI.

**Stage one is AI** — reading a policy PDF. Insurance documents are forty pages of dense legal
English and every insurer writes them differently. Pulling out "your room limit is ₹5,000 a day" and
pointing at the exact clause it came from is genuinely a language problem. That's an LLM job.

**Stage two is AI** — forecasting what the hospital will charge. Nobody knows this number in
advance. It depends on the procedure, the city, the hospital, how long you stay, whether you need
ICU. That's a prediction problem. That's machine learning.

**Stage three is deliberately not AI** — working out what the policy refuses. Because a family
arguing with a TPA needs a clause number, not a confidence score. If we said "we're 87% sure
₹78,400 will be deducted", that's useless to them. Saying "₹78,400 will be deducted under clause
3.2, here's the arithmetic" is something they can take to the desk and argue with.

So: **AI where things are uncertain, arithmetic where things are written down.** That's a decision,
not a gap.

### Q. What model do you use for the cost forecast, and why?

**XGBoost with quantile regression.** Two parts to that name, and both are worth being able to
explain, because a technical judge will push on them.

**XGBoost** is a tree-based model. It's the standard, best-performing choice for this kind of data —
rows and columns, numbers and categories, a few hundred or a few thousand examples. Not images, not
text. And critically, we can look inside it and see which factors pushed an estimate up, which we
could never do with a neural network. If we're telling a family a number, we should be able to say
why.

**Quantile regression** means it predicts a range instead of a single number. Instead of "your bill
will be ₹3.2 lakh", it says "there's a 10% chance it's below ₹2.8 lakh and a 10% chance it's above
₹3.6 lakh". A single number for a hospital bill is a number that will be wrong, and a family can't
plan against a number that will be wrong. A range they can.

### Q. Why not deep learning? Why not a neural network?

Two reasons, and the second one decides it.

First, hospital cost data has an awkward shape — most bills are moderate, a few are enormous, none
are negative. Tree models handle that shape well, and there's published research comparing them: a
study on US cancer-care cost data found random forests beat the traditional statistical models,
including on the expensive cases that matter most.

Second, and this is the real reason — **we'll have hundreds of examples, not millions.** Neural
networks need enormous data to beat tree models on this kind of problem. At our scale, XGBoost is
simply the correct choice. Using a neural network here would be picking the fashionable tool over
the right one.

### Q. How do you know your forecast is any good? What does "accurate" mean for a range?

Two measures.

**Coverage** is the one that matters and it's easy to say: if we quote a 10-to-90 range, then 80% of
real bills should land inside it. We check that on data the model hasn't seen. If only 60% land
inside, our ranges are too narrow and we're lying to people.

**Pinball loss** is the technical scoring measure for this type of model — the standard metric for
quantile regression, the way accuracy is standard for a classifier. Name it if a technical judge
asks; you don't need to explain the formula.

A wide, honest range beats a narrow one that's wrong.

### Q. Quantile models can produce crossing quantiles. How do you handle that?

*(If a judge asks this, they're testing whether you actually understand the model. Don't bluff.)*

It's a real known flaw — the model predicting the low end can occasionally predict a number above
the model predicting the high end, which is nonsense.

The standard fix is called **conformalized quantile regression**, from a well-known 2019 NeurIPS
paper by Romano and colleagues at Stanford. You hold back a slice of your data purely to calibrate
the ranges, and it gives a mathematical guarantee that a 90% range really does contain the answer
90% of the time, without assuming anything about how the errors are distributed.

One honest limitation worth adding: that guarantee holds **on average across everyone**, not
necessarily for every subgroup. It might be 90% overall but 80% for cardiac cases specifically.
That's a known property of the method, not a flaw in our use of it.

### Q. Your LLM will misread a policy and cost someone money.

**It can't reach the money.** Three separate barriers, and this is the most important answer in the
whole deck.

One: the LLM only **extracts**. It reads the policy and fills in blanks — sum insured, room limit,
co-pay percentage. It never calculates a rupee.

Two: **every field it extracts is shown to the user to confirm** before it's used. If it misread
your room limit as ₹5,000 when the policy says ₹10,000, you see it on screen and correct it. A
misread field is a screen you fix, not a wrong number handed to a frightened family.

Three: the thing that actually calculates money is **ordinary arithmetic with no model in it**. Same
inputs, same answer, every single time.

That's what we mean on the slide by "a misread field fails safe."

### Q. How do you stop it inventing a clause that doesn't exist?

We check. Every clause reference the model produces gets compared against the clause references
actually present in the uploaded document, and anything that isn't in the document gets thrown away
rather than shown.

We also don't let it write freely. We define exactly which fields we want — sum insured, room cap,
co-pay, waiting periods — and reject anything that doesn't fit that shape. It's filling in a form,
not writing an essay. Much narrower job, much lower risk.

And we run it at temperature zero, which just means we ask for its most confident reading rather
than a creative one. That's the standard setting for extraction work.

### Q. Which LLM?

A frontier model — GPT-class or Claude — sitting behind an interface so it can be swapped. It's
deliberately not a dependency: the model reads documents and nothing else, so replacing it changes
nothing downstream.

*(Worth fixing on the deck: slide 5 currently names "GPT-4o", which is a 2024 model. Anyone who
follows the field will notice. Better as something like "a frontier LLM, swappable — the money path
never calls it.")*

### Q. What is "constraint optimization" on slide 3? That sounds like a buzzword.

It's the simplest part of the system, honestly.

We take your admission and re-run the entire claim calculation for every legal alternative — every
hospital, every room class, cashless or reimbursement. Then we throw out anything you're not allowed
to do (a hospital outside your network, a waiting period you haven't served) and rank what's left by
how much money you keep.

Two things worth saying about it.

It's **exhaustive, not clever**. Ten hospitals, five room classes, two claim routes is about a
hundred combinations, and we check all of them. So the answer isn't the best one we found — it's
provably the best one available.

And each one is a **complete recalculation**, not an adjustment. That matters because deductions
interact: co-pay applies after everything else, so changing your room changes your co-pay too. A
shortcut would get it wrong.

### Q. What's the "self-learning loop"?

Every case we run, we record: the procedure, the hospital, the city, what we predicted, and what the
person was actually billed. Over time that's a growing set of predictions paired with real outcomes,
and we retrain the forecast model on it. The ranges get tighter as we see more cases.

No names, no policy numbers, no diagnoses — just those five things.

### Q. But you only see outcomes for people who took your advice. Doesn't your training data get poisoned by your own recommendations?

*(This is the sharpest question a machine learning judge can ask. Have the answer ready.)*

Good question, and it's a real phenomenon. Three answers.

**First and most important — what we record is the actual bill at whatever hospital the person
actually chose.** Not whether they followed us. If someone ignores our advice completely and goes to
the expensive hospital, we still record that bill, and it's arguably the more useful data point.
Nothing filters what gets logged.

**Second, we record the roads not taken.** We store what we predicted for every option, not just the
chosen one. So we can also measure how often people follow the recommendation at all.

**Third, the government tariffs anchor the model regardless.** The public price floor doesn't move
based on what our users do.

### Q. How many cases before it's actually good?

Honest answer: that's an empirical question and we'd be making up a number if we told you one.

What we can commit to is the method — we keep the simple government-tariff baseline running in
production, measure the learned model against it on cases neither has seen, and only switch when the
learned one genuinely wins. That way there's never a moment where the fancy model is worse than the
simple one and we don't know it.

### Q. What does it do on day one with zero data?

It gives you the published government rate plus a published spread — a wide but honest range. That
works from the very first case and it's better than nothing, which is what a family has today. The
trained model replaces the guesswork gradually; it isn't required to start.

We say this on the slide under CONS. We'd rather admit the limit than have a judge find it.

---

# Part 3 — The idea itself

### Q. Isn't this just an insurance calculator?

A calculator tells you your premium. We tell you what a **decision** costs.

Give us your admission, your policy and your hospital, and we run the insurer's own deduction
arithmetic and tell you what will be refused and why, before you're admitted. Then we re-run the
whole thing for every other choice available to you.

There is nothing on the market that computes a deduction before admission.

### Q. Why would a family in a medical crisis use an app?

They wouldn't, if it took more than a minute. Which is why the output is one screen with one number,
and only the choices worth more than ₹10,000.

But the bigger answer is that most of these decisions aren't made in a crisis. A planned surgery is
scheduled days or weeks ahead. That's when this gets used — the night before, or in the OPD when the
date is fixed. Only one of the five decisions, cashless versus reimbursement, is genuinely a
counter-desk moment.

### Q. The TPA desk at the hospital already tells people this.

It does — **after admission**, when four of the five decisions have already been made and can't be
unmade. And it works for the hospital, not for you.

The information isn't secret. The **timing** is the problem. That's the entire product.

### Q. What if the family has no choice of hospital? Emergency, or one hospital in town?

Then that decision is closed and we say so — our tree shows closed doors as closed rather than
hiding them, because knowing a door is shut is also information.

But the other four decisions survive almost every emergency: which bed, cashless or reimbursement,
which implant, and whether it's billed as day-care or in-patient. And room class alone is the
biggest single lever in our example — ₹78,400 on a ₹3.5 lakh bill.

### Q. Aren't you pushing people towards cheap, bad hospitals?

*(Take this seriously and answer it flatly — it's the most dangerous question on the list.)*

No. We never recommend a hospital on price, and quality of care isn't an input to our system, an
output, or a ranking factor. We only price choices that are **already on the table** — chosen by the
patient or their doctor.

The competition rules forbid clinical recommendations and we take that literally. We're a money
tool. It says so on our last slide.

What we do is make the **financial** consequence of a clinical choice visible at the moment the
choice is being made, instead of six weeks later.

In one line: *we don't tell anyone where to be treated — we make sure nobody finds out the price
after it's too late to matter.*

### Q. What's genuinely new here? Every piece of this already exists.

The combination and the timing.

Insurers have adjudication engines — they run them after you've been discharged. Cost models exist.
Reading documents with AI exists. Nobody has pointed adjudication **backwards in time** and run it
**for the patient**.

Every existing product looks things up in your policy. We simulate the claim and then optimise the
decision. Lookup versus simulation.

### Q. Why did you pick this track?

The track is *Holistic Optimization System for Policy-Integrated Admission & Treatment Intelligence*.
Integrating the policy into the admission decision is literally the brief. We do exactly that —
instead of the policy being discovered at discharge.

---

# Part 4 — Rules, law and safety

### Q. Hasn't IRDAI abolished proportionate deduction? Your whole problem slide falls apart if so.

*(Expect this one. It's the question most likely to catch you out.)*

Three parts to the answer.

**One — the 2020 circular scoped it, it didn't abolish it.** Before 2020, insurers were scaling down
entire bills when your room exceeded the limit. The circular stopped that: the reduction can now
only apply to charges that genuinely vary with room category. It cannot touch medicines,
consumables, implants, diagnostics or ICU. So the rule got narrower, not extinct.

**Two — many new retail policies genuinely have no room cap now.** Under the 2024 product regime a
lot of newly filed retail plans dropped room-rent limits altogether. Where there's no cap, there's
no deduction. That's true and we should say it.

**Three — but that's not where most Indians are covered.** Room limits are still standard in older
retail policies still running, in budget plans, and especially in **corporate group cover**, where
1% of sum insured per day for a normal room and 2% for ICU is the usual structure. On a ₹5 lakh
corporate policy that's ₹5,000 a day, against metro private rooms at ₹9,000 to ₹15,000.

Then close it: **and even where the room cap is gone, the other four decisions aren't.** Network
versus non-network, cashless versus reimbursement, implant limits, List I, the 24-hour rule — none
of that is affected by any of this. We price five decisions, not one.

### Q. Are you giving insurance advice? Isn't that regulated?

No. We don't sell a policy, recommend a policy, or tell anyone whether to make a claim. We do
arithmetic on a document the user already owns and show them the clause behind each line.

Same category as a tax calculator. And our outputs are labelled estimates, not guarantees.

*(One thing to fix on the deck first: slide 4 currently says "we guarantee what won't be paid", while
the CONS column on that same slide says "an estimate, never a guarantee", and the last slide says
"never guarantees". A judge reading slide 4 twice will spot it, and "guarantee" is a loaded word in
insurance. Same punch without the problem: **"We estimate what you'll be billed. We compute exactly
what won't be paid."**)*

### Q. Are you giving medical advice?

No, and the rules forbid it. No diagnosis, no treatment suggestion, no ranking hospitals by quality.
Money only. It's the last line of our last slide.

### Q. What if you're wrong and someone relies on it?

Three protections built into the design.

The forecast is a **range**, not a promise — presented as a range precisely so nobody treats it as
certain.

Every deduction **cites its clause**, so the user can check it against the policy in their hand.
We're not asking to be trusted; we're showing our working.

And every field extracted from the policy is **confirmed by the user** before it does anything. So
the inputs are the user's own statements, not the machine's guesses.

### Q. You're handling health data. What about the data protection law?

The DPDP Act 2023 applies and we've thought about it.

The document is the user's own, uploaded by the user, for the user's own decision. And what we
**keep** is deliberately thin — procedure, hospital, city, our forecast, the actual bill. No name, no
policy number, no diagnosis, no identifier. Nothing goes to an insurer or a hospital.

Our slide says "no identifiable patient data". That's not a promise, that's the actual list of
fields we store.

---

# Part 5 — Money and competition

*This is 20% of the scoring and our deck currently says nothing about it. Have these ready.*

### Q. Who pays for this?

Three routes, in order of how realistic they are.

**Through employers, via brokers — the strongest.** Corporate group policies are exactly where room
limits are still standard, so the pain is concentrated in a channel that already buys software and
has a budget. An HR benefits platform or an insurance broker embeds ClaimCast; the employer pays per
covered employee.

**Through insurers — counter-intuitive but real.** A deduction is a service failure: it's the moment
your customer discovers their cover was smaller than they thought. Insurers competing on customer
experience have a reason to tell people first. And the regulator is pushing this way anyway —
one-hour cashless approval, three-hour discharge, mandatory committee review before rejecting a
claim. All of it is pressure toward telling people things earlier.

**Direct to consumers — the weakest.** Free for one forecast, paid for family or multi-policy views.
The trouble is that the moment someone needs this most is a terrible moment to ask them for money.

### Q. How big is the market?

Health insurance premiums in India are around **₹1.08 lakh crore**, covering **57 crore lives**, and
growing about 20% a year.

And the specific thing we address — money deducted from approved claims — was around **₹15,100 crore
in one year**, growing 19%. That's not a niche.

### Q. Who else is doing this?

*(Know these names. Being surprised by a competitor is worse than any answer you could give.)*

**Vitraya Technologies** does AI claim adjudication — genuinely similar technology. But they build it
**for insurers**, and it runs **after** the claim is filed. Same arithmetic, opposite side of the
table, opposite moment in time.

**ClaimBuddy** works with hospitals and patients to file claims properly. They help you make a claim
well. They don't tell you what a decision will cost before you make it.

**Ditto and PolicyBazaar** explain and sell policies. That's lookup and sales, not simulation.

**Care.fi and IHX** are hospital billing infrastructure — plumbing between institutions, not
anything a patient sees.

The pattern: **everyone is either on the institution's side, or after the fact, or both.** Nobody is
on the patient's side, before the decision.

### Q. What stops someone copying you?

The IRDAI circular is public — anyone can read it. But **turning every policy wording into working,
clause-referenced code** is months of work and it's where all the edge cases live. That library
grows every time we encode another product.

And the forecast-versus-actual data pool can't be bought at any price. It only accumulates through
use.

### Q. Does this only work for private insurance?

No — the engine is the same, only the rulebook changes. Our slide mentions rulebooks for private
insurance, PM-JAY and ESI.

PM-JAY is actually a strong case: it promises no out-of-pocket cost and that promise is broken
constantly. Telling a beneficiary what is supposed to be free is the same calculation with a
different rulebook.

---

# Part 6 — The numbers on our slides

### Q. Where did the 50% on the problem slide come from?

It's the deduction ratio in the worst case: if your policy caps the room at ₹5,000 and you take a
₹10,000 room, the ratio is one half, so half of the eligible charges get cut. The slide says
"maximal case" for exactly that reason — it's the ceiling, not the average, and it varies by policy
wording.

Both room rates are realistic. Metro private rooms genuinely run ₹9,000 to ₹15,000 a day.

### Q. Where do ₹39,085 and ₹3.31 lakh come from?

A published study — Prinja, Dixit and colleagues, *Financial toxicity of cancer treatment in India*,
Frontiers in Public Health, 2023, with a sample of 12,148 patients. ₹39,085 is the average
out-of-pocket cost per hospitalisation and ₹3.31 lakh is the average per patient per year. The 36%
diagnostics and 45% medicines splits are from the same study.

**One thing to watch:** those are **cancer patients specifically**, not hospitalisation generally.
Our slide labels them that way, correctly. If a judge points it out, agree immediately: yes, that's
the cancer cohort, it's the best-sourced Indian study on this, and we labelled it rather than
pretending it was a general figure.

### Q. And the quote from the IRDAI chairman?

It's a **paraphrase, deliberately** — the slide italicises it rather than putting it in quotation
marks, because we couldn't verify his exact words. **Don't quote it word for word in the Q&A.**

If you need a hard number instead, use this: roughly 54% of the insurance ombudsman complaints in
FY24 were about health insurance.

### Q. Where do ₹1.2 lakh, ₹2 lakh, ₹45,000 and ₹22,000 on slide 3 come from?

They're **illustrative** — the amounts at stake in a five-day spinal fusion at a metro hospital on a
₹5 lakh policy. They're the right order of magnitude for what those mechanics produce, but they're
not measured from real bills.

**Say "illustrative" before anyone asks.** Getting caught claiming a measurement you don't have is
far worse than admitting an example is an example.

### Q. And ₹78,400? Is that illustrative too?

That one's different, and it's the number to defend hardest.

It's from a synthetic case, but it is **fully worked out**. There's a complete itemised bill behind
it. Private room: total ₹3,53,900, insurer pays ₹2,27,000, patient pays ₹1,26,900. Semi-private:
total ₹3,28,900, patient pays ₹48,500. The difference is ₹78,400 — and notice **₹48,500 + ₹78,400 =
₹1,26,900** exactly.

Better still, our prototype's test suite recalculates those figures from the actual engine and
**fails the build if they don't match the slide**. So the deck and the code physically cannot drift
apart.

The interesting bit, if you want to make a point: the saving is **larger than the room price
difference**, because moving under the cap makes the proportionate deduction vanish entirely. That's
the whole argument of the slide in one sentence.

### Q. Why should we believe a bill you made up yourselves?

Don't believe the amounts — check the mechanics. Every deduction cites a real IRDAI clause. The
arithmetic reconciles exactly to the paise. And it's reproducible: one command in our repository
re-derives every figure on the deck from the engine.

The bill is invented. The rules applied to it are not.

### Q. What about "roughly 1,900 procedures"?

Verified. PM-JAY's 2022 package list contains 1,949 packages across 27 specialties.

### Q. Your four references — are they solid?

Three of the four are verified: the IRDAI 2020 circular, the Frontiers in Public Health cancer study,
and the IRDAI Master Circular of May 2024.

**Reference 3 — the Lancet Regional Health article — we could not fully verify the volume and article
number.** If a judge asks about that one specifically, offer to send the DOI rather than reciting it
from memory. Worth checking or replacing before the round.

---

# Part 7 — The website we built

### Q. What is this thing you're showing us?

A working prototype of the whole system, running locally in a browser. No server, no internet
connection, no real data. Which means it can't break during a demo and it can't leak anything.

Three tabs.

**The path** is the decision tree — the admission at the top, then the choices in the order a family
actually faces them, then what they pay at the bottom. Every branch is clickable, and clicking one
recalculates the entire claim for that path.

**The working** is the same case as arithmetic — the bill line by line, every deduction with its
clause, and every hospital and room class worked out in full. This is the tab for a judge who wants
to check the tree rather than take our word for it.

**Database** is what the system knows: 16 settled admissions, 10 hospitals, 14 procedures, 6 policy
structures, the IRDAI lists and the clause registry.

### Q. What's it built with?

React and TypeScript, using a build tool called Vite.

TypeScript specifically because everything in this system is money, and it catches the kind of
mistake where a value in rupees gets handed to something expecting paise. That's not paranoia —
that class of bug is exactly how financial software goes wrong.

### Q. Which frameworks and libraries did you use?

Almost none, on purpose. **Two dependencies in total** — React and the piece that puts React on a
page. No UI kit, no chart library, no component library. Every part of the interface is hand-written.

Which means nothing you're looking at is a component somebody else designed for a different problem.

### Q. Why is there no login, no server, no database?

Because the competition rules say synthetic or user-provided data only, and building a backend would
imply we have data we're not supposed to have.

Everything needed to make one of these decisions fits in the browser. When it ships, the calculation
engine moves to a server unchanged — it's a self-contained function with no connections to anything.

### Q. Anything technically interesting under the hood?

Three things, if asked.

**All money is stored as whole paise, never decimals.** No floating-point arithmetic anywhere in the
money path, which means no rounding drift and the two halves always add back to the total exactly.

**The build fails if the deck is wrong.** One command recalculates every rupee figure on our slides
from the engine and checks them. If someone changes the engine and slide 4's number no longer
follows, the build breaks. The slides and the code can't silently disagree.

**The tree is drawn in CSS, not as a picture.** So the branches are real buttons — keyboard
navigable, readable by a screen reader — and the whole thing reflows on a phone.

### Q. Is the data real?

No, and every part of the interface says so. All 16 admissions, 10 hospitals, 6 policies and 14
procedures are invented.

But they were **written, not generated**. Each admission exists because of something it breaks — the
room priced exactly at the limit, the ICU stay where there's nothing left to apply a ratio to, the
claim refused five hours short of 24, the sum insured that ran out in March, the nursing home with
only one room class so there's no cheaper bed to move to.

If a judge asks "what happens if…", we can usually just click it.

### Q. Did you build this or did AI build it?

Both, and say so plainly — it's the normal way software gets written now.

It was built in a working session with an AI assistant. The parts that matter — which IRDAI rules
apply where, the money arithmetic, the structure of the decision tree, and every one of those edge
cases — were specified deliberately and are covered by tests that would catch a wrong answer.

### Q. Can we see it?

Yes. It runs offline on a laptop at `localhost:5174`. **Have it already running before you walk in.**

---

# Part 8 — The five questions most likely to hurt

If you only rehearse five, rehearse these.

**1. "Hasn't IRDAI abolished proportionate deduction?"**
Scoped it, didn't abolish it. Many new retail plans have no room cap — but group, budget and older
retail policies still do, at 1% of sum insured. And the other four decisions are untouched
regardless.

**2. "Are you steering patients to cheap, bad hospitals?"**
Never recommends on price. Quality isn't an input or an output. We price choices already on the
table. Money only.

**3. "Your numbers are made up."**
One figure is fully derived and checked by our build. Four are illustrative and we say so first.
Government tariffs give us structure, not level — which is exactly why the output is a range.

**4. "Your self-learning loop will eat its own output."**
We record the actual bill wherever the person went, including when they ignored us. We also record
what we predicted for the options they didn't take.

**5. "Who pays for this?"**
Employers through brokers first — that's where room limits still bite and where there's already a
software budget.

---

## Sources

**Government and regulatory**
- IRDAI circular `IRDAI/HLT/REG/CIR/151/06/2020` — room-rent proportionate deduction and its limits
- IRDAI Master Circular on Health Insurance Business, 29 May 2024
- IRDAI Guidelines on Standardization — Lists I to IV of non-payable items
- [NHA / PM-JAY Health Benefit Packages](https://nha.gov.in/PM-JAY) — ~1,900 procedure rates
- [CGHS city-wise rate lists](https://www.cghs.mohfw.gov.in/) — ward differentials, 2024 revision
- [NSS 75th Round health survey microdata](https://microdata.gov.in/NADA/index.php/catalog/152)
- [NHCX](https://abdm.gov.in/strapicms/uploads/NHCX_Brochure_ffdb63d9bc.pdf) — National Health Claims Exchange

**Industry figures** *(secondary reporting of the IRDAI annual report — verify before slide use)*
- [₹15,100 cr disallowed in FY24](https://www.business-standard.com/finance/personal-finance/health-insurers-reject-claims-worth-rs-15-100-crore-in-fy24-irdai-124123100615_1.html)
- [Claims rejection up 19.10% in FY24](https://www.business-standard.com/finance/personal-finance/health-insurance-claims-rejection-up-19-10-in-fy24-irdai-report-124122700754_1.html)

**Research**
- Prinja S, Dixit J, et al., *Financial toxicity of cancer treatment in India*, Front. Public Health 2023;11:1065737
- [XGBoost quantile regression](https://xgboost.readthedocs.io/en/stable/python/examples/quantile_regression.html)
- [Romano et al., Conformalized Quantile Regression, NeurIPS 2019](https://arxiv.org/abs/1905.03222)
- [ML vs statistical models for healthcare cost prediction, BMC Health Serv Res 2020](https://link.springer.com/article/10.1186/s12913-020-05148-y)

**Competitors**
- [Vitraya Technologies](https://vitraya.com/about) · [ClaimBuddy](https://claimbuddy.in/)
