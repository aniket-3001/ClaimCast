import type { BillLine, Policy } from "./types";
import { ratioSplit, type Paise } from "./money";

export interface Deduction {
  lineId: string;
  line: string;
  amount: Paise;
  reason: string;
  clause: string;
}

export interface Adjudication {
  billTotal: Paise;
  deductions: Deduction[];
  deductionTotal: Paise;
  /** Bill less deductions. What the co-payment is calculated on. */
  admissible: Paise;
  copay: Paise;
  /** Admissible spend the sum insured could not reach. */
  siShortfall: Paise;
  insurerPays: Paise;
  patientPays: Paise;
  /** Eligible rent over rent charged. 1 means the room was within limit. */
  roomRatio: number;
  roomCapPerDay: Paise | null;
  repudiated: { reason: string; clause: string } | null;
  notes: string[];
}

/**
 * A limit written as "2% of the sum insured, subject to a maximum of Rs 5,000 a
 * day" is two limits, and the tighter one binds. Products that state only one
 * leave the other null.
 */
const capFor = (abs: Paise | null, pctOfSI: number | null, si: Paise): Paise | null => {
  const byPct = pctOfSI === null ? null : Math.round(si * pctOfSI);
  if (abs !== null && byPct !== null) return Math.min(abs, byPct);
  return abs ?? byPct;
};

/**
 * The insurer's own arithmetic, run early.
 *
 * There is nothing predictive in here. Given the bill, the policy and the room,
 * the answer is determined, and the order of operations is the order the
 * wording imposes: strip what is never payable, cap the room, scale only what
 * the room drags with it, apply sub-limits, then co-pay, then the sum insured.
 *
 * Two orderings matter and are easy to get wrong. Co-pay comes last, on the
 * admissible balance rather than on the bill \u2014 taking it first would overcharge
 * the patient on every claim. And proportionate reduction touches `associated`
 * lines only: ICU, diagnostics, pharmacy and implants are exempt by the 2020
 * circular, and treating them as associated is the single most expensive
 * mistake available here.
 */
