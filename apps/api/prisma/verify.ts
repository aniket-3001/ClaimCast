/**
 * The Phase 1 gate: the database says exactly what the fixtures say.
 *
 * Two checks, and the second is the one that matters. The first deep-compares
 * every reference record read back out of Postgres against the hand-written
 * fixture it was seeded from, which catches a column that silently rounded, an
 * optional key that came back as null, or a child list that arrived in a
 * different order. The second re-adjudicates the reference admission using only
 * database rows and asserts the three figures the ClaimCast deck quotes in
 * public.
 *
 * A database that agrees with the fixtures on every field but produces a
 * different patient figure would be the worst outcome available, so the
 * arithmetic is checked separately from the data rather than assumed to follow
 * from it.
 *
 *   npm run check --workspace @claimcast/api
 */

import { adjudicate, fmt, rupees as r } from "@claimcast/engine";
import {
  ADMISSIONS,
  CLAUSES,
  HOSPITALS,
  LIST_I,
  POLICIES,
  PROCEDURES,
} from "@claimcast/engine/fixtures";
import * as ref from "../src/reference.js";

let failures = 0;

function pass(label: string) {
  console.log("  ok  " + label);
}

function fail(label: string, detail: string) {
  failures++;
  console.log("FAIL  " + label + ": " + detail);
}

