# ClaimCast

**Know what your hospital bill will actually cost you. Before you are admitted, not after you are
discharged.**

GE HealthCare **Precision Care Challenge 2026** — Phase 1, Idea Submission.
Team **Rocket**, Indraprastha Institute of Information Technology, Delhi (IIIT-Delhi).
Track: **Hospitality — Holistic Optimization System for Policy-Integrated Admission & Treatment
Intelligence**.

---

## The idea in one line

Insurers compute what you are owed *after* discharge. ClaimCast computes it *before* admission.
Same arithmetic, different timestamp.

An Indian health policy refuses part of almost every claim — through room-rent sub-limits,
proportionate deduction, co-pays and IRDAI's List I of non-payable items. All of it is
deterministic, all of it is written down, and none of it is applied at the moment the patient can
still act on it. ClaimCast runs the insurer's own adjudication arithmetic at each of five decision
points in the care journey, and shows the caregiver what each choice costs them in rupees, with
every deduction cited to the clause that produced it.

> We cannot tell you exactly what your bill will be. We can tell you exactly how much of it your
> policy will refuse.

**AI where uncertain. Arithmetic where known. The LLM never decides the money.**

---

## What is in this repository

| Path | What it is |
|---|---|
| `Team Rocket_IIIT Delhi.pptx` / `.pdf` | **The submission.** These two files are what gets uploaded. |
| `ClaimCast.md` | The complete reference — every slide, number, term and citation explained from scratch. Start here. |
| `src/build_poster.py` | Builds the five slides on top of the official template. |
| `src/deckkit.py` | Shared layout helpers, palette, template loader. |
| `finalize.ps1` | Copies the build output to the required submission filenames. |
| `reference/` | The official PCC 2026 template and the Hospitality problem statement. |
| `packages/engine/` | **The deterministic core.** Adjudication, bill assembly and the counterfactual solver. No I/O, no framework, no network. |
| `apps/web/` | **The client.** The admission rendered as a path, not a form. |
| `apps/api/` | **The server.** Postgres via Prisma, and the same engine, authoritative for anything persisted. |
| `infra/` | Docker Compose for the local database. |

**`ClaimCast.md` is the document to read.** It is written for someone who has never opened an
Indian health-insurance policy: it defines every term before using it, works the proportionate
deduction mechanic through a full ₹4,00,000 bill, walks each slide line by line, and gives the
full citation and verification status of every source on the deck.

---

## Rebuilding the deck

The slides are generated from code, not edited by hand, so a correction is one line and a rerun.

```powershell
python src/build_poster.py     # writes "Team Rocket_IIIT Delhi - C Poster.pptx"
.\finalize.ps1                 # copies it to the submission filenames
```

Requires Python 3.11 with `python-pptx`. The PDF is exported from PowerPoint (COM automation);
`build_poster.py` only produces the `.pptx`.

`build_poster.py` opens the organisers' `PCC 2026 TEMPLATE.pptx` from `reference/` and fills its
content frames, so the master layout, page numbering and footer are preserved exactly.
`deckkit.py` locates the template by searching the repository tree, so the scripts work regardless
of where the repository is checked out.

### House rules for the deck

- **No grey text.** Body copy is near-black `#23282D` throughout; there is deliberately no faded
  tier. Hierarchy comes from size, weight and the blue label colour. Low-contrast grey is hard to
  read on a projector and reads as unfinished.
- **Every claim on the deck is traceable.** If you add a number, add its source to `ClaimCast.md`
  and mark its verification status. Nothing goes on a submitted slide because it sounds right.

---

## The prototype

npm workspaces. `packages/engine` holds the adjudication core, `apps/api` serves the
reference data out of Postgres and `apps/web` renders it. The engine is imported directly
by both sides rather than reached over a network, because the journey screen
re-adjudicates the whole claim on every branch click and a round trip per click would
destroy the interaction. The client fetches the reference set once at boot and prices
locally from then on; the API recomputes with the same code and is what anything saved is
taken from, so the two cannot disagree about a rupee.

