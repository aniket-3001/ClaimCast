/**
 * Everything the client says to the server.
 *
 * The reference data is fetched once at boot and installed in the engine's
 * registry, and from that point the app prices admissions locally: the journey
 * screen re-adjudicates the whole claim on every branch click, and a round trip
 * per click would destroy the interaction that is the entire demo. The server
 * runs the same engine over the same rows and is authoritative for anything
 * saved, which is the only place the two could ever be compared.
 *
 * There is no offline fallback, deliberately. If the API is unreachable the app
 * says so and stops. Quietly falling back to a hand-written sample set would
 * mean showing someone a figure that came from nowhere while the screen implied
 * it came from a database.
 */

import { setRegistry, type Registry } from "@claimcast/engine";
import {
  ExtractionSchema,
  ForecastResponseSchema,
  LearningStateSchema,
  PolicyQaAnswerSchema,
  ReferenceBundleSchema,
  SavedCaseSchema,
  SessionSchema,
  ShakyFieldSchema,
  type ExtractedField,
  type Extraction,
  type ForecastRequest,
  type ForecastResponse,
  type LearningState,
  type PolicyQaAnswer,
  type ReferenceBundle,
  type SavedCase,
  type Session,
  type ShakyField,
} from "@claimcast/contracts";

/**
 * Same origin in development, where Vite proxies /api to the server. In a
 * deployed build the API is on its own host and this is set at build time.
 */
//
// Read defensively because this module is also bundled by the selfcheck harness,
// which runs the same components under Node with esbuild and no Vite, so
// `import.meta.env` is not there at all. Same origin is the right answer in both.
const BASE = import.meta.env?.VITE_API_URL ?? "";

/**
 * Every request carries the session cookie.
 *
 * `credentials: "include"` is needed because in a deployed build the API is on
 * a different origin from the page, and a browser withholds cookies across
 * origins unless both sides opt in. The server's half is `credentials: true`
 * on CORS with an explicit origin list. Leave this off and the symptom is a new
 * anonymous session on every request, which looks like data loss rather than
 * like a missing flag.
 */
const CREDS: RequestCredentials = "include";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { credentials: CREDS });
  if (!res.ok) throw new Error("GET " + path + " returned " + res.status);
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    credentials: CREDS,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("POST " + path + " returned " + res.status);
  return (await res.json()) as T;
}

/**
 * Fetch the reference set, check it, and hand it to the engine.
 *
 * It is parsed rather than cast. The schema is the same one the server validates
 * against, so a field that changed shape on one side fails here loudly instead
 * of arriving as `undefined` and turning into a NaN three screens later.
 */
export async function loadReference(): Promise<ReferenceBundle> {
  const raw = await get<unknown>("/api/reference");
  const bundle = ReferenceBundleSchema.parse(raw);

  const registry: Registry = {
    hospitals: bundle.hospitals,
    procedures: bundle.procedures,
    policies: bundle.policies,
    clauses: bundle.clauses,
    listI: bundle.listI,
    listFramework: bundle.listFramework,
    admissions: bundle.admissions,
  };
  setRegistry(registry);
  return bundle;
}

export const saveCase = (input: unknown, label?: string) =>
  post<{ id: string; createdAt: string }>("/api/cases", { input, label });

/**
 * The cost model's band for this admission, or nothing, with the reason.
 *
 * The one call in the app that is allowed to come back empty-handed. The model
 * refuses admissions it has no honest basis for -- a procedure nobody has coded
 * to an ailment category, a stay no scheme publishes a rate for -- and answers
 * 422 with the reason. That reason belongs on screen: a band that quietly
 * disappears teaches the reader nothing, and a band invented to fill the gap
 * would be the one thing this project cannot do. 503 means the model is not
 * configured, which is a deployment fact rather than a fact about the admission.
 *
 * `nabh` is sent as true because accreditation is not on the hospital record,
 * and every CGHS rate in the reference set is quoted at NABH. The screen says so
 * rather than leaving the reader to assume the anchor was picked for them.
 */
export async function getForecast(
  req: ForecastRequest,
): Promise<{ ok: true; forecast: ForecastResponse } | { ok: false; reason: string }> {
  const res = await fetch(BASE + "/api/forecast", {
    method: "POST",
    credentials: CREDS,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (res.status === 422 || res.status === 503) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    return { ok: false, reason: body.detail ?? "The cost model declined this admission." };
  }
  if (!res.ok) return { ok: false, reason: "The cost model is not answering." };
  return { ok: true, forecast: ForecastResponseSchema.parse(await res.json()) };
}

/**
 * Send a policy schedule to be read.
 *
 * What comes back is a proposal with citations, not a policy. Nothing in the app
 * prices anything with it until the user has confirmed it field by field, which
 * is what `Intake.tsx` is for.
 *
 * The failure path is as important as the success one. Extraction needs a key and
 * an encryption key on the server, and a demo machine may have neither; when it
 * does not, this returns the server's own reason and the screen says the schedule
 * has to be entered by hand. It does not invent an extraction to keep the flow
 * moving -- a fabricated reading of someone's policy is the exact failure this
 * whole screen exists to prevent.
 */
export async function extractPolicy(
  file: File,
): Promise<
  | { ok: true; documentId: string; extraction: Extraction; shaky: ShakyField[] }
  | { ok: false; reason: string }
> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(BASE + "/api/policies/extract", {
    method: "POST",
    credentials: CREDS,
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    return { ok: false, reason: body.detail ?? "The schedule could not be read." };
  }
  const body = (await res.json()) as {
    documentId: string;
    extraction: unknown;
    shaky?: unknown;
  };
  return {
    ok: true,
    documentId: body.documentId,
    extraction: ExtractionSchema.parse(body.extraction),
    // Advisory, so it is parsed leniently: a server that has not been taught to
    // send this yet, or sends something unexpected, should cost the caller a
    // warning rather than the reading it came with.
    shaky: ShakyFieldSchema.array().safeParse(body.shaky).data ?? [],
  };
}

/**
 * Record that a person looked at the extraction and what they settled on.
 *
 * The values travel, not just the fact of the click. Sending only the id --
 * which is what this did until the learning loop existed -- threw away the one
 * corpus the application produces for free: true labels on real schedules,
 * made by the person best placed to make them, at a step that had to happen
 * anyway. Every field goes, including the ones left alone, because a reader
 * being right is as much an observation as a reader being wrong and a rate
 * built only from corrections has no denominator.
 *
 * `keepExamples` is the person's own answer about the verbatim text of their
 * schedule, and it is passed through rather than defaulted: the counters do not
 * need it and do not get it.
 *
 * Failure is swallowed. The confirmation that governs the app has already
 * happened in the browser, and this is the server's note of it; losing the note
 * is not a reason to stop someone walking their own claim.
 */
export async function confirmDocument(
  id: string,
  fields: Partial<Record<ExtractedField, number | boolean | string | null>> = {},
  keepExamples = false,
): Promise<void> {
  await fetch(BASE + "/api/policies/" + encodeURIComponent(id) + "/confirm", {
    method: "POST",
    credentials: CREDS,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fields, keepExamples }),
  }).catch(() => {});
}

