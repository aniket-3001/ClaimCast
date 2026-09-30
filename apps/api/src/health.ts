/**
 * Reading a health report or a prescription, so what the doctor asked for can
 * be priced.
 *
 * The shape is the policy reader's, on purpose. A model proposes -- the
 * diagnosis, each test or scan, the operation, the medicines -- and quotes the
 * line of the report it read each one from. Then this module looks for every
 * quote in the report's own text, and a line that is not there travels to the
 * screen saying so. The family confirms before anything is priced.
 *
 * Two things are ClaimCast's rather than the model's:
 *
 * - **Which CGHS test a scan is.** Matched here, deterministically, against
 *   the CGHS rate list in the database, and shown with the next-closest tests
 *   so a wrong match is one click to fix. A model is never asked for a price.
 * - **Which priced operation the treatment is.** The model may name one from
 *   the list it is given; the id is checked against the reference set, and
 *   keyword rules stand in when it names none or no model is configured.
 *
 * Nothing is kept. The file is read in memory and dropped, and nothing about
 * it is logged; what the family confirms is all that is ever saved.
 *
 * ClaimCast does not interpret a report medically. It prices what the report
 * already says, and every screen that shows the result says so.
 */

import { procedureFor, type DiagnosticTest, type Procedure } from "@claimcast/engine";
import type { HealthReading, ReadTest } from "@claimcast/contracts";
import { HealthReadingSchema } from "@claimcast/contracts";
import { chat } from "./llm.js";

// ── Text ────────────────────────────────────────────────────────────────────

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Is this quote in the report, and on which page? Whitespace and letter case
 * are forgiven -- a prescription's text layer breaks lines wherever the pad
 * did -- and nothing else is.
 */
export function locate(pages: string[], quote: string): number | null {
  const q = squash(quote).toLowerCase();
  if (q.length < 2) return null;
  const i = pages.findIndex((p) => squash(p).toLowerCase().includes(q));
  return i === -1 ? null : i + 1;
}

/**
 * A photo of a report, or a scanned PDF with no text in it, written out as
 * text by a vision model -- line for line, nothing added.
 *
 * Quotes are then checked against this transcription, which proves the
 * reading matches what the model saw rather than what the paper says; the
 * screen says as much, and asks the family to check against their copy.
 */
export async function transcribe(bytes: Buffer, mime: string): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw Object.assign(new Error("No vision model is configured."), { status: 503 });
  }
  const model = process.env.OPENROUTER_VISION_MODEL || "google/gemini-2.5-flash";
  const data = `data:${mime};base64,${bytes.toString("base64")}`;
  const part =
    mime === "application/pdf"
      ? { type: "file", file: { filename: "report.pdf", file_data: data } }
      : { type: "image_url", image_url: { url: data } };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "x-title": "ClaimCast" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Transcribe this medical report or prescription exactly as written, line by line, " +
                "including handwriting. Do not summarise, correct, translate or add anything. " +
                "Write [illegible] for words you cannot read. Reply with the transcription only.",
            },
            part,
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`OpenRouter refused the transcription: ${res.status}`), {
      status: res.status === 429 ? 429 : 502,
    });
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw Object.assign(new Error("The transcription came back empty."), { status: 502 });
  return text;
}

/**
 * A PDF's text with its line breaks kept. `extract.ts` flattens each page to
 * one run for quoting; a prescription is read line by line -- "Diagnosis: …",
 * "Adv: …" -- so the breaks are worth keeping here.
 */
export async function pdfLines(pdf: Buffer): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(pdf), useWorkerFetch: false, useSystemFonts: false });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      let out = "";
      let lastY: number | null = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2 && !out.endsWith("\n")) out += "\n";
        out += item.str + (item.hasEOL ? "\n" : "");
        lastY = y;
      }
      pages.push(out.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim());
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

// ── Matching a test to the CGHS list ────────────────────────────────────────

/**
 * Words that mean the same test, written the ways Indian reports write them,
 * folded to one token each. Order matters: longer phrases first.
 */
