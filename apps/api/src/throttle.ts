/**
 * A cap on how fast the same caller can guess.
 *
 * scrypt makes one guess expensive for an attacker, but a ten-character
 * password is only out of reach if the guesses are also few. This puts a
 * ceiling on the rate: a fixed window per key, counted in memory.
 *
 * **In memory, which is a real limitation.** The counters live in this process,
 * so two instances behind a load balancer each allow the full budget, and a
 * restart forgets everything. It is deployed as a single Cloud Run service with
 * the free tier's concurrency, so today that is one process and the limit is the
 * limit; the day it is scaled out, this needs to move to the database or to
 * Redis. Written down here rather than discovered later.
 *
 * It is keyed by both address and email, and either one alone exhausting its
 * budget is enough to refuse. One address grinding through a list of emails is
 * stopped by the address key; a botnet grinding one email from many addresses is
 * stopped by the email key. Neither key alone covers both.
 */

/** Guesses allowed per key per window. Generous for a person, useless for a script. */
const LIMIT = 8;
const WINDOW_MS = 10 * 60 * 1000;

/** A bound on the map, so a flood of distinct keys cannot grow it without end. */
const MAX_KEYS = 20_000;

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

function bump(key: string, now: number): boolean {
  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  w.count += 1;
  return w.count <= LIMIT;
}

function sweep(now: number): void {
  for (const [k, w] of windows) {
    if (now >= w.resetAt) windows.delete(k);
  }
}

/**
 * May this attempt proceed? Returns the seconds to wait when it may not.
 *
 * Both keys are bumped whichever way it goes, so an attacker cannot spend an
 * address's budget on one email and then start fresh on the next.
 */
export function attempt(address: string, email: string): { ok: true } | { ok: false; retryIn: number } {
  const now = Date.now();
  if (windows.size > MAX_KEYS) sweep(now);

  const byAddress = bump("ip:" + address, now);
  const byEmail = bump("em:" + email.trim().toLowerCase(), now);
  if (byAddress && byEmail) return { ok: true };

  const a = windows.get("ip:" + address)?.resetAt ?? now;
  const e = windows.get("em:" + email.trim().toLowerCase())?.resetAt ?? now;
  return { ok: false, retryIn: Math.ceil((Math.max(a, e) - now) / 1000) };
}

/** Test seam. Nothing in the server calls this. */
export function reset(): void {
  windows.clear();
}

export const BUDGET = LIMIT;
export const WINDOW_SECONDS = WINDOW_MS / 1000;
