/**
 * The chatbox: questions about the admission on screen, and about the policy
 * the user uploaded, answered in plain words.
 *
 * Two sources and nothing else. The engine's facts about this admission --
 * `caseFacts()`, the same figures every screen shows, re-priced here by the
 * same engine -- and, when a document was uploaded, passages retrieved from it
 * by `retrieval.ts`. The model phrases; it does not compute. That is the deck's
 * "the LLM never decides the money", and it is enforced after the fact rather
 * than hoped for:
 *
 * - every quote from the policy is looked for in the document's own text, as
 *   `extract.ts` and `rag.ts` do;
 * - every rupee figure in the answer must appear in an engine fact or in a
 *   verified quote. One that appears in neither is a number the model made,
 *   and it goes back to the screen named as such.
 *
 * Money only. No diagnosis, no treatment advice, and never a promise that a
 * claim will be paid -- the prompt says so, and the facts give it nothing to
 * be clinical with.
 */

import type { Fact } from "@claimcast/engine";
import type { ChatAnswer, ChatRequest, ChatTurnRecord } from "@claimcast/contracts";
import { found } from "./extract.js";
import { chat } from "./llm.js";
import { chunkPages, retrieve, type ScoredChunk } from "./retrieval.js";

const SYSTEM = `You are the help box inside ClaimCast, which shows an Indian family what their
health insurance policy will and will not pay for one hospital admission, before they are admitted.

You are given two things and have nothing else:
1. FACTS: numbered statements the ClaimCast engine computed about this admission. They are
   correct. Every rupee figure you mention must be copied from a fact, exactly as written there.
   Never add, subtract, multiply, round or estimate a figure yourself -- if the answer needs a
   figure that is not in the facts, say that ClaimCast has not worked that figure out.
2. PASSAGES (sometimes): excerpts retrieved from the policy document the family uploaded. Any
   claim about what the policy wording says must quote the passage character for character, with
   its page number.

Rules:
- Answer the question asked, in two to five short sentences, for someone who has never read an
  insurance policy. Say which choice changes what they pay, and by how much, when the facts show it.
- Money only. Never give medical advice, a diagnosis, or an opinion on whether a treatment is
  needed. If asked, say that ClaimCast only works out the money and they should ask their doctor.
- Never say a claim will definitely be paid. These are estimates from the policy wording.
- If neither the facts nor the passages answer the question, say so plainly.
- MEMORY (sometimes) holds questions other families asked in saved sessions and how ClaimCast
  answered them. Use it only to learn how to explain things clearly and what people usually want
  to know. Its figures belong to other admissions: never repeat a figure from MEMORY.

Reply with JSON only -- no prose, no markdown fence -- in exactly this shape:
{ "answer": string, "facts": [ "F3", ... ], "citations": [ { "quote": string, "page": integer } ] }
"facts" lists the ids of the facts the answer used. "citations" may be empty.`;

/** Every rupee figure written in a piece of text, in paise. `₹1,26,900`, `Rs. 5,000`, `INR 48500`. */
export function rupeeFigures(text: string): { raw: string; paise: number }[] {
  const out: { raw: string; paise: number }[] = [];
  for (const m of text.matchAll(/(?:₹|\bRs\.?|\bINR)\s?(\d[\d,]*(?:\.\d{1,2})?)(\s?(?:lakh|lakhs|L)\b)?/gi)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const rupees = m[2] ? n * 100_000 : n;
    out.push({ raw: m[0].trim(), paise: Math.round(rupees * 100) });
  }
  return out;
}

function parseJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw Object.assign(new Error("The model did not return JSON."), { status: 502 });
  }
  return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
}

export function buildPrompt(
  facts: Fact[],
  passages: ScoredChunk[] | null,
  memory: ChatTurnRecord[] = [],
): string {
  const factBlock = facts.map((f) => `${f.id}. ${f.text}`).join("\n");
  const passageBlock =
    passages === null
      ? ""
      : "\n\n── PASSAGES from the uploaded policy ──\n" +
        (passages.length
          ? passages.map((p) => `[page ${p.chunk.page}] "${p.chunk.text}"`).join("\n\n")
          : "(no passage in the document matched this question)");
  const memoryBlock = memory.length
    ? "\n\n── MEMORY: past questions from saved sessions, and ClaimCast's answers (other admissions) ──\n" +
      memory.map((m) => `Q: ${m.question}\nA: ${m.answer}`).join("\n\n")
    : "";
  return `${SYSTEM}\n\n── FACTS about this admission ──\n${factBlock}${passageBlock}${memoryBlock}`;
}

