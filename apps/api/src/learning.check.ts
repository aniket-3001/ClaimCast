/**
 * The three learning loops, closed against a real database.
 *
 * Everything here could have been asserted against a mock and none of it would
 * have been worth running. The claims are about what a second request sees after
 * a first one wrote something — a warning on the next person's intake screen, a
 * worked example in the next prompt, a settled bill in the next forecast — and a
 * mock that returns what it was handed proves only that it was handed something.
 * So this writes rows, reads them back through the same functions the routes
 * call, and deletes them.
 *
 * The consent rule is the reason this file exists at all. `keepExamples` is the
 * difference between storing a counter and storing a sentence out of somebody's
 * policy schedule, and it is enforced in two places that have to agree: the
 * write nulls the three text columns, and the read filters on them being not
 * null. Either one alone would be a bug that leaks quietly and looks like
 * nothing. Both are asserted below, in both directions.
 *
 * Cleanup: every row written here hangs off one throwaway document, which
 * cascades, except the reliability counters, which have no owner. Those are
 * written against a model name no provider will ever produce and deleted by that
 * name at the end. If this check dies half way, that is the one thing to sweep.
 *
 *   npm run check --workspace @claimcast/api
 */

import { PrismaClient } from "@prisma/client";
import {
  changed,
  examplesFor,
  learningState,
  promptHints,
  recordConfirmation,
  settledBills,
  shakyFields,
} from "./learning.js";

const db = new PrismaClient();
const failures: string[] = [];

function ok(cond: boolean, what: string) {
  if (!cond) failures.push(what);
}

/** A model name no provider returns, so these counters cannot be confused for real ones. */
const MODEL = "check/learning";

// ── What counts as a correction ──────────────────────────────────────────
//
// The cheapest function in the module and the one with the most riding on it:
// every rate on the learning screen is a count of what this returned. A false
// positive inflates them all; a false negative empties them.

ok(!changed(12, 12), "the same number counts as a correction");
ok(!changed(12, "12"), "a number and its string form count as a correction");
ok(!changed(null, undefined), "null and absent disagree");
ok(!changed(null, null), "null disagrees with itself");
ok(!changed(true, "true"), "a boolean and its string form disagree");
ok(changed(12, 13), "a changed number is not counted");
ok(changed(null, 0), "a field filled in from nothing is not counted");
ok(changed(12, null), "a field emptied is not counted");
ok(changed(true, false), "a flipped boolean is not counted");

// ── The corrections loop ─────────────────────────────────────────────────

const doc = await db.policyDocument.create({
  data: { filename: "learning.check.pdf", storageKey: "check/learning/" + Date.now() },
});

const before = await learningState(db);

// Ten readings of the same field, corrected every time, with consent withheld.
for (let i = 0; i < 10; i++) {
  await recordConfirmation(db, {
    documentId: doc.id,
    model: MODEL,
    read: {
      copayPct: { value: 0.1, verified: true, span: "Co-payment: 20% of each claim" },
      insurer: { value: "Acme", verified: true, span: "Acme General Insurance" },
    },
    confirmed: { copayPct: 0.2, insurer: "Acme" },
    keepExamples: false,
  });
}

const shaky = await shakyFields(db, MODEL);
const copay = shaky.find((s) => s.field === "copayPct");
ok(copay !== undefined, "ten corrections of one field did not make it shaky");
ok(copay?.seen === 10 && copay?.corrected === 10, "the shaky field's counts are wrong");
ok(
  !shaky.some((s) => s.field === "insurer"),
  "a field confirmed unchanged ten times was reported as shaky",
);

// Consent withheld means there is nothing to quote, even though the field is
// demonstrably the worst one on the deployment. This is the assertion that a
// warning and an exemplar are governed separately.
ok((await examplesFor(db, "copayPct", 2)).length === 0, "an unconsented span was retrievable");
ok((await promptHints(db, MODEL)).length === 0, "an unconsented span reached the prompt");

// The same correction, this time with consent.
await recordConfirmation(db, {
  documentId: doc.id,
  model: MODEL,
  read: { copayPct: { value: 0.1, verified: true, span: "Co-payment: 20% of each claim" } },
  confirmed: { copayPct: 0.2 },
  keepExamples: true,
});

const examples = await examplesFor(db, "copayPct", 2);
ok(examples.length >= 1, "the consented span was not retrievable");
// Newest first, so the row this check just wrote is the one at the front even on
// a database somebody has already consented to something on.
ok(examples[0]?.span.includes("20%"), "the stored span is not the one that was sent");

const hints = await promptHints(db, MODEL);
ok(hints.includes("copayPct"), "the consented correction did not reach the prompt");
ok(hints.includes("20%"), "the prompt hint does not carry the wording that was misread");
ok(!hints.includes("insurer"), "a field nobody has corrected reached the prompt");

// A field the reader never produced is not an observation. Counting it as
// agreement would let a reader that says nothing look infallible.
const quiet = await recordConfirmation(db, {
  documentId: doc.id,
  model: MODEL,
  read: { insurer: { value: "Acme", verified: true, span: "Acme General Insurance" } },
  confirmed: { insurer: "Acme", sumInsured: 500000000 },
  keepExamples: false,
});
ok(quiet.seen === 1, "a field the reader never returned was counted as judged");
ok(quiet.corrected === 0, "an unchanged field was counted as corrected");

// ── The outcomes loop ────────────────────────────────────────────────────

const outcome = await db.forecastOutcome.create({
  data: {
    request: { procedureId: "p-tkr", cityTier: "Y", nabh: true, roomClass: "semi_private" },
    p10: 20000000,
    p50: 30000000,
    p90: 45000000,
    anchorTotal: 9000000,
    actualTotal: 36000000,
    procedureId: "p-tkr",
    cityTier: "Y",
  },
});

const bills = await settledBills(db);
const mine = bills.find((b) => b.p50 === 30000000 && b.actual === 36000000);
ok(mine !== undefined, "a reported bill did not come back for the next forecast");
ok(
  bills.every((b) => Object.keys(b).length === 2),
  "a settled bill carried more than the two figures the model needs",
);

// ── The counters people are shown ────────────────────────────────────────

const after = await learningState(db);
// Twenty-two observations: ten readings of two fields, then one consented
// correction and one single-field confirmation.
ok(after.confirmations === before.confirmations + 22, "the confirmation count did not move by 22");
ok(after.outcomes === before.outcomes + 1, "the outcome count did not move by 1");

// ── Cleanup ──────────────────────────────────────────────────────────────

await db.forecastOutcome.delete({ where: { id: outcome.id } });
await db.policyDocument.delete({ where: { id: doc.id } });
await db.fieldReliability.deleteMany({ where: { model: MODEL } });

const left = await db.fieldObservation.count({ where: { model: MODEL } });
ok(left === 0, left + " observations from this check survived the document being deleted");

await db.$disconnect();

if (failures.length) {
  for (const f of failures) console.error("  " + f);
  console.error("learning — " + failures.length + " failed");
  process.exit(1);
}

console.log(
  "learning — corrections warn and teach, consent gates the wording, " +
    "settled bills reach the model",
);
