import type { Clause } from "../types";

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
  DAY_CARE_DOWNGRADE: {
    id: "DAY_CARE_DOWNGRADE",
    cite: "Definition of hospitalisation \u2014 day-care downgrade",
    source: "IRDAI standard definitions",
    text: "Where the continuous stay falls short of 24 hours and the procedure is not on the day-care list, room, nursing, ICU and every other room-linked charge are not a valid in-patient claim and are refused in full. Charges priced independently of the room \u2014 diagnostics, pharmacy, the implant, List I \u2014 are unaffected.",
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
  PRIVATE_INDEMNITY: {
    id: "PRIVATE_INDEMNITY",
    cite: "Policy schedule \u2014 the claim on this page",
    source: "Product wording",
    text: "The private policy indemnifies the actual, itemised cost of treatment, subject to every limit, sub-limit and deduction on this page.",
  },
  PMJAY: {
    id: "PMJAY",
    cite: "PM-JAY \u2014 Health Benefit Package rates",
    source: "National Health Authority, Ayushman Bharat PM-JAY",
    text: "At an empanelled hospital, a listed procedure is paid at a fixed package rate, cashless, with no balance billing to the patient. Eligibility is means-tested against the SECC beneficiary database, not something this or any app can determine \u2014 a household either already holds a card or does not.",
  },
  VAY_VANDANA: {
    id: "VAY_VANDANA",
    cite: "PM-JAY \u2014 Vay Vandana Card for senior citizens",
    source: "National Health Authority, launched 29 October 2024",
    text: "Every citizen aged 70 and above qualifies for a \u20b95 lakh annual cover under PM-JAY on age alone \u2014 no income test, and independent of any card the rest of the household already holds. Introduced in 2024, so a family already on another policy may not know it applies to them.",
  },
  CGHS_SCHEME: {
    id: "CGHS_SCHEME",
    cite: "CGHS \u2014 package rates for serving and retired central government employees",
    source: "Central Government Health Scheme",
    text: "At a CGHS-empanelled centre, a listed procedure is paid at the fixed CGHS package rate, cashless, for a serving or retired central government employee and their dependants.",
  },
  ESI_SCHEME: {
    id: "ESI_SCHEME",
    cite: "ESI — medical benefit for insured persons and dependants",
    source: "Employees' State Insurance Act, 1948; ESIC tie-up hospitals",
    text: "An employee of a covered establishment earning up to ₹21,000 a month, and their dependants, receive full medical care with no cost ceiling. Treatment the ESIC's own hospitals cannot provide is referred to a tie-up hospital and settled by ESIC at CGHS package rates, cashless to the patient.",
  },
  SINGLE_CLAIM_PATH: {
    id: "SINGLE_CLAIM_PATH",
    cite: "Principle of indemnity \u2014 no double recovery",
    source: "General insurance law",
    text: "The same admission cannot be paid twice over. A family picks one path to claim under \u2014 the private policy or a government scheme \u2014 rather than combining them the way a shopping cart combines two discount coupons.",
  },
};

export const clause = (id: string): Clause => CLAUSES[id];