const SYNONYMS: [RegExp, string][] = [
  [/\bx[\s-]?rays?\b|\bradiographs?\b|\bskiagrams?\b/g, " xray "],
  [/\bultra\s?sono(graphy)?\b|\bultrasound\b|\bsonography\b|\busg\b/g, " usg "],
  [/\bmagnetic resonance( imaging)?\b|\bmri\b|\bmr\b/g, " mri "],
  [/\bncct\b/g, " ct without contrast "],
  [/\bcect\b/g, " ct with contrast "],
  [/\bcomputed tomography\b|\bct[\s-]?scan\b|\bct\b/g, " ct "],
  [/\bcomplete blood (count|picture)\b|\bcbc\b|\bha?emogram\b/g, " cbc "],
  [/\belectrocardiogra(m|phy)\b|\becg\b|\bekg\b/g, " ecg "],
  [/\b2\s?d\s?echo\b|\bechocardiography\b|\bechocardiogram\b|\becho\b/g, " echocardiography "],
  [/\bliver function( tests?)?\b|\blft\b/g, " lft "],
  [/\b(kidney|renal) function( tests?)?\b|\bkft\b|\brft\b/g, " kft "],
  [/\bthyroid (function|profile)( tests?)?\b|\btft\b/g, " tft "],
  [/\bfbs\b|\bppbs\b|\brbs\b|\bblood sugar\b|\bsugar\b/g, " glucose "],
  [/\bhba1c\b|\bglycosylated ha?emoglobin\b/g, " hba1c "],
  [/\blumbo[\s-]?sacral\b|\bl\.?\s?s\.?\s?spine\b/g, " lumbar spine "],
  [/\bbilateral\b|\bboth\b/g, " both "],
  [/\blat\b/g, " lateral "],
  [/\bplain\b|\bnon[\s-]?contrast\b|\bwithout contrast\b/g, " without contrast "],
];

/** Modalities are a constraint, not a clue: an MRI is never matched to an X-ray of the same joint. */
const MODALITIES = ["xray", "usg", "mri", "ct", "ecg", "echocardiography", "doppler"];

const STOP = new Set(
  "a an and of the for to in on at by or etc per one two three film view rt lt right left test scan study profile including incl with without single region please advised adv do".split(
    " ",
  ),
);

function fold(s: string): string {
  let t = " " + s.toLowerCase().replace(/\bb\/l\b/g, " both ").replace(/[^a-z0-9]+/g, " ") + " ";
  // "x-ray" and "l-s spine" lose their hyphen above, so match the spaced forms too.
  for (const [re, to] of SYNONYMS) t = t.replace(re, to);
  return t.replace(/\s+/g, " ").trim();
}

/** "ankles" and "ankle", "views" and "view", are the same word to a price list. */
const stem = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

const words = (folded: string) => folded.split(" ").map(stem).filter((w) => w && !STOP.has(w));
const tokens = (s: string) => words(fold(s));

export interface Catalogue {
  tests: DiagnosticTest[];
  folded: string[];
  toks: Set<string>[];
  idf: Map<string, number>;
}

export function catalogue(tests: DiagnosticTest[]): Catalogue {
  const folded = tests.map((t) => fold(t.name));
  const toks = folded.map((f) => new Set(words(f)));
  const df = new Map<string, number>();
  for (const s of toks) for (const w of s) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = new Map([...df].map(([w, n]) => [w, Math.log(1 + tests.length / n)]));
  return { tests, folded, toks, idf };
}

/**
 * The CGHS tests closest to a phrase, best first. A test of another modality
 * is never offered; "with contrast" and "both joints" are only preferred when
 * the phrase asks for them, because a report that says "MRI ankle" means the
 * plain single-joint study.
 */
export interface Scored {
  test: DiagnosticTest;
  score: number;
  /** How much of the phrase, weighted by how telling each word is, the test's name accounts for. */
  coverage: number;
}

