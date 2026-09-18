/**
 * Seed the database from the engine's fixture set.
 *
 * This is deliberately a translation and nothing more. Every row written here
 * comes out of `@claimcast/engine`'s reference data unchanged, so that the
 * database and the hardcoded path can be compared figure for figure — which is
 * exactly what prisma/verify.ts then does. The moment the two disagree, one of
 * them is wrong, and until Phase 3 lands the fixtures are the ones we trust.
 *
 * The one thing added on the way in is provenance. Each priced row points at
 * the Source it came from, and almost all of them currently point at the
 * synthetic set with a caveat attached. That is the honest state of the data,
 * and it is recorded rather than assumed.
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import {
  ADMISSIONS,
  CLAUSES,
  HOSPITALS,
  LIST_FRAMEWORK,
  LIST_I,
  POLICIES,
  PROCEDURES,
} from "@claimcast/engine";
import { CLAUSE_SOURCE, SOURCES } from "../src/sources.js";

const db = new PrismaClient();

const SYNTHETIC = "claimcast-synthetic";

async function main() {
  // Order matters: everything below points at a Source, and the child rows of
  // a hospital or procedure are rewritten wholesale rather than merged, so a
  // re-seed cannot leave a room tariff behind that the fixtures have dropped.
  await db.$transaction(async (tx) => {
    for (const s of SOURCES) {
      await tx.source.upsert({ where: { id: s.id }, create: s, update: s });
    }

    for (const { id, title, effect } of LIST_FRAMEWORK) {
      const row = { id: id as "I" | "II" | "III" | "IV", title, effect };
      await tx.irdaiListInfo.upsert({ where: { id: row.id }, create: row, update: row });
    }

    for (const h of HOSPITALS) {
      const row = {
        name: h.name,
        city: h.city,
        tier: h.tier,
        beds: h.beds,
        pmjayEmpanelled: h.pmjayEmpanelled,
        cghsRateBand: h.cghsRateBand,
        costIndex: h.costIndex,
        settlementDays: h.settlementDays,
        preAuthHours: h.preAuthHours,
        flags: h.flags ?? [],
        sourceId: SYNTHETIC,
      };
      await tx.hospital.upsert({
        where: { id: h.id },
        create: { id: h.id, ...row },
        update: row,
      });
      await tx.hospitalTariff.deleteMany({ where: { hospitalId: h.id } });
      await tx.hospitalTariff.createMany({
        data: h.rooms.map((t) => ({ hospitalId: h.id, cls: t.cls, perDay: t.perDay })),
      });
      await tx.hospitalNetwork.deleteMany({ where: { hospitalId: h.id } });
      await tx.hospitalNetwork.createMany({
        data: h.network.map((insurer) => ({ hospitalId: h.id, insurer })),
      });
    }

    for (const p of PROCEDURES) {
      const row = {
        name: p.name,
        hbpCode: p.hbpCode,
        specialty: p.specialty,
        dayCare: p.dayCare,
        medianStayDays: p.medianStayDays,
        usesImplant: p.usesImplant,
        privateLow: p.privateLow,
        privateHigh: p.privateHigh,
        surgical: p.costs.surgical,
        nursingPerDay: p.costs.nursingPerDay,
        icuPerDay: p.costs.icuPerDay,
        diagnostics: p.costs.diagnostics,
        pharmacyPerDay: p.costs.pharmacyPerDay,
        implant: p.costs.implant,
        otherIndependent: p.costs.otherIndependent,
        nonPayableFixed: p.costs.nonPayableFixed,
        nonPayablePerDay: p.costs.nonPayablePerDay,
        outsideWindow: p.costs.outsideWindow,
      };
      await tx.procedure.upsert({
        where: { id: p.id },
        create: { id: p.id, ...row },
        update: row,
      });

      await tx.implantOption.deleteMany({ where: { procedureId: p.id } });
      if (p.implantOptions?.length) {
        await tx.implantOption.createMany({
          data: p.implantOptions.map((o) => ({
            procedureId: p.id,
            id: o.id,
            label: o.label,
            amount: o.amount,
          })),
        });
      }

      // One row per published scheme rate. Both are tier- and NABH-agnostic
      // today because the fixtures carry a single number each; Phase 3 fans
      // these out per city tier, which is why the table is shaped for it.
      await tx.tariffRate.deleteMany({ where: { procedureId: p.id } });
      const rates: Prisma.TariffRateCreateManyInput[] = [];
      if (p.pmjayRate !== null) {
        rates.push({
          id: p.id + ":PMJAY",
          procedureId: p.id,
          scheme: "PMJAY",
          cityTier: null,
          nabh: null,
          amount: p.pmjayRate,
          effectiveFrom: new Date("2022-11-01T00:00:00Z"),
          sourceId: "nha-hbp-2-2",
        });
      }
      if (p.cghsRate !== null) {
        rates.push({
          id: p.id + ":CGHS",
          procedureId: p.id,
          scheme: "CGHS",
          cityTier: null,
          nabh: null,
          amount: p.cghsRate,
          effectiveFrom: new Date("2023-01-01T00:00:00Z"),
          sourceId: "cghs-rates",
        });
      }
      if (rates.length) await tx.tariffRate.createMany({ data: rates });
    }

    for (const pol of POLICIES) {
      const row = {
        insurer: pol.insurer,
        product: pol.product,
        sumInsured: pol.sumInsured,
        roomCapPerDay: pol.roomCapPerDay,
        roomCapPctOfSI: pol.roomCapPctOfSI,
        icuCapPerDay: pol.icuCapPerDay,
        icuCapPctOfSI: pol.icuCapPctOfSI,
        proportionateDeduction: pol.proportionateDeduction,
        copayPct: pol.copayPct,
        implantSubLimit: pol.implantSubLimit,
        preHospDays: pol.preHospDays,
        postHospDays: pol.postHospDays,
        dayCareCovered: pol.dayCareCovered,
        monthsInForce: pol.monthsInForce,
        pedWaitingMonths: pol.pedWaitingMonths,
        moratoriumMonths: pol.moratoriumMonths,
        notes: pol.notes ?? null,
        sourceId: SYNTHETIC,
      };
      await tx.policy.upsert({
        where: { id: pol.id },
        create: { id: pol.id, ...row },
        update: row,
      });
    }

    for (const c of Object.values(CLAUSES)) {
      const sourceId = CLAUSE_SOURCE[c.id];
      if (!sourceId) throw new Error("clause " + c.id + " has no source attribution");
      // `cite` is what the UI prints beside a deduction; `sourceText` is the
      // engine's own one-line attribution, kept verbatim so that a round trip
      // through the database returns the identical Clause object.
      const row = { cite: c.cite, sourceText: c.source, text: c.text, url: null, sourceId };
      await tx.clause.upsert({ where: { id: c.id }, create: { id: c.id, ...row }, update: row });
    }

    await tx.nonPayableItem.deleteMany({ where: { list: "I" } });
    await tx.nonPayableItem.createMany({
      data: LIST_I.map((i) => ({
        id: "I:" + i.item,
        list: "I" as const,
        group: i.group,
        label: i.item,
        typical: i.typical,
        sourceId: "irdai-lists",
      })),
    });

    for (const a of ADMISSIONS) {
      const row = {
        ref: a.ref,
        date: new Date(a.date + "T00:00:00Z"),
        hospitalId: a.hospitalId,
        procedureId: a.procedureId,
        policyId: a.policyId,
        roomClass: a.roomClass,
        route: a.route,
        lines: a.lines as unknown as Prisma.InputJsonValue,
        edgeCase: a.edgeCase,
        siUsed: a.siUsed ?? null,
        repudiatedReason: a.repudiated?.reason ?? null,
        repudiatedClause: a.repudiated?.clause ?? null,
      };
      await tx.admission.upsert({ where: { id: a.id }, create: { id: a.id, ...row }, update: row });
    }
  });

  const counts: Array<[string, number]> = [
    ["sources", await db.source.count()],
    ["hospitals", await db.hospital.count()],
    ["room tariffs", await db.hospitalTariff.count()],
    ["procedures", await db.procedure.count()],
    ["tariff rates", await db.tariffRate.count()],
    ["policies", await db.policy.count()],
    ["clauses", await db.clause.count()],
    ["list I items", await db.nonPayableItem.count()],
    ["admissions", await db.admission.count()],
  ];
  for (const [label, n] of counts) console.log("  " + label.padEnd(13) + n);
  console.log("seeded");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
