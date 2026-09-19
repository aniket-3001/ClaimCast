/**
 * Which model reads the schedule, and how to ask it.
 *
 * Three providers behind one call, chosen by whichever key is present. The
 * choice is not cosmetic and the order is not arbitrary.
 *
 * **Gemini first, because it takes the PDF.** A policy schedule is a grid: limit
 * names down one column, figures down another. `pdfjs` flattens that into a
 * stream of words in layout order, and once flattened there is nothing in the
 * text tying "₹5,000 per day" to "Room rent" rather than to the row above it.
 * Gemini and Claude are handed the file and see the page. Groq's models are all
 * text-only, so it gets the flattened text and a correspondingly worse chance at
 * anything positional.
 *
 * **Groq is kept anyway**, because it is the one path that does not depend on
 * Google. This project's Google account carries an unresolved verification
 * notice, and a suspended project on the morning of a demo is a real failure
 * mode. A fallback that runs on a different company's infrastructure is worth
 * more than a marginally better score.
 *
 * **Anthropic is supported and not recommended here.** It is the most accurate
 * of the three on this task and roughly ten times the price of Gemini for it,
 * which does not pay for itself when the verification pass below catches the
 * failure mode that the extra accuracy would have avoided.
 *
 * No new dependency: Gemini and Groq are plain HTTPS, and `fetch` is in Node.
 *
 * **The keys never reach the browser.** This module is imported only by the API.
 */

import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTED_FIELDS, type ExtractedField } from "@claimcast/contracts";

/** What a model hands back per field, before anything has been checked. */
export interface RawField {
  value: unknown;
  span: unknown;
  absent: unknown;
}

export type Raw = Record<string, RawField>;

/**
 * What each field means, in the words the model is given. These double as the
 * schema description for the providers that take one and as the prompt text for
 * the ones that do not, so there is a single place where a field's meaning is
 * written down.
 */
export const FIELD_NOTES: Record<ExtractedField, string> = {
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

/**
 * The type each value has to end up as.
 *
 * Needed because two of the three providers answer in free JSON rather than
 * against a schema, and a model writing `"50000000"` or `"5,00,000"` where a
 * number belongs is the ordinary case, not the odd one. The contract accepts a
 * string for `value`, so nothing downstream would have rejected it -- the engine
 * would simply have been handed a string and priced something wrong. Coercion
 * happens in one place, for every provider, including the ones that got it right.
 */
export const FIELD_TYPES: Record<ExtractedField, "string" | "number" | "boolean"> = {
  insurer: "string",
  product: "string",
  sumInsured: "number",
  roomCapPerDay: "number",
  roomCapPctOfSI: "number",
  icuCapPerDay: "number",
  icuCapPctOfSI: "number",
  proportionateDeduction: "boolean",
  copayPct: "number",
  implantSubLimit: "number",
  preHospDays: "number",
  postHospDays: "number",
  dayCareCovered: "boolean",
  monthsInForce: "number",
  pedWaitingMonths: "number",
  moratoriumMonths: "number",
};

export const PROMPT = `You are reading an Indian health insurance policy schedule so that a claim can be
adjudicated against it.

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

/** The shape, written out for the providers that are asked for JSON rather than given a schema. */
function jsonHint(): string {
  const lines = EXTRACTED_FIELDS.map((f) => {
    const type = FIELD_TYPES[f] === "string" ? "string" : FIELD_TYPES[f];
    return `  "${f}": { "value": ${type} or null, "span": {"text": string, "page": integer} or null, "absent": string or null }   // ${FIELD_NOTES[f]}`;
  });
  return `Reply with JSON only -- no prose, no markdown fence -- in exactly this shape:

{
${lines.join("\n")}
}

"page" is 1-based. "span" is null exactly when "value" is null, and "absent" is a sentence
exactly when "value" is null. Every one of the ${EXTRACTED_FIELDS.length} keys must be present.`;
}

