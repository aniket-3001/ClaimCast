import type { BillLine, Hospital, Policy, Procedure, RoomClass, Route } from "./types";
import { adjudicate, type Adjudication } from "./engine";
import { buildBill, ROOM_LABEL, tariff } from "./bill";
import { fmt, rupees, type Paise } from "./money";
import { hospital, policy, procedure, registry } from "./registry";
import { isNoPolicy } from "./nopolicy";

/** Below this, a deduction is true but not worth a decision. */
export const MATERIALITY: Paise = rupees(10000);

export interface CaseInput {
  hospitalId: string;
  procedureId: string;
  policyId: string;
  roomClass: RoomClass;
  route: Route;
  days: number;
  icuDays: number;
  siUsed: Paise;
  /** Which of the procedure's `implantOptions` was used, where a choice exists. */
  implantId: string;
  /**
   * Whether the stay is classified as a valid 24-hour in-patient admission,
   * independent of `days` — `days` is how long the care actually took;
   * this is the separate, disputable question of how it was billed. Only
   * meaningful where the procedure is not on the day-care list.
   */
  admittedInpatient: boolean;
  /** Drives Ayushman Bharat Vay Vandana eligibility — 70+, no means test. */
  age: number;
  /** Self-reported: an existing PM-JAY / Ayushman Bharat card in the household. */
  hasPmjayCard: boolean;
  /** Self-reported: a serving or retired central government employee, CGHS-eligible. */
  govtEmployeeOrPensioner: boolean;
  /** Self-reported: insured under ESI, or the dependant of someone who is. */
  esiInsured: boolean;
  /**
   * Self-reported: the condition being treated was present before the policy
   * began. Asked rather than inferred -- whether something is pre-existing is
   * a clinical history question, and this app does not answer those.
   */
  preExisting: boolean;
  /**
   * Whether the government scheme for the patient's age group is applied by
   * default -- Vay Vandana at 70 and above, RBSK under 18. Absent means yes;
   * false is the family choosing to see the claim on their own policy instead.
   */
  ageScheme?: boolean;
  /**
   * The patient is the policyholder's parent, covered as a dependant. Decided by the caller, from
   * whose policy it is; the engine only knows what the policy says to do about it.
   */
  dependentParent?: boolean;
}

export interface Evaluated {
  input: CaseInput;
  hospital: Hospital;
  procedure: Procedure;
  policy: Policy;
  lines: BillLine[];
  result: Adjudication;
  /** Set when the claim cannot survive the definition of hospitalisation. */
  repudiation: { reason: string; clause: string } | null;
}

/**
 * Whether this stay is a claim at all.
 *
 * Checked before any arithmetic, because the answer makes the arithmetic
 * irrelevant. A procedure on the day-care list has no minimum stay and
 * nothing below this can change that; off the list, the claim always stands,
 * but whether it stands as a full in-patient admission or gets downgraded to
 * day-care billing is a real choice, decided on the tree rather than here.
 *
 * The waiting period is checked first because it is the harder refusal: a
 * pre-existing condition inside it is not covered in any hospital, in any room,
 * by any route, so no branch below could change the answer.
 */
function admissibility(p: Procedure, pol: Policy, input: CaseInput) {
  if (input.preExisting && pol.monthsInForce < pol.pedWaitingMonths) {
    return {
      reason: `A pre-existing condition, and this policy has run ${pol.monthsInForce} of the ${pol.pedWaitingMonths} months it must before one is covered.`,
      clause: "PED_WAITING",
    };
  }
  if (p.dayCare && !pol.dayCareCovered) {
    return {
      reason: "This policy does not cover day-care procedures, and the procedure has no minimum stay to fall back on.",
      clause: "DAY_CARE",
    };
  }
  return null;
}

/**
 * Force an input back into a combination that actually exists.
 *
 * Changing one field can invalidate another — a hospital that does not stock
 * the selected room class, an insurer with no agreement at the new hospital.
 * Every entry point runs through here so no unreachable case is ever evaluated.
 */
