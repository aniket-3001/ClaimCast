/**
 * Reading a policy schedule, and proving what was read.
 *
 * A language model reads the PDF and returns one value per field together with
 * the verbatim run of text it took that value from. Then this module does the
 * part that makes the citation worth having: it pulls the document's own text
 * out with pdf.js and looks for each span in it. A span that is not there is
 * marked unverified and travels to the screen saying so.
 *
 * That check is cheap and it is the only real defence available here. A model
 * asked to cite will sometimes produce a citation shaped exactly like the real
 * ones and absent from the document, and no amount of prompting reliably stops
 * it. Comparing against the actual bytes does stop it, every time, because the
 * text either is in the file or it is not.
 *
 * It is also what makes a cheaper model safe to use. `models.ts` picks between
 * Gemini, Claude and Groq on whichever key is present, and the weaker the model
 * the more work this pass does -- but the failure it has to catch is the same
 * one in every case, and it catches it by looking rather than by trusting.
 *
 * **The extraction is never the answer.** It populates a form the user confirms.
 * `Intake.tsx` holds that gate and nothing here bypasses it -- no extracted
 * value reaches the engine, the database or a figure on screen until a person
 * has looked at the number beside the sentence it came from and agreed.
 *
 * **What the schedule cannot say.** `monthsInForce` is how long the cover has
 * run, and a schedule states the current policy year. The model is told to
 * return null with a reason rather than to compute one from the period of
 * insurance, because a policy renewed for eight years and one bought in January
 * carry the same dates, and that field decides whether a pre-existing-disease
 * waiting period has expired. Guessing it would move a real person's claim.
 */

import {
  EXTRACTED_FIELDS,
  ExtractionSchema,
  type ExtractedField,
  type Extraction,
} from "@claimcast/contracts";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { FIELD_TYPES, read } from "./models.js";

/**
 * Is this quote actually in the document?
 *
 * Exported so that the check can be run against a real schedule on its own,
 * without an API key and without a model in the loop. It is the whole substance
 * of the citation, and a claim that a citation is verified is worth exactly as
 * much as the last time someone ran this over a real PDF.
 */
export function found(pages: string[], text: string, page: number): boolean {
  if (!Number.isInteger(page) || page < 1 || page > pages.length) return false;
  return pages[page - 1].includes(normalise(text));
}

/** Every page's text, as pdf.js reads it, whitespace collapsed for comparison. */
export async function pageText(pdf: Buffer): Promise<string[]> {
  const task = getDocument({
    data: new Uint8Array(pdf),
    // No fetching and no system fonts: this runs in a server process that has no
    // business reaching the network or the host's font directory to read a file
    // someone uploaded.
    useWorkerFetch: false,
    useSystemFonts: false,
  });

  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((i) => ("str" in i ? i.str : "")).join(" ");
      pages.push(normalise(text));
    }
    return pages;
  } finally {
    // The loading task owns the worker, so it is the thing that has to be torn
    // down -- and in a finally, because a PDF that fails to parse halfway
    // through would otherwise leave one running for the life of the process.
    await task.destroy();
  }
}

/**
 * Whitespace is where an honest quote and the document disagree for no reason.
 * A PDF's text layer breaks lines wherever the layout did, so a rupee figure and
 * the words "per day" can arrive with a line break and double spaces between
 * them. Collapsing runs of space closes that gap without letting a different
 * sentence through: every character that carries meaning still has to match.
 */
function normalise(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Make the value the type the engine prices with, or refuse it.
 *
 * Two of the three providers answer in free-form JSON, where a quoted number or
 * a figure still carrying its rupee sign and thousands separators is an ordinary
 * answer for a field that has to be numeric. The contract accepts a string for
 * `value`, so nothing downstream would have rejected either one -- the engine
 * would have been handed a string and priced something wrong, quietly. This is
 * the one place that cannot happen.
 *
 * A value that will not convert becomes null rather than a guess. It then
 * travels to the screen as an unanswered field with a reason, which is a person
 * typing one number, instead of a wrong number nobody was asked about.
 */
function coerce(
  field: ExtractedField,
  value: unknown,
): { value: number | boolean | string | null; bad: boolean } {
  if (value === null || value === undefined) return { value: null, bad: false };
  const want = FIELD_TYPES[field];

  if (want === "string") {
    const s = typeof value === "string" ? value.trim() : String(value);
    return s ? { value: s, bad: false } : { value: null, bad: false };
  }

  if (want === "boolean") {
    if (typeof value === "boolean") return { value, bad: false };
    if (typeof value === "string") {
      const s = value.trim().toLowerCase();
      if (s === "true" || s === "yes") return { value: true, bad: false };
      if (s === "false" || s === "no") return { value: false, bad: false };
    }
    return { value: null, bad: true };
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? { value, bad: false } : { value: null, bad: true };
  }
  if (typeof value === "string") {
    // Currency marks, thousands separators and a stray "Rs" are formatting, not
    // information. Anything left over that is not a number is not a number.
    const cleaned = value.replace(/(?:rs\.?|inr)/gi, "").replace(/[₹,\s]/g, "");
    const n = Number(cleaned);
    if (cleaned !== "" && Number.isFinite(n)) return { value: n, bad: false };
  }
  return { value: null, bad: true };
}

export interface ExtractionResult {
  extraction: Extraction;
  /** Page text, kept in memory for the caller to search. Never persisted. */
  pages: string[];
}

export async function extractPolicy(
  pdf: Buffer,
  filename: string,
  documentId: string,
  /**
   * Worked examples out of past corrections, from the caller that has a database
   * handle. Passed in rather than fetched here because this module is the one
   * place the reading happens and it stays testable against a fixed prompt --
   * and because an extraction must still work on a server with no learning
   * history at all, which is what the default is.
   */
  hints = "",
): Promise<ExtractionResult> {
  const pages = await pageText(pdf);
  const { raw, used, retrieved } = await read(pdf, pages, hints);

  const fields: Record<string, unknown> = {};
  const unverified: string[] = [];

  for (const f of EXTRACTED_FIELDS) {
    const got = raw[f];
    const span =
      got?.span && typeof got.span === "object"
        ? (got.span as { text?: unknown; page?: unknown })
        : null;
    const text = typeof span?.text === "string" ? span.text : null;
    const page = typeof span?.page === "number" ? span.page : null;

    // The whole point of the exercise: the quote either is in the document or
    // it is not, and this is where that is settled.
    const verified = text !== null && page !== null && found(pages, text, page);

    if (text !== null && !verified) unverified.push(f);

    const { value, bad } = coerce(f, got?.value);
    const absent = typeof got?.absent === "string" ? got.absent : null;

    fields[f] = {
      value,
      // A span is a citation for a value. Once the value has been dropped there
      // is nothing left for it to cite, and keeping it would put a quote beside
      // an empty field as though the two agreed.
      span: !bad && text !== null && page !== null ? { text, page } : null,
      absent: bad
        ? "The model answered with something this field cannot hold, so it was dropped rather than guessed at."
        : absent,
      verified: bad ? false : verified,
    };
  }

  return {
    pages,
    extraction: ExtractionSchema.parse({
      documentId,
      filename,
      pages: pages.length,
      // Which model, not just which company. A figure on screen should be
      // traceable to the thing that read it, including on the day that thing
      // was the text-only fallback.
      model: `${used.provider}/${used.model}`,
      retrievedPassages: retrieved,
      extractedAt: new Date().toISOString(),
      fields,
      unverified,
    }),
  };
}