export function adjudicate(args: {
  lines: BillLine[];
  policy: Policy;
  /** Sum insured already consumed this policy year. */
  siUsed?: Paise;
  repudiated?: { reason: string; clause: string } | null;
  /**
   * The stay did not clear the 24-hour inpatient definition. The hospital
   * still billed the room, nursing and ICU charges — the patient was there,
   * however briefly — but none of them were ever a valid inpatient claim, so
   * they are refused in full rather than merely capped. Everything priced
   * independently of the bed (diagnostics, pharmacy, implant, List I) is
   * unaffected: the dispute is about the admission, not the treatment.
   */
  dayCareDowngrade?: boolean;
}): Adjudication {
  const { lines, policy } = args;
  const downgrade = args.dayCareDowngrade ?? false;
  const siUsed = args.siUsed ?? 0;
  const billTotal = lines.reduce((t, l) => t + l.amount, 0);
  const deductions: Deduction[] = [];
  const notes: string[] = [];

  if (args.repudiated) {
    return {
      billTotal,
      deductions: [
        {
          lineId: "*",
          line: "Whole claim",
          amount: billTotal,
          reason: args.repudiated.reason,
          clause: args.repudiated.clause,
        },
      ],
      deductionTotal: billTotal,
      admissible: 0,
      copay: 0,
      siShortfall: 0,
      insurerPays: 0,
      patientPays: billTotal,
      roomRatio: 1,
      roomCapPerDay: null,
      repudiated: args.repudiated,
      notes: ["Claim refused in full. Nothing below applies."],
    };
  }

  const roomCap = capFor(policy.roomCapPerDay, policy.roomCapPctOfSI, policy.sumInsured);
  const icuCap = capFor(policy.icuCapPerDay, policy.icuCapPctOfSI, policy.sumInsured);

  const room = lines.find((l) => l.kind === "room");
  const charged = room?.perDay ?? 0;

  if (downgrade) {
    notes.push(
      "Under 24 hours, and not on the day-care list: room, nursing and every room-linked charge are refused in full. Diagnostics, pharmacy, the implant and List I are unaffected.",
    );
  }

  // The room drives everything below it. Work the ratio out once.
  let roomRatio = 1;
  if (downgrade) {
    if (room) {
      deductions.push({
        lineId: room.id,
        line: room.label,
        amount: room.amount,
        reason: "The stay did not reach 24 hours, so this was never a valid inpatient claim.",
        clause: "DAY_CARE_DOWNGRADE",
      });
    }
  } else if (room && roomCap !== null && charged > roomCap) {
    const eligible = roomCap * (room.days ?? 1);
    deductions.push({
      lineId: room.id,
      line: room.label,
      amount: room.amount - eligible,
      reason: `Charged ${inr(charged)} a day against a limit of ${inr(roomCap)}.`,
      clause: "ROOM_CAP",
    });
    if (policy.proportionateDeduction) roomRatio = roomCap / charged;
    else notes.push("This policy does not apply proportionate reduction. Only the rent above the limit is deducted.");
  }

  for (const l of lines) {
    switch (l.kind) {
      case "room":
        break;

      case "associated": {
        if (downgrade) {
          deductions.push({
            lineId: l.id,
            line: l.label,
            amount: l.amount,
            reason: "Priced by room category, and there was no valid inpatient stay to price it against.",
            clause: "DAY_CARE_DOWNGRADE",
          });
          break;
        }
        if (roomRatio === 1) break;
        const { drop } = ratioSplit(l.amount, roomRatio);
        deductions.push({
          lineId: l.id,
          line: l.label,
          amount: drop,
          reason: `Priced by room category, so it is reduced in the same ratio: ${inr(roomCap!)} \u00f7 ${inr(charged)}.`,
          clause: "PROPORTIONATE",
        });
        break;
      }

      case "icu": {
        if (downgrade) {
          deductions.push({
            lineId: l.id,
            line: l.label,
            amount: l.amount,
            reason: "Intensive care is exempt from proportionate reduction, but still requires a valid inpatient claim.",
            clause: "DAY_CARE_DOWNGRADE",
          });
          break;
        }
        if (icuCap !== null && (l.perDay ?? 0) > icuCap) {
          deductions.push({
            lineId: l.id,
            line: l.label,
            amount: l.amount - icuCap * (l.days ?? 1),
            reason: `Charged ${inr(l.perDay ?? 0)} a day against an ICU limit of ${inr(icuCap)}.`,
            clause: "ICU_CAP",
          });
        }
        if (roomRatio < 1) {
          notes.push("Intensive care is exempt from the proportionate reduction and has been left whole.");
        }
        break;
      }

      case "implant": {
        if (policy.implantSubLimit !== null && l.amount > policy.implantSubLimit) {
          deductions.push({
            lineId: l.id,
            line: l.label,
            amount: l.amount - policy.implantSubLimit,
            reason: `Sub-limit of ${inr(policy.implantSubLimit)} regardless of the balance sum insured.`,
            clause: "IMPLANT_SUBLIMIT",
          });
        }
        break;
      }

      case "outside_window":
        deductions.push({
          lineId: l.id,
          line: l.label,
          amount: l.amount,
          reason: l.note ?? `Outside the ${policy.preHospDays}-day pre-hospitalisation window.`,
          clause: "PRE_POST_WINDOW",
        });
        break;

      case "non_payable":
        deductions.push({
          lineId: l.id,
          line: l.label,
          amount: l.amount,
          reason: "On IRDAI List I. Not payable under any policy, in any room.",
          clause: "LIST_I",
        });
        break;

      case "independent":
        break;
    }
  }

  const deductionTotal = deductions.reduce((t, d) => t + d.amount, 0);
  const admissible = billTotal - deductionTotal;
  const copay = Math.round(admissible * policy.copayPct);
  const afterCopay = admissible - copay;

  const siLeft = Math.max(0, policy.sumInsured - siUsed);
  const insurerPays = Math.min(afterCopay, siLeft);
  const siShortfall = afterCopay - insurerPays;
  if (siShortfall > 0) {
    notes.push(
      siUsed > 0
        ? `${inr(siUsed)} of the sum insured was already used this year. Only ${inr(siLeft)} was left.`
        : "The admissible amount is above the sum insured.",
    );
  }

  return {
    billTotal,
    deductions,
    deductionTotal,
    admissible,
    copay,
    siShortfall,
    insurerPays,
    patientPays: billTotal - insurerPays,
    roomRatio,
    roomCapPerDay: roomCap,
    repudiated: null,
    notes,
  };
}

// Local, so the engine stays free of formatting concerns everywhere but here,
// where the reason strings have to read as sentences.
function inr(p: Paise): string {
  const n = Math.round(p / 100);
  const s = String(n);
  if (s.length <= 3) return "\u20b9" + s;
  return "\u20b9" + s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + s.slice(-3);
}