/** Anthropic takes a real schema, so it gets one rather than a description of one. */
function tool() {
  return {
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
                  FIELD_NOTES[f] +
                  " Null if the document does not state it. Never infer or compute.",
              },
              span: {
                type: ["object", "null"],
                description:
                  "The exact text this was read from, copied character for character from the " +
                  "document, and the page it is on. Null when the value is null.",
                properties: { text: { type: "string" }, page: { type: "integer" } },
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
}

export interface Chosen {
  provider: "vertex" | "gemini" | "anthropic" | "groq";
  /** Recorded on the extraction, so a figure on screen can be traced to what read it. */
  model: string;
}

/**
 * Which provider is configured, in preference order.
 *
 * `EXTRACTION_PROVIDER` forces one, so a deployment can pin the fallback without
 * removing the primary's key. Otherwise the first key present wins.
 */
export function chosen(): Chosen | null {
  const forced = process.env.EXTRACTION_PROVIDER?.trim().toLowerCase();
  const vertex = (process.env.VERTEX_PROJECT ?? "").trim();
  const gemini = process.env.GEMINI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const groq = process.env.GROQ_API_KEY;

  // Pro, not Flash, on both Google paths. This reads a financial document that a
  // person is then asked to confirm, and the difference in price between the two
  // is under two rupees per upload -- which is not a reason to use the weaker
  // reader on a page of sub-limits. The *_MODEL variables switch to Flash if
  // volume ever matters.
  //
  // Vertex serves gemini-2.5-pro; the AI Studio API no longer does. A key issued
  // there in September 2026 answers 404 on 2.5 ("no longer available to new
  // users. Please update your code to use models/gemini-3.1-pro-preview"), so the
  // two defaults differ on purpose and neither is a typo for the other. Vertex
  // does not offer the 3.x names at all -- every one of them 404s.
  const vertexModel = process.env.VERTEX_MODEL ?? "gemini-2.5-pro";
  const geminiModel = process.env.GEMINI_MODEL ?? "gemini-3.1-pro-preview";
  const anthropicModel = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  const groqModel = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

  if (forced === "vertex" && vertex) return { provider: "vertex", model: vertexModel };
  if (forced === "gemini" && gemini) return { provider: "gemini", model: geminiModel };
  if (forced === "anthropic" && anthropic) return { provider: "anthropic", model: anthropicModel };
  if (forced === "groq" && groq) return { provider: "groq", model: groqModel };

  if (vertex) return { provider: "vertex", model: vertexModel };
  if (gemini) return { provider: "gemini", model: geminiModel };
  if (anthropic) return { provider: "anthropic", model: anthropicModel };
  if (groq) return { provider: "groq", model: groqModel };
  return null;
}

/** A model's JSON, with the fence some of them add stripped off. */
function parseJson(text: string): Raw {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  // A model that answers with a sentence before the object is common enough to
  // be worth surviving, and the object is always the outermost braces.
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw Object.assign(new Error("The model did not return JSON."), { status: 502 });
  }
  return JSON.parse(body.slice(start, end + 1)) as Raw;
}

/**
 * An access token for this service, for the Vertex path.
 *
 * Vertex authenticates with OAuth rather than an API key, which is most of why
 * it is preferred: there is no long-lived secret to put in Secret Manager, to
 * rotate, or to leak. On Cloud Run the metadata server mints a token for the
 * attached service account, and the only thing that had to be configured is one
 * IAM grant. Locally there is no metadata server, so GOOGLE_ACCESS_TOKEN is
 * read first -- `gcloud auth print-access-token` fills it for a development run.
 *
 * Cached until a minute before it expires. A token lasts an hour and a request
 * per upload would otherwise fetch a fresh one every time.
 */
let vertexToken: { value: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  const explicit = (process.env.GOOGLE_ACCESS_TOKEN ?? "").trim();
  if (explicit) return explicit;

  if (vertexToken && Date.now() < vertexToken.until) return vertexToken.value;

  const res = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "metadata-flavor": "Google" }, signal: AbortSignal.timeout(3000) },
  ).catch(() => null);

  if (!res?.ok) {
    throw Object.assign(
      new Error(
        "No Google credentials for Vertex. On Cloud Run this means the metadata " +
          "server is unreachable; locally, set GOOGLE_ACCESS_TOKEN to the output of " +
          "`gcloud auth print-access-token`.",
      ),
      { status: 503 },
    );
  }

  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw Object.assign(new Error("The metadata server returned no access token."), { status: 503 });
  }
  vertexToken = {
    value: body.access_token,
    until: Date.now() + Math.max((body.expires_in ?? 3600) - 60, 60) * 1000,
  };
  return vertexToken.value;
}

/**
 * Gemini through Vertex AI, which is the same model reached a different way.
 *
 * The request and the response are shaped identically to the AI Studio one, so
 * `viaGemini` does the work and this only decides the URL and the credential.
 * What differs is billing and secrets: Vertex bills to the Google Cloud project,
 * which is where the credit is, while the AI Studio API bills to a separate
 * prepay balance that Cloud credit does not fund -- the practical effect being
 * that every AI Studio model answers 429 on this account and Vertex answers 200.
 */
