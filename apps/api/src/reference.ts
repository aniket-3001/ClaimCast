/**
 * Reference data, read out of the database in the shapes the engine expects.
 *
 * The engine's types are the contract, not the database schema. Rows come back
 * from Prisma with nulls where the engine wants absent keys, child rows in
 * whatever order the query planner felt like, and a `source` split across a
 * column and a relation. All of that is reconciled here, once, so that neither
 * the engine nor anything calling it has to know a database exists.
 *
 * The reconciliation is exact on purpose. `prisma/verify.ts` deep-compares what
 * these functions return against the hand-written fixtures, and a mapper that
 * was merely close enough — an empty array where the fixture has no key, a
 * tariff list in a different order — would fail that comparison. Keeping it
 * exact is what makes the check meaningful rather than approximate.
 */

import { PrismaClient } from "@prisma/client";
import type {
  Admission,
  BillLine,
  Clause,
  Hospital,
  Policy,
  Procedure,
  RoomClass,
} from "@claimcast/engine";

export const db = new PrismaClient();

/** The fixtures list room tariffs cheapest first; the database must too. */
const ROOM_ORDER: RoomClass[] = ["general", "semi_private", "private", "deluxe", "suite", "icu"];

export async function hospitals(): Promise<Hospital[]> {
  const rows = await db.hospital.findMany({
    include: { rooms: true, network: true },
    orderBy: { id: "asc" },
  });
  return rows.map((h) => ({
    id: h.id,
    name: h.name,
    city: h.city,
    tier: h.tier,
    beds: h.beds,
    network: h.network.map((n) => n.insurer),
    pmjayEmpanelled: h.pmjayEmpanelled,
    cghsRateBand: h.cghsRateBand,
    costIndex: h.costIndex,
    settlementDays: h.settlementDays,
    preAuthHours: h.preAuthHours,
    rooms: [...h.rooms]
      .sort((a, b) => ROOM_ORDER.indexOf(a.cls) - ROOM_ORDER.indexOf(b.cls))
      .map((t) => ({ cls: t.cls, perDay: t.perDay })),
    // Absent rather than empty: the fixtures omit the key on a hospital with
    // nothing to flag, and an empty array is not the same object.
    ...(h.flags.length ? { flags: h.flags } : {}),
  }));
}

export async function procedures(): Promise<Procedure[]> {
  const rows = await db.procedure.findMany({
    include: { implantOptions: true, tariffRates: true },
    orderBy: { id: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    hbpCode: p.hbpCode,
    specialty: p.specialty,
    dayCare: p.dayCare,
    medianStayDays: p.medianStayDays,
    usesImplant: p.usesImplant,
    ...(p.implantOptions.length
      ? {
          implantOptions: p.implantOptions.map((o) => ({
            id: o.id,
            label: o.label,
            amount: o.amount,
          })),
        }
      : {}),
    // The National Reference Price, which is the row with no city tier on it.
    // PM-JAY prints four figures per package -- the reference price and one per
    // city tier -- and `Procedure.pmjayRate` is one number, so the cell has to
    // be named rather than picked up by whichever row came back first.
    //
    // Only a PACKAGE row qualifies. A medical admission is priced per bed-day
    // and has no episode price at all, so pneumonia, septic shock and the
    // gastroenteritis observation come back null here on purpose: the scheme
    // publishes no package rate for them, and the per-day grid it does publish
    // is on their PER_DAY rows. Dropping the basis filter would hand the
    // government fork a single day's ward rate and call it the package price.
    pmjayRate:
      p.tariffRates.find(
        (r) => r.scheme === "PMJAY" && r.cityTier === null && r.basis === "PACKAGE",
      )?.amount ?? null,
    // The database holds the whole CGHS grid -- three city tiers by two
    // accreditation columns -- and `Procedure.cghsRate` is one number, so the
    // cell has to be named rather than picked up by whichever row came back
    // first. X tier, NABH accredited: the ClaimCast hospitals are metro and
    // accredited, so that is the figure a user is actually comparing against.
    // Everything else in the grid is on the procedure's tariffRates rows.
    cghsRate:
      p.tariffRates.find((r) => r.scheme === "CGHS" && r.cityTier === "X" && r.nabh === true)
        ?.amount ?? null,
    privateLow: p.privateLow,
    privateHigh: p.privateHigh,
    costs: {
      surgical: p.surgical,
      nursingPerDay: p.nursingPerDay,
      icuPerDay: p.icuPerDay,
      diagnostics: p.diagnostics,
      pharmacyPerDay: p.pharmacyPerDay,
      implant: p.implant,
      otherIndependent: p.otherIndependent,
      nonPayableFixed: p.nonPayableFixed,
      nonPayablePerDay: p.nonPayablePerDay,
      outsideWindow: p.outsideWindow,
    },
  }));
}

