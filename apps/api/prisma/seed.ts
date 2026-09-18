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
// The fixtures, by name. This is the one place in the application that is
// meant to read them: everything downstream reads the database this writes.
import {
  ADMISSIONS,
  CLAUSES,
  HOSPITALS,
  LIST_FRAMEWORK,
  LIST_I,
  POLICIES,
  PROCEDURES,
  SUBSUMED_MODELLED,
} from "@claimcast/engine/fixtures";
import { CLAUSE_SOURCE, SOURCES } from "../src/sources.js";
import { CGHS_MAP } from "./cghs-map.js";
import { arogya, atTier, cghs, irdaiLists } from "./etl.js";

const db = new PrismaClient();

const SYNTHETIC = "claimcast-synthetic";

// The CGHS Office Memorandum, as parsed by etl/sources/cghs_rates.py. Read once
// rather than per procedure: it is two thousand rows.
const CGHS = cghs();
const CGHS_BY_CODE = new Map(CGHS.rates.map((r) => [r.code, r]));
const CGHS_EFFECTIVE = new Date(CGHS.source.effectiveFrom + "T00:00:00Z");
const LISTS = irdaiLists();
const AROGYA = arogya();

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

      // Scheme rates. The CGHS ones are real: the published semi-private,
      // Tier I figure for this procedure's CGHS code, fanned out across the
      // city tiers by the reductions the OM states in prose (Y is 10% lower
      // than X, Z is 20%) and across the accreditation columns it prints.
      // Six rows per procedure, every one traceable to a page of the document.
      await tx.tariffRate.deleteMany({ where: { procedureId: p.id } });
      const rates: Prisma.TariffRateCreateManyInput[] = [];

      const mapping = CGHS_MAP[p.id];
      if (mapping) {
        const row = CGHS_BY_CODE.get(mapping.code);
        if (!row) {
          throw new Error(
            "procedure " + p.id + " is mapped to CGHS code " + mapping.code +
              ", which is not in the parsed rate list. Either the mapping is wrong or " +
              "the OM was re-issued; check apps/api/prisma/cghs-map.ts against etl/out/cghs-rates.json.",
          );
        }
        for (const tier of ["X", "Y", "Z"] as const) {
          const factor = CGHS.rules.cityFactor[tier];
          for (const nabh of [false, true]) {
            rates.push({
              id: p.id + ":CGHS:" + tier + ":" + (nabh ? "NABH" : "NON"),
              procedureId: p.id,
              scheme: "CGHS",
              cityTier: tier,
              nabh,
              amount: atTier(nabh ? row.nabh : row.nonNabh, factor),
              effectiveFrom: CGHS_EFFECTIVE,
              sourceId: "cghs-rates",
            });
          }
        }
      }

      // PM-JAY is the opposite case. The package master could not be retrieved
      // from any NHA URL, so there is no published per-procedure rate to seed;
      // what the fixture carries is a plausible number, and it is attributed to
      // the synthetic set rather than to the National Health Authority. The
      // scheme's real published figures -- the family cover, the unspecified
      // cap, the four medical bed-day rates -- are in etl/out/nha-hbp.json and
      // are not per-procedure rates at all.
      if (p.pmjayRate !== null) {
        rates.push({
          id: p.id + ":PMJAY",
          procedureId: p.id,
          scheme: "PMJAY",
          cityTier: null,
          nabh: null,
          amount: p.pmjayRate,
          effectiveFrom: new Date("2022-11-01T00:00:00Z"),
          sourceId: SYNTHETIC,
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

    // Arogya Sanjeevani, the one policy here whose terms are quoted rather
    // than plausible. IRDAI prescribes them and an insurer may not vary them,
    // so unlike every other row in `policies` this one points at a real
    // document. The sum insured range the circular sets -- one lakh to five,
    // in multiples of fifty thousand -- has no column on Policy, so it stays
    // in `notes` rather than being dropped or invented into a field.
    {
      const pol = AROGYA.policy;
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
        notes:
          pol.notes +
          " Sum insured is issuable from Rs 1,00,000 to Rs 5,00,000 in multiples" +
          " of fifty thousand; the figure seeded is the prescribed maximum.",
        sourceId: AROGYA.source.id,
      };
      await tx.policy.upsert({
        where: { id: pol.id },
        create: { id: pol.id, ...row },
        update: row,
      });

      for (const c of AROGYA.clauses) {
        // `cite` is what the UI prints beside a deduction. `sourceText` is the
        // one-line attribution, and for these it names the page, because the
        // ETL verified each clause against that page at build time.
        const clause = {
          cite: c.cite,
          sourceText: AROGYA.source.document + " Page " + c.page + ".",
          text: c.text,
          url: AROGYA.source.url,
          sourceId: AROGYA.source.id,
        };
        await tx.clause.upsert({
          where: { id: c.id },
          create: { id: c.id, ...clause },
          update: clause,
        });
      }
    }

    // Two kinds of row, kept apart by `published` and never blended.
    //
    // The published side is IRDAI's Annexure-I transcribed whole: all four
    // lists, item names and serial numbers, no prices and no groupings,
    // because IRDAI publishes none. The modelled side is ClaimCast's own
    // basket of what a five-day metro admission actually leaves the family
    // paying, and it carries the amounts. It is attributed to the synthetic
    // source, not to IRDAI, for the same reason the PM-JAY rates are: the
    // regulator named these items, it did not price them.
    await tx.nonPayableItem.deleteMany({});
    await tx.nonPayableItem.createMany({
      data: (["I", "II", "III", "IV"] as const).flatMap((list) =>
        LISTS.lists[list].map((i) => ({
          id: list + ":" + i.serial,
          list,
          published: true,
          serial: i.serial,
          label: i.label,
          group: null,
          typical: null,
          sourceId: "irdai-lists",
        })),
      ),
    });
    await tx.nonPayableItem.createMany({
      data: [
        ...LIST_I.map((i) => ({ ...i, list: "I" as const })),
        // Filed where the 2019 guidelines file them, not where the app used to.
        // These four are subsumed into the room rate, the procedure fee or the
        // cost of treatment, so a separate line for them is the insurer's to
        // refuse rather than the family's to pay.
        ...SUBSUMED_MODELLED,
      ].map((i) => ({
        id: "modelled:" + i.list + ":" + i.item,
        list: i.list,
        published: false,
        serial: null,
        label: i.item,
        group: i.group,
        typical: i.typical,
        sourceId: SYNTHETIC,
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
    ["published items", await db.nonPayableItem.count({ where: { published: true } })],
    ["modelled items", await db.nonPayableItem.count({ where: { published: false } })],
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
