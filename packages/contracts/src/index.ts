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
import type { CaseInput, DiagnosticTest, Hospital, Policy, Procedure } from "@claimcast/engine";

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
  esiInsured: z.boolean(),
  preExisting: z.boolean(),
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
  esicTieUp: z.boolean(),
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
  exclusions: z.string().nullable(),
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
  /**
   * The hospital the admission is at. Logged with a settled bill so the outcome
   * record says where it was; the cost model does not price from it, because no
   * public source publishes what a named hospital charges.
   */
  hospitalId: z.string().optional(),
});

export const ForecastResponseSchema = z.object({
  p10: Paise,
  p50: Paise,
  p90: Paise,
  /** The government tariff the estimate was anchored on, and which scheme published it. */
  anchor: z.object({
    scheme: z.enum(["PMJAY", "CGHS"]),
    amount: Paise,
    sourceId: z.string(),
    /** The package or rate code, so the figure can be looked up in the published document. */
    code: z.string(),
    /** How the amount was arrived at: a package price, a per-day rate times a stay, a ward factor. */
    detail: z.string(),
  }),
  /** Shares by bill line kind, because the engine adjudicates by kind and a total tells it nothing. */
  split: z.record(LineKind, z.number()),
  /**
   * How far the bills people reported moved this forecast, and how many said so.
   *
   * `factor` is what the survey-fitted multiplier was multiplied by; exactly 1
   * when `n` is 0, which is every forecast on a deployment nobody has reported a
   * settled bill on. Optional because the cost model shipped without it and a
   * running older revision must not be read as breaking the contract.
   */
  calibration: z
    .object({ n: z.number().int().min(0), factor: z.number().positive() })
    .optional(),
  modelVersion: z.string(),
  trainedOn: z.string(),
  basis: z.string(),
  /**
   * What is wrong with this estimate, in the estimate. A forecast built on a survey of
   * stratum means and a government tariff has specific, nameable weaknesses, and the
   * only dishonest thing to do with them is to keep them in the model and not in the
   * response. The UI shows these beside the band.
   */
  caveats: z.array(z.string()),
});

export type ForecastRequest = z.infer<typeof ForecastRequestSchema>;
export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;

/* ---------------------------------------------------------------------------
   Policy extraction.

   A model reads the schedule; the user confirms it; the engine never sees an
   unconfirmed value. That gate is the architectural promise on slide 5, and it
   is only worth anything if the user is given something to check *against*.
   Hence the span: every extracted field carries the verbatim run of text it was
   read from, and the page it sits on.

   The span is not decoration and it is not taken on trust. The server extracts
   the document's own text, looks for the span in it, and sets `verified`. A
   field whose citation cannot be found in the document is the exact shape a
   fabricated figure takes, and it arrives on screen labelled as such rather
   than sitting silently beside the ones that are real.
   --------------------------------------------------------------------------- */

/** The fields a schedule can be read for. Everything else on a Policy is an id or a note. */
export const EXTRACTED_FIELDS = [
  "insurer",
  "product",
  "sumInsured",
  "roomCapPerDay",
  "roomCapPctOfSI",
  "icuCapPerDay",
  "icuCapPctOfSI",
  "proportionateDeduction",
  "copayPct",
  "implantSubLimit",
  "preHospDays",
  "postHospDays",
  "dayCareCovered",
  "monthsInForce",
  "pedWaitingMonths",
  "moratoriumMonths",
  "exclusions",
] as const;

export type ExtractedField = (typeof EXTRACTED_FIELDS)[number];

export const SpanSchema = z.object({
  /** Verbatim from the document. Paraphrase defeats the point of quoting. */
  text: z.string().min(1),
  page: z.number().int().min(1),
});

export const ExtractedValueSchema = z.object({
  /**
   * Paise for money, a fraction for a percentage, months for a duration, and
   * null when the document does not say. Null is a real answer: a schedule
   * states the policy year, not how long the cover has run, so `monthsInForce`
   * is genuinely not in most of them.
   */
  value: z.union([z.number(), z.boolean(), z.string(), z.null()]),
  span: SpanSchema.nullable(),
  /** Why the field is absent. Required when there is no value, so a gap is explained. */
  absent: z.string().nullable(),
  /** Whether the span was found, character for character, in the document's own text. */
  verified: z.boolean(),
});

