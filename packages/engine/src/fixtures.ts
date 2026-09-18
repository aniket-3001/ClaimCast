/**
 * The hand-written reference set, as a registry.
 *
 * This is the data the prototype ran on and it is still what the self-checks
 * run on, because a check that needed a database running would not be a check
 * anyone remembered to do. It is no longer what the application runs on: the
 * app installs what it fetched from the API, and nothing here is reachable
 * from it unless something imports this module by name.
 *
 * That is the point of keeping it in its own file rather than in the barrel.
 * An import of `@claimcast/engine` brings the arithmetic and nothing else, so
 * a screen cannot quietly render a hand-written figure while appearing to show
 * one that came out of the database.
 */

import { ADMISSIONS } from "./data/admissions";
import { CLAUSES } from "./data/clauses";
import { HOSPITALS } from "./data/hospitals";
import { LIST_FRAMEWORK, LIST_I } from "./data/lists";
import { POLICIES } from "./data/policies";
import { PROCEDURES } from "./data/procedures";
import type { Registry } from "./registry";

export const FIXTURES: Registry = {
  hospitals: HOSPITALS,
  procedures: PROCEDURES,
  policies: POLICIES,
  clauses: CLAUSES,
  listI: LIST_I,
  listFramework: LIST_FRAMEWORK,
  admissions: ADMISSIONS,
};

export { ADMISSIONS, CLAUSES, HOSPITALS, LIST_FRAMEWORK, LIST_I, POLICIES, PROCEDURES };
