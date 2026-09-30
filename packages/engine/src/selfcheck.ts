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
import { admission, policy, setRegistry } from "./registry";
import { ADMISSIONS, FIXTURES, HOSPITALS } from "./fixtures";
import { NO_POLICY, NO_POLICY_ID } from "./nopolicy";
import { carePlan, surgeryOptions, testOptions, type DiagnosticTest } from "./care";

// The engine has no data until something gives it some. These checks are the
// one place that is allowed to hand it the hand-written set.
setRegistry(FIXTURES);
import { ageScheme, evaluate, familyPays, fixedRegardless, repair, schemeOptions, bestGovtScheme, type CaseInput } from "./case";

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
    age: 45,
    hasPmjayCard: false,
    govtEmployeeOrPensioner: false,
    esiInsured: false,
    preExisting: false,
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

  console.log("Government schemes never surface until they actually apply");
  const noneEligible = bestGovtScheme(base) === null;
  if (!noneEligible) {
    failures++;
    console.log("FAIL  a 45-year-old with no card was offered a government scheme anyway");
  } else {
    console.log("  ok   no scheme nudged at age 45 with no card and no CGHS eligibility");
  }

  const senior = evaluate(repair({ ...refInput, age: 70 }));
  const vayVandana = schemeOptions(senior).find((s) => s.id === "vayvandana")!;
  eq("  Vay Vandana package rate at 70", vayVandana.patientPays ?? -1, 0);
  if (!vayVandana.eligible) {
    failures++;
    console.log("FAIL  age 70 did not unlock Vay Vandana");
  } else {
    console.log("  ok   age 70 alone unlocks Vay Vandana, no card or income test needed");
  }

  const cardHolder = evaluate(repair({ ...refInput, hasPmjayCard: true }));
  const pmjay = schemeOptions(cardHolder).find((s) => s.id === "pmjay")!;
  eq("  PM-JAY package rate with a card", pmjay.patientPays ?? -1, 0);

  const esiInsured = evaluate(repair({ ...refInput, esiInsured: true }));
  const esi = schemeOptions(esiInsured).find((s) => s.id === "esi")!;
  eq("  ESI at an ESIC tie-up hospital", esi.patientPays ?? -1, 0);
  if (!esi.eligible || esi.packageRate !== esiInsured.procedure.cghsRate) {
    failures++;
    console.log("FAIL  ESI was not offered at the CGHS rate to an insured person at a tie-up hospital");
  } else {
    console.log("  ok   ESI is settled at the CGHS package rate, and only for an insured person");
  }

  console.log("Waiting periods are applied, not only stored");
  // pol-classic has run 38 months against a 36-month waiting period.
  const served = evaluate(repair({ ...refInput, preExisting: true }));
  eq("  pre-existing, waiting period served", served.result.patientPays, base.result.patientPays);
  const young = evaluate(repair({ ...refInput, policyId: "pol-basic", preExisting: true }));
  if (young.repudiation?.clause !== "PED_WAITING" || young.result.patientPays !== young.result.billTotal) {
    failures++;
    console.log("FAIL  a pre-existing condition nine months into a 48-month wait was paid");
  } else {
    console.log("  ok   pre-existing, nine months into a 48-month wait: refused in full");
  }
  const fresh = evaluate(repair({ ...refInput, policyId: "pol-basic" }));
  if (fresh.repudiation !== null) {
    failures++;
    console.log("FAIL  a new condition was refused on a waiting period meant for pre-existing ones");
  } else {
    console.log("  ok   a condition that is not pre-existing is not held to the waiting period");
  }
}