export const ExtractionSchema = z.object({
  documentId: z.string(),
  filename: z.string(),
  pages: z.number().int().min(1),
  model: z.string(),
  /**
   * Distinct passages retrieval pulled out of the document to ground the
   * reading. Optional so that extractions stored before retrieval existed
   * still parse.
   */
  retrievedPassages: z.number().int().min(0).optional(),
  extractedAt: z.string(),
  fields: z.record(z.enum(EXTRACTED_FIELDS), ExtractedValueSchema),
  /**
   * Fields the model returned a span for that is not in the document. Empty is
   * the expected state; anything in it is the reader's business before they
   * confirm, not a server log line.
   */
  unverified: z.array(z.string()),
});

export type Span = z.infer<typeof SpanSchema>;
export type ExtractedValue = z.infer<typeof ExtractedValueSchema>;
export type Extraction = z.infer<typeof ExtractionSchema>;

/**
 * Signing in, or naming a session that already exists.
 *
 * The password floor is ten characters and there is no composition rule. Length
 * is the thing that actually costs an attacker time; requiring a digit and a
 * capital reliably produces the same handful of substitutions and a password
 * people write down. This is checked on the server too -- a schema shared with
 * the browser is a convenience for the person typing, never the control.
 */
export const CredentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(200),
});
export type Credentials = z.infer<typeof CredentialsSchema>;

/** Who the server thinks is asking. `anonymous` means the session has no email yet. */
export const SessionSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  anonymous: z.boolean(),
  cases: z.number().int(),
});
export type Session = z.infer<typeof SessionSchema>;

/** One row of "the cases on this account". Inputs are fetched when one is opened. */
export const SavedCaseSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  createdAt: z.string(),
});
export type SavedCase = z.infer<typeof SavedCaseSchema>;

/* ---------------------------------------------------------------------------
   Learning

   Three signals, and what each request is allowed to say about them. The
   asymmetry between them is deliberate and is the whole privacy position:
   confirmations may carry a person's own policy terms and so require consent
   to keep, outcomes are a figure someone volunteered, and a branch click
   carries nothing about anybody and is never attached to a session.
--------------------------------------------------------------------------- */

/**
 * What a person agreed to, field by field.
 *
 * The extraction that produced these values is already on the server, so only
 * the confirmed values travel back. What the reader originally said is looked
 * up rather than trusted from the client — a correction is only meaningful
 * against what was actually read, and a client could otherwise report a
 * correction that never happened.
 */
export const ConfirmSchema = z.object({
  /**
   * Field name to the value the person settled on. A field the person left
   * alone still appears here, carrying the value as read: absence would be
   * indistinguishable from agreement, and agreement is the observation.
   */
  fields: z.record(z.enum(EXTRACTED_FIELDS), z.union([z.number(), z.boolean(), z.string(), z.null()])),
  /**
   * Whether the verbatim terms may be kept as a worked example for future
   * readers. Defaults to false, so the quiet path keeps nothing: consent that
   * has to be withheld is not consent.
   */
  keepExamples: z.boolean().default(false),
});
export type ConfirmRequest = z.infer<typeof ConfirmSchema>;

/**
 * How far a field can be trusted, as of now.
 *
 * `seen` is the honest qualifier on the other two and is always shown with
 * them. A field corrected once out of once is not a field that is always wrong,
 * and a rate without its denominator invites exactly that reading.
 */
export const FieldReliabilitySchema = z.object({
  field: z.enum(EXTRACTED_FIELDS),
  model: z.string(),
  seen: z.number().int().min(0),
  corrected: z.number().int().min(0),
  unverified: z.number().int().min(0),
});
export type FieldReliability = z.infer<typeof FieldReliabilitySchema>;

/**
 * What the system has learned so far, as a thing that can be put on screen.
 *
 * Deliberately shaped so the counts come with it. "Improves with use" is a
 * claim, and a claim about a system that has read four documents should look
 * different from one about a system that has read four thousand.
 */
