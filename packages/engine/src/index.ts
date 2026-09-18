/**
 * The deterministic core, as one package.
 *
 * Everything a caller needs to price an admission and explain the result is
 * exported here, and nothing in this package imports from the web app or the
 * API — the dependency only ever points inward. That is what lets the browser
 * and the server run the same adjudication and be unable to disagree about a
 * rupee: there is one implementation, imported twice, not a copy on each side.
 *
 * The reference data under ./data is still hand-written. It is the engine's
 * fixture set and the only reason selfcheck.ts can run without a database;
 * Phase 1 replaces it as the app's source of truth and keeps it as fixtures.
 */

export * from "./money";
export * from "./types";
export * from "./bill";
export * from "./engine";
export * from "./case";

export { ADMISSIONS, admission, stayDays } from "./data/admissions";
export { CLAUSES, clause } from "./data/clauses";
export { HOSPITALS, hospital } from "./data/hospitals";
export { POLICIES, policy } from "./data/policies";
export { PROCEDURES, procedure } from "./data/procedures";
export { LIST_FRAMEWORK, LIST_I, LIST_I_TOTAL, type ListItem } from "./data/lists";