console.log("No insurance, the nil option");
{
  setRegistry({ ...FIXTURES, policies: [...FIXTURES.policies, NO_POLICY] });
  const self = evaluate(
    repair({
      hospitalId: "h-meridian", procedureId: "p-spine-fusion", policyId: NO_POLICY_ID, roomClass: "private",
      route: "cashless", days: 5, icuDays: 0, siUsed: 0, implantId: "imported", admittedInpatient: true,
      age: 45, hasPmjayCard: false, govtEmployeeOrPensioner: false, esiInsured: false, preExisting: false,
    }),
  );
  eq("  the family pays the whole bill", self.result.patientPays, self.result.billTotal);
  if (self.result.deductions.length) {
    failures++;
    console.log("FAIL  a self-paying family was shown refusals");
  } else console.log("  ok   nothing is 'refused' when there is no policy to refuse it");
  setRegistry(FIXTURES);
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
      age: 45,
      hasPmjayCard: false,
      govtEmployeeOrPensioner: false,
      esiInsured: false,
      preExisting: false,
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

console.log("A health report: scans and the operation, priced and paid for");
{
  const mri: DiagnosticTest = { code: "RI110", name: "MRI Ankle Single joint - Without contrast", specialty: "Radiological Investigation", nonNabh: 297500, nabh: 350000 };
  const ankle: CaseInput = repair({
    hospitalId: "h-meridian", procedureId: "p-ankle-orif", policyId: "pol-classic", roomClass: "private",
    route: "cashless", days: 3, icuDays: 0, siUsed: 0, implantId: "imported", admittedInpatient: true,
    age: 45, hasPmjayCard: false, govtEmployeeOrPensioner: false, esiInsured: false, preExisting: false,
  });
  const check = (ok: boolean, good: string, bad: string) => {
    if (!ok) failures++;
    console.log(ok ? `  ok   ${good}` : `FAIL  ${bad}`);
  };
  const e = evaluate(ankle);
  const alone = testOptions(e, mri, false);
  check(
    alone.every((a) => a.price >= a.cghsRate && a.payer === "self" && a.youPay === a.price),
    "a scan with no operation and no scheme is the family's, and never priced under the CGHS rate",
    "a stand-alone scan was paid by someone, or priced below the government rate",
  );
  const before = testOptions(e, mri, true);
  const pol = e.policy;
  check(
    pol.preHospDays > 0 && before.every((a) => a.payer === "policy" && a.youPay === Math.round(a.price * pol.copayPct)),
    "a scan before a covered operation is repaid by the policy, less its co-payment",
    "a pre-hospitalisation scan was not repaid by the policy",
  );
  // A policy three months old, so a pre-existing illness is still inside its wait.
  setRegistry({ ...FIXTURES, policies: [...FIXTURES.policies, { ...policy("pol-classic"), id: "pol-young", monthsInForce: 3 }] });
  const refused = evaluate({ ...ankle, policyId: "pol-young", preExisting: true });
  const refusedScans = testOptions(refused, mri, true);
  setRegistry(FIXTURES);
  check(
    refused.result.insurerPays === 0 && refusedScans.every((a) => a.payer === "self"),
    "when the admission is refused for a waiting period, the scans before it are not repaid either",
    "scans were repaid for an admission the policy refuses",
  );
  const esi = testOptions(evaluate({ ...ankle, esiInsured: true }), mri, false);
  check(
    esi.filter((a) => a.hospital.esicTieUp).every((a) => a.youPay === 0 && a.payer === "esi") &&
      esi.filter((a) => !a.hospital.esicTieUp).every((a) => a.payer !== "esi"),
    "ESI pays for a scan only at a hospital with an ESIC tie-up",
    "ESI was applied at a hospital without a tie-up, or missed at one with",
  );
  const card = evaluate({ ...ankle, hasPmjayCard: true });
  check(
    testOptions(card, mri, false).every((a) => a.payer !== "pmjay") &&
      testOptions(card, mri, true).filter((a) => a.hospital.pmjayEmpanelled).every((a) => a.payer === "pmjay" && a.youPay === 0),
    "PM-JAY pays for a scan only inside an operation package, never on its own",
    "PM-JAY was shown paying for an out-patient scan, or missed inside a package",
  );
  const ops = surgeryOptions(card);
  check(
    ops.length === HOSPITALS.length - 0 &&
      ops.every((o, i) => o.youPay <= o.withPolicy && (i === 0 || ops[i - 1].youPay <= o.youPay)) &&
      ops.filter((o) => o.hospital.pmjayEmpanelled).every((o) => o.youPay === 0),
    "the operation is compared at every hospital, cheapest first, and a scheme only ever lowers the bill",
    "the surgery comparison is out of order, or a scheme raised what the family pays",
  );
  const plan = carePlan(card, [mri], true);
  const top = plan.oneStop[0];
  check(
    top.total === top.scans + (top.surgery ?? 0) && plan.oneStop.every((o, i) => i === 0 || plan.oneStop[i - 1].total <= o.total),
    "the one-hospital plan adds scans and operation at the same place, cheapest first",
    "the one-hospital totals do not add up",
  );
}

console.log("Government schemes by age: RBSK under 18, Vay Vandana at 70 and above");
{
  const base: CaseInput = repair({
    hospitalId: "h-meridian", procedureId: "p-spine-fusion", policyId: "pol-classic", roomClass: "private",
    route: "cashless", days: 5, icuDays: 0, siUsed: 0, implantId: "imported", admittedInpatient: true,
    age: 45, hasPmjayCard: false, govtEmployeeOrPensioner: false, esiInsured: false, preExisting: false,
  });
  const check = (ok: boolean, good: string, bad: string) => {
    if (!ok) failures++;
    console.log(ok ? `  ok   ${good}` : `FAIL  ${bad}`);
  };
  const at = (patch: Partial<CaseInput>) => evaluate(repair({ ...base, ...patch }));
  check(ageScheme(at({ age: 45 })) === null && familyPays(at({ age: 45 })).via === null,
    "between 18 and 69 no age scheme is applied", "an age scheme was applied to a 45-year-old");
  check(ageScheme(at({ age: 69 })) === null && ageScheme(at({ age: 70 }))?.scheme.id === "vayvandana",
    "Vay Vandana starts at exactly 70", "the 70+ boundary is wrong");
  check(ageScheme(at({ age: 17 }))?.scheme.id === "rbsk" && ageScheme(at({ age: 18 })) === null,
    "RBSK ends at exactly 18", "the under-18 boundary is wrong");
  const senior = at({ age: 72 });
  check(familyPays(senior).amount === 0 && familyPays(senior).via?.id === "vayvandana" && senior.result.patientPays > 0,
    "at 72 Vay Vandana is the default payer: the family pays nothing, the policy figure stays underneath",
    "Vay Vandana was not applied by default at 72");
  const off = at({ age: 72, ageScheme: false });
  check(familyPays(off).via === null && familyPays(off).amount === off.result.patientPays && ageScheme(off)!.applies,
    "switched off, the headline goes back to the policy while the scheme stays on offer",
    "switching the age scheme off did not restore the policy figure");
  const notHere = at({ age: 72, hospitalId: "h-vistara" });
  check(ageScheme(notHere)!.applies === false && familyPays(notHere).via === null,
    "Vay Vandana is never applied at a hospital outside PM-JAY",
    "Vay Vandana was applied at a hospital that is not empanelled");
  const child = at({ age: 8, procedureId: "p-cataract" });
  check(familyPays(child).amount === 0 && familyPays(child).via?.id === "rbsk",
    "a child's cataract surgery is free under RBSK by default", "RBSK was not applied to a child's cataract");
  const appendix = at({ age: 8, procedureId: "p-appendix" });
  check(ageScheme(appendix)!.applies === false && familyPays(appendix).via === null,
    "RBSK does not pay for a treatment that is not a listed childhood condition",
    "RBSK was applied to an appendicectomy");
}

console.log(failures ? `\n${failures} failed` : "\nall checks passed");
if (failures) process.exit(1);
