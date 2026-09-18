/**
 * The two pieces of the session layer that are worth testing without a browser.
 *
 * Password storage and the guess limit are both things that look right by
 * inspection and fail silently when they are wrong — a hash that is not salted
 * still verifies, a limiter keyed on the wrong thing still returns true. Neither
 * shows up in the app, so neither shows up in a demo either.
 *
 * Ownership itself is not tested here. It lives in route handlers against a real
 * database and two real cookie jars, and asserting it against a mock would be
 * asserting that the mock works.
 *
 * Run: npm run check --workspace @claimcast/api
 */

import { attempt, BUDGET, reset } from "./throttle.js";
import { hash, verify } from "./session.js";

const failures: string[] = [];
function ok(cond: boolean, what: string) {
  if (!cond) failures.push(what);
}

// ── Passwords ────────────────────────────────────────────────────────────

const PASSWORD = "correct horse battery staple";
const stored = await hash(PASSWORD);

ok(await verify(PASSWORD, stored), "the right password does not verify");
ok(!(await verify(PASSWORD + " ", stored)), "a trailing space still verifies");
ok(!(await verify("", stored)), "an empty password verifies");
ok(!stored.includes(PASSWORD), "the password appears in what is stored");

// Salted, so two people with the same password do not have the same row, and a
// table of precomputed hashes buys an attacker nothing.
const second = await hash(PASSWORD);
ok(stored !== second, "the same password hashes to the same string twice");
ok(await verify(PASSWORD, second), "the second hash of the same password does not verify");

// The stored string has to carry its own parameters, or the cost can never be
// raised without invalidating every password already set.
const parts = stored.split("$");
ok(parts.length === 6 && parts[0] === "scrypt", "the stored format is not scrypt$N$r$p$salt$key");
ok(Number(parts[1]) >= 16384, "the scrypt cost has been lowered below 16384");

// A stored value from an algorithm this code does not know is refused rather
// than compared as if it were scrypt.
ok(!(await verify(PASSWORD, "md5$x$y")), "an unknown hash scheme was accepted");

// ── The guess limit ──────────────────────────────────────────────────────

reset();
let allowed = 0;
for (let i = 0; i < BUDGET + 4; i++) {
  if (attempt("203.0.113.9", "someone@example.com").ok) allowed++;
}
ok(allowed === BUDGET, `the limiter allowed ${allowed} guesses, not ${BUDGET}`);

// A second address against the same email must not get a fresh budget: the
// email key is exhausted, which is the botnet case.
ok(
  !attempt("198.51.100.4", "someone@example.com").ok,
  "a different address got a fresh budget against an already-exhausted email",
);

// And the reverse: the exhausted address cannot move on to the next email.
ok(
  !attempt("203.0.113.9", "another@example.com").ok,
  "an exhausted address got a fresh budget by changing the email",
);

// An untouched pair is unaffected — the limit is per key, not global.
ok(attempt("192.0.2.7", "fresh@example.com").ok, "an unrelated caller was refused");

// Case and surrounding space must not create a second budget for one address.
reset();
for (let i = 0; i < BUDGET; i++) attempt("203.0.113.9", "Someone@Example.com");
ok(
  !attempt("203.0.113.9", "  SOMEONE@EXAMPLE.COM  ").ok,
  "changing the case of the email got a fresh budget",
);

const refused = attempt("203.0.113.9", "someone@example.com");
ok(!refused.ok && refused.retryIn > 0, "a refusal did not say when to try again");

// ── ───────────────────────────────────────────────────────────────────────

console.log(`session — passwords salted and parameterised, ${BUDGET} guesses per window enforced`);
if (failures.length) {
  console.error("\nSession check failed:");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
