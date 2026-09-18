/**
 * What the three sides of ClaimCast agree to say to each other.
 *
 * The engine owns the types; this package owns the *validation*. Everything
 * arriving over a wire — a case posted by the browser, a forecast coming back
 * from the Python service — is parsed here before anything downstream is
 * allowed to treat it as a number. The engine is deterministic and has no
 * defences of its own, which is exactly why it gets nothing it has not been
 * checked.
 *
 * Every schema that mirrors an engine type ends with a compile-time assertion
 * that the two still agree. Add a field to `CaseInput` and forget it here and
 * the build fails, rather than the field silently going missing in transit.
 */

import { z } from "zod";
import type { CaseInput, Hospital, Policy, Procedure } from "@claimcast/engine";

/** Fails the build if `Got` and `Want` have drifted apart in either direction. */
type Exact<Got, Want> = [Got] extends [Want] ? ([Want] extends [Got] ? true : never) : never;

// ── Primitives ────────────────────────────────────────────────────────────

/**
 * Money, in integer paise. Negative amounts are rejected outright: every
 * figure this system carries is a charge or a limit, and a negative one would
 * be a bug upstream rather than a discount.
 */
export const Paise = z.number().int().min(0);

export const RoomClass = z.enum([
  "general",
  "semi_private",
  "private",
  "deluxe",
  "suite",
  "icu",
]);

export const Route = z.enum(["cashless", "reimbursement"]);

export const LineKind = z.enum([
  "room",
  "associated",
  "icu",
  "independent",
  "implant",
  "outside_window",
  "non_payable",
]);

export const CityTier = z.enum(["X", "Y", "Z"]);

// ── The case ──────────────────────────────────────────────────────────────

/**
 * An admission as the user has described it so far.
 *
 * The bounds are sanity limits, not clinical ones. A stay of 400 days or an
 * age of 200 is a malformed request rather than an unusual patient, and
 * catching it here keeps the engine's arithmetic from having to be defensive
 * about inputs that cannot occur.
 */
export const CaseInputSchema = z.object({
  hospitalId: z.string().min(1),
  procedureId: z.string().min(1),
  policyId: z.string().min(1),
  roomClass: RoomClass,
  route: Route,
  days: z.number().int().min(0).max(365),
  icuDays: z.number().int().min(0).max(365),
  siUsed: Paise,
  implantId: z.string(),
  admittedInpatient: z.boolean(),
  age: z.number().int().min(0).max(120),
  hasPmjayCard: z.boolean(),
  govtEmployeeOrPensioner: z.boolean(),
});

export type CaseInputWire = z.infer<typeof CaseInputSchema>;
export const _caseInputMatchesEngine: Exact<CaseInputWire, CaseInput> = true;

export const SaveCaseSchema = z.object({
  input: CaseInputSchema,
  label: z.string().max(200).optional(),
});

// ── Reference data ────────────────────────────────────────────────────────

export const BillLineSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: LineKind,
  amount: Paise,
  days: z.number().int().min(0).optional(),
  perDay: Paise.optional(),
  note: z.string().optional(),
});

export const HospitalSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  tier: CityTier,
  beds: z.number().int().min(0),
  network: z.array(z.string()),
  pmjayEmpanelled: z.boolean(),
  cghsRateBand: CityTier.nullable(),
  costIndex: z.number(),
  settlementDays: z.number().int().min(0),
  preAuthHours: z.number().int().min(0).nullable(),
  rooms: z.array(z.object({ cls: RoomClass, perDay: Paise })),
  flags: z.array(z.string()).optional(),
});
export const _hospitalMatchesEngine: Exact<z.infer<typeof HospitalSchema>, Hospital> = true;

export const CostModelSchema = z.object({
  surgical: Paise,
  nursingPerDay: Paise,
  icuPerDay: Paise.nullable(),
  diagnostics: Paise,
  pharmacyPerDay: Paise,
  implant: Paise.nullable(),
  otherIndependent: Paise,
  nonPayableFixed: Paise,
  nonPayablePerDay: Paise,
  outsideWindow: Paise,
});

