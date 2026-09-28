/**
 * What a correct reading of the mockup schedule looks like.
 *
 * The answer key, kept in one file because two things grade against it: the
 * offline check, which proves every quote below is really in the PDF and agrees
 * with the fixture the demo prices with, and the live check, which asks an
 * actual model to read the document and scores what comes back against this.
 *
 * Those two must never drift apart. A second copy of an answer key is a thing
 * that rots quietly and then grades a model against the wrong answers, which is
 * worse than not grading it at all.
 *
 * Nothing here is a judgement about a model. It is a statement about the
 * document, and `extract.check.ts` proves it against the bytes on every run.
 */

import type { ExtractedField } from "@claimcast/contracts";

/** The value a correct reading yields, and the words it has to come from. */
export interface Cited {
  value: number | boolean | string | null;
  /** Null only when the document does not state the field at all. */
  span: { text: string; page: number } | null;
  /** Why it is absent, when it is. */
  absent?: string;
}

export const CITED: Record<ExtractedField, Cited> = {
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
  exclusions: {
    value: "Registration & documentation charges; Toiletries, attendant meals, television; Expenses outside the pre/post window (Clause 7.1)",
    span: { text: "8. Non-Payable Items", page: 5 },
  },
};

/**
 * Quotes that must NOT verify.
 *
 * A check that only ever confirms things is not a check. These are the two ways
 * a fabricated citation actually arrives: a figure changed inside otherwise
 * genuine wording, and a real sentence attributed to the wrong page.
 */
export const FABRICATED: { why: string; text: string; page: number }[] = [
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
export const UNSTATED: ExtractedField[] = ["monthsInForce"];
