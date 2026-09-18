/**
 * Where an uploaded policy schedule is kept, and for how long.
 *
 * These are real people's financial documents. A policy schedule carries a name,
 * an age, a policy number and what a family is covered for, which is enough to
 * impersonate someone to an insurer. So three rules, and they are enforced here
 * rather than written down somewhere and hoped for:
 *
 * 1. **Encrypted at rest.** AES-256-GCM, a fresh 12-byte nonce per file, the
 *    authentication tag stored with it. The key comes from the environment and
 *    is never written to disk beside the documents it opens.
 * 2. **A retention period, not a promise to tidy up.** Files older than
 *    DOCUMENT_RETENTION_DAYS are deleted, swept on every write and at boot. The
 *    default is seven days, which is longer than a demo needs and shorter than
 *    anyone would want their schedule sitting on a server.
 * 3. **Never logged.** Nothing in this module writes a filename, a byte or a
 *    field of the plaintext to the log. The caller gets an opaque id.
 *
 * The API refuses to accept an upload at all when no key is configured, rather
 * than falling back to writing plaintext. An unencrypted store that works is
 * worse than a broken one that does not, because only one of them gets noticed.
 */

import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.DOCUMENT_DIR ?? join(HERE, "..", ".vault");
const RETENTION_DAYS = Number(process.env.DOCUMENT_RETENTION_DAYS ?? 7);
const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export class VaultUnconfigured extends Error {
  constructor() {
    super(
      "DOCUMENT_ENCRYPTION_KEY is not set. Uploaded schedules are encrypted at rest, and there " +
        "is deliberately no plaintext fallback. Generate one with: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
}

function key(): Buffer {
  const raw = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!raw) throw new VaultUnconfigured();
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) {
    throw new Error("DOCUMENT_ENCRYPTION_KEY must be 32 bytes, base64-encoded. Got " + k.length + ".");
  }
  return k;
}

/** True when an upload can be accepted at all. Checked before the file is read. */
export function configured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete anything past its retention period.
 *
 * Failures are swallowed on purpose: a file that cannot be deleted right now is
 * a reason to try again on the next write, not a reason to fail the upload the
 * user is waiting on. It is not logged either, because the only thing worth
 * saying would name the file.
 */
export async function sweep(): Promise<number> {
  let removed = 0;
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const name of await readdir(DIR)) {
      try {
        const s = await stat(join(DIR, name));
        if (s.mtimeMs < cutoff) {
          await unlink(join(DIR, name));
          removed++;
        }
      } catch {
        /* already gone, or held open; the next sweep will get it */
      }
    }
  } catch {
    /* no directory yet */
  }
  return removed;
}

/** Store a document. Returns the id, which is all the caller ever holds. */
export async function put(bytes: Buffer): Promise<string> {
  const k = key();
  await mkdir(DIR, { recursive: true });
  void sweep();

  const id = randomUUID();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, k, nonce);
  const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
  await writeFile(join(DIR, id), Buffer.concat([nonce, cipher.getAuthTag(), body]), {
    mode: 0o600,
  });
  return id;
}

/** Read a document back, or null if it has aged out. */
export async function get(id: string): Promise<Buffer | null> {
  // The id is a UUID this module generated. Anything else is a caller trying to
  // reach out of the directory, and it does not get a filesystem call at all.
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const k = key();
  let raw: Buffer;
  try {
    raw = await readFile(join(DIR, id));
  } catch {
    return null;
  }
  const decipher = createDecipheriv(ALGORITHM, k, raw.subarray(0, NONCE_BYTES));
  decipher.setAuthTag(raw.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(raw.subarray(NONCE_BYTES + TAG_BYTES)),
    decipher.final(),
  ]);
}

export async function drop(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  try {
    await unlink(join(DIR, id));
  } catch {
    /* already gone */
  }
}

export const RETENTION = RETENTION_DAYS;