export const LearningStateSchema = z.object({
  fields: z.array(FieldReliabilitySchema),
  /** Confirmations recorded, all fields and models together. */
  confirmations: z.number().int().min(0),
  /** Settled bills reported against a forecast. */
  outcomes: z.number().int().min(0),
  /** Branch choices recorded. */
  choices: z.number().int().min(0),
  /** Saved sessions, and the chat answers in them the chatbox can recall. */
  savedSessions: z.number().int().min(0).optional(),
  chatMemory: z.number().int().min(0).optional(),
  /**
   * The cost model's own learning: which booster version is serving, how many
   * settled bills it was trained on, and how many more until it retrains.
   * Null when the cost model is not configured or not answering.
   */
  costModel: z
    .object({
      modelVersion: z.string(),
      model: z.string(),
      trainedOn: z.string(),
      tariffRows: z.number().int().min(0),
      outcomesTrainedOn: z.number().int().min(0),
      /** Settled bills in the database the running booster has not learned from yet. */
      pending: z.number().int().min(0),
      retrainEvery: z.number().int().min(1),
      heldOutCoverage: z.record(z.string(), z.number()),
    })
    .nullable()
    .optional(),
});
export type LearningState = z.infer<typeof LearningStateSchema>;

/**
 * A bill that actually settled.
 *
 * The rarest and most valuable row in the system: it is the only thing that
 * can say whether a forecast was any good. It has to be volunteered, so the
 * shape is kept as small as a person can reasonably be asked to fill in.
 */
export const OutcomeSchema = z.object({
  /** The forecast request this is the outcome of, echoed back. */
  request: ForecastRequestSchema,
  p10: Paise,
  p50: Paise,
  p90: Paise,
  anchorTotal: Paise.nullable(),
  /** What the admission actually came to, in paise. */
  actualTotal: Paise,
});
export type OutcomeRequest = z.infer<typeof OutcomeSchema>;

/**
 * One branch taken in the journey.
 *
 * Fire and forget, and never attached to a session. The reply carries nothing
 * because there is nothing a caller should wait for.
 */
export const BranchChoiceSchema = z.object({
  stage: z.string().min(1).max(60),
  option: z.string().min(1).max(60),
});
export type BranchChoiceRequest = z.infer<typeof BranchChoiceSchema>;

/**
 * A field the reader keeps getting wrong, sent back with the next extraction.
 *
 * The product effect of the correction loop, and the honest limit of it. It does
 * not make the reader better at its job -- the reader is a hosted model nobody
 * here fits -- it tells the person in front of it where to look first. The count
 * travels with the correction so the warning can be weighed rather than obeyed:
 * two out of four is a different sentence from two hundred out of four hundred,
 * and the screen should be able to say which one it means.
 */
export const ShakyFieldSchema = z.object({
  field: z.enum(EXTRACTED_FIELDS),
  seen: z.number().int().min(0),
  corrected: z.number().int().min(0),
});
export type ShakyField = z.infer<typeof ShakyFieldSchema>;

// ── Policy PDF Q&A (RAG) ──────────────────────────────────────────────────

/**
 * A question about the policy PDF a user has already uploaded. `hospitalId`
 * is optional -- when given, the answer is cross-checked against that
 * hospital's own record; left out, the question is scanned for a hospital
 * name the pool recognises.
 */
export const AskPdfSchema = z.object({
  question: z.string().min(1).max(500),
  hospitalId: z.string().min(1).optional(),
});
export type AskPdfRequest = z.infer<typeof AskPdfSchema>;

/**
 * One quote the answer leaned on, and whether it is really on the page it
 * claims. `rag.ts` checks this against the document's own text the same way
 * `extract.ts` checks an extracted field's span -- a citation shaped like the
 * real thing and not actually in the document is caught here, not trusted.
 */
export const PolicyQaCitationSchema = z.object({
  quote: z.string(),
  page: z.number().int(),
  verified: z.boolean(),
});

export const PolicyQaAnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(PolicyQaCitationSchema),
  /** How many citations failed verification against the document's own text. */
  unverified: z.number().int().min(0),
  /** Which pages retrieval actually pulled from, so a screen can say what was searched. */
  retrievedPages: z.array(z.number().int().min(1)),
  /** Name of the hospital this answer was cross-checked against, if one was named. */
  hospital: z.string().nullable(),
  model: z.string(),
});
export type PolicyQaAnswer = z.infer<typeof PolicyQaAnswerSchema>;

// ── Health reports ────────────────────────────────────────────────────────

