/**
 * Does the mockup schedule actually say what `pol-classic` claims it says?
 *
 * The plan's test for policy extraction is that `policy-schedule.pdf` reads back
 * to the same policy the demo has hardcoded, every field carrying a span that is
 * really in the PDF. This file is the half of that which does not need an API
 * key: for each field it holds the quote a correct extraction would cite, checks
 * it against the document's own text through the same `found()` the extractor
 * uses, and checks the value it implies against the fixture the demo prices with.
 *
 * So a model is not being marked here. The *target* is — the answer key, proven
 * to be quotable from the document before anything is asked to find it. If the
 * mockup is ever regenerated with a different room limit, this fails on the next
 * run rather than in front of a judge.
 *
 * `monthsInForce` is the interesting one and it is expected to be absent. The
 * schedule gives a period of insurance, which is the current policy year; how
 * long the cover has run is a different fact and this document does not contain
 * it. It is also the field that decides whether a 36-month pre-existing-disease
 * waiting period has expired, so inventing it would change who gets paid. The
 * check below asserts the gap rather than papering over it.
 *
 * Run: npm run check --workspace @claimcast/api
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { POLICIES } from "@claimcast/engine/fixtures";
import { EXTRACTED_FIELDS, type ExtractedField } from "@claimcast/contracts";
import { found, pageText } from "./extract.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PDF = join(REPO, "presentation deck", "mockup documents", "policy-schedule.pdf");

/** The value a correct reading yields, and the words it has to come from. */
interface Cited {
  value: number | boolean | string | null;
  /** Null only when the document does not state the field at all. */
  span: { text: string; page: number } | null;
  /** Why it is absent, when it is. */
  absent?: string;
}

const CITED: Record<ExtractedField, Cited> = {
  insurer: {
    value: "Sanrakshan General",
    span: { text: "SANRAKSHAN GENERAL Insurance Company Limited", page: 1 },
  },
  product: {
    value: "Health Shield Classic",
    span: { text: "Health Shield Classic (Individual)", page: 1 },
  },
  sumInsured: {
    value: 50_000_000,
    span: { text: "Sum Insured (per policy year) ₹5,00,000", page: 2 },
  },
  roomCapPerDay: { value: 500_000, span: { text: "Room rent ₹5,000 per day", page: 3 } },
  roomCapPctOfSI: {
    value: null,
    span: null,
    absent: "The room limit is a rupee figure per day, not a percentage of the sum insured.",
  },
  icuCapPerDay: {
    value: 1_000_000,
    span: { text: "Intensive care unit (ICU) ₹10,000 per day", page: 3 },
  },
  icuCapPctOfSI: {
    value: null,
    span: null,
    absent: "The ICU limit is a rupee figure per day, not a percentage of the sum insured.",
  },
  proportionateDeduction: {
    value: true,
    span: { text: "Proportionate Deduction Clause Applicable", page: 1 },
  },
  copayPct: { value: 0, span: { text: "Co-payment None applicable on this product", page: 4 } },
  implantSubLimit: {
    value: 8_000_000,
    span: { text: "Implant / prosthesis sub-limit ₹80,000", page: 3 },
  },
  preHospDays: {
    value: 30,
    span: { text: "Pre-hospitalisation expenses 30 days before admission", page: 4 },
  },
  postHospDays: {
    value: 60,
    span: { text: "Post-hospitalisation expenses 60 days after discharge", page: 4 },
  },
  dayCareCovered: {
    value: true,
    span: { text: "Day-care procedures Covered — no minimum stay applies", page: 2 },
  },
  monthsInForce: {
    value: null,
    span: null,
    absent:
      "The schedule gives a period of insurance (01-Jan-2026 to 31-Dec-2026), which is the " +
      "current policy year and not how long the cover has been in force.",
  },
  pedWaitingMonths: {
    value: 36,
    span: { text: "Pre-existing disease waiting period 36 months", page: 2 },
  },
  moratoriumMonths: { value: 60, span: { text: "Moratorium period 60 months", page: 2 } },
};

