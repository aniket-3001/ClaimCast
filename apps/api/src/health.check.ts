/**
 * Does a health report read back to what the doctor wrote, and does each test
 * land on the right CGHS rate?
 *
 * No model and no key: the matcher and the rules reader are deterministic, and
 * they are what stands between a model's reading and a price. The CGHS list is
 * the one seeded into the database, so a re-issued Memorandum that renames a
 * scan fails here rather than on a family's screen.
 *
 * Run: npm run check --workspace @claimcast/api
 */

import "./env.js";
import { PROCEDURES } from "@claimcast/engine/fixtures";
import { bestMatch, catalogue, isoDate, locate, matchTests, procedureFor, readByRules, readReport } from "./health.js";
import { db } from "./reference.js";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${what}`);
};

const rows = await db.diagnosticTest.findMany();
check(rows.length > 700, `the CGHS investigation list is seeded (${rows.length} tests)`);
const cat = catalogue(rows.map((r) => ({ code: r.code, name: r.name, specialty: r.specialty, nonNabh: r.nonNabh, nabh: r.nabh })));

const WANT: [string, string][] = [
  ["X-ray Rt ankle AP/Lat", "RI037"],
  ["MRI Rt ankle", "RI110"],
  ["MRI ankle with contrast", "RI111"],
  ["MRI both ankles", "RI113"],
  ["NCCT head", "RI062"],
  ["CBC", "LB012"],
  ["LFT", "LB124"],
  ["KFT", "LB123"],
  ["2D Echo", "RI001"],
  ["ECG", "CI001"],
  ["USG whole abdomen", "RI020"],
  ["MRI LS spine", "RI136"],
  ["HbA1c", "LB122"],
  ["X ray chest PA view", "RI034"],
];
const wrong = WANT.filter(([phrase, code]) => bestMatch(cat, phrase)?.code !== code);
check(
  wrong.length === 0,
  wrong.length
    ? `test matching: ${wrong.map(([p, c]) => `"${p}" gave ${bestMatch(cat, p)?.code ?? "nothing"}, want ${c}`).join("; ")}`
    : `${WANT.length} tests as reports write them land on the right CGHS code`,
);
check(
  matchTests(cat, "MRI knee").every((m) => /\bMRI\b/i.test(m.test.name)),
  "an MRI is never matched to an X-ray or a CT of the same joint",
);
check(bestMatch(cat, "blood transfusion ward round") === null, "a phrase that is no test matches nothing rather than something");

const REPORT = `CITY ORTHO CLINIC
Patient Name: Ravi Kumar   Age: 34 Y / M
Date: 14/09/2026
Date of injury: 12/09/2026
C/o pain and swelling right ankle after fall from stairs
Diagnosis: Bimalleolar fracture right ankle
Investigations: X-ray Rt ankle AP/Lat, MRI Rt ankle
Advised: ORIF with plating under spinal anaesthesia
Rx
1. Tab Zerodol-SP 1-0-1 x 5 days
2. Tab Pantop 40 mg 1-0-0
3. Cap Shelcal 500 1-0-0`;

const raw = readByRules([REPORT], PROCEDURES);
check(raw.diagnosis?.text === "Bimalleolar fracture right ankle", "rules: the diagnosis line is read");
check(raw.tests?.length === 2, `rules: two tests found (${raw.tests?.map((t) => t.asWritten).join(" | ")})`);
check(raw.treatment?.procedureId === "p-ankle-orif", "rules: ORIF on an ankle is the priced ankle fixation");
check(raw.medicines?.length === 3, "rules: three medicines");
check(raw.patient?.age === 34 && raw.patient?.name === "Ravi Kumar", "rules: patient name and age");
check(raw.onsetDate === "12/09/2026", "rules: the date of injury, not the date of the visit");

// The whole reading with no provider configured: it must fall back to the rules
// rather than fail, and every quote must be found in the report.
const keys = ["OPENROUTER_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "VERTEX_PROJECT"] as const;
const saved = keys.map((k) => process.env[k]);
for (const k of keys) delete process.env[k];
const reading = await readReport([REPORT], { filename: "report.txt", source: "text" }, cat, PROCEDURES);
keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
check(reading.model === "rules", "with no model configured, the rules read the report");
check(
  reading.tests.map((t) => t.match?.code).join(",") === "RI037,RI110",
  `the report's X-ray and MRI are priced as RI037 and RI110 (${reading.tests.map((t) => t.match?.code).join(",")})`,
);
check(reading.unverified === 0 && reading.tests.every((t) => t.quote?.verified), "every quote is found in the report");
check(reading.onsetDate === "2026-09-12" && reading.treatment?.procedureId === "p-ankle-orif", "injury date and operation carried through");

check(locate([REPORT], "Diagnosis: Trimalleolar fracture") === null, "a quote that is not in the report is caught");
check(locate([REPORT], "diagnosis:   bimalleolar fracture") === 1, "a quote differing only in case and spacing is found");
check(isoDate("12/09/2026") === "2026-09-12" && isoDate("31/02/2026") === null && isoDate("01/01/2999") === null, "dates read day-first, and impossible or future ones refused");
check(
  procedureFor("Lap. chole for gall stones", PROCEDURES) === "p-chole" &&
    procedureFor("Plaster for 6 weeks, review", PROCEDURES) === null &&
    procedureFor("Age: 45, fever", PROCEDURES) === null,
  "a treatment only matches the operation it names",
);

await db.$disconnect();
console.log(
  failures
    ? `\nhealth — ${failures} failed`
    : "health — reports read to the doctor's own lines, tests priced against the right CGHS codes, and nothing made up survives",
);
if (failures) process.exit(1);
