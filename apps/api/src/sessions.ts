/**
 * Saved sessions: what a family did with ClaimCast, kept when they asked.
 *
 * Three uses of one table. The family's "Save my session" writes it; the admin's
 * Database reads it back, so the two sides of the product meet on real records;
 * and the chatbox recalls the answers in it as memory for later questions. The
 * engine's outcome is frozen at save time -- what they were shown -- while the
 * input is kept too, so reopening re-prices with the engine as it is now.
 */

import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  ChatTurnRecordSchema,
  ConfirmedHealthSchema,
  PolicyOwnerSchema,
  type ChatTurnRecord,
  type SaveSessionRequest,
  type SavedSessionDetail,
  type SavedSessionRow,
} from "@claimcast/contracts";
import { evaluate, familyPays, repair, withPolicy, ROOM_LABEL, registry } from "@claimcast/engine";
import { chunkPages, retrieve } from "./retrieval.js";

/** The engine's outcome for this session, priced now, as the admin will see it. */
export function summarise(req: SaveSessionRequest) {
  const run = () => {
    const e = evaluate(repair(req.case));
    const { clauses } = registry();
    // The age-group scheme, when it is the payer, replaces the policy's claim
    // rather than sitting on top of it: nothing is "refused" by a policy that
    // is not being claimed on.
    const via = familyPays(e).via;
    return {
      procedure: e.procedure.name,
      hospital: e.hospital.name,
      city: e.hospital.city,
      policy: `${e.policy.product} (${e.policy.insurer})`,
      roomClass: ROOM_LABEL[e.input.roomClass],
      billTotal: e.result.billTotal,
      // With the age scheme applied the scheme pays, not the insurer, and the family pays what it leaves.
      insurerPays: via ? 0 : e.result.insurerPays,
      patientPays: familyPays(e).amount,
      deductionTotal: via ? 0 : e.result.deductionTotal,
      deductions: (via ? [] : e.result.deductions).map((d) => ({
        line: d.line,
        amount: d.amount,
        clause: clauses[d.clause]?.cite ?? d.clause,
      })),
      repudiated: via ? null : e.result.repudiated?.reason ?? null,
      noTreatment: false,
      ageScheme: via?.label ?? null,
    };
  };
  if (req.noTreatment) {
    // The family chose "none" for the treatment: keep where and with which plan, price nothing.
    const s = req.policy ? withPolicy(req.policy, run) : run();
    return { ...s, procedure: "No treatment chosen", billTotal: 0, insurerPays: 0, patientPays: 0, deductionTotal: 0,
             deductions: [], repudiated: null, noTreatment: true, ageScheme: null };
  }
  return req.policy ? withPolicy(req.policy, run) : run();
}

