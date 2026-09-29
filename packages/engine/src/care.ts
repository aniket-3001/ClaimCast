import type { Hospital } from "./types";
import { fmt, type Paise } from "./money";
import { tariff } from "./bill";
import { bestGovtScheme, evaluate, repair, type CaseInput, type Evaluated, type SchemeId } from "./case";
import { registry } from "./registry";
import { isNoPolicy } from "./nopolicy";
import type { Fact } from "./facts";

/**
 * From a health report to a plan: where each scan can be done, where the
 * operation can be done, and who pays for each.
 *
 * Scans are priced off the CGHS rate list rather than invented. A published
 * CGHS rate is what the government pays an empanelled hospital; a private
 * patient is charged more than that, so a hospital's own price is estimated as
 * the rate times a working multiple, scaled by the hospital's cost index, and
 * never below the rate itself. The multiple is ClaimCast's assumption, not a
 * published figure, and every screen that shows a scan price says "about".
 *
 * Who pays follows the rules each payer actually has for a scan:
 *
 * - **ESI** pays for investigations on an ESIC referral at a tied-up hospital.
 * - **CGHS** pays its own rate at an empanelled centre, in or out of an
 *   admission.
 * - **PM-JAY** has no out-patient cover. It pays for a scan only as part of an
 *   admission package, for the three days before admission, at the hospital
 *   doing the operation.
 * - **An insurance policy** has no out-patient cover either (none of the plans
 *   here carries one). It repays a scan as pre-hospitalisation cost when the
 *   scan leads to a covered admission within the policy's window, less the
 *   co-payment -- and not at all when the admission itself is refused.
 *
 * Everything here is structured -- a payer and figures -- so the screen writes
 * the sentence in whichever language it is showing.
 */

/** One priced investigation from the CGHS list. Paise, X-tier city. */
export interface DiagnosticTest {
  code: string;
  name: string;
  specialty: string;
  nonNabh: Paise;
  nabh: Paise;
}

/** How much more a private hospital charges for a scan than the CGHS rate. An assumption, stated once. */
export const PRIVATE_OVER_CGHS_TESTS = 2;

/** CGHS rates are printed for a Tier I city; these are the published discounts for Y and Z. */
export const CGHS_CITY_FACTOR: Record<"X" | "Y" | "Z", number> = { X: 1, Y: 0.9, Z: 0.8 };

/** PM-JAY's pre-hospitalisation window, in days: the package covers what is spent in it. */
export const PMJAY_PRE_DAYS = 3;

const to10 = (p: Paise) => Math.round(p / 1000) * 1000;

/** What CGHS pays for this test at this hospital's city tier. */
export function cghsTestRate(t: DiagnosticTest, h: Hospital): Paise {
  return to10(t.nabh * CGHS_CITY_FACTOR[h.cghsRateBand ?? h.tier]);
}

/** The hospital's own price for the test, as estimated. Never below the government rate. */
export function testPrice(t: DiagnosticTest, h: Hospital): Paise {
  return Math.max(cghsTestRate(t, h), to10(t.nabh * PRIVATE_OVER_CGHS_TESTS * h.costIndex));
}

export type Payer = "esi" | "cghs" | "pmjay" | "policy" | "self";

export interface TestAt {
  hospital: Hospital;
  price: Paise;
  youPay: Paise;
  payer: Payer;
  /** The CGHS rate at this hospital's tier, for the "CGHS pays" line. */
  cghsRate: Paise;
  /** Days before admission the policy repays it for, when the policy is the payer. */
  windowDays: number;
}

/**
 * Whether the policy would repay a scan that leads to this admission.
 *
 * Only when there is an admission, the plan has a pre-hospitalisation window,
 * and the admission itself is paid -- a claim refused for a waiting period
 * takes its pre-hospitalisation costs down with it.
 */
function policyRepaysScans(e: Evaluated, surgery: boolean): boolean {
  return surgery && !isNoPolicy(e.policy) && e.policy.preHospDays > 0 && e.result.insurerPays > 0;
}

function pmjayEligible(input: CaseInput): boolean {
  return input.hasPmjayCard || input.age >= 70;
}

