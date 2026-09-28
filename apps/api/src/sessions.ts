/**
 * Saved sessions: what a family did with ClaimCast, kept when they asked.
 *
 * Three uses of one table. The family's "Save my session" writes it; the admin's
 * Database reads it back, so the two sides of the product meet on real records;
 * and the chatbox recalls the answers in it as memory for later questions. The
 * engine's outcome is frozen at save time -- what they were shown -- while the
 * input is kept too, so reopening re-prices with the engine as it is now.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  ChatTurnRecordSchema,
  type ChatTurnRecord,
  type SaveSessionRequest,
  type SavedSessionDetail,
  type SavedSessionRow,
} from "@claimcast/contracts";
import { evaluate, repair, withPolicy, ROOM_LABEL, registry } from "@claimcast/engine";
import { chunkPages, retrieve } from "./retrieval.js";

/** The engine's outcome for this session, priced now, as the admin will see it. */
export function summarise(req: SaveSessionRequest) {
  const run = () => {
    const e = evaluate(repair(req.case));
    const { clauses } = registry();
    return {
      procedure: e.procedure.name,
      hospital: e.hospital.name,
      city: e.hospital.city,
      policy: `${e.policy.product} (${e.policy.insurer})`,
      roomClass: ROOM_LABEL[e.input.roomClass],
      billTotal: e.result.billTotal,
      insurerPays: e.result.insurerPays,
      patientPays: e.result.patientPays,
      deductionTotal: e.result.deductionTotal,
      deductions: e.result.deductions.map((d) => ({
        line: d.line,
        amount: d.amount,
        clause: clauses[d.clause]?.cite ?? d.clause,
      })),
      repudiated: e.result.repudiated?.reason ?? null,
    };
  };
  return req.policy ? withPolicy(req.policy, run) : run();
}

export async function saveSession(db: PrismaClient, userId: string | null, req: SaveSessionRequest) {
  const data = {
    name: req.name?.trim() || null,
    policyholder: req.policyholder?.trim() || null,
    input: req.case as unknown as Prisma.InputJsonValue,
    policy: (req.policy ?? undefined) as Prisma.InputJsonValue | undefined,
    documentId: req.documentId ?? null,
    summary: summarise(req) as unknown as Prisma.InputJsonValue,
    chat: req.chat as unknown as Prisma.InputJsonValue,
  };
  // Updating is only ever of this browser's own record; anything else starts a new one.
  if (req.id) {
    const hit = await db.savedSession.updateMany({ where: { id: req.id, userId }, data });
    if (hit.count === 1) {
      const row = await db.savedSession.findUniqueOrThrow({ where: { id: req.id } });
      return { id: row.id, createdAt: row.createdAt.toISOString(), updated: true };
    }
  }
  const row = await db.savedSession.create({ data: { ...data, userId } });
  return { id: row.id, createdAt: row.createdAt.toISOString(), updated: false };
}

type Row = Awaited<ReturnType<PrismaClient["savedSession"]["findFirstOrThrow"]>>;

function toRow(r: Row): SavedSessionRow {
  return {
    id: r.id,
    name: r.name,
    policyholder: r.policyholder,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    summary: r.summary as SavedSessionRow["summary"],
    chatTurns: Array.isArray(r.chat) ? r.chat.length : 0,
    uploadedPolicy: r.policy !== null,
  };
}

export async function listSessions(db: PrismaClient, take = 200): Promise<SavedSessionRow[]> {
  const rows = await db.savedSession.findMany({ orderBy: { updatedAt: "desc" }, take });
  return rows.map(toRow);
}

export async function sessionDetail(db: PrismaClient, id: string): Promise<SavedSessionDetail | null> {
  const r = await db.savedSession.findUnique({ where: { id } });
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