export function repair(c: CaseInput): CaseInput {
  const h = hospital(c.hospitalId);
  const p = procedure(c.procedureId);
  const pol = policy(c.policyId);
  const next = { ...c };
  if (!h.rooms.some((r) => r.cls === next.roomClass)) {
    next.roomClass = h.rooms.find((r) => r.cls !== "icu")?.cls ?? "icu";
  }
  if (next.icuDays > next.days) next.icuDays = next.days;
  // Cashless is not a preference. It exists only where the hospital and the
  // insurer already have an agreement.
  if (!h.network.includes(pol.insurer)) next.route = "reimbursement";
  // The device on offer changes with the procedure. Fall back to the first
  // option rather than carry over a choice that belongs to a different one.
  if (p.implantOptions?.length) {
    if (!p.implantOptions.some((o) => o.id === next.implantId)) next.implantId = p.implantOptions[0].id;
  } else {
    next.implantId = "";
  }
  return next;
}

export function evaluate(input: CaseInput): Evaluated {
  const h = hospital(input.hospitalId);
  const p = procedure(input.procedureId);
  const pol = policy(input.policyId);
  const implantOpt = p.implantOptions?.find((o) => o.id === input.implantId);
  // The clinical bill reflects what was actually done, not the classification
  // dispute below — a stay billed as day-care still occupied a bed and drew
  // nursing for part of a day, so the room-linked lines are never zeroed here.
  // `admittedInpatient` alone decides whether they survive adjudication.
  const billedDays = p.dayCare ? input.days : Math.max(input.days, 1);
  const lines = buildBill({
    procedure: p,
    hospital: h,
    roomClass: input.roomClass,
    days: billedDays,
    icuDays: input.icuDays,
    includeOutsideWindow: true,
    implantAmount: implantOpt?.amount,
    implantLabel: implantOpt?.label,
  });
  const repudiation = admissibility(p, pol, input);
  const dayCareDowngrade = !p.dayCare && !input.admittedInpatient;
  return {
    input,
    hospital: h,
    procedure: p,
    policy: pol,
    lines,
    result: adjudicate({
      lines,
      policy: pol,
      siUsed: input.siUsed,
      repudiated: repudiation,
      dayCareDowngrade,
      procedureId: p.id,
      outOfNetwork: !h.network.includes(pol.insurer),
      dependentParent: input.dependentParent,
    }),
    repudiation,
  };
}

/**
 * A range, not a number.
 *
 * The room rate is known exactly -- it is on a board at the admission desk -- so
 * the room line is held fixed and only the clinical part of the bill is spread
 * across the private-sector range for the procedure. That is why the band on the
 * patient share is tighter than the band on the bill: a good part of what the
 * patient will pay is decided by the tariff and the policy, not by how the
 * operation goes.
 *
 * **Where the spread comes from.** `Band` is a pair of multiples of the centre,
 * and the caller chooses which pair. Passing none uses the procedure's own
 * `privateLow`/`privateHigh`, which slide 5 declares as simulated; passing the
 * cost model's p10 and p90 divided by its p50 uses a spread fitted to NSS 75th
 * Round strata instead. The engine takes the spread and nothing else from the
 * model -- the level stays the hospital's own tariff, because the hospital is
 * the thing the journey is manipulating and a national mean cannot tell you what
 * this bed costs. That is the topology slide 5 draws: a fitted distribution at
 * the edge, a deterministic core that adjudicates it.
 */
export interface Band {
  /** The tenth percentile as a multiple of the centre, so below 1. */
  low: number;
  /** The ninetieth, so above 1. */
  high: number;
}

export interface Forecast {
  low: Adjudication;
  point: Adjudication;
  high: Adjudication;
  /** Refused for certain, whatever the clinical bill turns out to be. */
  certain: Paise;
  /** Which spread produced this band, for the screen to say so. */
  spread: "simulated" | "fitted";
}

