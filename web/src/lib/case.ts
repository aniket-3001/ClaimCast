import type { BillLine, Hospital, Policy, Procedure, RoomClass, Route } from "./types";
import { adjudicate, type Adjudication } from "./engine";
import { buildBill, ROOM_LABEL } from "./bill";
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
}

/** The same admission in every room class this hospital actually has. */
export function roomOptions(e: Evaluated): Option[] {
  const here = e.result.patientPays;
  return e.hospital.rooms
    .filter((r) => r.cls !== "icu")
    .map((r) => {
      const alt = evaluate({ ...e.input, roomClass: r.cls });
      return {
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
 * The cheapest room class available at each is used, because that is the
 * comparison a family can act on. A hospital outside the insurer's network is
 * still listed — it may well be the right choice — but the entry says what
 * choosing it means for the money the family has to find on the day.
 */
export function hospitalOptions(e: Evaluated): Option[] {
  const here = e.result.patientPays;
  return HOSPITALS.map((h) => {
    const classes = h.rooms.filter((r) => r.cls !== "icu");
    if (!classes.length) return null;
    const best = classes
      .map((r) => evaluate({ ...e.input, hospitalId: h.id, roomClass: r.cls }))
      .sort((a, b) => a.result.patientPays - b.result.patientPays)[0];
    const inNetwork = h.network.includes(e.policy.insurer);
    return {
      key: h.id,
      label: h.name,
      detail: `${h.city} · ${ROOM_LABEL[best.input.roomClass].toLowerCase()} · ${
        inNetwork ? "cashless" : `reimbursement, ${h.settlementDays} days`
      }`,
      patientPays: best.result.patientPays,
      billTotal: best.result.billTotal,
      delta: best.result.patientPays - here,
      current: h.id === e.input.hospitalId,
      available: inNetwork,
    };
  })
    .filter((o): o is Option => o !== null)
    .sort((a, b) => a.patientPays - b.patientPays);
}

export interface Fork {
  stage: string;
  decision: string;
  mechanic: string;
  /** Rupees riding on this one choice. Null where the fork is not in play. */
  amount: Paise | null;
  detail: string;
}

/**
 * The five points on the journey where a choice is still open.
 *
 * Every amount here is the difference between two full adjudications, not a
 * headline figure. Where a fork has nothing riding on it — a hospital with one
 * room class, a stay far past 24 hours — it says so rather than inventing a
 * number to fill the space.
 */
export function forks(e: Evaluated): Fork[] {
  const rooms = roomOptions(e);
  const bestRoom = rooms[0];
  const hospitals = hospitalOptions(e);
  const bestHospital = hospitals.find((h) => h.available) ?? hospitals[0];
  const inNetwork = e.hospital.network.includes(e.policy.insurer);

  const implantExcess = e.result.deductions
    .filter((d) => d.clause === "IMPLANT_SUBLIMIT" || d.clause === "LIST_I")
    .reduce((t, d) => t + d.amount, 0);

  const stay = e.input.days;

  return [
    {
      stage: "Admission",
      decision: "Which hospital",
      mechanic: "network or not",
      amount: bestHospital && bestHospital.delta < 0 ? -bestHospital.delta : null,
      detail:
        bestHospital && bestHospital.delta < 0
          ? `${bestHospital.label} settles the same admission for less.`
          : inNetwork
            ? "Already the cheapest of the ten on this policy."
            : "Outside the network. No cheaper option in the set either.",
    },
    {
      stage: "Admission",
      decision: "Which room class",
      mechanic: "proportionate deduction",
      amount: bestRoom && bestRoom.delta < 0 ? -bestRoom.delta : null,
      detail:
        bestRoom && bestRoom.delta < 0
          ? `${bestRoom.label} instead, ${bestRoom.detail}.`
          : e.hospital.rooms.filter((r) => r.cls !== "icu").length === 1
            ? "One room class in the building. Nothing to move to."
            : "Already on the cheapest terms this hospital offers.",
    },
    {
      stage: "Investigation",
      decision: "Cashless or reimbursement",
      mechanic: "what the family must float",
      amount: inNetwork ? null : e.result.billTotal,
      detail: inNetwork
        ? `Cashless. Pre-authorisation runs about ${e.hospital.preAuthHours} hours.`
        : `The whole bill, then a wait of about ${e.hospital.settlementDays} days.`,
    },
    {
      stage: "Procedure",
      decision: "Implant and consumables",
      mechanic: "sub-limits and IRDAI List I",
      amount: implantExcess || null,
      detail: implantExcess
        ? "Refused whatever room is taken and whatever the sum insured is."
        : "No implant, and the non-medical items are immaterial here.",
    },
    {
      stage: "Recovery",
      decision: "The 24-hour rule",
      mechanic: "day-care or in-patient",
      amount: e.procedure.dayCare || stay > 1 ? null : e.result.billTotal,
      detail: e.procedure.dayCare
        ? "On the day-care list. No minimum stay applies."
        : stay > 1
          ? `A ${stay}-day stay. The rule is not in play.`
          : "A single day, and not a listed day-care procedure. The whole claim turns on the clock.",
    },
  ];
}

function inr(p: Paise): string {
  const n = Math.round(p / 100);
  const s = String(n);
  if (s.length <= 3) return "₹" + s;
  return "₹" + s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + s.slice(-3);
}
