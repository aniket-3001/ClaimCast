/**
 * The deterministic core, as one package.
 *
 * Everything a caller needs to price an admission and explain the result is
 * exported here, and nothing in this package imports from the web app or the
 * API — the dependency only ever points inward. That is what lets the browser
 * and the server run the same adjudication and be unable to disagree about a
 * rupee: there is one implementation, imported twice, not a copy on each side.
 *
 * What is deliberately not exported here is the reference data. The engine
 * reads whatever registry was installed — from the database, in the running
 * application — and the hand-written set now lives behind a separate import,
 * `@claimcast/engine/fixtures`, which only the self-checks reach for. A screen
 * that shows a figure has to have fetched it.
 */

export * from "./money";
export * from "./types";
export * from "./bill";
export * from "./engine";
export * from "./case";
export * from "./registry";
export * from "./facts";