export function matchTests(cat: Catalogue, phrase: string, limit = 6): Scored[] {
  const f = fold(phrase);
  const want = new Set(tokens(phrase));
  const modality = MODALITIES.find((m) => want.has(m)) ?? null;
  const contrast = /\bcontrast\b/.test(f) && !/without contrast/.test(f);
  const both = want.has("both");

  const total = [...want].reduce((sum, w) => sum + (cat.idf.get(w) ?? Math.log(1 + cat.tests.length)), 0);
  const scored: Scored[] = [];
  cat.tests.forEach((test, i) => {
    const have = cat.toks[i];
    if (modality && !have.has(modality)) return;
    let score = 0;
    let body = 0;
    for (const w of want) {
      if (!have.has(w)) continue;
      const weight = cat.idf.get(w) ?? 0;
      score += weight;
      if (!MODALITIES.includes(w) && w !== "contrast" && w !== "both") body += weight;
    }
    // Something beyond the modality has to agree, or "MRI" alone would pick the first MRI in the list.
    if (body === 0 && !(modality && [...want].every((w) => MODALITIES.includes(w)))) return;
    const withContrast = / with contrast/.test(" " + cat.folded[i]) && !/without contrast/.test(cat.folded[i]);
    if (withContrast !== contrast) score -= 1.5;
    if (have.has("both") !== both) score -= 1;
    // Among equals, the shorter name is the more specific match.
    const coverage = total ? [...want].filter((w) => have.has(w)).reduce((sum, w) => sum + (cat.idf.get(w) ?? 0), 0) / total : 0;
    score -= 0.02 * have.size;
    scored.push({ test, score, coverage });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * The one test a phrase means, or null. It has to account for most of the
 * phrase: a name that shares one common word ("blood") with a line that is
 * about something else is a coincidence, not a match.
 */
export const MIN_COVERAGE = 0.5;
export function bestMatch(cat: Catalogue, phrase: string): DiagnosticTest | null {
  const top = matchTests(cat, phrase, 1)[0];
  return top && top.coverage >= MIN_COVERAGE ? top.test : null;
}

// ── Matching a treatment to a priced procedure ──────────────────────────────

// The phrase map lives in the engine now, shared with the policy reader.
export { procedureFor };

// ── Reading ─────────────────────────────────────────────────────────────────

interface Raw {
  patient?: { name?: unknown; age?: unknown };
  onsetDate?: unknown;
  diagnosis?: { text?: unknown; quote?: unknown } | null;
  tests?: { asWritten?: unknown; standard?: unknown; quote?: unknown }[];
  treatment?: { text?: unknown; quote?: unknown; procedureId?: unknown } | null;
  medicines?: unknown[];
}

const str = (v: unknown, max = 300): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

function system(procedures: Procedure[]): string {
  return `You read an Indian medical report or prescription so that ClaimCast can work out what the
tests and treatment it asks for will cost. You do not give medical advice, and you never add
anything the report does not say.

Reply with JSON only -- no prose, no markdown fence -- in exactly this shape:
{
  "patient": { "name": string or null, "age": integer or null },
  "onsetDate": "YYYY-MM-DD" or null,
  "diagnosis": { "text": string, "quote": string } or null,
  "tests": [ { "asWritten": string, "standard": string, "quote": string } ],
  "treatment": { "text": string, "quote": string, "procedureId": string or null } or null,
  "medicines": [ string ]
}

Rules:
- "quote" is copied from the report character for character: a short run of under 120 characters
  that contains the item. Never paraphrase a quote.
- "diagnosis": the diagnosis or impression in plain words, e.g. "Fracture of the right ankle
  (bimalleolar)".
- "tests": every investigation the report asks for or reports on -- X-ray, MRI, CT, ultrasound,
  ECG, echo, blood and urine tests. One entry per test. "standard" is its plain standard name, e.g.
  "MRI ankle without contrast", "X-ray ankle AP and lateral", "Complete blood count".
- "treatment": the operation or hospital treatment the report advises, if it advises one.
  "procedureId" is an id from the list below ONLY if it is that same operation; otherwise null.
  Never pick one because it is merely similar.
- "onsetDate": the date of the injury or when the illness began, only if the report gives it.
  Dates on Indian reports are day/month/year.
- "medicines": each medicine with its strength, as written.

PROCEDURES:
${procedures.map((p) => `${p.id}: ${p.name}`).join("\n")}`;
}

function parseJson(text: string): Raw {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw Object.assign(new Error("The model did not return JSON."), { status: 502 });
  return JSON.parse(body.slice(start, end + 1)) as Raw;
}

/** Day/month/year as Indian reports write it, to YYYY-MM-DD; null if it is not a real past date. */
export function isoDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  let y: number, m: number, d: number;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) {
    [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
    if (y < 100) y += 2000;
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (date.getTime() > Date.now() || y < 1900) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const MODALITY_WORD =
  /\b(x[\s-]?rays?|radiograph|mri|ct[\s-]?scan|ncct|cect|hrct|usg|ultrasound|sonography|doppler|ecg|ekg|2\s?d\s?echo|echocardiograph\w*|cbc|ha?emogram|complete blood count|lft|kft|rft|liver function|kidney function|renal function|lipid profile|thyroid|tsh|hba1c|blood sugar|fbs|ppbs|rbs|urine routine|serum \w+)\b/i;

/** A line that advises an operation or a hospital treatment. */
const OPERATION =
  /\borif\b|fixation|plating|replacement|arthroplasty|ectomy|angioplasty|bypass|caesarean|\blscs\b|c[\s-]section|dialysis|chemotherapy|surgery|operation|posted for/i;

/**
 * The same reading with no model: lines and keywords. Used when no provider
 * is configured or the model fails, so a report can always be read -- less
 * well, and said to be.
 */
export function readByRules(pages: string[], procedures: Procedure[]): Raw {
  const lines = pages.flatMap((p) => p.split(/\r?\n/)).map((l) => l.trim()).filter(Boolean);
  const all = lines.join("\n");

  const label = (re: RegExp) => {
    for (const l of lines) {
      const m = l.match(re);
      if (m && m[1]?.trim()) return { text: m[1].trim().replace(/[.;,]$/, ""), quote: l };
    }
    return null;
  };

  const diagnosis = label(/^(?:provisional\s+)?(?:diagnosis|impression|dx|diag\.?)\s*[:\-–]\s*(.+)$/i);
  const tests: Raw["tests"] = [];
  for (const l of lines) {
    if (!MODALITY_WORD.test(l)) continue;
    const body = l.replace(/^(?:investigations?|inv|tests?|plan|rx|adv(?:ised)?)(?:\s+(?:advised|adv|done))?\s*[:\-–.]\s*/i, "");
    for (const seg of body.split(/[,;+]|\band\b|\s\/\s/i)) {
      let s = seg.trim().replace(/^[-•*\d.)\s]+/, "").replace(/\s*\([^)]*\)?\s*$/, "");
      // "X-ray Lt ankle AP/Lat: displaced fracture…" is a test and its finding; keep the test.
      const colon = s.indexOf(":");
      if (colon > 0 && MODALITY_WORD.test(s.slice(0, colon))) s = s.slice(0, colon).trim();
      if (s && MODALITY_WORD.test(s)) tests.push({ asWritten: s, standard: s, quote: s });
    }
  }
  const treatLine = lines.find((l) => OPERATION.test(l) || (procedureFor(l, procedures) !== null && !MODALITY_WORD.test(l)));
  const medicines = lines
    .filter((l) => /^(?:\d+[.)]\s*)?(tab|cap|inj|syp|syr|oint|gel|t\.|c\.)\b/i.test(l))
    .map((l) => l.replace(/^\d+[.)]\s*/, ""));
  const age = all.match(/\b(?:age|aged)\s*[:\-]?\s*(\d{1,3})\b|\b(\d{1,3})\s*(?:y|yrs?|years?)(?:\s*\/\s*[mf])?\b/i);
  const name = all.match(/\b(?:patient(?:'s)?\s*name|name|pt\.?\s*name)\s*[:\-]\s*([A-Za-z][A-Za-z .]{1,60}?)(?=\s{2,}|\s*(?:age|sex|\d|$))/im);
  const onset = all.match(/\b(?:date of injury|injury on|injured on|d\.?o\.?i\.?|onset|since)\s*[:\-]?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i);

  return {
    patient: { name: name?.[1] ?? null, age: age ? Number(age[1] ?? age[2]) : null },
    onsetDate: onset?.[1] ?? null,
    diagnosis,
    tests,
    treatment: treatLine
      ? { text: treatLine, quote: treatLine, procedureId: procedureFor(`${diagnosis?.text ?? ""} ${treatLine}`, procedures) }
      : null,
    medicines,
  };
}

/**
 * Read the report and check the reading. `pages` is the report's text, one
 * entry per page; a photo or typed text is one page.
 */
export async function readReport(
  pages: string[],
  meta: { filename: string; source: HealthReading["source"] },
  cat: Catalogue,
  procedures: Procedure[],
  onWarn?: (message: string) => void,
): Promise<HealthReading> {
  let raw: Raw | null = null;
  let model = "rules";
  const text = pages.map((p, i) => `[page ${i + 1}]\n${p}`).join("\n\n").slice(0, 24000);
  // Open models occasionally answer in prose instead of the JSON asked for:
  // one more try, told so, as the chat does. No provider at all is not retried.
  for (let attempt = 0; attempt < 2 && raw === null; attempt++) {
    try {
      const r = await chat(
        attempt === 0 ? system(procedures) : system(procedures) + "\n\nYour last reply was not valid JSON. Reply with the JSON object only.",
        "REPORT:\n" + text,
      );
      raw = parseJson(r.text);
      model = `${r.used.provider}/${r.used.model}`;
    } catch (e) {
      // The provider's message only, never the report.
      onWarn?.(e instanceof Error ? e.message.slice(0, 200) : String(e));
      if ((e as { status?: number }).status === 503) break;
    }
  }
  // No provider, or one that failed twice: the rules still read the report, and the screen says which read it.
  if (raw === null) raw = readByRules(pages, procedures);

  let unverified = 0;
  const quote = (q: unknown) => {
    const text = str(q, 500);
    if (!text) return null;
    const page = locate(pages, text);
    if (page === null) unverified++;
    return { text, page, verified: page !== null };
  };

  const known = new Set(procedures.map((p) => p.id));
  const seen = new Set<string>();
  const tests: ReadTest[] = [];
  for (const t of (Array.isArray(raw.tests) ? raw.tests : []).slice(0, 20)) {
    const asWritten = str(t?.asWritten, 200) ?? str(t?.standard, 200);
    if (!asWritten) continue;
    const standard = str(t?.standard, 200) ?? asWritten;
    // Both phrasings are tried: the model's standard name usually matches
    // better, but the doctor's own words are the ones on the page.
    const ranked = [...matchTests(cat, standard, 8), ...matchTests(cat, asWritten, 8)]
      .sort((a, b) => b.score - a.score)
      .filter((x, i, all) => all.findIndex((y) => y.test.code === x.test.code) === i);
    const match = ranked[0] && ranked[0].coverage >= MIN_COVERAGE ? ranked[0].test : null;
    const key = match?.code ?? "?" + asWritten.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tests.push({ asWritten, quote: quote(t?.quote), match, candidates: ranked.slice(0, 8).map((x) => x.test) });
  }

  const treatText = str(raw.treatment?.text);
  const named = str(raw.treatment?.procedureId, 60);
  const treatment = treatText
    ? {
        text: treatText,
        quote: quote(raw.treatment?.quote),
        procedureId: named && known.has(named) ? named : procedureFor(`${str(raw.diagnosis?.text) ?? ""} ${treatText}`, procedures),
      }
    : null;

  const diagText = str(raw.diagnosis?.text);
  const age = typeof raw.patient?.age === "number" ? Math.round(raw.patient.age) : Number(str(raw.patient?.age, 3));
  // Only a date that is written in the report. A model will happily work one
  // out from "fever since 2 days" and the date of the visit; that is a guess,
  // and it would decide whether an illness counts as pre-existing.
  const written = new Set(
    pages
      .flatMap((p) => p.match(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g) ?? [])
      .map(isoDate)
      .filter((d): d is string => d !== null),
  );
  const said = str(raw.onsetDate, 20);
  const onset = said && isoDate(said) && written.has(isoDate(said)!) ? said : null;

  return HealthReadingSchema.parse({
    filename: meta.filename.slice(0, 200),
    source: meta.source,
    model,
    readAt: new Date().toISOString(),
    patient: {
      name: str(raw.patient?.name, 120),
      age: Number.isInteger(age) && age >= 0 && age <= 120 ? age : null,
    },
    onsetDate: onset ? isoDate(onset) : null,
    diagnosis: diagText ? { text: diagText, quote: quote(raw.diagnosis?.quote) } : null,
    tests,
    treatment,
    medicines: (Array.isArray(raw.medicines) ? raw.medicines : [])
      .map((m) => str(m, 200))
      .filter((m): m is string => m !== null)
      .slice(0, 30),
    unverified,
  });
}