export function forecast(e: Evaluated, band?: Band): Forecast {
  const { privateLow: lo, privateHigh: hi } = e.procedure;
  const mid = (lo + hi) / 2;
  const k = band ?? { low: lo / mid, high: hi / mid };
  const dayCareDowngrade = !e.procedure.dayCare && !e.input.admittedInpatient;
  const scale = (f: number): Adjudication =>
    adjudicate({
      lines: e.lines.map((l) => (l.kind === "room" ? l : { ...l, amount: Math.round(l.amount * f) })),
      policy: e.policy,
      siUsed: e.input.siUsed,
      repudiated: e.repudiation,
      dayCareDowngrade,
      procedureId: e.procedure.id,
      outOfNetwork: !e.hospital.network.includes(e.policy.insurer),
      dependentParent: e.input.dependentParent,
    });

  const roomExcess = e.result.deductions
    .filter((d) => d.clause === "ROOM_CAP" || d.clause === "ICU_CAP")
    .reduce((t, d) => t + d.amount, 0);

  return {
    low: scale(k.low),
    point: e.result,
    high: scale(k.high),
    certain: roomExcess,
    spread: band ? "fitted" : "simulated",
  };
}

export interface Option {
  key: string;
  label: string;
  detail: string;
  patientPays: Paise;
  billTotal: Paise;
  delta: Paise;
  current: boolean;
  available: boolean;
  /** The case this option produces, already repaired. */
  next: CaseInput;
}

/** The same admission in every room class this hospital actually has. */
export function roomOptions(e: Evaluated): Option[] {
  const here = e.result.patientPays;
  return e.hospital.rooms
    .filter((r) => r.cls !== "icu")
    .map((r) => {
      const next = repair({ ...e.input, roomClass: r.cls });
      const alt = evaluate(next);
      return {
        next,
        key: r.cls,
        label: ROOM_LABEL[r.cls],
        detail: `${inr(r.perDay)} a day`,
        patientPays: alt.result.patientPays,
        billTotal: alt.result.billTotal,
        delta: alt.result.patientPays - here,
        current: r.cls === e.input.roomClass,
        available: true,
      };
    })
    .sort((a, b) => a.patientPays - b.patientPays);
}

/**
 * The same admission at every hospital in the set.
 *
 * Like for like: the same room class where they stock it, and the nearest by
 * tariff where they do not. Comparing each hospital at its own cheapest bed
 * would flatter the cheap ones and answer a question nobody asked.
 */
export function hospitalOptions(e: Evaluated): Option[] {
  const here = e.result.patientPays;
  const want = tariff(e.hospital, e.input.roomClass) ?? 0;
  return registry().hospitals.map((h) => {
    const classes = h.rooms.filter((r) => r.cls !== "icu");
    if (!classes.length) return null;
    const match =
      classes.find((r) => r.cls === e.input.roomClass) ??
      [...classes].sort((a, b) => Math.abs(a.perDay - want) - Math.abs(b.perDay - want))[0];
    const next = repair({ ...e.input, hospitalId: h.id, roomClass: match.cls });
    const alt = evaluate(next);
    const inNetwork = h.network.includes(e.policy.insurer);
    return {
      next,
      key: h.id,
      label: h.name,
      detail: `${h.city} · ${ROOM_LABEL[match.cls].toLowerCase()} · ${
        inNetwork ? "cashless" : `reimbursement, ${h.settlementDays} days`
      }`,
      patientPays: alt.result.patientPays,
      billTotal: alt.result.billTotal,
      delta: alt.result.patientPays - here,
      current: h.id === e.input.hospitalId,
      available: inNetwork,
    };
  })
    .filter((o): o is Option => o !== null)
    .sort((a, b) => a.patientPays - b.patientPays);
}

function inr(p: Paise): string {
  const n = Math.round(p / 100);
  const s = String(n);
  if (s.length <= 3) return "₹" + s;
  return "₹" + s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + s.slice(-3);
}

