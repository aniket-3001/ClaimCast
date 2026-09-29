/**
 * Saved sessions and the chatbox's memory, against the database.
 *
 * A session saves with the engine's outcome; saving again from the same browser
 * updates rather than duplicates; the admin list and detail read it back; and
 * only clean answers become memory, recalled by how alike the questions are.
 *
 * Run: npm run check --workspace @claimcast/api (needs the database up)
 */

import { PrismaClient } from "@prisma/client";
import { setRegistry, type CaseInput } from "@claimcast/engine";
import { FIXTURES } from "@claimcast/engine/fixtures";
import { chatMemory, listSessions, recall, saveSession, sessionDetail } from "./sessions.js";

const db = new PrismaClient();
setRegistry(FIXTURES);
const failures: string[] = [];
const ok = (cond: boolean, why: string) => {
  if (!cond) failures.push(why);
};

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
const MARK = "sessions.check " + Date.now();

const first = await saveSession(db, null, {
  name: MARK,
  case: input,
  chat: [
    { question: "Why is my room rent refused?", answer: "Because the room is above the limit.", factIds: ["F6"], unsupportedFigures: [], model: "t" },
    { question: "What will I pay in total?", answer: "About ₹9,99,999.", factIds: [], unsupportedFigures: ["₹9,99,999"], model: "t" },
  ],
});
const again = await saveSession(db, null, { id: first.id, name: MARK, case: { ...input, roomClass: "semi_private" }, chat: [] });
ok(again.id === first.id && again.updated, "saving again with the id did not update the same session");

const d = await sessionDetail(db, first.id);
ok(d?.summary.patientPays === 4850000, "the updated session did not keep the engine's ₹48,500 semi-private outcome");
ok((await listSessions(db)).some((r) => r.id === first.id), "the admin list does not show the saved session");

// Memory: restore the chat, then check what is remembered and recalled.
await saveSession(db, null, {
  id: first.id,
  name: MARK,
  case: input,
  chat: [
    { question: "Why is my room rent refused?", answer: "Because the room is above the limit.", factIds: ["F6"], unsupportedFigures: [], model: "t" },
    { question: "What will I pay in total?", answer: "About ₹9,99,999.", factIds: [], unsupportedFigures: ["₹9,99,999"], model: "t" },
  ],
});
const memory = await chatMemory(db);
ok(memory.some((t) => t.question === "Why is my room rent refused?"), "a clean answer did not become memory");
ok(!memory.some((t) => t.answer.includes("9,99,999")), "an answer with an invented figure was remembered");
const hit = recall(memory, "why was the room rent cut?");
ok(hit[0]?.question === "Why is my room rent refused?", "recall did not bring back the most similar past question");

// ── Everyone gets a UUID, kept across saves, never shared ─────────────────
const fam = [
  { role: "self" as const, name: "Ravi Kumar", age: 40 },
  { role: "patient" as const, name: "Sita Kumar", age: 68 },
  { role: "family" as const, relation: "son" as const, name: "Ravi", age: 12 },
  { role: "family" as const, relation: "son" as const, name: "Ravi", age: 9 },
];
const s1 = await saveSession(db, null, { name: MARK, case: input, people: fam });
const uids = s1.people.map((p) => p.uid);
ok(new Set(uids).size === 4, "four people did not get four different UUIDs");
ok(uids.every((u) => /^[0-9a-f-]{36}$/.test(u)), "a person id is not a UUID");
// Save again with the uids: same people, same ids; one son removed.
const s2 = await saveSession(db, null, { id: s1.id, name: MARK, case: input, people: s1.people.slice(0, 3) });
ok(JSON.stringify(s2.people.map((p) => p.uid)) === JSON.stringify(uids.slice(0, 3)), "re-saving changed someone's UUID");
ok((await db.person.count({ where: { sessionId: s1.id } })) === 3, "a removed family member was not deleted");
// A uid sent twice, or borrowed from another session, is replaced rather than shared.
const other = await saveSession(db, null, { name: MARK, case: input, people: [{ role: "self", uid: uids[0], name: "X", age: 30 }] });
ok(other.people[0].uid !== uids[0], "a UUID from another session was reused");
const dup = await saveSession(db, null, { id: s1.id, name: MARK, case: input, people: [s2.people[0], s2.people[0]] });
ok(dup.people[0].uid !== dup.people[1].uid, "the same UUID was given to two people");
const back = await sessionDetail(db, s1.id);
ok(back?.people.length === 2 && back.people[0].name === "Ravi Kumar", "the admin detail does not show the people saved");
await db.savedSession.deleteMany({ where: { id: { in: [s1.id, other.id] } } });

// A confirmed health report is kept with the session, and saving without one clears it.
const health = {
  filename: "report.pdf",
  diagnosis: "Bimalleolar fracture, left ankle",
  tests: [{ code: "RI110", name: "MRI Ankle Single joint - Without contrast", specialty: "Radiological Investigation", nonNabh: 297500, nabh: 350000, asWritten: "MRI Lt ankle" }],
  treatment: "ORIF",
  procedureId: null,
  medicines: [],
};
const h1 = await saveSession(db, null, { name: MARK, case: input, health });
const hBack = await sessionDetail(db, h1.id);
ok(hBack?.health?.tests[0]?.code === "RI110" && hBack.health.diagnosis === health.diagnosis, "the health report did not come back with the session");
await saveSession(db, null, { id: h1.id, name: MARK, case: input, health: null });
ok((await sessionDetail(db, h1.id))?.health === null, "removing the health report and saving again did not clear it");
await db.savedSession.delete({ where: { id: h1.id } });

await db.savedSession.delete({ where: { id: first.id } });
await db.$disconnect();

if (failures.length) {
  for (const f of failures) console.error("  " + f);
  console.error("sessions — " + failures.length + " failed");
  process.exit(1);
}
console.log("sessions — saved with the engine's outcome, updated not duplicated, everyone given a stable unique UUID, the health report kept and cleared, and only clean answers remembered");
