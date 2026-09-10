# ClaimCast — Live Demo Script (≈4:30)

Standalone walkthrough of the working prototype. Assumes the audience has
**not** necessarily seen the pitch deck — it stands on its own. This is the
expanded version of the original 3-minute script: it now opens with an
intake flow, and adds a government-schemes discovery moment before the
close. If you're short on time, the cuts are marked at the bottom.

## Before you start

Open **http://localhost:5174/** fresh (reload it) so state resets to the
default case — this is the exact Slide 4 admission: Lumbar spinal fusion,
private room, Meridian, Health Shield Classic, ₹1,26,900 patient share. The
app now opens on the **"Start"** tab rather than the tree.

The dev server must already be running (`npm run dev` inside `web/`, port
5174) before you open the page — it will not work from a cold clone without
that step. Have a screen-recording backup in case Wi-Fi or setup eats time.

**Print or have ready on a second screen, from `presentation deck/mockup
documents/`:**
- `policy-schedule.pdf` — the 5-page specimen policy schedule
- `sample-hospital-bill.pdf` — the specimen hospital bill for this exact
  admission
- `policyholder-id-card.png` and `policy-card.png` — hold these up as
  physical-feeling props during the intake beat

All four are clearly marked "SPECIMEN" / synthetic — say so out loud once,
early, so nobody mistakes them for real documents.

---

## The script

### [OPEN — Start tab] (0:00–0:45)

*(You're on "Start." Don't scroll yet.)*

> Before any of the arithmetic, this is where a real family would begin —
> not a room, not a hospital, just: who are you, and what have you got.

*(Type "Abhishek Jha" into "Your name" and "Policyholder" — the same name
on the printed props, so the physical documents and the screen agree.)*

> I'll enter a name here — watch the header. *(point top-right, "For
> Abhishek Jha")* That's not cosmetic dressing. Everything downstream is now built
> around this specific person's claim.

*(Optionally hold up the printed `policy-card.png` / ID card here.)*

> And here's what they'd actually be holding — a policy card, an ID. In a
> real deployment this is a photo of the card in your hand. Right now, I'll
> just tell the app which policy it is. *(select the policy dropdown — leave
> it on Health Shield Classic)*

*(Click the upload box under "Your policy schedule.")*