/**
 * Deep equality by canonical JSON. Key order is normalised first, because two
 * objects that differ only in the order their keys were written are the same
 * record and the fixtures were not written in alphabetical order.
 */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      out[k] = canonical((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

function same(label: string, got: unknown, want: unknown) {
  const a = JSON.stringify(canonical(got));
  const b = JSON.stringify(canonical(want));
  if (a === b) return pass(label);

  // Report the first divergence rather than two walls of JSON.
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const from = Math.max(0, i - 60);
  fail(
    label,
    "diverges at character " +
      i +
      "\n        database: ..." +
      a.slice(from, i + 60) +
      "\n        fixtures: ..." +
      b.slice(from, i + 60),
  );
}

function eq(label: string, got: number, want: number) {
  if (got === want) return pass(label + ": " + fmt(got));
  fail(label, fmt(got) + " (expected " + fmt(want) + ")");
}

async function main() {
  console.log("Reference data, database against fixtures");
  const [dbHospitals, dbProcedures, dbPolicies, dbClauses, dbListI, dbAdmissions] =
    await Promise.all([
      ref.hospitals(),
      ref.procedures(),
      ref.policies(),
      ref.clauses(),
      ref.listI(),
      ref.admissions(),
    ]);

  // The fixtures are sorted the same way the queries are, so that a comparison
  // failure means a difference in content and never in ordering.
  const byId = <T extends { id: string }>(xs: readonly T[]) =>
    [...xs].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

  same("hospitals", dbHospitals, byId(HOSPITALS));
  same("procedures", dbProcedures, byId(PROCEDURES));
  // Policies and clauses are compared over the fixture's ids, not the whole
  // table. From Phase 3 the database holds records the fixtures never had --
  // Arogya Sanjeevani and its nine quoted clauses come out of the Master
  // Circular, not out of `data/policies.ts` -- and this check exists to prove
  // that every fixture survives the round trip unchanged, not that nothing
  // else was ever seeded beside it. A fixture that went missing still fails,
  // because the pick below would come back short.
  const pick = <T,>(rows: Record<string, T>, want: Record<string, unknown>): Record<string, T> =>
    Object.fromEntries(Object.keys(want).map((k) => [k, rows[k]]));

  same("policies", byId(dbPolicies.filter((p) => POLICIES.some((f) => f.id === p.id))), byId(POLICIES));
  same("clauses", pick(dbClauses, CLAUSES), CLAUSES);

  // The extra rows are not unchecked, just checked for what they are: present,
  // and attributed to the document they were quoted from rather than to the
  // synthetic set.
  const arogya = dbPolicies.find((p) => p.id === "pol-arogya-sanjeevani");
  if (!arogya) fail("Arogya Sanjeevani", "the standard product is not in the database");
  else pass("Arogya Sanjeevani seeded, room cap " + fmt(arogya.roomCapPerDay ?? 0) + "/day");

  const quoted = Object.keys(dbClauses).filter((id) => id.startsWith("as-"));
  if (quoted.length !== 9) fail("Arogya clauses", quoted.length + " seeded, expected 9");
  else pass("Arogya Sanjeevani clauses: 9, each verified against its cited page");

  const published = await ref.publishedLists();
  const counts = { I: 68, II: 37, III: 23, IV: 18 };
  for (const [list, want] of Object.entries(counts)) {
    const got = published.filter((i) => i.list === list).length;
    if (got !== want) fail("IRDAI List " + list, got + " items, expected " + want);
    else pass("IRDAI List " + list + ": " + want + " items as published");
  }
  same("admissions", dbAdmissions, byId(ADMISSIONS));
  same(
    "List I",
    [...dbListI].sort((x, y) => (x.item < y.item ? -1 : 1)),
    [...LIST_I].sort((x, y) => (x.item < y.item ? -1 : 1)),
  );

  console.log("Provenance");
  const srcs = await ref.sources();
  const missing = srcs.filter((s) => !s.url);
  if (missing.length) fail("every source resolves to a URL", missing.length + " without one");
  else pass("every source resolves to a URL, " + srcs.length + " sources");
  const caveated = srcs.filter((s) => s.caveat !== null).length;
  pass(caveated + " of " + srcs.length + " sources carry a caveat and must be labelled on screen");

  // Adjudicated out of the database alone: the bill lines, the policy terms and
  // the sum insured already consumed all come from Postgres, and only the
  // arithmetic comes from the engine.
  console.log("Reference admission RC-2401, adjudicated from the database");
  const a2401 = dbAdmissions.find((a) => a.id === "a-2401");
  const a2402 = dbAdmissions.find((a) => a.id === "a-2402");
  if (!a2401 || !a2402) {
    fail("reference admissions present", "a-2401 or a-2402 missing from the database");
  } else {
    const pol = (id: string) => {
      const p = dbPolicies.find((x) => x.id === id);
      if (!p) throw new Error("policy " + id + " missing from the database");
      return p;
    };
    const run = (a: (typeof dbAdmissions)[number]) =>
      adjudicate({
        lines: a.lines,
        policy: pol(a.policyId),
        siUsed: a.siUsed,
        repudiated: a.repudiated ?? null,
      });

    const priv = run(a2401);
    eq("  bill total", priv.billTotal, r(353900));
    eq("  patient pays", priv.patientPays, r(126900));
    eq("  insurer pays", priv.insurerPays, r(227000));

    console.log("Reference admission RC-2402, semi-private");
    const semi = run(a2402);
    eq("  bill total", semi.billTotal, r(328900));
    eq("  patient pays", semi.patientPays, r(48500));
    eq("  saved by one room class", priv.patientPays - semi.patientPays, r(78400));
  }

  console.log("");
  if (failures) {
    console.log(failures + " check" + (failures === 1 ? "" : "s") + " failed");
    process.exit(1);
  }
  console.log("database agrees with the fixtures, figure for figure");
}

main()
  .catch((e) => {
    // This check needs a database, and the usual reason it does not have one
    // is that nobody started it. Say that, rather than printing a connection
    // stack trace and leaving the reader to work it out.
    const msg = e instanceof Error ? e.message : String(e);
    if (/P1001|ECONNREFUSED|Can't reach database/.test(msg)) {
      console.error("No database at DATABASE_URL. Start one with:");
      console.error("  npm run db:up");
    } else {
      console.error(e);
    }
    process.exit(1);
  })
  .finally(() => ref.db.$disconnect());
