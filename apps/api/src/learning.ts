/**
 * What the system learns while it runs.
 *
 * Two speeds. Every function below is an update applied when an observation
 * arrives, and its effect is visible to the very next request: nothing waits
 * for a nightly job. The one slow path is the cost model's booster, which is
 * rebuilt on the combined pool of tariffs and settled bills once enough new
 * bills have arrived (`maybeRetrain` in server.ts, `POST /retrain` in the
 * service) -- and between rebuilds, the bills it has not yet been trained on
 * still correct each forecast through `settledBills` below.
 *
 * That is not a shortcut around doing it properly — it is the correct shape for
 * this problem. A model fitted once is a photograph of the day it was fitted,
 * and none of what this application depends on holds still: insurers redesign
 * schedules, sub-limits move, hospitals reprice, and the reader behind the
 * extraction is itself swapped out from time to time. A system that stopped
 * learning at deploy would begin drifting immediately and would have no way of
 * noticing.
 *
 * Three signals, in descending order of how much they are worth:
 *
 *   1. **Corrections.** A person told us a figure we read was wrong. This is a
 *      true label on a real document, produced by a step that already existed
 *      for a different reason, and it costs the person nothing extra.
 *   2. **Outcomes.** A bill settled, and we can see where in our own band it
 *      landed. The strongest evidence available and the scarcest, because it
 *      has to be volunteered weeks after the fact.
 *   3. **Choices.** Which branches people take. Cheap, plentiful, and counted
 *      for the team to see -- nothing reorders on it yet, it makes no number
 *      more accurate, and it is described that way wherever it is described.
 *
 * On privacy. Counters here carry a field name, a model name and a verdict.
 * They say nothing about any person and are always written. The verbatim terms
 * out of somebody's schedule are a different thing entirely, and they are
 * written only where that person ticked the box; `keepExamples` is threaded
 * through rather than defaulted, so the quiet path keeps nothing.
 */

import type { PrismaClient } from "@prisma/client";
import { EXTRACTED_FIELDS, type ExtractedField, type LearningState } from "@claimcast/contracts";

/** A field's value as it travels: the same union the extraction uses. */
type Value = number | boolean | string | null;

/**
 * Whether a person changed what the reader said.
 *
 * Compared as strings deliberately. The values arrive as JSON and a schedule's
 * `12` may come back as `12` or `"12"` depending on which input rendered it,
 * and counting that as a correction would quietly inflate every rate on the
 * screen. Null and absent are the same answer — the document did not say — so
 * they compare equal rather than one counting as a correction of the other.
 */
export function changed(read: Value | undefined, confirmed: Value | undefined): boolean {
  const norm = (v: Value | undefined) => (v === null || v === undefined ? "" : String(v));
  return norm(read) !== norm(confirmed);
}

/**
 * Record one person's judgment on one document, and move the counters.
 *
 * Written as a single transaction with the confirmation itself. The reliability
 * table is a running tally of the observation table, and the two being written
 * apart would leave a window where the summary disagreed with what it
 * summarises — which, for a number shown to the next person as a reason to look
 * more closely, is worse than not showing it.
 *
 * Returns the number of fields the person corrected, which the caller echoes
 * back so a client can say "you changed three of sixteen" without asking again.
 */