export async function policies(): Promise<Policy[]> {
  const rows = await db.policy.findMany({ orderBy: { id: "asc" } });
  return rows.map((p) => ({
    id: p.id,
    insurer: p.insurer,
    product: p.product,
    sumInsured: p.sumInsured,
    roomCapPerDay: p.roomCapPerDay,
    roomCapPctOfSI: p.roomCapPctOfSI,
    icuCapPerDay: p.icuCapPerDay,
    icuCapPctOfSI: p.icuCapPctOfSI,
    proportionateDeduction: p.proportionateDeduction,
    copayPct: p.copayPct,
    implantSubLimit: p.implantSubLimit,
    preHospDays: p.preHospDays,
    postHospDays: p.postHospDays,
    dayCareCovered: p.dayCareCovered,
    monthsInForce: p.monthsInForce,
    pedWaitingMonths: p.pedWaitingMonths,
    moratoriumMonths: p.moratoriumMonths,
    ...(p.notes === null ? {} : { notes: p.notes }),
  }));
}

export async function clauses(): Promise<Record<string, Clause>> {
  const rows = await db.clause.findMany({ orderBy: { id: "asc" } });
  const out: Record<string, Clause> = {};
  for (const c of rows) {
    out[c.id] = { id: c.id, cite: c.cite, source: c.sourceText, text: c.text };
  }
  return out;
}

export interface ListItemRow {
  item: string;
  group: string;
  typical: number;
}

/**
 * The priced basket, not the published annexure.
 *
 * `non_payable_items` holds both: IRDAI's Annexure-I verbatim, and ClaimCast's
 * modelled basket of what a five-day metro admission leaves the family paying.
 * Only the modelled rows carry amounts -- IRDAI publishes item names and no
 * prices -- so this is the side the screen adds up, and `published: false` is
 * what selects it. Dropping that filter would pull in 146 unpriced rows and
 * quietly report them as costing nothing.
 */
export async function listI(): Promise<ListItemRow[]> {
  const rows = await db.nonPayableItem.findMany({
    where: { list: "I", published: false },
    orderBy: { id: "asc" },
  });
  return rows.map((i) => ({ item: i.label, group: i.group ?? "", typical: i.typical ?? 0 }));
}

export interface PublishedListItemRow {
  list: string;
  serial: number;
  label: string;
}

/** IRDAI's four lists as printed: every item, no prices, no groupings. */
export async function publishedLists(): Promise<PublishedListItemRow[]> {
  const rows = await db.nonPayableItem.findMany({
    where: { published: true },
    orderBy: [{ list: "asc" }, { serial: "asc" }],
  });
  return rows.map((i) => ({ list: i.list, serial: i.serial ?? 0, label: i.label }));
}

export async function listFramework() {
  return db.irdaiListInfo.findMany({ orderBy: { id: "asc" } });
}

export async function admissions(): Promise<Admission[]> {
  const rows = await db.admission.findMany({ orderBy: { id: "asc" } });
  return rows.map((a) => ({
    id: a.id,
    ref: a.ref,
    date: a.date.toISOString().slice(0, 10),
    hospitalId: a.hospitalId,
    procedureId: a.procedureId,
    policyId: a.policyId,
    roomClass: a.roomClass,
    route: a.route,
    lines: a.lines as unknown as BillLine[],
    edgeCase: a.edgeCase,
    ...(a.siUsed === null ? {} : { siUsed: a.siUsed }),
    ...(a.repudiatedReason === null || a.repudiatedClause === null
      ? {}
      : { repudiated: { reason: a.repudiatedReason, clause: a.repudiatedClause } }),
  }));
}

/**
 * Every source, including its caveat. Anything rendering a priced figure needs
 * this: a number whose source carries a caveat has to be shown carrying it too.
 */
export async function sources() {
  return db.source.findMany({ orderBy: { id: "asc" } });
}
