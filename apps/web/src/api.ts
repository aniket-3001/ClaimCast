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
import { ReferenceBundleSchema, type ReferenceBundle } from "@claimcast/contracts";

/**
 * Same origin in development, where Vite proxies /api to the server. In a
 * deployed build the API is on its own host and this is set at build time.
 */
const BASE = import.meta.env.VITE_API_URL ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error("GET " + path + " returned " + res.status);
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
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
