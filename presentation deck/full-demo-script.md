# ClaimCast — Full Demo Script (long-form)

A separate script from `live-demo-script.md`. That one is the strict 3:00
pitch-slot version — no story, no wasted motion, cut to the bone. This one
is for a slot where you actually get to walk the room through the product:
a demo round, a judges' Q&A, an internal review. No hook, no anecdote — the
room already has the room-rent-trap story from the deck. This starts on the
product and stays there.

Rough length if you say every line at a normal pace and don't rush the
pauses: **6–7 minutes.** There's no clock riding on this one, so let a
number sit for a second before you move on — that pause is doing work.

## Before you start

- Dev server running (`npm run dev` in `web/`, port 5174), page reloaded.
- On the "Start" tab, pre-fill (before you start talking): name "Abhishek
  Jha", policyholder "Abhishek Jha", age **45**, policy left on Health
  Shield Classic, PM-JAY card "No", central govt service "No". **Do not**
  click upload yet — that happens live, on screen, while you're talking.
- Know two moves cold: **the upload → confirm sequence**, and **click the
  domestic implant**. Everything else is pointing and reading numbers that
  are already on screen.

---

## The script

### Open — no hook, straight onto the product

*(Screen is already showing the Start tab: Abhishek Jha, 45, Health Shield
Classic. Don't re-explain the room-rent trap — the deck already made that
case. Orient the room on the product instead.)*

> This is Abhishek. Forty-five. He holds Health Shield Classic. Everything
> you're about to see is his actual claim, computed live — nothing here is
> a mockup or a slide dressed up as a screen.

---

### Attaching the policy

*(Click the upload box. Don't rush past "Extracting the schedule…" — let it
sit on screen for its full second.)*

> First thing a family would actually have on hand: the policy document.
> I'll attach his.

*(The "Confirm each field" screen appears — sum insured, room limit, ICU
limit, co-payment, implant sub-limit, pre/post-hospitalisation window, all
cited to a page and a clause.)*

> Every field it reads back is cited — page, clause — and every one needs
> my confirmation before it can touch a single rupee. If it misreads
> something, it fails safe: flagged for a human, not silently applied. This
> step is staged for today — the real version reads a real uploaded PDF —
> but every number on this screen is pulled from the actual policy. Nothing
> here is invented to make a slide look good.

*(Click "Confirm and continue.")*

---

### The path, top to bottom

*(You land on "The path." Point at the summary bar first — it's the first
thing on the page.)*

> As things stand: Abhishek pays ₹1,26,900 on a ₹3,53,900 bill. Everything
> below this line is *why*.

*(Point at "The admission" card, then the gate just under it.)*

> Spinal fusion, five nights, private room. And before any deduction can
> even be argued, one question: is this a valid claim at all. It is — he's
> nowhere near a day-care procedure, so nothing below this gate is in
> question.

**Decision 1 — Where**

*(Point at the four hospital cards.)*

> First real decision: which hospital. Same operation, same policy — four
> hospitals, four different numbers, already sitting on screen. Move him to
> Anandam, and he keeps ₹78,400 more. Nobody says this to a family walking
> in the door. This page does.

**Decision 2 — Which bed**

*(Point at the five room-class cards.)*

> Same hospital, second decision: which room. Private costs him ₹1,26,900.
> Semi-private — ₹48,500. That ₹78,400 gap is the room-rent trap, and here
> it isn't a static number on a slide — it's live math sitting under your
> finger.

**Decision 3 — How you claim**

*(Point at Cashless / Reimbursement.)*

> Third: cashless, or reimbursement. What he finally owes doesn't move —
> but what he has to *find*, and *when*, does. Cashless, he finds
> ₹1,26,900. Reimbursement, he finds the full ₹3,53,900 tonight, and waits
> thirty-four days to get ₹2,27,000 of it back. Same claim. Completely
> different night for his bank account.

**Decision 4 — Which implant** *(the live click)*

