import type { Paise } from "./money";

/**
 * How a bill line behaves under a room-rent sub-limit.
 *
 * This is the whole game. IRDAI/HLT/REG/CIR/151/06/2020 lets an insurer scale
 * down the charges that a hospital prices BY ROOM CATEGORY when the room taken
 * is dearer than the policy allows — and forbids scaling the rest. Getting the
 * membership of `associated` wrong by one category is worth tens of thousands
 * of rupees on a single admission.
 */
export type LineKind =
  /** The room itself. Capped at the policy's per-day limit; excess is the patient's. */
  | "room"
  /** Priced by room category, so it moves with the room: surgeon, OT, anaesthesia, nursing. */
  | "associated"
  /** ICU. Its own per-day cap. Explicitly OUTSIDE proportionate deduction. */
  | "icu"
  /** Diagnostics, pharmacy, physiotherapy. Same price in any room. Never scaled. */
  | "independent"
  /** Implants and high-value consumables, against their own sub-limit. */
  | "implant"
  /** Pre- or post-hospitalisation spend outside the policy's window. */
  | "outside_window"
  /** IRDAI List I. Never payable, in any room, under any policy. */
  | "non_payable";

export interface BillLine {
  id: string;
  label: string;
  kind: LineKind;
  amount: Paise;
  /** Set on `room` and `icu` lines so a per-day cap can be compared like for like. */
  days?: number;
  perDay?: Paise;
  note?: string;
}

export type RoomClass = "general" | "semi_private" | "private" | "deluxe" | "suite" | "icu";

export interface RoomTariff {
  cls: RoomClass;
  perDay: Paise;
}

export interface Hospital {
  id: string;
  name: string;
  city: string;
  /** NHA city classification, which drives the CGHS rate band. */
  tier: "X" | "Y" | "Z";
  beds: number;
  /** Which insurers hold a cashless network agreement with this hospital. */
  network: string[];
  pmjayEmpanelled: boolean;
  /**
   * Holds an ESIC tie-up for secondary and super-speciality referrals. ESIC
   * settles those at CGHS package rates, so the tie-up and a CGHS rate for the
   * procedure are together what puts ESI within reach here.
   */
  esicTieUp: boolean;
  cghsRateBand: "X" | "Y" | "Z" | null;
  rooms: RoomTariff[];
  /** Median days from discharge to reimbursement settlement, observed. */
  /**
   * What this hospital charges for the clinical work, against a metro corporate
   * hospital at 1.00. Applies to the surgical block, nursing, diagnostics,
   * pharmacy and ancillary services — never to the implant, which is a device
   * at list price, and never to the List I items, which are small fixed
   * charges. Keeping those two out is what makes the tree's "refused whichever
   * path you take" node literally true.
   */
  costIndex: number;
  settlementDays: number;
  /** Median cashless pre-authorisation turnaround, in hours. */
  preAuthHours: number | null;
  flags?: string[];
}

/**
 * Enough of a bill to rebuild one.
 *
 * The forecast is not a lookup of a stored total. It assembles the bill line by
 * line so that each line can be classified, and only then adjudicated — which
 * is the only way a deduction can be attributed to the charge that caused it.
 */
export interface CostModel {
  /** Surgeon, theatre and anaesthesia together. Scales with room class. */
  surgical: Paise;
  /** In-patient nursing. Scales with room class. */
  nursingPerDay: Paise;
  icuPerDay: Paise | null;
  diagnostics: Paise;
  pharmacyPerDay: Paise;
  implant: Paise | null;
  otherIndependent: Paise;
  /** IRDAI List I, the part billed once per admission. */
  nonPayableFixed: Paise;
  /** IRDAI List I, the part billed every day. */
  nonPayablePerDay: Paise;
  /** Pre-hospitalisation spend that fell outside the policy window. */
  outsideWindow: Paise;
}

/** One implant or consumable a procedure can be billed with. */
export interface ImplantOption {
  id: string;
  label: string;
  amount: Paise;
}

export interface Procedure {
  id: string;
  name: string;
  /** PM-JAY Health Benefit Package code, where one exists. */
  hbpCode: string | null;
  specialty: string;
  /** True where the procedure is on the policy's day-care list, so the
   *  24-hour in-patient rule does not apply. */
  dayCare: boolean;
  medianStayDays: number;
  usesImplant: boolean;
  /**
   * Alternatives to the device priced in `costs.implant`, where a choice
   * genuinely exists — an imported device against a domestic-make one at the
   * same clinical spec. Set only where `usesImplant` is true and a real
   * substitute is on the market; `costs.implant` always equals one entry
   * here, so the default case is unaffected by this list existing.
   */
  implantOptions?: ImplantOption[];
  /** Public reference rates, for the forecast band. */
  pmjayRate: Paise | null;
  cghsRate: Paise | null;
  /** Observed private-sector spread, before any room-class effect. */
  privateLow: Paise;
  privateHigh: Paise;
  costs: CostModel;
}

export interface Policy {
  id: string;
  insurer: string;
  product: string;
  sumInsured: Paise;
  /** Per-day room limit. Either an absolute figure or a percentage of sum insured. */
  roomCapPerDay: Paise | null;
  roomCapPctOfSI: number | null;
  icuCapPerDay: Paise | null;
  icuCapPctOfSI: number | null;
  /** Some products buy the clause out. When false, no scaling ever happens. */
  proportionateDeduction: boolean;
  copayPct: number;
  /**
   * A different co-payment for a claim made for a dependent parent, which group and family
   * policies often carry. Null where the policy has no such rule. Used only when the case says
   * the patient is the policyholder's parent; everyone else pays `copayPct`.
   */
  parentCopayPct: number | null;
  implantSubLimit: Paise | null;
  preHospDays: number;
  postHospDays: number;
  dayCareCovered: boolean;
  /** Months elapsed on this policy. Drives waiting periods and moratorium. */
  monthsInForce: number;
  pedWaitingMonths: number;
  moratoriumMonths: number;
  /**
   * What the wording excludes, in its own words, as read off a schedule and
   * confirmed. Null where no document has been read for this policy -- which
   * is not the same as a policy with no exclusions, and is never priced as one.
   */
  exclusions: string | null;
  /**
   * A limit on the whole admission for a named procedure, from the wording's annexure.
   * Null where none was read. Applied before the co-payment, as a deduction of its own.
   */
  procedureCaps: ProcedureCap[] | null;
  /**
   * The share of the admissible amount paid when the hospital is not on the insurer's
   * cashless network -- 0.7 for 70% -- or null where the policy does not reduce for it.
   * Null is not 1: a policy that simply asks you to pay first and claim afterwards has
   * not reduced anything.
   */
  nonNetworkPct: number | null;
  notes?: string;
}

/** One limit on the whole admission for a procedure. `per: "side"` is per knee, per eye. */
export interface ProcedureCap {
  procedureId: string;
  amount: Paise;
  per: "admission" | "side";
}

/** A clause that can be cited as the cause of a deduction. */
export interface Clause {
  id: string;
  cite: string;
  source: string;
  text: string;
}

export type Route = "cashless" | "reimbursement";

export interface Admission {
  id: string;
  /** Synthetic patient reference. No real person. */
  ref: string;
  date: string;
  hospitalId: string;
  procedureId: string;
  policyId: string;
  roomClass: RoomClass;
  route: Route;
  lines: BillLine[];
  /** What made this record worth keeping in the reference set. */
  edgeCase: string | null;
  /** Sum insured already consumed this policy year, before this admission. */
  siUsed?: Paise;
  /** Set where the claim was refused outright rather than reduced. */
  repudiated?: { reason: string; clause: string };
}