/** Every hospital, cheapest for the family first, for one test. */
export function testOptions(e: Evaluated, t: DiagnosticTest, surgery: boolean): TestAt[] {
  const { input, policy } = e;
  const repays = policyRepaysScans(e, surgery);
  const pmjayReach = surgery && e.procedure.pmjayRate !== null && pmjayEligible(input);

  return registry()
    .hospitals.map((h): TestAt => {
      const price = testPrice(t, h);
      const cghsRate = cghsTestRate(t, h);
      const base = { hospital: h, price, cghsRate, windowDays: 0 };
      if (input.esiInsured && h.esicTieUp) return { ...base, youPay: 0, payer: "esi" };
      if (input.govtEmployeeOrPensioner && h.cghsRateBand !== null) return { ...base, youPay: 0, payer: "cghs" };
      if (pmjayReach && h.pmjayEmpanelled) return { ...base, youPay: 0, payer: "pmjay", windowDays: PMJAY_PRE_DAYS };
      if (repays)
        return {
          ...base,
          youPay: Math.round(price * policy.copayPct),
          payer: "policy",
          windowDays: policy.preHospDays,
        };
      return { ...base, youPay: price, payer: "self" };
    })
    .sort((a, b) => a.youPay - b.youPay || a.price - b.price);
}

export interface SurgeryAt {
  hospital: Hospital;
  next: CaseInput;
  billTotal: Paise;
  /** What the family pays with the policy (or with no insurance), before any scheme. */
  withPolicy: Paise;
  /** The cheapest scheme the family is eligible for here, if any. */
  scheme: { id: SchemeId; label: string } | null;
  youPay: Paise;
  payer: "policy" | "self" | SchemeId;
  current: boolean;
  /** Whether the policy's insurer has a cashless agreement here. */
  cashless: boolean;
}

/**
 * The operation at every hospital, like for like: the same room class where
 * they have it and the nearest by price where they do not, exactly as the
 * hospital comparison on the path does. Each is then checked for a scheme,
 * because a scheme is an alternative to the policy, never a top-up.
 */
export function surgeryOptions(e: Evaluated): SurgeryAt[] {
  const want = tariff(e.hospital, e.input.roomClass) ?? 0;
  return registry()
    .hospitals.map((h): SurgeryAt | null => {
      const classes = h.rooms.filter((r) => r.cls !== "icu");
      if (!classes.length) return null;
      const match =
        classes.find((r) => r.cls === e.input.roomClass) ??
        [...classes].sort((a, b) => Math.abs(a.perDay - want) - Math.abs(b.perDay - want))[0];
      const next = repair({ ...e.input, hospitalId: h.id, roomClass: match.cls });
      const alt = evaluate(next);
      const scheme = bestGovtScheme(alt);
      const viaScheme = scheme !== null && scheme.patientPays !== null && scheme.patientPays < alt.result.patientPays;
      return {
        hospital: h,
        next,
        billTotal: alt.result.billTotal,
        withPolicy: alt.result.patientPays,
        scheme: scheme ? { id: scheme.id, label: scheme.label } : null,
        youPay: viaScheme ? scheme!.patientPays! : alt.result.patientPays,
        payer: viaScheme ? scheme!.id : isNoPolicy(e.policy) ? "self" : "policy",
        current: h.id === e.input.hospitalId,
        cashless: h.network.includes(e.policy.insurer),
      };
    })
    .filter((x): x is SurgeryAt => x !== null)
    .sort((a, b) => a.youPay - b.youPay || a.billTotal - b.billTotal);
}

export interface OneStop {
  hospital: Hospital;
  scans: Paise;
  surgery: Paise | null;
  total: Paise;
  /** The path's case moved to this hospital, when there is an operation to move. */
  next: CaseInput | null;
}

export interface CarePlan {
  tests: { test: DiagnosticTest; at: TestAt[] }[];
  surgery: SurgeryAt[] | null;
  /** Scans and operation at the same hospital, cheapest first. PM-JAY's scan cover needs exactly that. */
  oneStop: OneStop[];
}

