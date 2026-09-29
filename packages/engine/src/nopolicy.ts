import type { Policy } from "./types";

/**
 * "No insurance": the family pays for the admission themselves.
 *
 * Chosen from the path's plan picker as the nil option. It is a policy that
 * pays nothing, so the bill is the family's in full -- and the government
 * scheme fork above the tree still shows what could pay instead. The engine
 * recognises it by id and refuses nothing line by line, because there is no
 * wording to refuse it under: a self-paying family is not "denied" room rent.
 */
export const NO_POLICY_ID = "pol-none";

export const NO_POLICY: Policy = {
  id: NO_POLICY_ID,
  insurer: "",
  product: "No insurance",
  sumInsured: 0,
  roomCapPerDay: null,
  roomCapPctOfSI: null,
  icuCapPerDay: null,
  icuCapPctOfSI: null,
  proportionateDeduction: false,
  copayPct: 0,
  implantSubLimit: null,
  preHospDays: 0,
  postHospDays: 0,
  dayCareCovered: true,
  monthsInForce: 0,
  pedWaitingMonths: 0,
  moratoriumMonths: 0,
  exclusions: null,
  notes: "No health insurance: the family pays the whole bill unless a government scheme applies.",
};

export const isNoPolicy = (p: Pick<Policy, "id">) => p.id === NO_POLICY_ID;