The client has no bundled copy of that data. If the API is unreachable it says so and
stops rather than falling back to a sample set, because a figure on screen has to have
come from the database the screen says it came from.

```powershell
npm install
npm run db:up        # Postgres 16 on localhost:5434
npm run db:migrate
npm run db:seed
npm run api          # http://localhost:3101
npm run dev          # http://localhost:5174, /api proxied to the API
```

Two processes, in two terminals. The web app will not render without the API.

Still synthetic data at this stage: no real hospital, insurer, patient or bill appears
anywhere in it. Every priced row in the database points at the source it came from —
`sources.caveat` is a queryable column rather than a note in a file, because a figure
whose provenance is weak has to be labelled wherever it surfaces. Phase 3 dropped the
caveat from every source that is actually a published document, one file at a time, as
each was downloaded and checksummed; two rows keep theirs permanently rather than
temporarily, because there is no document behind them to fetch — the synthetic reference
set, by construction, and the principle of indemnity, which no single circular states.

Four tabs over one shared admission. **Start** is the front door: who is asking, which policy they hold, the three facts that decide whether a government scheme is open to them, and the policy schedule read back field by field for confirmation. **The path** is the decision tree: the admission at the top, the government fork under it where one applies, then the 24-hour gate and the choices in the order they are faced along the care journey — where, which bed, which implant, how the claim is made — and under those the deductions no choice moves and the figure the family ends up paying. Every branch is a full re-adjudication, so the rupee figure under it is what would actually be paid on that path, not an adjustment applied to this one. **The working** is the same admission as arithmetic: the bill line by line with each deduction citing its clause, then every room class and every hospital in full. **Database** is what the system already knows — the ten hospitals, fourteen procedures, six policy structures, sixteen settled admissions, IRDAI Lists I-IV and the clause registry the engine draws on.

Every hospital, insurer, product, patient and bill is invented. The sixteen stored admissions are chosen for what each one breaks — the room exactly at the sub-limit, the intensive-care stay that nothing may be scaled against, the claim refused five hours short of twenty-four, the sum insured that ran out in March, the nursing home with a single room class and therefore no cheaper bed to move to.

```powershell
npm run typecheck
npm run check    # engine reproduces the deck's figures; every tab renders on every case
```

Both run across every workspace. `npm run check` includes the database gate, which
re-reads every reference record out of Postgres, deep-compares it against the fixtures it
was seeded from, and re-adjudicates the reference admission from database rows alone — so
it needs `npm run db:up` first and fails loudly rather than quietly skipping if the
database is not there.

`npm run check` is the guard on the deck. It asserts the rupee figures on slide 3 against the engine, so if the two ever disagree the build fails rather than the slide going out wrong.

## Sources

The deck stands on four references, all public:

1. **IRDAI Circular `IRDAI/HLT/REG/CIR/151/06/2020`** (11 June 2020) — room-rent proportionate
   deduction, and the categories it excludes.
2. **Prinja S, Dixit J, et al.**, *Financial toxicity of cancer treatment in India*, Front. Public
   Health 2023;11:1065737 (n = 12,148).
3. **CROCODILE study group**, *Catastrophic expenditure and treatment attrition in colorectal
   cancer in India*, Lancet Reg. Health SE Asia 2022;6:100058.
4. **IRDAI Master Circular on Health Insurance Business**, 29 May 2024.

### The data pipeline

`etl/` downloads the published documents, checks that what arrived is actually the document, and
parses them into `etl/out/*.json`, which the database seeds from. The raw files are gitignored and
re-downloadable; their SHA-256s live in `etl/manifest.json`, so any rate can be traced to the exact
bytes it came from.

```bash
python -m etl.fetch     # download and verify; writes etl/manifest.json
python -m etl.build     # parse etl/raw/ -> etl/out/
```