/* ── The journey, as a tree ──────────────────────────────────────────────── */

export interface Branch {
  key: string;
  label: string;
  note: string;
  patientPays: Paise;
  /** Against the path currently taken. */
  delta: Paise;
  chosen: boolean;
  /** Why this branch is shut, where it is shut. */
  blocked: string | null;
  next: CaseInput;
  /**
   * Cash the family must find on the day, before any of it comes back —
   * distinct from `patientPays`, which is what is never returned. Set only
   * where a branch changes timing rather than the final split.
   */
  upfront?: Paise;
}

export interface Stage {
  id: string;
  step: number;
  /** Where on the care journey this is faced. The deck's five points, in order. */
  phase: string;
  question: string;
  mechanic: string;
  clause: string | null;
  branches: Branch[];
  /** Set where the stage exists but has nothing left to decide. */
  settled: string | null;
}

/** Four is as many branches as a person reads at an admission desk. */
const BRANCH_CAP = 4;

/**
 * The choices still open, in the order they are actually faced.
 *
 * Each branch is a full re-adjudication, so the rupee figure under it is what
 * the family would pay on that path rather than an adjustment applied to this
 * one. The hospital stage is capped at four: the one being used and the three
 * that move the number most. The rest are on the Working tab, in full.
 */
export function journey(e: Evaluated): Stage[] {
  const here = e.result.patientPays;

  const all = hospitalOptions(e);
  const current = all.find((o) => o.current)!;
  const shown = [current, ...all.filter((o) => !o.current).slice(0, BRANCH_CAP - 1)].sort(
    (a, b) => a.patientPays - b.patientPays,
  );
  const where: Omit<Stage, "step"> = {
    id: "hospital",
    phase: "Admission",
    question: "Where",
    mechanic: "Room tariff against the sub-limit",
    clause: "ROOM_CAP",
    settled: null,
    branches: shown.map((o) => ({
      key: o.key,
      label: o.label,
      note: o.detail,
      patientPays: o.patientPays,
      delta: o.delta,
      chosen: o.current,
      blocked: null,
      next: o.next,
    })),
  };

  const rooms = roomOptions(e);
  const which: Omit<Stage, "step"> = {
    id: "room",
    phase: "Admission",
    question: "Which bed",
    mechanic: "Proportionate deduction on room-linked charges",
    clause: e.policy.proportionateDeduction ? "PROPORTIONATE" : "ROOM_CAP",
    settled:
      rooms.length === 1
        ? "One room class in the building. There is nowhere cheaper to move."
        : rooms.every((r) => r.delta >= 0)
          ? "Already on the cheapest terms this hospital offers."
          : null,
    branches: rooms.map((o) => ({
      key: o.key,
      label: o.label,
      note: o.detail,
      patientPays: o.patientPays,
      delta: o.delta,
      chosen: o.current,
      blocked: null,
      next: o.next,
    })),
  };

  const inNetwork = e.hospital.network.includes(e.policy.insurer);
  const how: Omit<Stage, "step"> = {
    id: "route",
    phase: "Investigation",
    question: "How you claim",
    mechanic: "What the family has to find on the day, and when it comes back",
    clause: null,
    settled: inNetwork
      ? null
      : `${e.hospital.name} has no agreement with ${e.policy.insurer}. Only one route is open.`,
    branches: (["cashless", "reimbursement"] as Route[]).map((r) => ({
      key: r,
      label: r === "cashless" ? "Cashless" : "Reimbursement",
      note:
        r === "cashless"
          ? inNetwork
            ? `Pre-authorisation, about ${e.hospital.preAuthHours} hours. The insurer settles the rest directly.`
            : "No agreement with this insurer"
          : `Pay the full bill at discharge, and wait about ${e.hospital.settlementDays} days to get ${fmt(e.result.insurerPays)} of it back.`,
      // The route changes nothing about what is owed in the end, only what
      // the family has to find on the day and when the rest comes back.
      patientPays: here,
      delta: 0,
      chosen: e.input.route === r,
      blocked: r === "cashless" && !inNetwork ? "Not available here" : null,
      next: repair({ ...e.input, route: r }),
      upfront: r === "cashless" ? e.result.patientPays : e.result.billTotal,
    })),
  };

  // With no insurance there is no claim to make, so no "how you claim" fork.
  const stages: Omit<Stage, "step">[] = isNoPolicy(e.policy) ? [where, which] : [where, which, how];

  if (e.procedure.implantOptions && e.procedure.implantOptions.length > 1) {
    stages.push(implantStage(e));
  }
  if (!e.procedure.dayCare) {
    stages.push(stayStage(e));
  }

  return stages.map((s, i) => ({ ...s, step: i + 1 }));
}

