import type { Clause } from "../lib/types";

/**
 * Every deduction the engine makes names one of these.
 *
 * A number with no clause behind it is a guess, and a guess is what the
 * caregiver already has. The registry is small on purpose: if a rule is not
 * written down somewhere public, it does not get to reduce a payout here.
 */
export const CLAUSES: Record<string, Clause> = {
  ROOM_CAP: {
    id: "ROOM_CAP",
    cite: "Policy schedule \u2014 room rent limit",
    source: "Product wording",
    text: "Room rent is payable up to the daily limit shown in the schedule. Anything charged above that limit is not payable.",
  },
  PROPORTIONATE: {
    id: "PROPORTIONATE",
    cite: "IRDAI/HLT/REG/CIR/151/06/2020",
    source: "IRDAI circular, 11 June 2020",
    text: "Where a room above the eligible category is occupied, associated medical expenses may be reduced in the ratio of the eligible rent to the rent actually charged. The reduction may not be applied to pharmacy, consumables, implants, diagnostics or the cost of a procedure where the hospital does not vary that charge by room category.",
  },
  PROPORTIONATE_ICU: {
    id: "PROPORTIONATE_ICU",
    cite: "IRDAI/HLT/REG/CIR/151/06/2020",
    source: "IRDAI circular, 11 June 2020",
    text: "Intensive care charges are outside the scope of proportionate reduction. An ICU sub-limit, where one exists, applies on its own terms.",
  },
  ICU_CAP: {
    id: "ICU_CAP",
    cite: "Policy schedule \u2014 ICU limit",
    source: "Product wording",
    text: "Intensive care is payable up to the daily ICU limit shown in the schedule.",
  },
  LIST_I: {
    id: "LIST_I",
    cite: "IRDAI List I \u2014 non-medical items",
    source: "IRDAI Master Circular on Health Insurance Business, 29 May 2024",
    text: "Items in List I are not payable under any circumstances. They are billed by the hospital and settled by the patient regardless of room class, sum insured or claim route.",
  },
  IMPLANT_SUBLIMIT: {
    id: "IMPLANT_SUBLIMIT",
    cite: "Policy schedule \u2014 implant sub-limit",
    source: "Product wording",
    text: "The cost of an implant or prosthesis is payable up to the sub-limit shown in the schedule, irrespective of the balance sum insured.",
  },
  PRE_POST_WINDOW: {
    id: "PRE_POST_WINDOW",
    cite: "Policy schedule \u2014 pre and post hospitalisation",
    source: "Product wording",
    text: "Expenses incurred before admission or after discharge are payable only within the stated windows, and only where they relate to the same condition.",
  },
  COPAY: {
    id: "COPAY",
    cite: "Policy schedule \u2014 co-payment",
    source: "Product wording",
    text: "The stated percentage of every admissible claim is borne by the insured, applied after all other deductions.",
  },
  SUM_INSURED: {
    id: "SUM_INSURED",
    cite: "Policy schedule \u2014 sum insured",
    source: "Product wording",
    text: "The insurer's total liability in a policy year cannot exceed the sum insured less amounts already paid.",
  },
  DAY_CARE: {
    id: "DAY_CARE",
    cite: "Definition of hospitalisation \u2014 24 hours",
    source: "IRDAI standard definitions",
    text: "A claim requires a continuous in-patient stay of at least 24 hours, unless the procedure appears on the policy's day-care list, in which case no minimum applies.",
  },
  PED_WAITING: {
    id: "PED_WAITING",
    cite: "Policy schedule \u2014 pre-existing disease waiting period",
    source: "Product wording",
    text: "A condition present before the policy began is not covered until the stated waiting period has run.",
  },
  MORATORIUM: {
    id: "MORATORIUM",
    cite: "Moratorium period \u2014 60 months",
    source: "IRDAI Master Circular on Health Insurance Business, 29 May 2024",
    text: "After sixty months of continuous cover, a claim may not be contested on grounds of non-disclosure or misrepresentation, except for established fraud.",
  },
};

export const clause = (id: string): Clause => CLAUSES[id];
