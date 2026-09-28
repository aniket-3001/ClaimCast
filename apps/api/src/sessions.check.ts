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

await db.savedSession.delete({ where: { id: first.id } });
await db.$disconnect();

if (failures.length) {
  for (const f of failures) console.error("  " + f);
  console.error("sessions — " + failures.length + " failed");
  process.exit(1);
}
console.log("sessions — saved with the engine's outcome, updated not duplicated, and only clean answers are remembered and recalled");