/** The same admission with every device on offer, in place of the one billed. */
export function implantOptions(e: Evaluated): Option[] {
  const here = e.result.patientPays;
  const options = e.procedure.implantOptions ?? [];
  return options
    .map((o) => {
      const next = repair({ ...e.input, implantId: o.id });
      const alt = o.id === e.input.implantId ? e : evaluate(next);
      return {
        next,
        key: o.id,
        label: o.label,
        detail: `${inr(o.amount)} listed`,
        patientPays: alt.result.patientPays,
        billTotal: alt.result.billTotal,
        delta: alt.result.patientPays - here,
        current: o.id === e.input.implantId,
        available: true,
      };
    })
    .sort((a, b) => a.patientPays - b.patientPays);
}

function implantStage(e: Evaluated): Omit<Stage, "step"> {
  const options = implantOptions(e);
  return {
    id: "implant",
    phase: "Procedure",
    question: "Which implant",
    mechanic: "Sub-limit applies regardless of the balance sum insured",
    clause: "IMPLANT_SUBLIMIT",
    // Below the sub-limit, a cheaper device only lowers what the insurer
    // pays — the patient's share is untouched either way, and the branches
    // need to say so, or an unchanging number reads as a stuck screen.
    settled: options.every((o) => o.delta === 0)
      ? "Every option here is within the sub-limit. The choice changes what the insurer pays, not what the family owes."
      : null,
    branches: options.map((o) => ({
      key: o.key,
      label: o.label,
      note: o.detail,
      patientPays: o.patientPays,
      delta: o.delta,
      chosen: o.current,
      blocked: null,
      next: o.next,
    })),
  };
}

/**
 * Whether the same admission survives the 24-hour definition, or gets billed
 * as day-care instead. Both branches carry the same clinical bill — the same
 * days, the same lines — so the figure under each is what the classification
 * alone is worth, not a shorter stay.
 */
function stayStage(e: Evaluated): Omit<Stage, "step"> {
  const inpatient = e.input.admittedInpatient;
  const asInpatient = repair({ ...e.input, admittedInpatient: true });
  const asDayCare = repair({ ...e.input, admittedInpatient: false });
  const inpatientAlt = inpatient ? e : evaluate(asInpatient);
  const dayCareAlt = inpatient ? evaluate(asDayCare) : e;
  return {
    id: "stay",
    phase: "Recovery",
    question: "How the stay is classified",
    mechanic: "Room, nursing and ICU charges need a valid 24-hour admission behind them",
    clause: "DAY_CARE_DOWNGRADE",
    settled: null,
    branches: [
      {
        key: "inpatient",
        label: "24 hours or more in a bed",
        note: "Meets the definition of hospitalisation",
        patientPays: inpatientAlt.result.patientPays,
        delta: inpatientAlt.result.patientPays - e.result.patientPays,
        chosen: inpatient,
        blocked: null,
        next: asInpatient,
      },
      {
        key: "daycare",
        label: "Discharged before 24 hours",
        note: "Same treatment, billed as day-care instead",
        patientPays: dayCareAlt.result.patientPays,
        delta: dayCareAlt.result.patientPays - e.result.patientPays,
        chosen: !inpatient,
        blocked: null,
        next: asDayCare,
      },
    ],
  };
}

