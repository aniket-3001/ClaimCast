/**
 * Who is asking, and what they are allowed to see.
 *
 * Before this existed, `GET /api/cases/:id` would hand any case to anyone who
 * had the id. The ids are unguessable, which is not the same as private — a case
 * carries someone's admission, their policy and their age, and "hard to guess"
 * is what you say about a password, not about an access control.
 *
 * **A session exists from first contact.** The alternative — no owner until
 * someone registers — means a policy schedule uploaded on the first screen has
 * nowhere to belong, and the only options are to refuse the upload or to leave it
 * unscoped. So the first request gets a `User` row with no email, and everything
 * that person creates is scoped to it immediately. Naming yourself later attaches
 * an email and a password to the row that already holds your work; nothing is
 * migrated, because nothing changed hands.
 *
 * That is a real boundary and a modest one, and it is worth being exact about
 * which. It stops one person's cases reaching another's browser. It does not
 * survive cleared cookies, and until an email is set there is no way to prove the
 * row is yours — which is precisely why claiming it is offered.
 *
 * **Passwords** go through scrypt, which is in Node's standard library and is a
 * memory-hard KDF. No native dependency, nothing to keep patched, and the stored
 * string carries its own salt and parameters so the cost can be raised later
 * without invalidating what is already stored.
 */

import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "./reference.js";

const derive = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const COOKIE = "cc_session";
/** A demo is walked over weeks, not minutes; an idle session should still be there. */
const MAX_AGE = 60 * 60 * 24 * 30;

/**
 * scrypt at the parameters Node documents as interactive-login cost. N is the
 * memory-hard one and the only one worth raising; it is recorded in the stored
 * string so raising it does not strand existing hashes.
 */
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEYLEN = 32;

/**
 * In production the web app is on another origin, which browsers will only send
 * a cookie to when it is SameSite=None and Secure. In development it is behind
 * Vite's proxy and same-origin, where Secure would stop the cookie working over
 * http://localhost entirely.
 */
const PRODUCTION = process.env.NODE_ENV === "production";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set and at least 32 characters. Generate one with: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  return s;
}

/** Called at boot so a missing secret stops the server rather than a request. */
export function check(): void {
  secret();
}

export async function hash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEYLEN, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verify(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  // Constant time: a comparison that returns early on the first wrong byte tells
  // an attacker how much of the hash they have right.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function setCookie(reply: FastifyReply, userId: string): void {
  reply.setCookie(COOKIE, userId, {
    path: "/",
    httpOnly: true,
    signed: true,
    secure: PRODUCTION,
    sameSite: PRODUCTION ? "none" : "lax",
    maxAge: MAX_AGE,
  });
}

/**
 * The id of whoever is asking, creating a session if there is not one.
 *
 * A cookie whose signature does not check out is treated as no cookie at all:
 * the caller gets a fresh session rather than an error, because a tampered or
 * stale cookie is far more often a rotated secret than an attack, and either way
 * there is nothing useful to tell the browser.
 */
export async function current(req: FastifyRequest, reply: FastifyReply): Promise<string> {
  const raw = req.cookies[COOKIE];
  if (raw) {
    const opened = req.unsignCookie(raw);
    if (opened.valid && opened.value) {
      const known = await db.user.findUnique({ where: { id: opened.value } });
      if (known) return known.id;
    }
  }

  // An email is required to be unique but may be null, and a session that has not
  // been claimed has no name to put here either.
  const user = await db.user.create({ data: {} });
  setCookie(reply, user.id);
  return user.id;
}

/**
 * Attach an email and password to the session that is already running.
 *
 * Claiming an account keeps the same row, so the cases made before signing up
 * are still there afterwards. Signing in to a different account switches the
 * cookie instead, and the work done anonymously stays on the row it was made on
 * rather than being silently moved into someone else's account.
 *
 * **This endpoint tells you whether an email is registered, and that is not
 * fixable here.** One endpoint serves both signing up and signing in, so a known
 * email with the wrong password is refused while an unknown one succeeds --
 * which is an answer to "does this person have an account". Splitting it into
 * two endpoints does not help; a sign-up route has to reject an address that is
 * already taken, and that is the same disclosure. The only real fix is to stop
 * answering synchronously: accept anything, send a mail, and say "check your
 * inbox" either way. That needs a mail service this deployment does not have, so
 * the exposure is written down rather than papered over. What it discloses is
 * that an address has used ClaimCast -- which, for a claims estimator, is worth
 * closing before this is put in front of real users.
 *
 * Guessing is throttled separately, in `server.ts`, which is a different problem
 * from enumeration and is handled.
 */
export async function claim(
  req: FastifyRequest,
  reply: FastifyReply,
  email: string,
  password: string,
): Promise<{ ok: true; id: string; email: string } | { ok: false; reason: string }> {
  const normalised = email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email: normalised } });

  if (existing) {
    if (!existing.passwordHash || !(await verify(password, existing.passwordHash))) {
      return { ok: false, reason: "That email and password do not match an account." };
    }
    setCookie(reply, existing.id);
    return { ok: true, id: existing.id, email: normalised };
  }

  if (password.length < 10) {
    return { ok: false, reason: "Use a password of at least 10 characters." };
  }

  const id = await current(req, reply);
  const me = await db.user.findUnique({ where: { id } });
  if (me?.email) {
    // Already signed in as someone else. Rather than move this session's work
    // into a new account, start a clean one and leave the old row alone.
    const fresh = await db.user.create({
      data: { email: normalised, passwordHash: await hash(password) },
    });
    setCookie(reply, fresh.id);
    return { ok: true, id: fresh.id, email: normalised };
  }

  const claimed = await db.user.update({
    where: { id },
    data: { email: normalised, passwordHash: await hash(password) },
  });
  return { ok: true, id: claimed.id, email: normalised };
}

/** Forget the browser. The row and its cases stay; only this device lets go. */
export function signOut(reply: FastifyReply): void {
  reply.clearCookie(COOKIE, { path: "/" });
}

export const cookieSecret = secret;
export const anonymousName = () => "session-" + randomUUID().slice(0, 8);
