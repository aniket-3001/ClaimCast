/**
 * Answering a question by retrieving it out of the policy PDF the user
 * actually uploaded — not a hand-written clause list.
 *
 * Three steps, in the order a RAG pipeline always has them:
 *
 * 1. **Chunk.** `pageText()` (from `extract.ts`) already turns the upload into
 *    one normalised string per page. `chunkPages` slices each page into
 *    overlapping windows on a word boundary, so a sentence never gets split
 *    mid-word and a fact sitting across a window edge still appears whole in
 *    the next window.
 * 2. **Retrieve.** `retrieve` scores every chunk against the question by
 *    TF-IDF — term frequency in the chunk, weighted down for terms that show
 *    up in most chunks anyway (a policy schedule repeats "sum insured" and
 *    "the Company" on every page; those should not win a match). No
 *    embeddings and no vector store: the whole document is at most a few
 *    dozen chunks, small enough that a transparent, offline-computable score
 *    is both sufficient and — because it is deterministic and testable
 *    without a network call — the more auditable choice for a system whose
 *    whole premise is that a figure has to be traceable to what produced it.
 * 3. **Answer, then check.** The model is shown only the retrieved passages
 *    (never the whole document) and told to quote, not paraphrase, exactly
 *    the way `models.ts` asks for a span. `groundPolicyAnswer` then checks
 *    every quote against the document's own text with `found()` — the same
 *    function `extract.ts` uses — so a citation shaped like the real thing
 *    and not actually on the page is caught here, not trusted.
 *
 * **The hospital mapping is not retrieved and not asked of the model.** Whether
 * a named hospital is in the policy's cashless network is looked up in the
 * hospital registry and handed to the model as a stated fact, the same
 * separation of "code decides the fact, the model only phrases it" that keeps
 * every other figure in this codebase out of a language model's hands.
 *
 * **This never decides what a claim is worth.** It describes what the
 * document says and what the hospital record says. Pricing a real admission
 * is still `adjudicate()`'s job, over data this module never touches.
 */

import type { Hospital } from "@claimcast/engine";
import type { PolicyQaAnswer } from "@claimcast/contracts";
import { found } from "./extract.js";
import { chat } from "./llm.js";

export { chunkPages, retrieve, type Chunk, type ScoredChunk } from "./retrieval.js";
import { chunkPages, retrieve, type ScoredChunk } from "./retrieval.js";

/** The first hospital in the pool whose name is actually named in the text. */
export function matchHospitalByName(hospitals: Hospital[], text: string): Hospital | null {
  const lower = text.toLowerCase();
  return hospitals.find((h) => lower.includes(h.name.toLowerCase())) ?? null;
}