/**
 * Quotes that must NOT verify.
 *
 * A check that only ever confirms things is not a check. These are the two ways
 * a fabricated citation actually arrives: a figure changed inside otherwise
 * genuine wording, and a real sentence attributed to the wrong page.
 */
const FABRICATED: { why: string; text: string; page: number }[] = [
  { why: "a real sentence with the number altered", text: "Room rent ₹7,500 per day", page: 3 },
  { why: "a real sentence cited on the wrong page", text: "Room rent ₹5,000 per day", page: 1 },
  {
    why: "a figure the document never states, in the document's own idiom",
    text: "Co-payment 20% on all claims",
    page: 4,
  },
];

/**
 * Fields a policy schedule does not contain, pinned.
 *
 * Not "fields the extractor got wrong" — fields the document type does not carry
 * at all, which the demo therefore supplies from the case rather than the paper.
 * The list is pinned so that it can only shrink deliberately: a field that starts
 * coming back unstated without being named here fails the check, which is the
 * difference between a known gap and a silent one.
 */
const UNSTATED: ExtractedField[] = ["monthsInForce"];

const classic = POLICIES.find((p) => p.id === "pol-classic");
if (!classic) throw new Error("pol-classic is not in the fixtures any more.");

// Every ExtractedField is a field of Policy, but TypeScript has no reason to
// believe that from a string index, and the alternative is sixteen hand-written
// comparisons that would drift the first time a field is added.
const fixture = classic as unknown as Record<string, unknown>;

const pages = await pageText(await readFile(PDF));
const failures: string[] = [];

for (const field of EXTRACTED_FIELDS) {
  const cited = CITED[field];
  const expected = fixture[field];

  if (cited.span && !found(pages, cited.span.text, cited.span.page)) {
    failures.push(`${field}: the quote is not on page ${cited.span.page} of the schedule.`);
  }
  if (!cited.span && !cited.absent) {
    failures.push(`${field}: no span and no reason given for there being none.`);
  }

  // The fixture is what the demo prices with. A field the document proves and the
  // fixture contradicts means one of the two is wrong, and either way a judge
  // would be shown a number the schedule beside it does not support.
  if (cited.value !== expected && !UNSTATED.includes(field)) {
    failures.push(
      cited.span === null
        ? `${field}: the schedule does not state it, but pol-classic carries ${String(expected)}. ` +
          `Either the quote is missing or the field belongs in UNSTATED.`
        : `${field}: the schedule says ${String(cited.value)}, pol-classic says ${String(expected)}.`,
    );
  }
}

for (const field of UNSTATED) {
  // A pinned gap has to stay a gap. If the mockup is ever regenerated with the
  // months in force printed on it, this list is wrong and the extractor should
  // be reading the field rather than declining it.
  if (CITED[field].span !== null) {
    failures.push(`${field} is pinned as unstated but the schedule now quotes it.`);
  }
  if (fixture[field] == null) {
    failures.push(
      `${field} is pinned as unstated, so pol-classic has to supply it from the case; it does not.`,
    );
  }
}

for (const f of FABRICATED) {
  if (found(pages, f.text, f.page)) {
    failures.push(`a fabricated span verified — ${f.why}: "${f.text}" (page ${f.page}).`);
  }
}

const gaps = EXTRACTED_FIELDS.filter((f) => CITED[f].span === null);

console.log(`policy-schedule.pdf — ${pages.length} pages read`);
console.log(
  `  ${EXTRACTED_FIELDS.length - gaps.length} of ${EXTRACTED_FIELDS.length} fields quotable from the document`,
);
for (const g of gaps) console.log(`  absent: ${g} — ${CITED[g].absent}`);
console.log(`  ${FABRICATED.length} fabricated spans refused`);
for (const f of UNSTATED) {
  console.log(
    `  gap: ${f} is not in a schedule at all — pol-classic's ${String(fixture[f])} comes from the case`,
  );
}

if (failures.length) {
  console.error("\nExtraction check failed:");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("  extraction target agrees with pol-classic");
