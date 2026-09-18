/**
 * Ask a real model to read the real schedule, and score what comes back.
 *
 * `extract.check.ts` proves the answer key is quotable from the document and
 * needs no key and no network. This is the other half: it spends money, it
 * depends on someone else's uptime, and it is the only thing that can tell you
 * whether the provider you are about to demo on can actually read the page.
 *
 * Deliberately **not** part of `npm run check`. A suite that fails because a
 * third party rate-limited you teaches people to ignore the suite.
 *
 * What it fails on is narrow and chosen. Not accuracy -- a model that leaves a
 * field blank has behaved correctly under the instructions it was given, and a
 * field read wrong but cited to a quote that does not exist is caught by the
 * verification pass and shown to the reader in amber. The one outcome nobody
 * downstream can catch is a **wrong value carrying a citation that checks out**,
 * because that reaches the screen looking exactly like a right one. That is the
 * only condition that exits non-zero.
 *
 * Run: npm run extract:live --workspace @claimcast/api
 *      EXTRACTION_PROVIDER=groq npm run extract:live --workspace @claimcast/api
 */

import "./env.js";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXTRACTED_FIELDS } from "@claimcast/contracts";
import { extractPolicy } from "./extract.js";
import { FIELD_TYPES, chosen } from "./models.js";
import { CITED, UNSTATED } from "./schedule.target.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PDF = join(REPO, "presentation deck", "mockup documents", "policy-schedule.pdf");

const pick = chosen();
if (!pick) {
  console.error("No provider configured. Set GEMINI_API_KEY, GROQ_API_KEY or ANTHROPIC_API_KEY.");
  process.exit(2);
}

console.log(`Reading policy-schedule.pdf with ${pick.provider}/${pick.model} ...`);

const started = Date.now();
const { extraction } = await extractPolicy(await readFile(PDF), "policy-schedule.pdf", "live-check");
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

/**
 * Does the answer agree with the key?
 *
 * Exact for anything that is priced. Lenient for the two string fields, because
 * they are labels and the model was told to quote the document rather than to
 * match a fixture: asked for the insurer "as printed", a correct reading returns
 * "SANRAKSHAN GENERAL Insurance Company Limited" where the demo's fixture
 * carries the trading name "Sanrakshan General". Marking that wrong grades the
 * model against a house style nobody told it about, and then the real failures
 * are buried in noise.
 */
function agrees(want: unknown, got: unknown): boolean {
  if (want === got) return true;
  if (typeof want === "string" && typeof got === "string") {
    const a = want.toLowerCase().replace(/\s+/g, " ").trim();
    const b = got.toLowerCase().replace(/\s+/g, " ").trim();
    return a.includes(b) || b.includes(a);
  }
  return false;
}

let right = 0;
let cited = 0;
const confidentlyWrong: string[] = [];
const rows: string[] = [];

for (const f of EXTRACTED_FIELDS) {
  const want = CITED[f].value;
  const got = extraction.fields[f];

  // The contract requires every field, so this cannot happen -- but the parse
  // that guarantees it is one refactor away from someone, and a missing field
  // silently scoring as a gap would flatter the provider rather than fail.
  if (!got) {
    confidentlyWrong.push(`${f}: the extraction has no entry for this field at all.`);
    rows.push(`  MISSING ${"-".padEnd(10)} ${f.padEnd(23)} -`);
    continue;
  }

  const ok = agrees(want, got.value);
  const verified = got.verified;

  if (ok) right++;
  if (verified) cited++;

  // The dangerous case, and the only one that fails the run -- restricted to the
  // fields that move money. A label read more fully than the fixture writes it
  // changes what is printed at the top of the page and nothing that is added up.
  if (!ok && got.value !== null && verified && FIELD_TYPES[f] !== "string") {
    confidentlyWrong.push(
      `${f}: answered ${JSON.stringify(got.value)} (want ${JSON.stringify(want)}) ` +
        `and the quote "${got.span?.text ?? ""}" is genuinely in the document.`,
    );
  }

  const mark = ok ? "ok   " : got.value === null ? "gap  " : "WRONG";
  const cite = verified ? "cited" : got.span ? "UNVERIFIED" : "-";
  rows.push(`  ${mark} ${cite.padEnd(10)} ${f.padEnd(23)} ${JSON.stringify(got.value)}`);
}

// Three fields are not in this document and correctly carry no citation.
// Scoring those against the full sixteen reports a shortfall that is really the
// extractor doing as it was told, which is the kind of number that gets quoted
// back later as a weakness.
const quotable = EXTRACTED_FIELDS.filter((f) => CITED[f].span !== null).length;

console.log(rows.join("\n"));
console.log(
  `\n${pick.provider}/${pick.model} — ${right}/${EXTRACTED_FIELDS.length} values match the key, ` +
    `${cited}/${quotable} spans verified ` +
    `(${EXTRACTED_FIELDS.length - quotable} fields the document does not state), ${elapsed}s`,
);

// A pinned gap that the model filled in anyway is worth saying out loud: it means
// the model computed a figure the document does not carry, which is the exact
// instruction it was given not to follow.
for (const f of UNSTATED) {
  const supplied = extraction.fields[f]?.value;
  if (supplied !== null && supplied !== undefined) {
    console.log(
      `  note: ${f} is not in this document, and the model supplied ` +
        `${JSON.stringify(supplied)} for it anyway.`,
    );
  }
}

if (extraction.unverified.length) {
  console.log(
    `  ${extraction.unverified.length} span(s) could not be found in the document ` +
      `and are shown to the reader as unverified: ${extraction.unverified.join(", ")}`,
  );
}

if (confidentlyWrong.length) {
  console.error("\nWrong values wearing a verified citation:");
  for (const c of confidentlyWrong) console.error("  " + c);
  process.exit(1);
}