function inr(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

/** What the engine already knows about one hospital, as plain sentences. */
function hospitalBlock(h: Hospital, insurer: string | null): string {
  const rooms = h.rooms.map((r) => `${r.cls} ${inr(r.perDay)}/day`).join(", ") || "not on file";
  const network =
    insurer === null
      ? `Insurers with a cashless agreement here, on file: ${h.network.join(", ") || "none on file"}.`
      : h.network.some((n) => n.toLowerCase() === insurer.toLowerCase())
        ? `${insurer} IS listed as having a cashless agreement with this hospital.`
        : `${insurer} is NOT listed as having a cashless agreement with this hospital -- ` +
          "reimbursement would be the route, per the registry on file.";

  return [
    `Hospital: ${h.name}, ${h.city} (city tier ${h.tier}).`,
    `Room rates on file: ${rooms}.`,
    `PM-JAY empanelled: ${h.pmjayEmpanelled ? "yes" : "no"}.`,
    `ESIC tie-up: ${h.esicTieUp ? "yes" : "no"}.`,
    `CGHS rate band: ${h.cghsRateBand ?? "not applicable"}.`,
    network,
  ].join("\n");
}

const SYSTEM = `You answer a caregiver's questions about ONE insurance policy schedule, using
only the passages given below -- excerpts actually retrieved from the document they uploaded --
and, if one is given, one hospital's own record. You have no other information about this policy
and nothing from the internet.

Rules:
- Answer only from the passages and the hospital record given below. If neither addresses the
  question, say so plainly -- do not guess, and do not fall back on general knowledge of Indian
  insurance.
- Every factual claim that comes from the policy document must carry a citation: the exact
  phrase it came from, copied character for character from the passage it is in, and the page
  number printed above that passage. A claim about the hospital record needs no citation -- it is
  given to you as a fact, not quoted from a document.
- Never say a claim will or will not be paid, and never give medical advice or a treatment
  recommendation. Describe what the wording says, plainly, for someone who has never read an
  insurance policy before.

Reply with JSON only -- no prose, no markdown fence -- in exactly this shape:
{ "answer": string, "citations": [ { "quote": string, "page": integer } ] }
"citations" may be empty -- e.g. the answer came only from the hospital record, or it is
"the document does not say."`;

function buildContext(passages: ScoredChunk[], hospitalText: string | null): string {
  const docBlock = passages.length
    ? passages.map((p) => `[page ${p.chunk.page}] "${p.chunk.text}"`).join("\n\n")
    : "(no passage in the document matched this question)";
  return (
    `── Retrieved from the policy document ──\n${docBlock}` +
    (hospitalText ? `\n\n── Hospital record ──\n${hospitalText}` : "")
  );
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw Object.assign(new Error("The model did not return JSON."), { status: 502 });
  }
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * The model's raw JSON, checked against the document's own pages.
 *
 * Pure and network-free: `answerFromPolicyPdf` below is the only caller that
 * has actually talked to a model, and this is what turns its text into the
 * typed, verified shape the contract promises — testable against canned
 * model output the same way `extract.check.ts` tests `found()` on its own.
 */
export function groundPolicyAnswer(
  rawModelText: string,
  pages: string[],
  retrievedPages: number[],
  hospitalName: string | null,
  model: string,
): PolicyQaAnswer {
  const parsed = parseJson(rawModelText) as { answer?: unknown; citations?: unknown };
  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  const rows = Array.isArray(parsed.citations) ? parsed.citations : [];

  const citations = rows.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const quote = typeof r.quote === "string" ? r.quote : "";
    const page = typeof r.page === "number" ? r.page : -1;
    const verified = quote.length > 0 && found(pages, quote, page);
    return { quote, page, verified };
  });

  return {
    answer,
    citations,
    unverified: citations.filter((c) => !c.verified).length,
    retrievedPages,
    hospital: hospitalName,
    model,
  };
}

export async function answerFromPolicyPdf(args: {
  /** Whole-document page text, from `extract.ts`'s `pageText()`. */
  pages: string[];
  question: string;
  hospitals: Hospital[];
  /** Preferred over name-matching, when the caller already knows which hospital is meant. */
  hospitalId?: string;
  /** The insurer name the (unconfirmed) extraction read off this schedule, for the network check. */
  extractedInsurer?: string | null;
}): Promise<PolicyQaAnswer> {
  const chunks = chunkPages(args.pages);
  const top = retrieve(chunks, args.question, 6);
  const retrievedPages = [...new Set(top.map((t) => t.chunk.page))].sort((a, b) => a - b);

  const hospital =
    (args.hospitalId ? args.hospitals.find((h) => h.id === args.hospitalId) : undefined) ??
    matchHospitalByName(args.hospitals, args.question) ??
    null;
  const hospitalText = hospital ? hospitalBlock(hospital, args.extractedInsurer ?? null) : null;

  const system = SYSTEM + "\n\n" + buildContext(top, hospitalText);
  const { text, used } = await chat(system, args.question);

  return groundPolicyAnswer(
    text,
    args.pages,
    retrievedPages,
    hospital?.name ?? null,
    `${used.provider}/${used.model}`,
  );
}
