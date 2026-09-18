import type { Admission, RoomClass, Route } from "../types";
import { buildBill } from "../bill";
import { rupees as r } from "../money";
import { hospital } from "./hospitals";
import { procedure } from "./procedures";

interface Spec {
  id: string;
  ref: string;
  date: string;
  hospitalId: string;
  procedureId: string;
  policyId: string;
  roomClass: RoomClass;
  route: Route;
  days: number;
  icuDays?: number;
  outsideWindow?: boolean;
  siUsed?: number;
  repudiated?: { reason: string; clause: string };
  edgeCase: string | null;
}

/**
 * Sixteen settled admissions, kept because of what each one proves.
 *
 * These are the records a new forecast is checked against. Nothing here is a
 * real patient or a real bill. The first two are the same admission twice, one
 * room class apart, and every figure the ClaimCast deck quotes comes out of
 * them. The rest exist because each breaks an assumption that a naive
 * implementation makes: that a bigger room always costs the patient more, that
 * proportionate reduction scales the whole bill, that a claim under 24 hours is
 * always refused, that the sum insured is the only ceiling.
 */
const SPECS: Spec[] = [
  {
    id: "a-2401",
    ref: "RC-2401",
    date: "2025-02-11",
    hospitalId: "h-meridian",
    procedureId: "p-spine-fusion",
    policyId: "pol-classic",
    roomClass: "private",
    route: "cashless",
    days: 5,
    outsideWindow: true,
    edgeCase:
      "Reference admission. Room at twice the limit, and every kind of deduction present at once.",
  },
  {
    id: "a-2402",
    ref: "RC-2402",
    date: "2025-02-11",
    hospitalId: "h-meridian",
    procedureId: "p-spine-fusion",
    policyId: "pol-classic",
    roomClass: "semi_private",
    route: "cashless",
    days: 5,
    outsideWindow: true,
    edgeCase:
      "The same admission one room class down. Rent exactly at the limit, so the ratio is 1.00 and nothing is scaled.",
  },
  {
    id: "a-2403",
    ref: "RC-2403",
    date: "2025-03-04",
    hospitalId: "h-meridian",
    procedureId: "p-angioplasty",
    policyId: "pol-classic",
    roomClass: "private",
    route: "cashless",
    days: 5,
    icuDays: 2,
    outsideWindow: true,
    edgeCase:
      "Two days in intensive care, three in a private room. The ICU bill is capped but never scaled.",
  },
  {
    id: "a-2404",
    ref: "RC-2404",
    date: "2025-03-19",
    hospitalId: "h-vistara",
    procedureId: "p-sepsis",
    policyId: "pol-classic",
    roomClass: "icu",
    route: "cashless",
    days: 5,
    icuDays: 5,
    edgeCase:
      "Intensive care throughout. There is no room line, so there is nothing for proportionate reduction to attach to.",
  },
  {
    id: "a-2405",
    ref: "RC-2405",
    date: "2025-04-02",
    hospitalId: "h-sanjeevan",
    procedureId: "p-pneumonia",
    policyId: "pol-basic",
    roomClass: "private",
    route: "cashless",
    days: 5,
    outsideWindow: true,
    edgeCase:
      "No surgery, so the only room-linked charge is nursing. The room is three times the limit and the reduction still takes very little.",
  },
  {
    id: "a-2406",
    ref: "RC-2406",
    date: "2025-04-21",
    hospitalId: "h-shanti",
    procedureId: "p-cataract",
    policyId: "pol-sanjeevani",
    roomClass: "general",
    route: "cashless",
    days: 1,
    outsideWindow: true,
    edgeCase:
      "Two hours in hospital and payable, because the procedure is on the day-care list. A 5% co-payment applies anyway.",
  },
  {
    id: "a-2407",
    ref: "RC-2407",
    date: "2025-05-08",
    hospitalId: "h-arogya",
    procedureId: "p-observation",
    policyId: "pol-classic",
    roomClass: "general",
    route: "cashless",
    days: 1,
    repudiated: {
      reason:
        "Nineteen hours in hospital. Under the 24-hour minimum, and the condition is not on the day-care list.",
      clause: "DAY_CARE",
    },
    edgeCase: "Refused whole. Five hours short of a claim.",
  },
  {
    id: "a-2408",
    ref: "RC-2408",
    date: "2025-05-30",
    hospitalId: "h-kalpataru",
    procedureId: "p-tkr",
    policyId: "pol-senior",
    roomClass: "private",
    route: "cashless",
    days: 6,
    outsideWindow: true,
    edgeCase:
      "Sum insured runs out. The co-payment is taken before the ceiling bites, so the patient pays twice over.",
  },
  {
    id: "a-2409",
    ref: "RC-2409",
    date: "2025-06-12",
    hospitalId: "h-deccan",
    procedureId: "p-cabg",
    policyId: "pol-premier",
    roomClass: "suite",
    route: "cashless",
    days: 8,
    outsideWindow: true,
    edgeCase:
      "A product with no room limit. The suite costs the insurer more and the patient nothing.",
  },
  {
    id: "a-2410",
    ref: "RC-2410",
    date: "2025-06-27",
    hospitalId: "h-vistara",
    procedureId: "p-angioplasty",
    policyId: "pol-corporate",
    roomClass: "private",
    route: "cashless",
    days: 3,
    outsideWindow: true,
    edgeCase:
      "A limit of 1% of a small sum insured against a metro tariff. Nearly three quarters of every room-linked charge is refused.",
  },
  {
    id: "a-2411",
    ref: "RC-2411",
    date: "2025-07-09",
    hospitalId: "h-anandam",
    procedureId: "p-chole",
    policyId: "pol-classic",
    roomClass: "semi_private",
    route: "reimbursement",
    days: 2,
    outsideWindow: true,
    edgeCase:
      "No cashless agreement anywhere in this hospital. The family funds the whole bill and waits 63 days.",
  },
  {
    id: "a-2412",
    ref: "RC-2412",
    date: "2025-07-25",
    hospitalId: "h-arogya",
    procedureId: "p-cabg",
    policyId: "pol-basic",
    roomClass: "semi_private",
    route: "cashless",
    days: 8,
    repudiated: {
      reason:
        "Coronary disease disclosed at proposal. The policy is nine months old against a 48-month waiting period.",
      clause: "PED_WAITING",
    },
    edgeCase: "Declared, accepted, and still not covered for another 39 months.",
  },
  {
    id: "a-2413",
    ref: "RC-2413",
    date: "2025-08-06",
    hospitalId: "h-deccan",
    procedureId: "p-chemo",
    policyId: "pol-premier",
    roomClass: "general",
    route: "cashless",
    days: 1,
    outsideWindow: true,
    edgeCase:
      "Sixty-two months of continuous cover. Non-disclosure can no longer be raised against this claim.",
  },
  {
    id: "a-2414",
    ref: "RC-2414",
    date: "2025-08-18",
    hospitalId: "h-arogya",
    procedureId: "p-dialysis",
    policyId: "pol-corporate",
    roomClass: "general",
    route: "cashless",
    days: 1,
    edgeCase:
      "Every deduction on this claim is under a thousand rupees. Nothing here is worth interrupting a caregiver for.",
  },
  {
    id: "a-2415",
    ref: "RC-2415",
    date: "2025-09-02",
    hospitalId: "h-tarun",
    procedureId: "p-chole",
    policyId: "pol-classic",
    roomClass: "private",
    route: "cashless",
    days: 2,
    outsideWindow: true,
    edgeCase:
      "One room class in the building. The advice to take a cheaper bed has nowhere to go.",
  },
  {
    id: "a-2416",
    ref: "RC-2416",
    date: "2025-09-15",
    hospitalId: "h-meridian",
    procedureId: "p-csection",
    policyId: "pol-classic",
    roomClass: "private",
    route: "cashless",
    days: 4,
    outsideWindow: true,
    siUsed: 420000,
    edgeCase:
      "The third claim of the policy year. Only 80,000 rupees of the sum insured were still standing.",
  },
];

export const ADMISSIONS: Admission[] = SPECS.map((s) => ({
  id: s.id,
  ref: s.ref,
  date: s.date,
  hospitalId: s.hospitalId,
  procedureId: s.procedureId,
  policyId: s.policyId,
  roomClass: s.roomClass,
  route: s.route,
  edgeCase: s.edgeCase,
  repudiated: s.repudiated,
  siUsed: s.siUsed === undefined ? undefined : r(s.siUsed),
  lines: buildBill({
    procedure: procedure(s.procedureId),
    hospital: hospital(s.hospitalId),
    roomClass: s.roomClass,
    days: s.days,
    icuDays: s.icuDays,
    includeOutsideWindow: s.outsideWindow,
  }),
}));
