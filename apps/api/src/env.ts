/**
 * Load the repository's `.env`, wherever this process was started from.
 *
 * `import "dotenv/config"` reads `.env` from the current working directory, and
 * the API is started from `apps/api` by npm, so it read nothing. Nothing broke
 * loudly: Prisma finds `DATABASE_URL` by searching upward from the schema, so
 * the database connected and every other variable was quietly absent. The vault
 * answered "not configured" to uploads that should have worked, and the session
 * secret went missing at boot, which is how this was finally noticed.
 *
 * Resolving from this file's own location instead of the cwd removes the
 * dependency on how the process was launched. Real environment variables still
 * win -- `override` is left off -- because in production there is no `.env` at
 * all and the platform supplies them directly.
 */

import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// src -> api -> apps -> repository root.
config({ path: join(HERE, "..", "..", "..", ".env") });