/** One priced investigation from the CGHS list. */
export const DiagnosticTestSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(400),
  specialty: z.string().max(120),
  nonNabh: Paise,
  nabh: Paise,
});
export const _diagnosticTestMatchesEngine: Exact<z.infer<typeof DiagnosticTestSchema>, DiagnosticTest> = true;

/** Where in the report a reading came from, and whether that line is really there. */
export const ReportQuoteSchema = z.object({
  text: z.string().min(1).max(500),
  page: z.number().int().min(1).nullable(),
  verified: z.boolean(),
});

export const ReadTestSchema = z.object({
  /** As the doctor wrote it. */
  asWritten: z.string().min(1).max(200),
  quote: ReportQuoteSchema.nullable(),
  /** The CGHS test it was matched to, for the family to check; null when nothing fitted. */
  match: DiagnosticTestSchema.nullable(),
  /** Other close CGHS tests, so a wrong match is one click to fix. */
  candidates: z.array(DiagnosticTestSchema).max(8),
});

/**
 * What was read off a health report or prescription: a proposal, exactly as
 * an extracted policy is. Nothing in it prices anything until the family has
 * looked at it beside the lines it came from and confirmed.
 */
export const HealthReadingSchema = z.object({
  filename: z.string().max(200),
  source: z.enum(["pdf", "image", "text"]),
  /** Which model read it, or "rules" when none was configured. */
  model: z.string().max(200),
  readAt: z.string(),
  patient: z.object({
    name: z.string().max(120).nullable(),
    age: z.number().int().min(0).max(120).nullable(),
  }),
  /** When the injury or illness began, where the report says. YYYY-MM-DD. */
  onsetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  diagnosis: z.object({ text: z.string().min(1).max(300), quote: ReportQuoteSchema.nullable() }).nullable(),
  tests: z.array(ReadTestSchema).max(20),
  treatment: z
    .object({
      text: z.string().min(1).max(300),
      quote: ReportQuoteSchema.nullable(),
      /** The priced procedure it matches, when one does. */
      procedureId: z.string().nullable(),
    })
    .nullable(),
  medicines: z.array(z.string().max(200)).max(30),
  /** Readings whose quoted line could not be found in the report. */
  unverified: z.number().int().min(0),
});
export type HealthReading = z.infer<typeof HealthReadingSchema>;
export type ReadTest = z.infer<typeof ReadTestSchema>;

/** A test the family kept, with what the doctor wrote beside the CGHS test it was matched to. */
export const ConfirmedTestSchema = DiagnosticTestSchema.extend({ asWritten: z.string().max(200) });
export type ConfirmedTest = z.infer<typeof ConfirmedTestSchema>;

/** The health report as the family confirmed it. This, never the file, is what is kept. */
export const ConfirmedHealthSchema = z.object({
  filename: z.string().max(200).nullable(),
  diagnosis: z.string().max(300).nullable(),
  tests: z.array(ConfirmedTestSchema).max(20),
  treatment: z.string().max(300).nullable(),
  /** The priced procedure the operation was matched to; null when the report calls for none. */
  procedureId: z.string().nullable(),
  medicines: z.array(z.string().max(200)).max(30).default([]),
});
export type ConfirmedHealth = z.infer<typeof ConfirmedHealthSchema>;

/** Typed instead of uploaded: what the doctor wrote, as the family reads it. */
export const HealthTextSchema = z.object({ text: z.string().trim().min(3).max(8000) });

// ── The chatbox ───────────────────────────────────────────────────────────

/**
 * A question from the chatbox, about the admission on screen and, optionally,
 * the policy document the user uploaded.
 *
 * `case` is priced again on the server by the same engine; `policy` travels
 * only when it is one the user uploaded and confirmed, which exists in their
 * browser and nowhere else. `history` is the last few turns, so "and in a
 * general ward?" can be understood -- it is context for phrasing, never a
 * source of figures.
 */
export const ChatRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  case: CaseInputSchema,
  policy: PolicySchema.optional(),
  documentId: z.string().min(1).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }))
    .max(6)
    .default([]),
  /** Which language to answer in. The figures stay as written either way. */
  language: z.enum(["en", "hi"]).default("en"),
  /** The confirmed health report, so the chat can say where each scan is cheapest. */
  health: ConfirmedHealthSchema.optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatFactSchema = z.object({
  id: z.string(),
  text: z.string(),
  clause: z.string().nullable(),
});