/**
 * The model's reply, checked. Pure and network-free, so it is tested against
 * canned replies in `chat.check.ts` rather than against a model's honesty.
 */
export function groundChat(args: {
  rawModelText: string;
  facts: Fact[];
  pages: string[] | null;
  retrievedPages: number[];
  model: string;
  memoryUsed?: number;
}): ChatAnswer {
  const parsed = parseJson(args.rawModelText);
  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";

  const byId = new Map(args.facts.map((f) => [f.id, f]));
  const used = (Array.isArray(parsed.facts) ? parsed.facts : [])
    .filter((id): id is string => typeof id === "string" && byId.has(id))
    .filter((id, i, all) => all.indexOf(id) === i)
    .map((id) => byId.get(id)!);

  const citations = (Array.isArray(parsed.citations) ? parsed.citations : []).map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const quote = typeof r.quote === "string" ? r.quote : "";
    const page = typeof r.page === "number" ? r.page : -1;
    const verified = args.pages !== null && quote.length > 0 && found(args.pages, quote, page);
    return { quote, page, verified };
  });

  // A figure is supported if the engine stated it, or a verified quote from the
  // policy contains it. Checked against every fact, not only the ones the model
  // said it used: a correct figure with a missing fact id is a citation slip,
  // not an invented number.
  const allowed = new Set<number>(args.facts.flatMap((f) => [...f.amounts, ...rupeeFigures(f.text).map((x) => x.paise)]));
  for (const c of citations) if (c.verified) for (const x of rupeeFigures(c.quote)) allowed.add(x.paise);
  const unsupportedFigures = [
    ...new Set(rupeeFigures(answer).filter((x) => !allowed.has(x.paise)).map((x) => x.raw)),
  ];

  return {
    answer,
    facts: used.map((f) => ({ id: f.id, text: f.text, clause: f.clause })),
    citations,
    unverified: citations.filter((c) => !c.verified).length,
    unsupportedFigures,
    usedDocument: args.pages !== null,
    retrievedPages: args.retrievedPages,
    model: args.model,
    memoryUsed: args.memoryUsed ?? 0,
  };
}

export async function answerChat(args: {
  question: string;
  history: ChatRequest["history"];
  facts: Fact[];
  /** The uploaded document's page text, or null when none was given. */
  pages: string[] | null;
  /** Past answers from saved sessions most like this question. */
  memory?: ChatTurnRecord[];
  language?: "en" | "hi";
}): Promise<ChatAnswer> {
  const top = args.pages === null ? null : retrieve(chunkPages(args.pages), args.question, 5);
  const retrievedPages = top ? [...new Set(top.map((t) => t.chunk.page))].sort((a, b) => a - b) : [];

  // Earlier turns are context for understanding the question, not a source:
  // a figure the model said two turns ago is not a fact unless the engine says it now.
  const history = args.history.length
    ? "Earlier in this conversation (context only, not a source of figures):\n" +
      args.history.map((h) => `${h.role === "user" ? "Family" : "ClaimCast"}: ${h.text}`).join("\n") +
      "\n\nNow the family asks: "
    : "";

  const memory = args.memory ?? [];
  const system =
    buildPrompt(args.facts, top, memory) +
    (args.language === "hi"
      ? "\n\nThe family is reading in Hindi. Write \"answer\" in simple, everyday Hindi (Devanagari script). " +
        "Write every rupee figure exactly as it appears in the facts, with the ₹ sign and digits (for example ₹1,26,900) -- " +
        "never in words and never as lakh. Keep the JSON keys in English."
      : "");
  // Open models occasionally answer in prose instead of the JSON asked for.
  // One more try, told so, before giving up; a second miss is a real failure.
  for (let attempt = 0; ; attempt++) {
    const { text, used } = await chat(
      attempt === 0 ? system : system + "\n\nYour last reply was not valid JSON. Reply with the JSON object only.",
      history + args.question,
    );
    try {
      return groundChat({
        rawModelText: text,
        facts: args.facts,
        pages: args.pages,
        retrievedPages,
        model: `${used.provider}/${used.model}`,
        memoryUsed: memory.length,
      });
    } catch (e) {
      if (attempt >= 1 || !(e instanceof SyntaxError || (e as { status?: number }).status === 502)) throw e;
    }
  }
}