/** The gate every claim passes before any of the arithmetic matters. */
export interface Gate {
  question: string;
  test: string;
  passed: boolean;
  clause: string;
  detail: string;
  /**
   * Whether this is worth a node on the tree at all. Off the day-care list,
   * every stay is a valid claim regardless of length — the 24-hour question
   * is a real decision, but it belongs to the Recovery stage, not to a
   * checkpoint that would otherwise always read "Yes" and say nothing.
   */
  relevant: boolean;
}

export function gate(e: Evaluated): Gate {
  const p = e.procedure;
  const pol = e.policy;
  if (e.input.preExisting) {
    const served = pol.monthsInForce >= pol.pedWaitingMonths;
    // Served, the waiting period is no longer the question; fall through to
    // the day-care test when that one can still fail.
    if (!served || !p.dayCare) {
      return {
        question: "Is this a claim at all?",
        test: served ? "Pre-existing condition, waiting period served" : "Pre-existing condition, inside the waiting period",
        passed: served,
        clause: "PED_WAITING",
        detail: served
          ? `The policy has run ${pol.monthsInForce} months against a ${pol.pedWaitingMonths}-month waiting period, so the condition is covered like any other.`
          : e.repudiation!.reason,
        relevant: true,
      };
    }
  }
  if (!p.dayCare) {
    return {
      question: "Is this a claim at all?",
      test: "Not on the day-care list, so any stay is a valid claim",
      passed: true,
      clause: "DAY_CARE",
      detail: "There is no minimum stay to clear before a deduction can even be argued. Whether it is billed as a full 24-hour admission is decided further down.",
      relevant: false,
    };
  }
  return {
    question: "Is this a claim at all?",
    test: "On the day-care list",
    passed: e.repudiation === null,
    clause: e.repudiation?.clause ?? "DAY_CARE",
    detail: e.repudiation?.reason ?? "A listed day-care procedure. No minimum stay applies.",
    relevant: true,
  };
}

/** Deductions no branch of the tree can move. */
const IMMOVABLE = ["LIST_I", "IMPLANT_SUBLIMIT", "PRE_POST_WINDOW"];

export interface Fixed {
  clause: string;
  label: string;
  amount: Paise;
}

/**
 * What is refused whichever path is taken.
 *
 * These come off the procedure and the policy schedule, never off the room
 * tariff, so they survive every choice on the tree. Saying so plainly is more
 * use than letting a family go on hunting for a cheaper bed to fix them.
 */
export function fixedRegardless(e: Evaluated): Fixed[] {
  const by = new Map<string, Fixed>();
  for (const d of e.result.deductions) {
    if (!IMMOVABLE.includes(d.clause)) continue;
    const at = by.get(d.clause);
    if (at) at.amount += d.amount;
    else by.set(d.clause, { clause: d.clause, label: LABEL[d.clause] ?? d.line, amount: d.amount });
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount);
}

const LABEL: Record<string, string> = {
  LIST_I: "Non-medical items",
  IMPLANT_SUBLIMIT: "Implant above its sub-limit",
  PRE_POST_WINDOW: "Outside the pre and post-hospitalisation window",
};

/* ── Government schemes, as alternatives to the policy — never on top of it ── */

export type SchemeId = "private" | "pmjay" | "vayvandana" | "rbsk" | "cghs" | "esi";

/**
 * The two age groups a government scheme covers on age alone. Only two, on
 * purpose: children under 18 (RBSK) and people aged 70 and above (Ayushman
 * Vay Vandana). Every other scheme here turns on a card, a job or a wage.
 */
export const CHILD_UNDER = 18;
export const SENIOR_FROM = 70;