export const ChatAnswerSchema = z.object({
  answer: z.string(),
  /** The engine's facts the answer leans on, as the engine wrote them. */
  facts: z.array(ChatFactSchema),
  /** Quotes from the uploaded policy, each checked against the document's own text. */
  citations: z.array(PolicyQaCitationSchema),
  unverified: z.number().int().min(0),
  /**
   * Rupee figures in the answer that appear in no engine fact and no verified
   * quote. The model is told never to compute one; this is how a reply that did
   * anyway is caught and labelled rather than trusted.
   */
  unsupportedFigures: z.array(z.string()),
  /** Whether the uploaded document was searched for this answer. */
  usedDocument: z.boolean(),
  retrievedPages: z.array(z.number().int().min(1)),
  model: z.string(),
  /** How many past saved conversations the answer was shown as examples. */
  memoryUsed: z.number().int().min(0).default(0),
});
export type ChatAnswer = z.infer<typeof ChatAnswerSchema>;

// ── Saved sessions ────────────────────────────────────────────────────────

/** One chat turn, as it is kept in a saved session and recalled as memory. */
export const ChatTurnRecordSchema = z.object({
  question: z.string().max(500),
  answer: z.string().max(4000),
  factIds: z.array(z.string()).max(60).default([]),
  unsupportedFigures: z.array(z.string()).max(20).default([]),
  model: z.string().max(200).default(""),
});
export type ChatTurnRecord = z.infer<typeof ChatTurnRecordSchema>;

/**
 * "Save my session". `id`, when given, updates that session rather than
 * starting another, so pressing save twice keeps one record per sitting.
 */
/** One person in a saved session. `uid` is absent until the server has assigned one. */
export const PersonSchema = z.object({
  uid: z.string().uuid().optional(),
  role: z.enum(["self", "patient", "family"]),
  relation: z.enum(["husband", "wife", "son", "daughter", "father", "mother", "other"]).nullable().default(null),
  name: z.string().trim().max(120).default(""),
  age: z.number().int().min(0).max(120).nullable().default(null),
});
export type Person = z.infer<typeof PersonSchema>;
export const SavedPersonSchema = PersonSchema.extend({ uid: z.string().uuid() });
export type SavedPerson = z.infer<typeof SavedPersonSchema>;

export const SaveSessionSchema = z.object({
  id: z.string().optional(),
  name: z.string().max(120).optional(),
  policyholder: z.string().max(120).optional(),
  case: CaseInputSchema,
  policy: PolicySchema.optional(),
  documentId: z.string().optional(),
  chat: z.array(ChatTurnRecordSchema).max(100).default([]),
  people: z.array(PersonSchema).max(30).default([]),
  health: ConfirmedHealthSchema.nullable().optional(),
});
/** What a client sends: `chat` and `people` may be left out. */
export type SaveSessionRequest = z.input<typeof SaveSessionSchema>;

/** What the engine worked out, frozen at the moment of saving. */
export const SessionSummarySchema = z.object({
  procedure: z.string(),
  hospital: z.string(),
  city: z.string(),
  policy: z.string(),
  roomClass: z.string(),
  billTotal: Paise,
  insurerPays: Paise,
  patientPays: Paise,
  deductionTotal: Paise,
  deductions: z.array(z.object({ line: z.string(), amount: Paise, clause: z.string() })),
  repudiated: z.string().nullable(),
});

export const SavedSessionRowSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  policyholder: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  summary: SessionSummarySchema,
  chatTurns: z.number().int().min(0),
  uploadedPolicy: z.boolean(),
  /** Everyone named in the session, with their UUIDs. */
  people: z.array(SavedPersonSchema).default([]),
  /** The confirmed health report, when one was added. */
  health: ConfirmedHealthSchema.nullable().default(null),
});
export type SavedSessionRow = z.infer<typeof SavedSessionRowSchema>;

export const SavedSessionDetailSchema = SavedSessionRowSchema.extend({
  input: CaseInputSchema,
  policy: PolicySchema.nullable(),
  chat: z.array(ChatTurnRecordSchema),
});
export type SavedSessionDetail = z.infer<typeof SavedSessionDetailSchema>;