export async function recordConfirmation(
  db: PrismaClient,
  args: {
    documentId: string;
    model: string;
    /** What the reader said, as stored on the extraction. */
    read: Partial<Record<ExtractedField, { value: Value; verified: boolean; span: string | null }>>;
    /** What the person settled on. */
    confirmed: Partial<Record<ExtractedField, Value>>;
    keepExamples: boolean;
  },
): Promise<{ corrected: number; seen: number }> {
  // Only fields the reader actually returned are observations. A field it
  // never produced was not judged by anybody, and counting it as agreement
  // would make a reader that says nothing look like a reader that is never
  // wrong.
  const judged = EXTRACTED_FIELDS.filter((f) => args.read[f] !== undefined);

  const rows = judged.map((field) => {
    const read = args.read[field]!;
    const confirmed = args.confirmed[field];
    const corrected = changed(read.value, confirmed);
    return {
      documentId: args.documentId,
      field,
      model: args.model,
      verified: read.verified,
      corrected,
      // The three columns consent governs. Null unless asked for, and null
      // for an untouched field even with consent: an example is only worth
      // keeping where it shows the reader being wrong and a person putting it
      // right, and storing the rest would be collecting for its own sake.
      readValue: args.keepExamples && corrected ? String(read.value ?? "") : null,
      confirmedValue: args.keepExamples && corrected ? String(confirmed ?? "") : null,
      spanText: args.keepExamples && corrected ? read.span : null,
    };
  });

  await db.$transaction([
    db.fieldObservation.createMany({ data: rows }),
    ...rows.map((r) =>
      db.fieldReliability.upsert({
        where: { field_model: { field: r.field, model: r.model } },
        create: {
          field: r.field,
          model: r.model,
          seen: 1,
          corrected: r.corrected ? 1 : 0,
          unverified: r.verified ? 0 : 1,
        },
        update: {
          seen: { increment: 1 },
          corrected: { increment: r.corrected ? 1 : 0 },
          unverified: { increment: r.verified ? 0 : 1 },
        },
      }),
    ),
  ]);

  return { corrected: rows.filter((r) => r.corrected).length, seen: rows.length };
}

/**
 * Fields worth warning the next person about.
 *
 * The product effect of the correction signal, and the honest limit of it: this
 * does not make the reader better at its job, it tells a human where to look.
 * That is a smaller claim than "the model improves" and it is the one that is
 * true — the reader is a hosted model we do not fit.
 *
 * `floor` exists because a rate computed from two observations is noise wearing
 * a percentage sign. Three is not a statistically interesting number either,
 * but it is enough to stop a single fat-fingered correction from putting a
 * warning on everybody's screen, and the count travels with the rate so the
 * reader can judge it.
 */
export async function shakyFields(
  db: PrismaClient,
  model: string,
  opts: { floor?: number; rate?: number } = {},
): Promise<Array<{ field: ExtractedField; seen: number; corrected: number }>> {
  const floor = opts.floor ?? 3;
  const rate = opts.rate ?? 0.25;

  const rows = await db.fieldReliability.findMany({ where: { model, seen: { gte: floor } } });
  return rows
    .filter((r) => r.corrected / r.seen >= rate)
    .sort((a, b) => b.corrected / b.seen - a.corrected / a.seen)
    .map((r) => ({ field: r.field as ExtractedField, seen: r.seen, corrected: r.corrected }));
}

/**
 * Corrections kept as worked examples, for the reader's prompt.
 *
 * This is the one place a past document influences a future reading, and it is
 * the reason consent was asked for. Only consented rows have text in them at
 * all, so the `not: null` filters are the consent check rather than a
 * convenience — a row without consent cannot be selected by this query even by
 * mistake.
 *
 * Most recent first, because when a reader starts getting a field wrong it is
 * usually because a document changed shape, and the newest correction is the
 * one that describes the new shape.
 */