/**
 * The treatments here that RBSK pays for. RBSK treats a published list of
 * childhood conditions -- defects at birth, deficiencies, diseases and
 * developmental delays -- free at government and empanelled hospitals on a
 * District Early Intervention Centre referral. Of the procedures ClaimCast
 * prices, only cataract surgery falls on that list (congenital cataract); an
 * appendix or a fracture is not a listed condition, and saying so is the
 * point of the check.
 */
export const RBSK_COVERED: Record<string, string> = {
  "p-cataract": "congenital cataract",
};

export interface Scheme {
  id: SchemeId;
  label: string;
  /** Why this row exists at all, and what it would pay. */
  detail: string;
  /** Null where the scheme does not reach this hospital or procedure at all. */
  patientPays: Paise | null;
  packageRate: Paise | null;
  eligible: boolean;
  /** Why it's greyed out, when it is. */
  reason: string | null;
  clause: string;
  current: boolean;
}

/**
 * A government package is a flat, cashless rate for the whole admission — no
 * room-rent cap, no proportionate deduction, no co-pay, because none of that
 * machinery exists in these schemes. It either reaches the hospital and the
 * procedure, or it does not.
 *
 * Eligibility here is deliberately narrow. PM-JAY's ordinary route is
 * means-tested against a beneficiary database no app can see, so it is
 * asked as a plain fact — does the household already hold a card — rather
 * than guessed at. Vay Vandana is the one exception: age 70 and up qualifies
 * on its own, no other test, which is exactly why a family can be eligible
 * and not know it.
 */
export function schemeOptions(e: Evaluated): Scheme[] {
  const { hospital: h, procedure: p, input } = e;

  const pmjayReach = h.pmjayEmpanelled && p.pmjayRate !== null;
  const rbskCondition = RBSK_COVERED[p.id] ?? null;
  const rbskReach = h.pmjayEmpanelled && rbskCondition !== null;
  const cghsReach = h.cghsRateBand !== null && p.cghsRate !== null;
  const esiReach = h.esicTieUp && p.cghsRate !== null;

  const schemes: Scheme[] = [
    {
      id: "private",
      label: e.policy.product,
      detail: "The claim worked out on the rest of this page.",
      patientPays: e.result.patientPays,
      packageRate: null,
      eligible: true,
      reason: null,
      clause: "PRIVATE_INDEMNITY",
      current: true,
    },
    {
      id: "pmjay",
      label: "PM-JAY (Ayushman Bharat)",
      detail: pmjayReach
        ? `Package rate for this procedure: ${fmt(p.pmjayRate!)}, cashless, no balance billing.`
        : `Not available: ${!h.pmjayEmpanelled ? "hospital is not PM-JAY empanelled" : "no package rate for this procedure"}.`,
      patientPays: pmjayReach ? 0 : null,
      packageRate: pmjayReach ? p.pmjayRate : null,
      eligible: pmjayReach && input.hasPmjayCard,
      reason: !pmjayReach
        ? "not offered here"
        : !input.hasPmjayCard
          ? "household has no PM-JAY card on record"
          : null,
      clause: "PMJAY",
      current: false,
    },
    {
      id: "vayvandana",
      label: "Ayushman Bharat Vay Vandana (70+)",
      detail: pmjayReach
        ? `Same package rate, ${fmt(p.pmjayRate!)} — but on age alone, not income or an existing card.`
        : `Not available: ${!h.pmjayEmpanelled ? "hospital is not PM-JAY empanelled" : "no package rate for this procedure"}.`,
      patientPays: pmjayReach ? 0 : null,
      packageRate: pmjayReach ? p.pmjayRate : null,
      eligible: pmjayReach && input.age >= SENIOR_FROM,
      reason: !pmjayReach ? "not offered here" : input.age < SENIOR_FROM ? `patient is ${input.age}, scheme starts at 70` : null,
      clause: "VAY_VANDANA",
      current: false,
    },
    {
      id: "rbsk",
      label: "RBSK (Rashtriya Bal Swasthya Karyakram, under 18)",
      detail: rbskReach
        ? `Free for a child, as treatment of ${rbskCondition}, at government and empanelled hospitals on a DEIC referral.`
        : `Not available: ${
            rbskCondition === null ? "RBSK treats listed childhood conditions only, and this is not one" : "hospital is not a government or empanelled centre"
          }.`,
      patientPays: rbskReach ? 0 : null,
      packageRate: rbskReach ? p.pmjayRate : null,
      eligible: rbskReach && input.age < CHILD_UNDER,
      reason: !rbskReach ? "not offered here" : input.age >= CHILD_UNDER ? `patient is ${input.age}, scheme is for under 18` : null,
      clause: "RBSK",
      current: false,
    },
    {
      id: "cghs",
      label: "CGHS",
      detail: cghsReach
        ? `Package rate for this procedure: ${fmt(p.cghsRate!)}, cashless at empanelled centres.`
        : `Not available: ${h.cghsRateBand === null ? "hospital is not a CGHS centre" : "no package rate for this procedure"}.`,
      patientPays: cghsReach ? 0 : null,
      packageRate: cghsReach ? p.cghsRate : null,
      eligible: cghsReach && input.govtEmployeeOrPensioner,
      reason: !cghsReach
        ? "not offered here"
        : !input.govtEmployeeOrPensioner
          ? "not a serving or retired central government employee"
          : null,
      clause: "CGHS_SCHEME",
      current: false,
    },
    {
      id: "esi",
      label: "ESI (Employees' State Insurance)",
      detail: esiReach
        ? `ESIC tie-up, settled at the CGHS package rate of ${fmt(p.cghsRate!)}, cashless on an ESIC referral.`
        : `Not available: ${!h.esicTieUp ? "hospital has no ESIC tie-up" : "no CGHS package rate for ESIC to settle this procedure at"}.`,
      patientPays: esiReach ? 0 : null,
      packageRate: esiReach ? p.cghsRate : null,
      eligible: esiReach && input.esiInsured,
      reason: !esiReach ? "not offered here" : !input.esiInsured ? "not insured under ESI" : null,
      clause: "ESI_SCHEME",
      current: false,
    },
  ];

  return schemes;
}

