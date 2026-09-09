import type { BillLine, Hospital, Policy, Procedure, RoomClass, Route } from "./types";
import { adjudicate, type Adjudication } from "./engine";
import { buildBill, ROOM_LABEL, tariff } from "./bill";
import { rupees, type Paise } from "./money";
import { hospital, HOSPITALS } from "../data/hospitals";
import { procedure } from "../data/procedures";
import { policy } from "../data/policies";

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
 * irrelevant. A procedure on the day-care list has no minimum stay; anything
 * else needs a full 24 hours in a bed.
 */
function admissibility(p: Procedure, pol: Policy, days: number) {
  if (p.dayCare) {
    if (!pol.dayCareCovered) {
      return {
        reason: "This policy does not cover day-care procedures, and the stay is under 24 hours.",
        clause: "DAY_CARE",
      };
    }
    return null;
  }
  if (days < 1) {
    return {
      reason: "Under the 24-hour minimum, and the procedure is not on the day-care list.",
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
  const pol = policy(c.policyId);
  const next = { ...c };
  if (!h.rooms.some((r) => r.cls === next.roomClass)) {
    next.roomClass = h.rooms.find((r) => r.cls !== "icu")?.cls ?? "icu";
  }
  if (next.icuDays > next.days) next.icuDays = next.days;
  // Cashless is not a preference. It exists only where the hospital and the
  // insurer already have an agreement.
  if (!h.network.includes(pol.insurer)) next.route = "reimbursement";
  return next;
}

export function evaluate(input: CaseInput): Evaluated {
  const h = hospital(input.hospitalId);
  const p = procedure(input.procedureId);
  const pol = policy(input.policyId);
  const lines = buildBill({
    procedure: p,
    hospital: h,
    roomClass: input.roomClass,
    days: input.days,
    icuDays: input.icuDays,
    includeOutsideWindow: true,
  });
  const repudiation = admissibility(p, pol, input.days);
  return {
    input,
    hospital: h,
    procedure: p,
    policy: pol,
    lines,
    result: adjudicate({ lines, policy: pol, siUsed: input.siUsed, repudiated: repudiation }),
    repudiation,
  };
}

/**
 * A range, not a number.
 *
 * The room rate is known exactly — it is on a board at the admission desk — so
 * the room line is held fixed and only the clinical part of the bill is spread
 * across the observed private-sector range for the procedure. That is why the
 * band on the patient share is tighter than the band on the bill: a good part
 * of what the patient will pay is decided by the tariff and the policy, not by
 * how the operation goes.
 */
export interface Forecast {
  low: Adjudication;
  point: Adjudication;
  high: Adjudication;
  /** Refused for certain, whatever the clinical bill turns out to be. */
  certain: Paise;
}

export function forecast(e: Evaluated): Forecast {
  const { privateLow: lo, privateHigh: hi } = e.procedure;
  const mid = (lo + hi) / 2;
  const scale = (k: number): Adjudication =>
    adjudicate({
      lines: e.lines.map((l) => (l.kind === "room" ? l : { ...l, amount: Math.round(l.amount * k) })),
      policy: e.policy,
      siUsed: e.input.siUsed,
      repudiated: e.repudiation,
    });

  const roomExcess = e.result.deductions
    .filter((d) => d.clause === "ROOM_CAP" || d.clause === "ICU_CAP")
    .reduce((t, d) => t + d.amount, 0);

  return { low: scale(lo / mid), point: e.result, high: scale(hi / mid), certain: roomExcess };
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
  return HOSPITALS.map((h) => {
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
  const where: Stage = {
    id: "hospital",
    step: 1,
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

  const inNetwork = e.hospital.network.includes(e.policy.insurer);
  const how: Stage = {
    id: "route",
    step: 3,
    phase: "Investigation",
    question: "How you claim",
    mechanic: "What the family has to find on the day",
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
            ? `Pre-authorisation, about ${e.hospital.preAuthHours} hours`
            : "No agreement with this insurer"
          : `Pay the bill, wait about ${e.hospital.settlementDays} days`,
      // The route changes nothing about what is owed, only when it is owed.
      patientPays: here,
      delta: 0,
      chosen: e.input.route === r,
      blocked: r === "cashless" && !inNetwork ? "Not available here" : null,
      next: repair({ ...e.input, route: r }),
    })),
  };

  const rooms = roomOptions(e);
  const which: Stage = {
    id: "room",
    step: 2,
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

  return [where, which, how];
}

/** The gate every claim passes before any of the arithmetic matters. */
export interface Gate {
  question: string;
  test: string;
  passed: boolean;
  clause: string;
  detail: string;
}

export function gate(e: Evaluated): Gate {
  const p = e.procedure;
  return {
    question: "Is this a claim at all?",
    test: p.dayCare ? "On the day-care list" : "At least 24 hours in a bed",
    passed: e.repudiation === null,
    clause: e.repudiation?.clause ?? "DAY_CARE",
    detail:
      e.repudiation?.reason ??
      (p.dayCare
        ? "A listed day-care procedure. No minimum stay applies."
        : `${e.input.days} ${e.input.days === 1 ? "night" : "nights"}. The definition is met.`),
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