export const ProcedureSchema = z.object({
  id: z.string(),
  name: z.string(),
  hbpCode: z.string().nullable(),
  specialty: z.string(),
  dayCare: z.boolean(),
  medianStayDays: z.number().int().min(0),
  usesImplant: z.boolean(),
  implantOptions: z
    .array(z.object({ id: z.string(), label: z.string(), amount: Paise }))
    .optional(),
  pmjayRate: Paise.nullable(),
  cghsRate: Paise.nullable(),
  privateLow: Paise,
  privateHigh: Paise,
  costs: CostModelSchema,
});
export const _procedureMatchesEngine: Exact<z.infer<typeof ProcedureSchema>, Procedure> = true;

export const PolicySchema = z.object({
  id: z.string(),
  insurer: z.string(),
  product: z.string(),
  sumInsured: Paise,
  roomCapPerDay: Paise.nullable(),
  roomCapPctOfSI: z.number().nullable(),
  icuCapPerDay: Paise.nullable(),
  icuCapPctOfSI: z.number().nullable(),
  proportionateDeduction: z.boolean(),
  copayPct: z.number().min(0).max(1),
  implantSubLimit: Paise.nullable(),
  preHospDays: z.number().int().min(0),
  postHospDays: z.number().int().min(0),
  dayCareCovered: z.boolean(),
  monthsInForce: z.number().int().min(0),
  pedWaitingMonths: z.number().int().min(0),
  moratoriumMonths: z.number().int().min(0),
  notes: z.string().optional(),
});
export const _policyMatchesEngine: Exact<z.infer<typeof PolicySchema>, Policy> = true;

export const ClauseSchema = z.object({
  id: z.string(),
  cite: z.string(),
  source: z.string(),
  text: z.string(),
});

export const ListItemSchema = z.object({
  item: z.string(),
  group: z.string(),
  typical: Paise,
});

export const ListInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  effect: z.string(),
});

export const AdmissionSchema = z.object({
  id: z.string(),
  ref: z.string(),
  date: z.string(),
  hospitalId: z.string(),
  procedureId: z.string(),
  policyId: z.string(),
  roomClass: RoomClass,
  route: Route,
  lines: z.array(BillLineSchema),
  edgeCase: z.string().nullable(),
  siUsed: Paise.optional(),
  repudiated: z.object({ reason: z.string(), clause: z.string() }).optional(),
});

/**
 * Where a figure came from, and what is weak about it.
 *
 * `caveat` travels with the data rather than being looked up separately,
 * because a screen that has the number already has everything it needs to
 * decide whether it is allowed to show it plainly.
 */
export const SourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  publisher: z.string(),
  url: z.string(),
  checksum: z.string().nullable(),
  fetchedAt: z.string(),
  caveat: z.string().nullable(),
});

/** Everything the client needs to start. One request, because it always wants all of it. */
export const ReferenceBundleSchema = z.object({
  hospitals: z.array(HospitalSchema),
  procedures: z.array(ProcedureSchema),
  policies: z.array(PolicySchema),
  clauses: z.record(ClauseSchema),
  listI: z.array(ListItemSchema),
  listFramework: z.array(ListInfoSchema),
  admissions: z.array(AdmissionSchema),
  sources: z.array(SourceSchema),
});

export type ReferenceBundle = z.infer<typeof ReferenceBundleSchema>;

// ── The ML service ────────────────────────────────────────────────────────

/**
 * What the cost model is asked, and what it is allowed to answer.
 *
 * It answers with a band, never a point. The published tariff it anchored on
 * comes back alongside, so the interval can always be read against a real
 * number rather than taken on trust, and `basis` says in words what the model
 * actually did — which is the sentence that has to survive a judge asking
 * where the figure came from.
 */
export const ForecastRequestSchema = z.object({
  procedureId: z.string(),
  cityTier: CityTier,
  nabh: z.boolean(),
  roomClass: RoomClass,
  days: z.number().int().min(0).max(365),
  icuDays: z.number().int().min(0).max(365),
});

export const ForecastResponseSchema = z.object({
  p10: Paise,
  p50: Paise,
  p90: Paise,
  /** The government tariff the estimate was anchored on, and which scheme published it. */
  anchor: z.object({ scheme: z.enum(["PMJAY", "CGHS"]), amount: Paise, sourceId: z.string() }),
  /** Shares by bill line kind, because the engine adjudicates by kind and a total tells it nothing. */
  split: z.record(LineKind, z.number()),
  modelVersion: z.string(),
  trainedOn: z.string(),
  basis: z.string(),
});

export type ForecastRequest = z.infer<typeof ForecastRequestSchema>;
export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;
