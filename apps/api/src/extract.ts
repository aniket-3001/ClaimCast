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

import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTED_FIELDS, ExtractionSchema, type Extraction } from "@claimcast/contracts";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Sonnet 5 rather than the largest model available. This is transcription with a
 * citation requirement, not reasoning, and the verification pass below catches
 * the failure mode a bigger model would reduce but not remove. Override with
 * EXTRACTION_MODEL if a schedule turns up that it cannot read.
 */
const MODEL = process.env.EXTRACTION_MODEL ?? "claude-sonnet-5";

const FIELD_NOTES: Record<string, string> = {
  insurer: "The insurance company's name, as printed.",
  product: "The product or plan name.",
  sumInsured: "Sum insured for the policy year, in paise. Rs 5,00,000 is 50000000.",
  roomCapPerDay: "Room rent limit per day in paise, or null if the limit is only a percentage.",
  roomCapPctOfSI:
    "Room rent limit as a fraction of sum insured -- 1% is 0.01 -- or null if stated in rupees only.",
  icuCapPerDay: "ICU limit per day in paise, or null if only a percentage is given.",
  icuCapPctOfSI: "ICU limit as a fraction of sum insured, or null if stated in rupees only.",
  proportionateDeduction:
    "true if the policy applies proportionate deduction when the room taken exceeds the limit.",
  copayPct: "Co-payment as a fraction -- 20% is 0.2, none is 0.",
  implantSubLimit: "Implant or prosthesis sub-limit in paise, or null if there is none.",
  preHospDays: "Days of pre-hospitalisation expenses covered.",
  postHospDays: "Days of post-hospitalisation expenses covered.",
  dayCareCovered: "true if day-care procedures are covered without the minimum stay.",
  monthsInForce:
    "How many months the cover has been continuously in force. A schedule states the current " +
    "policy year, which is a different thing, so this is almost always null. Do not compute it " +
    "from the period of insurance.",
  pedWaitingMonths: "Pre-existing disease waiting period, in months.",
  moratoriumMonths: "Moratorium period, in months.",
};

const TOOL = {
  name: "record_policy",
  description:
    "Record each field of the policy schedule together with the verbatim text it was read from.",
  input_schema: {
    type: "object" as const,
    properties: Object.fromEntries(
      EXTRACTED_FIELDS.map((f) => [
        f,
        {
          type: "object",
          description: FIELD_NOTES[f],
          properties: {
            value: {
              description:
                FIELD_NOTES[f] + " Null if the document does not state it. Never infer or compute.",
            },
            span: {
              type: ["object", "null"],
              description:
                "The exact text this was read from, copied character for character from the " +
                "document, and the page it is on. Null when the value is null.",
              properties: {
                text: { type: "string" },
                page: { type: "integer" },
              },
              required: ["text", "page"],
            },
            absent: {
              type: ["string", "null"],
              description:
                "When the value is null, one sentence saying what the document does say instead. " +
                "Null when there is a value.",
            },
          },
          required: ["value", "span", "absent"],
        },
      ]),
    ),
    required: [...EXTRACTED_FIELDS],
  },
};

const PROMPT = `You are reading an Indian health insurance policy schedule so that a claim can be
adjudicated against it. Record every field using the record_policy tool.

Two rules matter more than completeness.

First, quote rather than paraphrase. The span you give for a field must be text that appears in
the document exactly as you write it -- the same words, the same digits, the same punctuation.
It is checked against the document afterwards, and a span that cannot be found is shown to the
reader as a failure. A short exact quote is better than a long approximate one.

Second, do not supply what the document does not. If a field is not stated, set its value to null
and say in "absent" what the document says instead. Do not compute a figure from other figures,
do not carry a market convention across, and do not round a number into a tidier one. A wrong
value that looks plausible is worse here than an honest gap, because a person will be shown this
and asked to confirm it.`;

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
 * A PDF's text layer breaks lines wherever the layout did, so "Rs 5,000 per day"
 * can arrive as "Rs  5,000\nper  day". Collapsing runs of space closes that gap
 * without letting a different sentence through: every character that carries
 * meaning still has to match.
 */
function normalise(s: string): string {
  return s.replace(/\s+/g, " ").trim();
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
): Promise<ExtractionResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw Object.assign(new Error("ANTHROPIC_API_KEY is not set."), { status: 503 });
  }

  const pages = await pageText(pdf);
  const client = new Anthropic({ apiKey: key });

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  const use = res.content.find((b) => b.type === "tool_use");
  if (!use || use.type !== "tool_use") {
    throw Object.assign(new Error("The model returned no extraction."), { status: 502 });
  }

  const raw = use.input as Record<string, { value: unknown; span: unknown; absent: unknown }>;
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

    fields[f] = {
      value: got?.value ?? null,
      span: text !== null && page !== null ? { text, page } : null,
      absent: typeof got?.absent === "string" ? got.absent : null,
      verified,
    };
  }

  return {
    pages,
    extraction: ExtractionSchema.parse({
      documentId,
      filename,
      pages: pages.length,
      model: MODEL,
      extractedAt: new Date().toISOString(),
      fields,
      unverified,
    }),
  };
}
