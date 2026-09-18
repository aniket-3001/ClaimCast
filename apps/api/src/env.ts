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
 * dependency on how the process was launched.
 *
 * **And in development the file wins over the ambient environment.** dotenv does
 * not overwrite a variable that is already set, which is the right default for a
 * server and the wrong one for a laptop. A `GROQ_API_KEY` left in the Windows
 * user environment by some earlier project shadowed the one in this `.env`
 * entirely: the file was read, the value was discarded, and a dead key went to
 * the provider. The failure arrived as `401 Invalid API Key` from Groq, which
 * points at the key rather than at the twelve-month-old environment variable
 * actually supplying it. Editing `.env` and having nothing change is a bad
 * afternoon, and it is the same shape of bug as the cwd one above.
 *
 * Production is exempt, deliberately. There is no `.env` in the image --
 * `.dockerignore` excludes it -- so this is a no-op there either way, and if one
 * ever did leak in, overriding Secret Manager with a stale committed file is a
 * far worse outcome than the confusion it would have prevented.
 */

import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// src -> api -> apps -> repository root.
config({
  path: join(HERE, "..", "..", "..", ".env"),
  override: process.env.NODE_ENV !== "production",
});