export async function examplesFor(
  db: PrismaClient,
  field: ExtractedField,
  limit = 3,
): Promise<Array<{ span: string; read: string; confirmed: string }>> {
  const rows = await db.fieldObservation.findMany({
    where: {
      field,
      corrected: true,
      spanText: { not: null },
      readValue: { not: null },
      confirmedValue: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({ span: r.spanText!, read: r.readValue!, confirmed: r.confirmedValue! }));
}

/**
 * Past corrections, written into the next extraction's prompt.
 *
 * This is the loop at its tightest: somebody corrected a field an hour ago, and
 * the model reading the next schedule is shown the sentence they corrected and
 * the answer they gave. The reader is a hosted model, so no weights move here;
 * the effect is on the very next request.
 *
 * Narrow on purpose. Only fields with a demonstrated correction rate get
 * examples, and only a few of those, because a prompt that grows with every
 * confirmation ever made would eventually cost more than the reading and would
 * drown the instructions that matter. Only consented rows have text at all, so
 * a person who did not tick the box cannot appear here even by accident.
 */
export async function promptHints(db: PrismaClient, model: string, fields = 4): Promise<string> {
  const shaky = await shakyFields(db, model);
  if (shaky.length === 0) return "";

  const lines: string[] = [];
  for (const s of shaky.slice(0, fields)) {
    for (const ex of await examplesFor(db, s.field, 2)) {
      // Truncated, because a span is a sentence out of a schedule and some
      // schedules write a paragraph where they mean a sentence.
      const span = ex.span.length > 240 ? ex.span.slice(0, 240) + "..." : ex.span;
      lines.push(`- ${s.field}: from "${span}" the correct value is ${ex.confirmed}, not ${ex.read}.`);
    }
  }
  if (lines.length === 0) return "";

  return (
    "\n\nReaders before you have been corrected on these fields, by the people whose " +
    "schedules they were. Same wording, same mistake:\n" +
    lines.join("\n")
  );
}

/**
 * Everything learned so far, with the denominators attached.
 *
 * Shaped for the screen rather than for a caller doing arithmetic, because the
 * point of putting it on screen is to keep the claim proportionate to the
 * evidence. A system that has read four documents and one that has read four
 * thousand should not describe themselves the same way, and the only reliable
 * way to make sure they do not is to show the number.
 */
export async function learningState(db: PrismaClient): Promise<LearningState> {
  const [fields, confirmations, outcomes, choices] = await Promise.all([
    db.fieldReliability.findMany({ orderBy: [{ seen: "desc" }, { field: "asc" }] }),
    db.fieldObservation.count(),
    db.forecastOutcome.count(),
    db.branchChoice.count(),
  ]);

  return {
    fields: fields.map((r) => ({
      field: r.field as ExtractedField,
      model: r.model,
      seen: r.seen,
      corrected: r.corrected,
      unverified: r.unverified,
    })),
    confirmations,
    outcomes,
    choices,
  };
}

/**
 * How far private billing has actually run above the published tariff.
 *
 * The online half of the cost model. `services/ml` fits a multiplier from NSSO
 * survey expenditure, which is national, three years stale and says nothing
 * about any particular hospital. Every settled bill reported here is a direct
 * observation of the quantity that multiplier is estimating, and is worth more
 * per row than the survey is.
 *
 * What is compared is the bill against the forecast, not the bill against the
 * tariff. A forecast is the tariff times the multiplier times the band's median
 * plus the midpoint of the published implant options, so a bill measured against
 * the bare tariff would charge the multiplier for the band's errors and for the
 * implant's -- and a knee replacement, where the prosthesis can cost more than
 * the package, would read as an enormous multiplier miss. Against the forecast
 * it answers the narrower question the correction can actually use.
 *
 * What comes back is the observations, not a decision. The blending against the
 * survey prior belongs with the model that holds the prior, so this returns the
 * evidence and `services/ml` decides what to do with it. Keeping the arithmetic
 * in one place is what stops the API and the model drifting into two different
 * answers.
 */
export async function settledBills(
  db: PrismaClient,
  take = 500,
): Promise<Array<{ p50: number; actual: number; at: string }>> {
  const rows = await db.forecastOutcome.findMany({
    // What the model said, beside what the admission came to. Both as they stood
    // at the time: a bill has to be judged against the forecast that preceded it,
    // not against one already moved by that same bill. And when it was reported,
    // so the model can skip the bills its booster was already trained on.
    select: { p50: true, actualTotal: true, createdAt: true },
    where: { p50: { gt: 0 }, actualTotal: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    take,
  });

  return rows.map((r) => ({ p50: r.p50, actual: r.actualTotal, at: r.createdAt.toISOString() }));
}

/**
 * Every settled bill, as training rows for the cost model's retrain.
 *
 * The forecast request each bill answered -- procedure, hospital, city tier,
 * room, stay -- and what it came to. No owner and no policy: those are not
 * features of what an admission costs, and they are not the model's business.
 */
export async function trainingBills(
  db: PrismaClient,
): Promise<Array<{ request: unknown; actual: number; at: string }>> {
  const rows = await db.forecastOutcome.findMany({
    select: { request: true, actualTotal: true, createdAt: true },
    where: { actualTotal: { gt: 0 } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ request: r.request, actual: r.actualTotal, at: r.createdAt.toISOString() }));
}