> Now the document. *(click, wait ~1 second for "Extracting the
> schedule…")* This step is staged for the demo — but every number it comes
> back with is real, pulled from the same policy data the rest of the app
> runs on. *(scroll to the extracted fields)* Sum insured, room limit, ICU
> limit, co-payment, implant sub-limit — each one cited to a page and a
> clause, and each one needs your confirmation before it can touch a rupee.
> That's not a UI nicety, it's the safety rule from the deck: a misread
> field fails safe, it never silently changes what gets paid.

*(Click "Confirm and continue to the claim.")*

---

### [Stage 1 — "Where"] (0:45–1:00)

*(Scroll down until the hospital cards are visible. Point, don't click.)*

> First decision: which hospital. Same admission, same procedure — four
> hospitals, four different numbers, already computed. Move it to Anandam
> here — the family keeps ₹78,400 more. Nobody tells you this before you're
> admitted. We do.

---

### [Stage 2 — "Which bed"] (1:00–1:15)

> Second decision, same hospital: which room. Private costs ₹1,26,900.
> Semi-private — ₹48,500. That ₹78,400 gap is the room-rent trap from the
> slide, and here it's not a static number, it's live math you can click
> into.

---

### [Stage 3 — "How you claim"] (1:15–1:30)

> Third: cashless or reimbursement. The final payout doesn't change — but
> look what does. *(point at "Find on the day")* Cashless, the family finds
> ₹1,26,900. Reimbursement, they need to find the full ₹3,53,900 upfront and
> wait 34 days to get ₹2,27,000 of it back. Same claim, completely different
> night for the family's bank account.

---

### [Stage 4 — "Which implant"] — LIVE CLICK #1 (1:30–1:50)

*(Click "Titanium cage, domestic make.")*

> Fourth decision — and this one I'll actually click. *(click)* Same
> clinical outcome, domestic-make implant instead of imported. Watch the
> number. *(pause half a second, let it visibly update)* Saves ₹25,000, and
> — look up there — *(point back up at Stage 3's numbers, now changed)* —
> every earlier number on this page just updated with it. This isn't four
> separate calculators. It's one engine.

---

### [Stage 5 — "How the stay is classified"] — LIVE CLICK #2 (1:50–2:15)

*(Click "Discharged before 24 hours.")*

> Fifth, and this is the one that should make people uncomfortable. *(click)*
> Same treatment. Same bill. The only thing that changed is whether the
> hospital kept the patient a few hours longer. Watch what that alone costs.
> *(pause, point at the red +₹78,400)* ₹78,400. For a technicality nobody
> explains to a family in the middle of a medical emergency.

---

### [Refused-anyway box + "You pay"] (2:15–2:30)

> And these three — *(point at the grey box)* — never move. No hospital, no
> room, no negotiating touches them. Below that: what the family actually
> owes, plus the forecast range, because the clinical bill isn't known until
> the operation's done.

---

### [CLICK "The working" tab] (2:30–2:45)

*(Click the tab. Scroll to the itemized bill briefly.)*

> Every one of those numbers traces back to here — line by line, each
> deduction cited to the actual clause that caused it. Arithmetic, not a
> black box. *(optional: hold up `sample-hospital-bill.pdf`)* And this is
> the actual hospital bill this whole page is built from — same eleven
> lines, same ₹3,53,900, so you can check us against paper.

---

### [BACK TO "Start", THEN "The path"] — THE DISCOVERY MOMENT (2:45–3:30)

*(Click "Start." Point at the second strip of fields — age 45, PM-JAY card
No, central government service No.)*

> One more thing. This admission is not the only path through. Ten seconds
> ago you saw ₹1,26,900 out of pocket on the private policy. That is one
> way of paying for this operation, not the only one.

*(Click into "Patient's age," clear it, type 72. Then click "The path.")*

> Say this patient is 72. Same hospital, same operation, same policy —
> watch what appears at the top of the tree.

*(Point at the green fork that has appeared under the admission.)*

> Ayushman Bharat Vay Vandana. Launched October 2024 — over a year old, and
> most families still do not know it exists. Seventy or above, no income
> test, no card required, ₹5 lakh a year, completely independent of the
> private policy. *(point at the Vay Vandana card, bold, ₹0)* Same
> admission. Zero out of pocket. And it was sitting right there.

*(Point at the line under the cards.)*

> One path per admission — these do not stack, like a single discount code
> rather than two combined. That is the honest constraint, and the app
> states it outright rather than let a family assume they can double-claim.

> Notice where it is. Not a tab called "government schemes" that you have
> to think to open — it is the first fork on the tree, and it only appears
> when someone is actually eligible.

---

### [CLICK "Database" tab] (3:30–3:45)

*(Click the tab, let it land on Admissions or flip to Hospitals briefly.)*

> And none of this is built around one lucky example — ten hospitals, six
> real policy structures, sixteen settled admissions we test the engine
> against. This is a system, not a demo trick.

---

### [CLOSE] (3:45–4:15)

> Existing tools retrieve your policy's text and hand you a paragraph. This
> simulates your actual claim, checks it against every government
> alternative, and shows you the decision in front of you, before you've
> made it. To be fully transparent about where we are: the adjudication,
> the tree, the government-scheme comparison — all of that is live and
> real. The policy-PDF upload you watched at the start reads real numbers,
> but the extraction step itself is staged for today; wiring an LLM to a
> real uploaded PDF is the next build, not this one. What's live today is
> the part that decides the money — and that was never allowed to guess.

---

## Notes on running it live

- **Rehearse the sequence once beforehand**, start to finish: type a name,
  click upload, confirm, then the two tree clicks (domestic implant,
  "discharged before 24 hours"), then typing "72" into the age field. Five
  interactions total — know them cold so you're not hunting for fields on
  stage.
- **The age field is the single most important click in the whole demo.**
  If you cut everything else for time, keep this one — it's the moment that
  makes a technical judge sit up.
- **Don't reset the age back to 45 afterward** unless you have slack —
  leaving the fork up going into the close is fine.
- **If a judge asks to see it live on their laptop**, the setup dependency
  above applies — the dev server has to already be running.
- **If you're short on time**, cut in this order: Database tab (3:30–3:45)
  first, then the mockup-document hold-up moments, then compress Stages
  1–3 to just pointing without narrating each number. Never cut the Vay
  Vandana reveal or the two tree clicks — those are the three moments that
  actually demonstrate the engine working.
