/**
 * The engine, checked against figures that are already published.
 *
 * The ClaimCast deck quotes three numbers off the reference admission. If the
 * engine and the deck ever disagree, one of them is wrong in public, so the
 * check runs as a build step rather than living in a test file nobody opens.
 *
 *   npm run check
 */
import { adjudicate } from "./engine";
import { fmt, rupees as r } from "./money";
import { ADMISSIONS, admission } from "../data/admissions";
import { policy } from "../data/policies";
import { HOSPITALS } from "../data/hospitals";
import { evaluate, fixedRegardless, repair, type CaseInput } from "./case";

let failures = 0;

function eq(label: string, got: number, want: number) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}: ${fmt(got)}${ok ? "" : ` (expected ${fmt(want)})`}`);
}

function run(id: string) {
  const a = admission(id);
  return adjudicate({
    lines: a.lines,
    policy: policy(a.policyId),
    siUsed: a.siUsed,
    repudiated: a.repudiated ?? null,
  });
}

console.log("Reference admission RC-2401, private room");
const priv = run("a-2401");
eq("  bill total", priv.billTotal, r(353900));
eq("  patient pays", priv.patientPays, r(126900));
eq("  insurer pays", priv.insurerPays, r(227000));

console.log("Reference admission RC-2402, semi-private");
const semi = run("a-2402");
eq("  bill total", semi.billTotal, r(328900));
eq("  patient pays", semi.patientPays, r(48500));

console.log("The figure on the deck");
eq("  saved by moving one room class", priv.patientPays - semi.patientPays, r(78400));

console.log("The two decisions added to the tree, on the same reference admission");
{
  const refInput: CaseInput = {
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
  };
  const base = evaluate(repair(refInput));
  const domestic = evaluate(repair({ ...refInput, implantId: "domestic" }));
  const dayCare = evaluate(repair({ ...refInput, admittedInpatient: false }));

  eq("  saved by the domestic implant", base.result.patientPays - domestic.result.patientPays, r(25000));
  eq(
    "  lost if billed as day-care instead of inpatient",
    dayCare.result.patientPays - base.result.patientPays,
    r(78400),
  );
}

console.log("Invariants across all 16 admissions");
for (const a of ADMISSIONS) {
  const res = run(a.id);
  const sum = res.insurerPays + res.patientPays;
  if (sum !== res.billTotal) {
    failures++;
    console.log(`FAIL  ${a.ref}: shares sum to ${fmt(sum)}, bill is ${fmt(res.billTotal)}`);
  }
  if (res.insurerPays < 0 || res.patientPays < 0) {
    failures++;
    console.log(`FAIL  ${a.ref}: a negative share`);
  }
  if (res.insurerPays > policy(a.policyId).sumInsured) {
    failures++;
    console.log(`FAIL  ${a.ref}: insurer paid above the sum insured`);
  }
  // Nothing outside the associated block may ever be scaled.
  const wrongly = res.deductions.filter(
    (d) => d.clause === "PROPORTIONATE" && a.lines.find((l) => l.id === d.lineId)?.kind !== "associated",
  );
  if (wrongly.length) {
    failures++;
    console.log(`FAIL  ${a.ref}: proportionate reduction applied to ${wrongly[0].line}`);
  }
}
if (!failures) console.log("  ok   shares reconcile, no scaling outside the associated block");

// The tree tells a family that three deductions survive every choice on it.
// That has to be true of the data, not just of the wording.
console.log("\nThe claim the tree makes");
{
  const base = evaluate(
    repair({
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
    }),
  );
  const key = (e: ReturnType<typeof evaluate>) =>
    fixedRegardless(e)
      .map((f) => `${f.clause}:${f.amount}`)
      .join("|");
  const want = key(base);
  const moved: string[] = [];
  for (const h of HOSPITALS) {
    for (const room of h.rooms) {
      const at = evaluate(repair({ ...base.input, hospitalId: h.id, roomClass: room.cls }));
      if (key(at) !== want) moved.push(`${h.name}, ${room.cls}`);
    }
  }
  if (moved.length) {
    failures++;
    console.log(`FAIL  a deduction billed as unavoidable moved at ${moved[0]}`);
  } else {
    console.log("  ok   the unavoidable deductions survive every hospital and every room class");
  }
}

console.log(failures ? `\n${failures} failed` : "\nall checks passed");
declare const process: { exit(code: number): never };
if (failures) process.exit(1);