async function viaVertex(model: string, pdf: Buffer): Promise<Raw> {
  const project = (process.env.VERTEX_PROJECT ?? "").trim();
  const location = (process.env.VERTEX_LOCATION ?? "us-central1").trim();
  const url =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  return viaGemini(model, pdf, {
    url,
    headers: { authorization: `Bearer ${await accessToken()}` },
    name: "Vertex",
  });
}

async function viaGemini(
  model: string,
  pdf: Buffer,
  // Absent for the AI Studio API; supplied by viaVertex, which speaks the same
  // protocol to a different host with a different credential.
  endpoint?: { url: string; headers: Record<string, string>; name: string },
): Promise<Raw> {
  const name = endpoint?.name ?? "Gemini";
  const url =
    endpoint?.url ??
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  // The key goes in a header rather than the query string, because a URL ends
  // up in logs and proxy traces and a query string is part of the URL.
  const auth = endpoint?.headers ?? { "x-goog-api-key": process.env.GEMINI_API_KEY! };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { inline_data: { mime_type: "application/pdf", data: pdf.toString("base64") } },
            { text: PROMPT + "\n\n" + jsonHint() },
          ],
        },
      ],
      generationConfig: {
        // Transcription, not deliberation. The same document should read the
        // same way twice, and a model that varies here varies on figures.
        temperature: 0,
        responseMimeType: "application/json",
        // Thinking is charged against this budget as well as the answer, and a
        // sixteen-field object is not short. Generous, because the failure when
        // it is too small is a truncated JSON object -- an extraction that dies
        // at the parse rather than one that comes back a little worse.
        maxOutputTokens: 16384,
        // Flash can have thinking switched off and does not need it to copy
        // figures off a page. Pro cannot: it rejects a zero budget outright, so
        // asking for one would 400 every request. Left unset there, which lets
        // the model decide.
        ...(model.includes("flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw Object.assign(
      new Error(`${name} refused the request: ${res.status} ${detail.slice(0, 300)}`),
      { status: res.status === 429 ? 429 : 502 },
    );
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  const candidate = body.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw Object.assign(new Error(`${name} ran out of output budget before finishing.`), {
      status: 502,
    });
  }
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text.trim()) {
    throw Object.assign(new Error(`${name} returned an empty answer.`), { status: 502 });
  }
  return parseJson(text);
}

async function viaGroq(model: string, pages: string[]): Promise<Raw> {
  const key = process.env.GROQ_API_KEY!;

  // Text only, and said so on the page it produces: the reader is told which
  // model read the schedule, and this one did not see it.
  const document = pages.map((p, i) => `--- page ${i + 1} ---\n${p}`).join("\n\n");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT + "\n\n" + jsonHint() },
        { role: "user", content: document },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw Object.assign(new Error(`Groq refused the request: ${res.status} ${detail.slice(0, 300)}`), {
      status: res.status === 429 ? 429 : 502,
    });
  }

  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) {
    throw Object.assign(new Error("Groq returned an empty answer."), { status: 502 });
  }
  return parseJson(text);
}

async function viaAnthropic(model: string, pdf: Buffer): Promise<Raw> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const spec = tool();

  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    tools: [spec],
    tool_choice: { type: "tool", name: spec.name },
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
  return use.input as Raw;
}

/**
 * Read the schedule with whichever provider is configured.
 *
 * `pages` is only used by the text-only path, but it is always passed: the
 * caller has already extracted it for the verification pass, and handing it over
 * costs nothing.
 */
export async function read(pdf: Buffer, pages: string[]): Promise<{ raw: Raw; used: Chosen }> {
  const pick = chosen();
  if (!pick) {
    throw Object.assign(
      new Error(
        "No extraction provider is configured. Set VERTEX_PROJECT, or one of " +
          "GEMINI_API_KEY, ANTHROPIC_API_KEY or GROQ_API_KEY.",
      ),
      { status: 503 },
    );
  }

  const raw =
    pick.provider === "vertex"
      ? await viaVertex(pick.model, pdf)
      : pick.provider === "gemini"
        ? await viaGemini(pick.model, pdf)
        : pick.provider === "anthropic"
          ? await viaAnthropic(pick.model, pdf)
          : await viaGroq(pick.model, pages);

  return { raw, used: pick };
}