*(Point at the two implant cards, narrate briefly, then click "Titanium
cage, domestic make.")*

> Fourth: which implant. Imported, or domestic-make, same clinical spec.
> Watch what one click does. *(click)* *(pause — let the number move)*
> ₹25,000, back in his pocket. And look — *(point up at the summary bar,
> now changed)* — the number at the very top of the page just moved with
> it. One engine. Not four spreadsheets stapled together.

**Decision 5 — How the stay is classified**

*(Point at the two cards — "24 hours or more" is current, "discharged
before 24 hours" shows the loss.)*

> Fifth, and this is the one that should make people uncomfortable. Same
> treatment, same bill — the only thing that changes is whether the
> hospital kept him a few hours longer. That distinction alone is worth
> ₹78,400. For a technicality nobody explains to a family mid-emergency.

**What never moves**

*(Point at the grey "Refused whichever path you take" box — now down to
two lines, since the domestic implant already cleared its sub-limit.)*

> And these two — non-medical items, and spend outside the claim window —
> never move. No cheaper bed, no different hospital touches them. Below
> that: what he actually owes, and the range once the clinical bill is
> known, because that part genuinely isn't settled until the operation is.

---

### Going back — the one they don't know about

*(Click "Start." Point at the age field before touching it.)*

> One more thing worth fifteen seconds. There's a second system running
> alongside every private policy in India — government coverage — and most
> families never check it, because nobody asks them the one question that
> unlocks it.

*(Click the age field, clear it, type "72.")*

> Say Abhishek is seventy-two instead of forty-five.

*(Click "The path." A green card has appeared directly under the
admission, above everything the policy does. Read its headline out loud —
don't paraphrase it, the app already wrote the best version of this
line.)*

> "Ayushman Bharat Vay Vandana would leave ₹0 to find, not ₹1,01,900."
>
> Launched fourteen months ago. No income test, no paperwork — age alone.
> *(pause)* He qualified this whole time. He just never had a reason to
> ask. And notice where that lives — not a tab you have to remember exists.
> It's the first thing on the tree, and it only shows up when it's actually
> true.

*(Point at the note under the two cards.)*

> One path per admission, never both — the same way a checkout takes one
> discount code, not two stacked together. The app says so outright rather
> than let a family assume they can double-claim.

---

### The working — proving the arithmetic

*(Click "The working." Scroll to the itemised bill.)*

> Everything you've watched traces back to this table. Every line, every
> rupee refused, cited to the exact clause that refused it. Nothing you
> saw upstream was invented — it's read straight off this bill, line by
> line.

---

### Database — proving it's a system

*(Click "Database.")*

> And none of this is built around one lucky example. Ten hospitals. Six
> real policy structures. Sixteen settled admissions we test this engine
> against every time a line of code changes. This isn't a demo trick tuned
> to one scenario — it's a system, and you can look under the hood of all
> of it.

---

### Close

> Every insurance app today does the same thing: it reads your policy back
> to you in plain English. That's retrieval — useful, but it's not the job.
>
> The job is telling a family, before they sign the admission form, exactly
> what they'll owe and exactly what they didn't know they were owed.
> That's not a paragraph. That's a number.
>
> We built the thing that gets there first.

*(Stop talking. Let the last screen sit.)*

---

## Notes on running it live

- **Nothing here is timed to the second on purpose.** If a stage's numbers
  don't need explaining to this particular room, skip the sentence and
  just point — reading every line verbatim to a technical audience will
  drag.
- **The domestic-implant click is still the only click inside the tree.**
  Everything else in "The path, top to bottom" is pointing and reading
  numbers already on screen — don't manufacture extra clicks there.
- **If you're asked to shorten this on the spot**, drop in this order:
  Database, then The working, then compress Decisions 1–3 to a single
  sentence each ("hospital, room, and claim route all move the number the
  same way the deck showed you — here's the one that doesn't: the
  implant"). Never drop the implant click, the age-72 reveal, or the close.