export async function saveSession(db: PrismaClient, userId: string | null, req: SaveSessionRequest) {
  const data = {
    name: req.name?.trim() || null,
    policyholder: req.policyholder?.trim() || null,
    policyholderRelation: req.policyholderRelation ?? null,
    input: req.case as unknown as Prisma.InputJsonValue,
    policy: (req.policy ?? undefined) as Prisma.InputJsonValue | undefined,
    documentId: req.documentId ?? null,
    summary: summarise(req) as unknown as Prisma.InputJsonValue,
    chat: (req.chat ?? []) as unknown as Prisma.InputJsonValue,
    // The confirmed summary, never the report itself. Removing the report and
    // saving again clears it.
    health: req.health ? (req.health as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
  };
  // Updating is only ever of this browser's own record; anything else starts a new one.
  let row: { id: string; createdAt: Date } | null = null;
  let updated = false;
  if (req.id) {
    const hit = await db.savedSession.updateMany({ where: { id: req.id, userId }, data });
    if (hit.count === 1) {
      row = await db.savedSession.findUniqueOrThrow({ where: { id: req.id } });
      updated = true;
    }
  }
  if (!row) row = await db.savedSession.create({ data: { ...data, userId } });
  const people = await savePeople(db, row.id, req.people ?? []);
  return { id: row.id, createdAt: row.createdAt.toISOString(), updated, people };
}

/**
 * Give everyone in the session a UUID, and keep it.
 *
 * A person keeps the uid the browser sends back only if that uid already
 * belongs to this session; anything else -- a new person, a uid copied from
 * another session, the same uid sent twice -- gets a fresh one from the
 * server. People no longer in the list are removed.
 */
export async function savePeople(db: PrismaClient, sessionId: string, people: NonNullable<SaveSessionRequest["people"]>) {
  const existing = new Set(
    (await db.person.findMany({ where: { sessionId }, select: { id: true } })).map((p) => p.id),
  );
  const used = new Set<string>();
  const saved = people.map((p, position) => {
    const uid = p.uid && existing.has(p.uid) && !used.has(p.uid) ? p.uid : randomUUID();
    used.add(uid);
    return { uid, role: p.role, relation: p.relation ?? null, name: p.name ?? "", age: p.age ?? null, position };
  });
  await db.$transaction([
    db.person.deleteMany({ where: { sessionId, id: { notIn: saved.map((p) => p.uid) } } }),
    ...saved.map((p) => {
      const fields = { role: p.role, relation: p.relation, name: p.name || null, age: p.age, position: p.position };
      return db.person.upsert({ where: { id: p.uid }, create: { id: p.uid, sessionId, ...fields }, update: fields });
    }),
  ]);
  return saved.map(({ position: _position, ...p }) => p);
}

const withPeople = { people: { orderBy: { position: "asc" as const } } };
type Row = Prisma.SavedSessionGetPayload<{ include: typeof withPeople }>;

function toRow(r: Row): SavedSessionRow {
  return {
    id: r.id,
    name: r.name,
    policyholder: r.policyholder,
    policyholderRelation: PolicyOwnerSchema.nullable().catch(null).parse(r.policyholderRelation ?? null),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    summary: r.summary as SavedSessionRow["summary"],
    chatTurns: Array.isArray(r.chat) ? r.chat.length : 0,
    uploadedPolicy: r.policy !== null,
    health: ConfirmedHealthSchema.nullable().catch(null).parse(r.health ?? null),
    people: r.people.map((p) => ({
      uid: p.id,
      role: p.role as "self" | "patient" | "family",
      relation: (p.relation ?? null) as SavedSessionRow["people"][number]["relation"],
      name: p.name ?? "",
      age: p.age,
    })),
  };
}

export async function listSessions(db: PrismaClient, take = 200): Promise<SavedSessionRow[]> {
  const rows = await db.savedSession.findMany({ orderBy: { updatedAt: "desc" }, take, include: withPeople });
  return rows.map(toRow);
}

/** This browser's own saved sessions, newest first, in full, for the profile page. */
export async function mySessions(db: PrismaClient, userId: string | null): Promise<SavedSessionDetail[]> {
  if (!userId) return [];
  const rows = await db.savedSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: withPeople,
  });
  return rows.map((r) => ({
    ...toRow(r),
    input: r.input as SavedSessionDetail["input"],
    policy: (r.policy ?? null) as SavedSessionDetail["policy"],
    chat: ChatTurnRecordSchema.array().catch([]).parse(r.chat),
  }));
}

export async function sessionDetail(db: PrismaClient, id: string): Promise<SavedSessionDetail | null> {
  const r = await db.savedSession.findUnique({ where: { id }, include: withPeople });
  if (!r) return null;
  return {
    ...toRow(r),
    input: r.input as SavedSessionDetail["input"],
    policy: (r.policy ?? null) as SavedSessionDetail["policy"],
    chat: ChatTurnRecordSchema.array().catch([]).parse(r.chat),
  };
}

/**
 * Every chat answer worth remembering: from saved sessions, newest first, and
 * only answers that came back clean -- no figure the engine did not state.
 */
export async function chatMemory(db: PrismaClient, sessions = 500): Promise<ChatTurnRecord[]> {
  const rows = await db.savedSession.findMany({
    select: { chat: true },
    orderBy: { updatedAt: "desc" },
    take: sessions,
  });
  return rows
    .flatMap((r) => ChatTurnRecordSchema.array().catch([]).parse(r.chat))
    .filter((t) => t.answer.trim() && t.unsupportedFigures.length === 0);
}

/** The past turns whose questions are most like this one. */
export function recall(memory: ChatTurnRecord[], question: string, k = 3): ChatTurnRecord[] {
  if (!memory.length) return [];
  // Each remembered question is one "page", so retrieval ranks questions, not answers.
  const chunks = chunkPages(memory.map((t) => t.question));
  const seen = new Set<string>();
  const out: ChatTurnRecord[] = [];
  for (const s of retrieve(chunks, question, k * 4)) {
    const t = memory[s.chunk.page - 1];
    const key = t.question.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length === k) break;
  }
  return out;
}
