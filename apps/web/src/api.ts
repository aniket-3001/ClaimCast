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
  ReferenceBundleSchema,
  SavedCaseSchema,
  SessionSchema,
  type Extraction,
  type ForecastRequest,
  type ForecastResponse,
  type ReferenceBundle,
  type SavedCase,
  type Session,
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
  { ok: true; documentId: string; extraction: Extraction } | { ok: false; reason: string }
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
  const body = (await res.json()) as { documentId: string; extraction: unknown };
  return {
    ok: true,
    documentId: body.documentId,
    extraction: ExtractionSchema.parse(body.extraction),
  };
}

/**
 * Record that a person looked at the extraction and agreed to it.
 *
 * Failure is swallowed. The confirmation that governs the app has already
 * happened in the browser, and this is the server's note of it; losing the note
 * is not a reason to stop someone walking their own claim.
 */
export async function confirmDocument(id: string): Promise<void> {
  await fetch(BASE + "/api/policies/" + encodeURIComponent(id) + "/confirm", {
    method: "POST",
    credentials: CREDS,
  }).catch(() => {});
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