export function carePlan(e: Evaluated, tests: DiagnosticTest[], surgery: boolean): CarePlan {
  const perTest = tests.map((test) => ({ test, at: testOptions(e, test, surgery) }));
  const ops = surgery ? surgeryOptions(e) : null;
  const billOf = (o: OneStop) =>
    (ops?.find((x) => x.hospital.id === o.hospital.id)?.billTotal ?? 0) +
    perTest.reduce((sum, x) => sum + (x.at.find((a) => a.hospital.id === o.hospital.id)?.price ?? 0), 0);
  const oneStop = registry()
    .hospitals.map((h): OneStop | null => {
      const scans = perTest.reduce((sum, x) => sum + (x.at.find((a) => a.hospital.id === h.id)?.youPay ?? 0), 0);
      const op = ops?.find((o) => o.hospital.id === h.id) ?? null;
      if (ops && !op) return null;
      return { hospital: h, scans, surgery: op ? op.youPay : null, total: scans + (op ? op.youPay : 0), next: op ? op.next : null };
    })
    .filter((x): x is OneStop => x !== null)
    // Ties go the way the operation table breaks them -- the smaller bill -- so
    // the recommendation and the row starred below it are the same hospital.
    .sort((a, b) => a.total - b.total || billOf(a) - billOf(b));
  return { tests: perTest, surgery: ops, oneStop };
}

const PAYER_WORDS: Record<Payer, string> = {
  esi: "ESI pays on an ESIC referral",
  cghs: "CGHS pays at this empanelled centre",
  pmjay: "PM-JAY pays as part of the operation package",
  policy: "the policy repays it as pre-hospitalisation cost",
  self: "the family pays",
};

/**
 * The plan as facts, for the chat. Same contract as `caseFacts`: every rupee
 * amount stated is listed, so a figure in an answer can be checked.
 */
export function careFacts(e: Evaluated, diagnosis: string | null, tests: DiagnosticTest[], surgery: boolean, start = 1): Fact[] {
  const plan = carePlan(e, tests, surgery);
  const out: Fact[] = [];
  let n = start;
  const add = (text: string, amounts: Paise[]) => out.push({ id: "H" + n++, text, clause: null, amounts });

  add(
    "From the health report the family uploaded" +
      (diagnosis ? `: ${diagnosis}.` : ".") +
      (surgery ? ` The operation it leads to is ${e.procedure.name}.` : " It does not call for an operation.") +
      (tests.length ? ` Tests asked for: ${tests.map((t) => t.name).join("; ")}.` : ""),
    [],
  );
  for (const { test, at } of plan.tests) {
    const best = at[0];
    const dear = at[at.length - 1];
    add(
      `${test.name}: about ${fmt(dear.price)} at ${dear.hospital.name} down to about ${fmt(
        Math.min(...at.map((a) => a.price)),
      )}; the CGHS rate is ${fmt(test.nabh)} in a Tier I city. Cheapest for this family: ${best.hospital.name}, ${
        best.hospital.city
      }, where they pay ${fmt(best.youPay)} (${PAYER_WORDS[best.payer]}${
        best.payer === "policy" ? `, if done within ${best.windowDays} days before admission` : ""
      }${best.payer === "pmjay" ? `, if done within ${best.windowDays} days before the operation there` : ""}).`,
      [dear.price, Math.min(...at.map((a) => a.price)), test.nabh, best.youPay],
    );
  }
  if (plan.surgery?.length) {
    const s = plan.surgery[0];
    add(
      `Cheapest place for the operation for this family: ${s.hospital.name}, ${s.hospital.city}, bill about ${fmt(
        s.billTotal,
      )}, family pays ${fmt(s.youPay)}` + (s.scheme && s.payer === s.scheme.id ? ` through ${s.scheme.label}.` : "."),
      [s.billTotal, s.youPay],
    );
  }
  if (plan.oneStop.length && (tests.length || surgery)) {
    const o = plan.oneStop[0];
    add(
      `Doing everything at one hospital, the cheapest is ${o.hospital.name}, ${o.hospital.city}: ${fmt(o.total)} in all for the family.`,
      [o.total],
    );
  }
  return out;
}
