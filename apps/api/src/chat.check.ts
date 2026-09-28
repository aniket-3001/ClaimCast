/**
 * The half of the chatbox that needs no API key: are the engine's facts the
 * figures the screens show, does grounding catch a rupee figure the model made
 * up and a quote that is not in the document, and does an uploaded policy get
 * priced without leaking into the registry afterwards?
 *
 * The model is never the thing being marked. Canned replies stand in for it.
 *
 * Run: npm run check --workspace @claimcast/api
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { caseFacts, evaluate, registry, repair, setRegistry, withPolicy, type CaseInput } from "@claimcast/engine";
import { FIXTURES } from "@claimcast/engine/fixtures";
import { buildPrompt, groundChat, rupeeFigures } from "./chat.js";
import { pageText } from "./extract.js";

const failures: string[] = [];
const check = (name: string, cond: boolean, detail: string) => {
  if (!cond) failures.push(`${name}: ${detail}`);
};

setRegistry(FIXTURES);

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const pages = await pageText(
  await readFile(join(REPO, "presentation deck", "mockup documents", "policy-schedule.pdf")),
);

// The reference admission the deck is built on: private room at Meridian.
const input: CaseInput = {
  hospitalId: "h-meridian",
  procedureId: "p-spine-fusion",
  policyId: "pol-classic",
  roomClass: "private",
  route: "cashless",
  days: 5,
  icuDays: 0,
  siUsed: 0,
  implantId: "imported",
  admittedInpatient: true,
  age: 45,
  hasPmjayCard: false,
  govtEmployeeOrPensioner: false,
  esiInsured: false,
  preExisting: false,
};
const facts = caseFacts(evaluate(repair(input)));
const all = facts.map((f) => f.text).join("\n");

// ── The facts are the screens' figures ───────────────────────────────────

check("outcome fact", all.includes("₹1,26,900"), "the family's ₹1,26,900 is not in the facts");
check("the room choice", all.includes("₹48,500"), "the semi-private ₹48,500 is not in the facts");
check(
  "clauses cited",
  facts.some((f) => f.clause === "PROPORTIONATE" && f.text.includes("IRDAI/HLT/REG/CIR/151/06/2020")),
  "no proportionate-deduction fact carries its circular",
);
check("ids are unique", new Set(facts.map((f) => f.id)).size === facts.length, "duplicate fact ids");

// ── Grounding ────────────────────────────────────────────────────────────

const room = facts.find((f) => f.text.includes("₹48,500"))!;
const good = groundChat({
  rawModelText: JSON.stringify({
    answer: "You pay ₹1,26,900 in a private room. A semi-private room brings that to ₹48,500.",
    facts: ["F3", room.id, "F999"],
    citations: [{ quote: "Room rent ₹5,000 per day", page: 3 }],
  }),
  facts,
  pages,
  retrievedPages: [3],
  model: "test/canned",
});
check("figures from facts pass", good.unsupportedFigures.length === 0, "flagged " + good.unsupportedFigures.join(", "));
check("unknown fact ids dropped", good.facts.every((f) => f.id !== "F999"), "an invented fact id survived");
check("real quote verifies", good.citations[0]?.verified === true, "a quote that is on page 3 did not verify");

const invented = groundChat({
  rawModelText: JSON.stringify({
    answer: "Roughly ₹99,999 of it comes back if you switch, and the policy caps rooms at Rs. 5,000.",
    facts: [],
    citations: [{ quote: "Room rent ₹7,500 per day", page: 3 }],
  }),
  facts,
  pages,
  retrievedPages: [3],
  model: "test/canned",
});
check(
  "an invented figure is caught",
  invented.unsupportedFigures.includes("₹99,999"),
  "₹99,999 was not flagged; got " + JSON.stringify(invented.unsupportedFigures),
);
check("a fabricated quote is caught", invented.unverified === 1, "a quote not in the document verified");

// A figure that only a verified quote supports is allowed; the same figure
// with no document behind it is not.
const quoted = groundChat({
  rawModelText: JSON.stringify({
    answer: "The schedule sets the implant sub-limit at ₹80,000.",
    facts: [],
    citations: [{ quote: "Implant / prosthesis sub-limit ₹80,000", page: 3 }],
  }),
  facts: facts.filter((f) => !f.text.includes("₹80,000")),
  pages,
  retrievedPages: [3],
  model: "test/canned",
});
check("a figure from a verified quote passes", quoted.unsupportedFigures.length === 0, "₹80,000 from the schedule was flagged");

check(
  "rupee parsing",
  JSON.stringify(rupeeFigures("₹1,26,900 or Rs. 5,000 or INR 48500 or ₹1.2 L").map((x) => x.paise)) ===
    JSON.stringify([12690000, 500000, 4850000, 12000000]),
  "rupeeFigures misread a figure: " + JSON.stringify(rupeeFigures("₹1,26,900 or Rs. 5,000 or INR 48500 or ₹1.2 L")),
);
check("prompt carries the facts", buildPrompt(facts, null).includes(facts[0].text), "facts missing from prompt");

// ── An uploaded policy is priced, then removed ───────────────────────────

const uploaded = { ...FIXTURES.policies.find((p) => p.id === "pol-classic")!, id: "pol-uploaded", roomCapPerDay: 1_000_000 };
const upFacts = withPolicy(uploaded, () => caseFacts(evaluate(repair({ ...input, policyId: "pol-uploaded" }))));
check(
  "uploaded policy priced",
  upFacts.some((f) => f.text.includes("room rent limit ₹10,000 a day")),
  "the uploaded policy's ₹10,000 room limit is not in its facts",
);
check(
  "registry restored",
  !registry().policies.some((p) => p.id === "pol-uploaded"),
  "the uploaded policy was left installed after the request",
);

if (failures.length) {
  for (const f of failures) console.error("  " + f);
  console.error("chat — " + failures.length + " failed");
  process.exit(1);
}
console.log(
  `chat — ${facts.length} engine facts for the reference admission; invented figures and quotes are caught, ` +
    "and an uploaded policy is priced without staying installed",
);
