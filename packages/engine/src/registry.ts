/**
 * Where the engine gets its reference data from.
 *
 * Until now the answer was a hardcoded import, which is why the browser could
 * price an admission without a server. That has to change for the data to come
 * out of a database, but the way it changes matters: the journey screen
 * re-adjudicates the whole claim on every branch click, so `evaluate` has to
 * stay a plain synchronous call that returns a figure, not something that
 * awaits a fetch. The data is therefore loaded once, installed here, and read
 * synchronously from then on.
 *
 * The registry starts empty on purpose. A caller that forgot to install one
 * gets a loud error rather than a quiet fall back to the fixtures, because an
 * app that silently prices an admission off hand-written sample data while
 * appearing to read a database is exactly the failure this project cannot
 * afford. The fixtures are still available — `FIXTURES`, installed explicitly —
 * and that is what the self-checks use.
 *
 * One registry per process. That is correct for a browser tab and correct for
 * an API serving one dataset; if this ever serves several, this becomes a
 * parameter rather than a module-level value, and every call site below is the
 * list of things that would have to change.
 */

import type { Admission, Clause, Hospital, Policy, Procedure } from "./types";
import type { Paise } from "./money";

export interface ListItem {
  item: string;
  group: string;
  /** Illustrative amount on a five-day admission at a metro hospital. */
  typical: Paise;
}

export interface ListInfo {
  id: string;
  title: string;
  effect: string;
}

/** Everything the engine and the screens above it need in order to price and explain an admission. */
export interface Registry {
  hospitals: Hospital[];
  procedures: Procedure[];
  policies: Policy[];
  clauses: Record<string, Clause>;
  listI: ListItem[];
  listFramework: ListInfo[];
  admissions: Admission[];
}

let current: Registry | null = null;

export function setRegistry(r: Registry): void {
  current = r;
}

export function registry(): Registry {
  if (!current) {
    throw new Error(
      "No reference data installed. Call setRegistry() with data fetched from the API, " +
        "or with FIXTURES, before pricing anything.",
    );
  }
  return current;
}

export const hasRegistry = (): boolean => current !== null;

function one<T extends { id: string }>(kind: string, xs: T[], id: string): T {
  const found = xs.find((x) => x.id === id);
  if (!found) throw new Error("No " + kind + " with id " + id);
  return found;
}

export const hospital = (id: string): Hospital => one("hospital", registry().hospitals, id);
export const procedure = (id: string): Procedure => one("procedure", registry().procedures, id);
export const policy = (id: string): Policy => one("policy", registry().policies, id);

export function clause(id: string): Clause {
  const c = registry().clauses[id];
  if (!c) throw new Error("No clause with id " + id);
  return c;
}

export const admission = (id: string): Admission => one("admission", registry().admissions, id);

/** Every List I item added up: what the family pays whatever else happens. */
export const listITotal = (): Paise =>
  registry().listI.reduce((t, i) => t + i.typical, 0);
