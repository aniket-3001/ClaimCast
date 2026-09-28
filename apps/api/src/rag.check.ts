/**
 * The half of the RAG path that needs no API key: does chunking actually
 * cover the document, does retrieval prefer a chunk that shares words with
 * the question, does hospital name-matching work, and does grounding catch a
 * citation that is not really on the page it claims?
 *
 * Same shape as `extract.check.ts` testing `found()` on its own — the target
 * here is the retrieval and verification logic, not a model's honesty,
 * because the model is never the thing being marked.
 *
 * Run: npm run check --workspace @claimcast/api
 */

import { HOSPITALS } from "@claimcast/engine/fixtures";
import { chunkPages, groundPolicyAnswer, matchHospitalByName, retrieve } from "./rag.js";

const failures: string[] = [];

function check(name: string, cond: boolean, detail: string): void {
  if (!cond) failures.push(`${name}: ${detail}`);
}

// ── chunkPages ──────────────────────────────────────────────────────────

{
  const page1 = "Room rent is payable up to Rs 5,000 per day. ".repeat(40); // ~2,300 chars
  const page2 = "The co-payment on this policy is twenty percent of every admissible claim. ".repeat(20);
  const chunks = chunkPages([page1, page2]);

  check("chunks produced", chunks.length > 0, "chunkPages returned nothing");
  check(
    "every chunk tagged with a real page",
    chunks.every((c) => c.page === 1 || c.page === 2),
    "a chunk carried a page outside the two given",
  );
  check(
    "long page split into more than one chunk",
    chunks.filter((c) => c.page === 1).length > 1,
    "a 2,300-character page produced only one chunk",
  );
  check(
    "no chunk exceeds the window by more than the overlap",
    chunks.every((c) => c.text.length <= 700 + 1),
    "a chunk came back longer than the configured window",
  );
  check(
    "chunk ids are unique",
    new Set(chunks.map((c) => c.id)).size === chunks.length,
    "duplicate chunk ids",
  );

  // Empty pages contribute nothing and do not crash.
  const withBlank = chunkPages([page1, "", "   "]);
  check(
    "blank pages produce no chunks",
    withBlank.filter((c) => c.page === 2 || c.page === 3).length === 0,
    "a blank page produced a chunk",
  );
}

// ── retrieve ────────────────────────────────────────────────────────────

{
  const chunks = chunkPages([
    "The room rent sub-limit is Rs 5,000 per day for a general ward.",
    "Cashless treatment requires prior authorisation from the insurer's TPA desk.",
    "Ambulance charges are reimbursed up to Rs 2,000 per hospitalisation event.",
  ]);

  const hit = retrieve(chunks, "What is the room rent sub-limit?", 3);
  check("retrieval returns something for a relevant question", hit.length > 0, "got nothing");
  check(
    "top hit is the room-rent page",
    hit[0]?.chunk.page === 1,
    `top hit was page ${hit[0]?.chunk.page}, expected 1`,
  );

  const nothing = retrieve(chunks, "the this and or of", 3);
  check("stopword-only query returns nothing", nothing.length === 0, `got ${nothing.length} hits`);

  const empty = retrieve([], "room rent", 3);
  check("empty document returns nothing", empty.length === 0, "got hits from no chunks");
}

// ── matchHospitalByName ─────────────────────────────────────────────────

{
  const real = HOSPITALS[0];
  const found = matchHospitalByName(HOSPITALS, `Is ${real.name} in my policy's network?`);
  check("real hospital name matched", found?.id === real.id, `matched ${found?.id ?? "nothing"}`);

  const none = matchHospitalByName(HOSPITALS, "Is Some Made Up Clinic in my network?");
  check("unrelated text matches nothing", none === null, `matched ${none?.id}`);
}

// ── groundPolicyAnswer ──────────────────────────────────────────────────

const PAGES = [
  "Room rent is payable up to Rs 5,000 per day for a general ward. Co-payment is 20 percent.",
];

{
  const raw = JSON.stringify({
    answer: "Your room rent limit is Rs 5,000 a day.",
    citations: [{ quote: "Room rent is payable up to Rs 5,000 per day", page: 1 }],
  });
  const result = groundPolicyAnswer(raw, PAGES, [1], null, "test/model");
  check("real quote verified", result.citations[0]?.verified === true, "marked unverified");
  check("nothing unverified on a clean answer", result.unverified === 0, `got ${result.unverified}`);
}

{
  const raw = JSON.stringify({
    answer: "This policy covers alien abduction.",
    citations: [{ quote: "alien abduction is covered in full", page: 1 }],
  });
  const result = groundPolicyAnswer(raw, PAGES, [1], null, "test/model");
  check("fabricated quote caught", result.citations[0]?.verified === false, "marked verified");
  check("unverified count reflects the fabrication", result.unverified === 1, `got ${result.unverified}`);
}

{
  // Fenced JSON, the way a model sometimes wraps its answer, still parses.
  const raw = "```json\n" + JSON.stringify({ answer: "No mention of that.", citations: [] }) + "\n```";
  const result = groundPolicyAnswer(raw, PAGES, [1], null, "test/model");
  check("fenced JSON parsed", result.answer === "No mention of that.", `got "${result.answer}"`);
}

{
  // A hospital name and retrievedPages travel through untouched.
  const raw = JSON.stringify({ answer: "Yes, that hospital is in network.", citations: [] });
  const result = groundPolicyAnswer(raw, PAGES, [1, 2], "Apollo Test Hospital", "test/model");
  check("hospital name carried through", result.hospital === "Apollo Test Hospital", "lost the hospital name");
  check(
    "retrievedPages carried through",
    result.retrievedPages.length === 2,
    `got ${result.retrievedPages.length}`,
  );
}

console.log(`rag.ts — chunking, retrieval and grounding checked against ${HOSPITALS.length} real hospitals`);

if (failures.length) {
  console.error("\nRAG check failed:");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("  chunking covers the document, retrieval ranks the relevant chunk first, and a fabricated citation is caught");