/**
 * Tell the server which branch was taken.
 *
 * Fire and forget in the strictest sense: not awaited, never surfaced, and the
 * reply carries nothing. It is on the click path of the one interaction the
 * whole demo rests on, so it is not allowed to cost that click a millisecond.
 */
export function recordChoice(stage: string, option: string): void {
  void fetch(BASE + "/api/journey/choice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stage, option }),
  }).catch(() => {});
}

/**
 * Report what the admission actually cost, against the band we gave for it.
 *
 * The scarcest signal in the system and the only one that can say whether the
 * forecast was any good, which is why the reply comes back rather than being
 * swallowed: somebody who has just volunteered a real number weeks after the
 * fact is owed an answer about what it meant.
 */
export async function reportOutcome(body: {
  request: ForecastRequest;
  p10: number;
  p50: number;
  p90: number;
  anchorTotal: number | null;
  actualTotal: number;
}): Promise<{ ok: true; within: boolean } | { ok: false }> {
  const res = await fetch(BASE + "/api/outcomes", {
    method: "POST",
    credentials: CREDS,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res || !res.ok) return { ok: false };
  const got = (await res.json().catch(() => ({}))) as { within?: boolean };
  return { ok: true, within: got.within === true };
}

/**
 * What the system has learned so far.
 *
 * Read by the screen that has to make the "improves with use" claim, and it is
 * given the denominators so it can make that claim proportionately. An empty
 * state is a real answer -- a system nobody has corrected yet has learned
 * nothing, and saying so is better than an empty panel that looks broken.
 */
export async function learningState(): Promise<LearningState | null> {
  const res = await fetch(BASE + "/api/learning", { credentials: CREDS }).catch(() => null);
  if (!res || !res.ok) return null;
  return LearningStateSchema.safeParse(await res.json().catch(() => null)).data ?? null;
}

/**
 * Who the server thinks this browser is.
 *
 * The first call is also what creates the session, so it runs at boot -- before
 * anything exists that would need an owner. An anonymous session is the normal
 * state, not a degraded one: it owns cases and uploads exactly the way a named
 * account does, and the only thing an email buys is the ability to come back to
 * them from another browser.
 */
export async function whoami(): Promise<Session | null> {
  try {
    return SessionSchema.parse(await get<unknown>("/api/me"));
  } catch {
    // The reference load has already told the user the API is unreachable, and
    // saying it twice on the same screen helps nobody.
    return null;
  }
}

/** Attach an email and password to this session, or sign in to an existing one. */
export async function claimAccount(
  email: string,
  password: string,
): Promise<{ ok: true; session: Session } | { ok: false; reason: string }> {
  const res = await fetch(BASE + "/api/auth/claim", {
    method: "POST",
    credentials: CREDS,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    return { ok: false, reason: body.detail ?? "That did not work. Check the email and password." };
  }
  return { ok: true, session: SessionSchema.parse(await res.json()) };
}

export async function signOut(): Promise<void> {
  await fetch(BASE + "/api/auth/signout", { method: "POST", credentials: CREDS }).catch(() => {});
}

/** The cases on this account, newest first. Labels and dates only, never figures. */
export async function myCases(): Promise<SavedCase[]> {
  try {
    return SavedCaseSchema.array().parse(await get<unknown>("/api/cases"));
  } catch {
    return [];
  }
}

/**
 * Ask a question about the policy PDF this user uploaded.
 *
 * Answered by retrieval over the document itself -- never the model's general
 * knowledge -- and cross-checked against a named hospital's own record when
 * `hospitalId` is given. `citations` names the exact phrase and page each
 * factual claim came from; a screen should treat `unverified > 0` as worth a
 * visible flag, not a silent pass -- it means the model cited something that
 * is not actually in the document.
 */
export async function askAboutPolicyPdf(
  documentId: string,
  question: string,
  hospitalId?: string,
): Promise<{ ok: true; answer: PolicyQaAnswer } | { ok: false; reason: string }> {
  const res = await fetch(BASE + "/api/policies/" + encodeURIComponent(documentId) + "/ask", {
    method: "POST",
    credentials: CREDS,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, ...(hospitalId ? { hospitalId } : {}) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    return { ok: false, reason: body.detail ?? "That question could not be answered." };
  }
  return { ok: true, answer: PolicyQaAnswerSchema.parse(await res.json()) };
}
