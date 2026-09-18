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

npm workspaces. `packages/engine` holds the adjudication core and `apps/web` renders it;
the engine is imported directly by the client rather than reached over a network, because
the journey screen re-adjudicates the whole claim on every branch click and a round trip
per click would destroy the interaction.

```powershell
npm install
npm run dev      # http://localhost:5174
```

Still synthetic data at this stage: no real hospital, insurer, patient or bill appears
anywhere in it.

Four tabs over one shared admission. **Start** is the front door: who is asking, which policy they hold, the three facts that decide whether a government scheme is open to them, and the policy schedule read back field by field for confirmation. **The path** is the decision tree: the admission at the top, the government fork under it where one applies, then the 24-hour gate and the choices in the order they are faced along the care journey — where, which bed, which implant, how the claim is made — and under those the deductions no choice moves and the figure the family ends up paying. Every branch is a full re-adjudication, so the rupee figure under it is what would actually be paid on that path, not an adjustment applied to this one. **The working** is the same admission as arithmetic: the bill line by line with each deduction citing its clause, then every room class and every hospital in full. **Database** is what the system already knows — the ten hospitals, fourteen procedures, six policy structures, sixteen settled admissions, IRDAI Lists I-IV and the clause registry the engine draws on.

Every hospital, insurer, product, patient and bill is invented. The sixteen stored admissions are chosen for what each one breaks — the room exactly at the sub-limit, the intensive-care stay that nothing may be scaled against, the claim refused five hours short of twenty-four, the sum insured that ran out in March, the nursing home with a single room class and therefore no cheaper bed to move to.

```powershell
npm run typecheck
npm run check    # engine reproduces the deck's figures; every tab renders on every case
```

Both run across every workspace.

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

The system's own data comes entirely from public sources: NHA / PM-JAY Health Benefit Packages,
CGHS city-wise rate lists, IRDAI's List I of non-payables, IRDAI standard wordings (Arogya
Sanjeevani), and the NHA empanelled-hospital registry.

---

## Scope and safety

Set by the problem statement, and built into the architecture rather than bolted on:

- No medical diagnoses, no clinical treatment recommendations, no binding insurance advice.
  **Money only.**
- Outputs are labelled estimates, never guarantees.
- Every field extracted from a policy document is confirmed by the user before it can affect a
  number.
- No identifiable patient data. Synthetic and user-provided data only.