/**
 * The government scheme the patient's age puts them in, if any: RBSK under 18,
 * Ayushman Vay Vandana at 70 and above. `applies` is whether it reaches this
 * hospital and treatment; `applied` is whether it is the payer the headline
 * figure uses -- by default it is, unless the family switched it off.
 */
export interface AgeScheme {
  scheme: Scheme;
  group: "child" | "senior";
  applies: boolean;
  applied: boolean;
}

export function ageScheme(e: Evaluated): AgeScheme | null {
  const age = e.input.age;
  const group = age < CHILD_UNDER ? "child" : age >= SENIOR_FROM ? "senior" : null;
  if (!group) return null;
  const scheme = schemeOptions(e).find((s) => s.id === (group === "child" ? "rbsk" : "vayvandana"))!;
  const applies = scheme.eligible && scheme.patientPays !== null;
  return { scheme, group, applies, applied: applies && e.input.ageScheme !== false };
}

/** What the family pays as things stand: the age scheme's figure when it is applied, the policy's otherwise. */
export function familyPays(e: Evaluated): { amount: Paise; via: Scheme | null } {
  const a = ageScheme(e);
  if (a?.applied && a.scheme.patientPays! < e.result.patientPays) return { amount: a.scheme.patientPays!, via: a.scheme };
  return { amount: e.result.patientPays, via: null };
}

/** The single most compelling reason to look past the private policy at all. */
export function bestGovtScheme(e: Evaluated): Scheme | null {
  const eligible = schemeOptions(e).filter((s) => s.id !== "private" && s.eligible);
  if (!eligible.length) return null;
  return eligible.reduce((best, s) => (s.patientPays! < best.patientPays! ? s : best));
}