The verification is the point, not the download. Government portals answer a request for a missing
PDF with HTTP 200 and an HTML error page, so every file is checked against its magic bytes and a
size floor before it is accepted. Certificate verification is never disabled; a chain certifi
rejects is retried once against the OS root store, and the manifest records which store was used.

| Source | What we have |
|---|---|
| **CGHS** Office Memorandum, 3 Oct 2025 | **1,998 published rates**, non-NABH / NABH / super-speciality, fanned out across the three city tiers by the reductions the OM states. Retrieved from a Delhi Jal Board mirror — `cghs.gov.in` does not resolve and its replacement is banner-marked a test environment — so the rates are real and the chain of custody runs through a mirror. |
| **IRDAI** Modification Guidelines, 2019 | **Lists I–IV verbatim**: 68, 37, 23 and 18 items. IRDAI names these items without pricing or grouping them, so every illustrative amount in the app is ClaimCast's modelling, not the regulator's. |
| **IRDAI** Master Circular, 2020 | The **Arogya Sanjeevani** standard product — the one policy whose room cap, ICU cap, co-pay and proportionate-deduction rule are quotable rather than modelled. |
| **NHA** HBP 2.2 User Guidelines | **Scheme rules.** The ₹5,00,000 family cover, the ₹1,00,000 unspecified-procedure cap, and the rule that medical packages are priced by bed category times bed days. It references "Annexure 2: Packages and Rates" without containing it, and no NHA URL serves that annexure. |
| **NHA** HBP 2022 Office Memorandum | **1,949 published package rates**, each with a National Reference Price and separate Tier 1, 2 and 3 prices, transcribed as printed — including the 246 rows whose tier prices do not follow the multipliers the rest of the document uses. 1,667 are priced per episode; 228 are medical admissions priced per bed-day, which is why `tariff_rates` carries a `basis` column. `nha.gov.in` answers every path with the same HTML shell and `pmjay.gov.in` refuses the connection, so this is the Haryana SHA's copy on the NIC government CDN: the national memorandum, through a state mirror. |

Published data and our own modelling are held apart rather than merged, in three places. Which CGHS
or PM-JAY code a procedure is priced against is a clinical-coding judgement, so it lives in
`apps/api/prisma/cghs-map.ts` and `hbp-map.ts` and never blurs into the published rate beside it. And
`non_payable_items` carries both IRDAI's annexure verbatim and the priced basket the app adds up,
separated by a `published` column — the priced rows are attributed to the synthetic set, because
IRDAI named these items and did not price them.

Two things stay explicitly simulated and are labelled so wherever they surface: per-hospital tariffs
and `Hospital.costIndex`, because no public source gives what a named private hospital charges per
bed-day; and the illustrative rupee amounts on the non-payables list.

Four items the app used to show as List I are filed elsewhere by the live document: admission and
registration in List IV, documentation and administrative charges and the visitor pass in List II,
ward and theatre booking in List III. Those lists mean the charge is already inside the room rate or
the procedure fee, so the hospital may not bill it separately — close to the opposite of the patient
paying it. They are kept, on their correct lists, because a hospital billing one of them is the
clearest example the app has of a charge the insurer should refuse. No adjudicated figure moved:
the basket is a display total and was never in the arithmetic.

Which document is live was checked rather than assumed. The Master Circular of 29 May 2024
supersedes the forty-six circulars in its Annexure-6; the 2019 Modification Guidelines are not among
them, and that circular carries no lists of its own. The 2020 Master Circular on Standardization
*is* among them, so the Arogya Sanjeevani terms are quoted from a superseded document — the standard
products are expressly carried forward, the product stands, and its source row says exactly that.
One figure moved with the repeal: the moratorium is 60 months, not eight years.

---

## Scope and safety

Set by the problem statement, and built into the architecture rather than bolted on:

- No medical diagnoses, no clinical treatment recommendations, no binding insurance advice.
  **Money only.**
- Outputs are labelled estimates, never guarantees.
- Every field extracted from a policy document is confirmed by the user before it can affect a
  number.
- No identifiable patient data. Synthetic and user-provided data only.
