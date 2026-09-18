/**
 * The ClaimCast API.
 *
 * Two jobs. It hands the client the reference data it needs to work — one
 * request, because the client always wants all of it — and it re-adjudicates
 * anything that is going to be persisted or shown as final, using the same
 * engine the browser just used. The browser computes optimistically so that a
 * branch click stays instant; this side is what the figure actually is.
 *
 * The engine imported here is the same package the client imports, not a
 * reimplementation of it, so the two cannot disagree about a rupee. Where they
 * would disagree is on the data, and that is why the registry is loaded from
 * the database at boot: the server prices with what is in Postgres, and the
 * client prices with what this endpoint gave it.
 */

import "./env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, repair, setRegistry, type Registry } from "@claimcast/engine";
import {
  CaseInputSchema,
  CredentialsSchema,
  ForecastRequestSchema,
  ForecastResponseSchema,
  SaveCaseSchema,
  type ReferenceBundle,
} from "@claimcast/contracts";
import * as ref from "./reference.js";
import * as vault from "./vault.js";
import { extractPolicy } from "./extract.js";
import * as session from "./session.js";
import { attempt } from "./throttle.js";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";
const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "";

const app = Fastify({
  // Cloud Run terminates TLS and forwards, so the socket address is always the
  // proxy's. Without this `req.ip` is one value for every caller on earth and
  // the login throttle becomes a global counter that one attacker can exhaust
  // for everybody. Only in production: trusting the header locally would let
  // anything set its own address.
  trustProxy: process.env.NODE_ENV === "production",
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
    // Nothing a user typed gets logged. A case input describes someone's
    // admission and a policy document is their financial record; the request
    // line is enough to debug a route, and the body never is.
    redact: { paths: ["req.body", "req.headers.authorization"], remove: true },
  },
});

/**
 * Who may call this.
 *
 * In development the client goes through Vite's proxy and is same-origin, so
 * nothing here applies. In production the web app is static on another origin
 * entirely, which is what this is for — an explicit list from the environment,
 * never a wildcard, because these endpoints will carry someone's policy and
 * their admission before long.
 */
const ORIGINS = (process.env.WEB_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

await app.register(cors, {
  origin: ORIGINS.length ? ORIGINS : false,
  methods: ["GET", "POST"],
  // The session cookie has to cross from the static web origin to this one, and
  // a browser will not send it unless the server says so. This is also why the
  // origin list above can never become a wildcard: `credentials: true` with `*`
  // is exactly the combination that hands someone's session to any site.
  credentials: true,
});

/**
 * Cookies, signed.
 *
 * The cookie carries a user id and nothing else -- no claim about who they are
 * that the server would then believe. The signature is what stops one id being
 * swapped for another, and it is checked in `session.current` before the id is
 * looked up.
 */
await app.register(cookie, { secret: session.cookieSecret() });

/**
 * One file, and not a large one.
 *
 * A policy schedule is a handful of pages. The ceiling is here rather than in
 * the route because a limit enforced after the bytes have been read is not a
 * limit — this one refuses the stream, so an oversized upload never reaches
 * memory, the encryptor or the model.
 */
await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4 },
});

/**
 * Read the whole reference set once and hold it.
 *
 * It changes when an ETL run changes it, which is never while the process is
 * up, and re-reading it per request would mean seven queries to answer a click
 * the engine answers in microseconds.
 */
let bundle: ReferenceBundle | null = null;

async function loadReference(): Promise<ReferenceBundle> {
  const [hospitals, procedures, policies, clauses, listI, listFramework, admissions, sources] =
    await Promise.all([
      ref.hospitals(),
      ref.procedures(),
      ref.policies(),
      ref.clauses(),
      ref.listI(),
      ref.listFramework(),
      ref.admissions(),
      ref.sources(),
    ]);

  const registry: Registry = {
    hospitals,
    procedures,
    policies,
    clauses,
    listI,
    listFramework: listFramework.map((l) => ({ id: l.id, title: l.title, effect: l.effect })),
    admissions,
  };
  setRegistry(registry);

  return {
    ...registry,
    listFramework: registry.listFramework,
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      publisher: s.publisher,
      url: s.url,
      checksum: s.checksum,
      fetchedAt: s.fetchedAt.toISOString(),
      caveat: s.caveat,
    })),
  };
}

app.get("/api/health", async () => ({
  ok: true,
  reference: bundle
    ? {
        hospitals: bundle.hospitals.length,
        procedures: bundle.procedures.length,
        policies: bundle.policies.length,
        sources: bundle.sources.length,
        caveatedSources: bundle.sources.filter((s) => s.caveat !== null).length,
      }
    : null,
}));

/** Everything the client needs to start. */
app.get("/api/reference", async () => {
  if (!bundle) bundle = await loadReference();
  return bundle;
});

/**
 * The authoritative adjudication.
 *
 * The client has already computed this locally and shown it; this is the same
 * arithmetic over the server's own copy of the data, and it is what a saved
 * case or a printed figure is taken from.
 */
app.post("/api/cases/evaluate", async (req, reply) => {
  const parsed = CaseInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid case", detail: parsed.error.flatten() });
  }
  try {
    // `repair` first: the same guard the UI applies, so an input naming a room
    // the hospital does not have is corrected identically on both sides rather
    // than throwing here and succeeding there.
    return evaluate(repair(parsed.data));
  } catch (e) {
    return reply.code(404).send({ error: e instanceof Error ? e.message : "unknown reference" });
  }
});

/**
 * Save a case.
 *
 * The input is stored, never the result. Reopening a saved case re-adjudicates
 * it with the engine of the day, so a figure shown to someone is always one
 * the current rules produce rather than one that was true in March.
 */
app.post("/api/cases", async (req, reply) => {
  const parsed = SaveCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid case", detail: parsed.error.flatten() });
  }
  const userId = await session.current(req, reply);
  const row = await ref.db.case.create({
    data: {
      input: parsed.data.input,
      label: parsed.data.label ?? null,
      userId,
    },
  });
  return reply.code(201).send({ id: row.id, createdAt: row.createdAt.toISOString() });
});

app.get<{ Params: { id: string } }>("/api/cases/:id", async (req, reply) => {
  const userId = await session.current(req, reply);
  const row = await ref.db.case.findUnique({ where: { id: req.params.id } });

  // Someone else's case, or one from before ownership existed, is answered the
  // same way a case that was never saved is: 404. Distinguishing them would
  // turn this route into a way of asking whether a given case id exists, and a
  // case id is the only thing standing between a stranger and an admission
  // record. A row with no owner belongs to nobody and is readable by nobody.
  if (!row || row.userId === null || row.userId !== userId) {
    return reply.code(404).send({ error: "no such case" });
  }

  const parsed = CaseInputSchema.safeParse(row.input);
  if (!parsed.success) {
    // A stored case that no longer parses means the input shape changed under
    // it. Say so rather than adjudicating something half-understood.
    return reply.code(409).send({ error: "stored case predates the current input shape" });
  }
  return {
    id: row.id,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    input: parsed.data,
    evaluated: evaluate(repair(parsed.data)),
  };
});

/**
 * The cost model, which does not exist yet.
 *
 * Phase 4 puts a tariff-anchored quantile model behind this. Until it is
 * actually there, the endpoint says so plainly — returning a plausible number
 * from nowhere would be the single most damaging thing this service could do.
 */
app.post("/api/forecast", async (req, reply) => {
  const parsed = ForecastRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid forecast request" });
  }
  if (!ML_SERVICE_URL) {
    return reply.code(503).send({
      error: "no cost model",
      detail:
        "The ML service is not configured. Set ML_SERVICE_URL once services/ml is running; " +
        "there is deliberately no fallback estimate.",
    });
  }
  const res = await fetch(ML_SERVICE_URL + "/forecast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  if (res.status === 422) {
    // The model refuses rather than guesses: an unknown procedure, an ailment
    // category nobody has coded, a procedure no scheme publishes a rate for. The
    // reason is the useful part and it is the caller's, not a log line.
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    return reply.code(422).send({
      error: "no forecast for this admission",
      detail: body.detail ?? "The cost model declined to estimate this admission.",
    });
  }
  if (!res.ok) {
    return reply.code(502).send({ error: "cost model failed", status: res.status });
  }
  // The model is a separate service in another language, so nothing but this
  // parse keeps it inside the contract. A drift here would otherwise surface as
  // a missing caveat or a silently stripped field in the UI.
  const forecast = ForecastResponseSchema.safeParse(await res.json());
  if (!forecast.success) {
    req.log.error({ issues: forecast.error.issues }, "cost model broke the contract");
    return reply.code(502).send({
      error: "cost model failed",
      detail: "The cost model returned a response outside the agreed contract.",
    });
  }
  return forecast.data;
});

/**
 * Read a policy schedule.
 *
 * The response is a proposal, never a policy. Every field arrives with the span
 * it was read from and a flag saying whether that span was found in the document
 * itself; the client shows both and the user confirms field by field. Nothing
 * here writes to `Policy`, and `confirmedAt` below is the only thing that marks
 * an extraction as having been looked at by a person.
 *
 * The upload is encrypted before anything else touches it and deleted when its
 * retention period runs out. Nothing about it is logged — not the filename, not
 * a field, not a span — so a failure here is debugged from the status code and
 * the caller's own copy of the file.
 */
app.post("/api/policies/extract", async (req, reply) => {
  // Before the file is touched, so that the row it creates has an owner from the
  // moment it exists rather than acquiring one afterwards.
  const userId = await session.current(req, reply);

  if (!vault.configured()) {
    return reply.code(503).send({
      error: "not configured",
      detail:
        "Uploads are encrypted at rest and DOCUMENT_ENCRYPTION_KEY is not set, so this server " +
        "will not accept one. Enter the schedule by hand until it is.",
    });
  }

  const part = await req.file();
  if (!part) {
    return reply.code(400).send({ error: "no file", detail: "Send the schedule as a file part." });
  }

  const bytes = await part.toBuffer();
  // The declared content type is the uploader's claim; the first five bytes are
  // the file's own. Both have to say PDF, because the model is about to be told
  // this is a document and pdf.js is about to parse it.
  if (part.mimetype !== "application/pdf" || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return reply.code(415).send({
      error: "not a pdf",
      detail: "Only a PDF policy schedule can be read here.",
    });
  }

  // Stored first, and under a name this server chose. A schedule that arrives is
  // encrypted before it is parsed, not after, so a failure in the middle of an
  // extraction cannot leave a plaintext copy anywhere.
  const storageKey = await vault.put(bytes);
  const filename = (part.filename ?? "schedule.pdf").slice(0, 200);
  const doc = await ref.db.policyDocument.create({ data: { filename, storageKey, userId } });

  try {
    const { extraction } = await extractPolicy(bytes, filename, doc.id);
    await ref.db.policyDocument.update({ where: { id: doc.id }, data: { extraction } });
    return { documentId: doc.id, extraction };
  } catch (e) {
    // A document that produced nothing is a document there is no reason to keep.
    await vault.drop(storageKey);
    await ref.db.policyDocument.delete({ where: { id: doc.id } }).catch(() => {});
    const raw = (e as { status?: unknown }).status;
    const status = typeof raw === "number" ? raw : 502;
    return reply.code(status).send({
      error: "extraction failed",
      detail:
        status === 503
          ? "The extraction service is not configured on this server. Enter the schedule by hand."
          : "The schedule could not be read. Enter it by hand.",
    });
  }
});

/**
 * The confirmation gate, recorded.
 *
 * `Intake.tsx` will not let an extracted value into the engine until the user
 * has agreed to it, and this is where that agreement is written down. It is a
 * separate request on purpose: the extraction and the confirmation are different
 * acts by different parties, and a row that carried both in one write could not
 * tell them apart afterwards.
 */
app.post("/api/policies/:id/confirm", async (req, reply) => {
  const { id } = req.params as { id: string };
  const userId = await session.current(req, reply);

  // `updateMany` with the owner in the filter, rather than a read followed by a
  // write: one statement, so there is no window in which the row is checked and
  // then written under a different owner. A count of zero covers both "no such
  // document" and "not yours", which are the same answer to the caller.
  const hit = await ref.db.policyDocument.updateMany({
    where: { id, userId },
    data: { confirmedAt: new Date() },
  });
  if (hit.count === 0) return reply.code(404).send({ error: "no such document" });
  return { documentId: id, confirmedAt: new Date().toISOString() };
});

/**
 * Who this browser is, as far as the server is concerned.
 *
 * Called on load so the web app knows whether to offer "keep these cases" or
 * "sign out". It creates the session if there is not one, which means the very
 * first request a browser makes is the one that gives it an identity -- before
 * anything has been uploaded that would need an owner.
 */
app.get("/api/me", async (req, reply) => {
  const id = await session.current(req, reply);
  const me = await ref.db.user.findUnique({ where: { id } });
  const cases = await ref.db.case.count({ where: { userId: id } });
  return { id, email: me?.email ?? null, anonymous: !me?.email, cases };
});

/**
 * Put a name to the session, or sign in to one that already has a name.
 *
 * One endpoint for both because from the browser they are one act: you type an
 * email and a password, and either it is yours already or it becomes yours. The
 * server can tell which; telling the browser which would also tell anyone who
 * asks whether a given person has an account here.
 */
app.post("/api/auth/claim", async (req, reply) => {
  const parsed = CredentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid credentials", detail: parsed.error.flatten() });
  }
  // Before the hash, not after: scrypt is deliberately slow, and letting a
  // rejected caller spend that time is a way to take the server down as well as
  // a way to guess.
  const gate = attempt(req.ip, parsed.data.email);
  if (!gate.ok) {
    return reply.code(429).header("retry-after", gate.retryIn).send({
      error: "too many attempts",
      detail: `Too many attempts. Try again in ${Math.ceil(gate.retryIn / 60)} minutes.`,
    });
  }

  const out = await session.claim(req, reply, parsed.data.email, parsed.data.password);
  if (!out.ok) return reply.code(401).send({ error: "rejected", detail: out.reason });
  const cases = await ref.db.case.count({ where: { userId: out.id } });
  return { id: out.id, email: out.email, anonymous: false, cases };
});

/**
 * Let go of this browser. The cases stay on the account; only the cookie goes.
 * The next request gets a fresh anonymous session, which is the right state for
 * a shared machine -- signed out means starting over, not seeing the last
 * person's claim.
 */
app.post("/api/auth/signout", async (_req, reply) => {
  session.signOut(reply);
  return { ok: true };
});

/**
 * The cases on this account, newest first.
 *
 * Inputs only. Each one is re-adjudicated when it is opened, so this list never
 * carries a figure -- a label and a date is all it takes to choose one, and a
 * stale number in a list is a number someone might read.
 */
app.get("/api/cases", async (req, reply) => {
  const userId = await session.current(req, reply);
  const rows = await ref.db.case.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, label: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
});

/* ---------------------------------------------------------------------------
 * The web app, served by the API that answers its calls.
 *
 * One origin, and that is the point. Served from somewhere else, the session
 * cookie is a third-party cookie: it needs SameSite=None, it needs the CORS
 * allow-list to name the exact origin with no trailing slash, and it is thrown
 * away silently by the browsers that block third-party cookies by default. The
 * symptom is not an error -- it is a new anonymous session on every request, so
 * saved cases vanish and the screen looks like it lost the data rather than
 * like a cookie was dropped. In front of a panel that is unrecoverable.
 *
 * Same origin removes the entire class: SameSite=Lax works, CORS is not
 * consulted, and `VITE_API_URL` stays empty because "" already means same
 * origin in `apps/web/src/api.ts`.
 *
 * Registered only when a build is actually present, so development is
 * unaffected -- there Vite serves the app on its own port and proxies /api here.
 * ------------------------------------------------------------------------- */

const WEB_DIST =
  process.env.WEB_DIST ??
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "web", "dist");

if (existsSync(join(WEB_DIST, "index.html"))) {
  await app.register(fastifyStatic, {
    root: WEB_DIST,
    // The SPA fallback below owns unmatched paths. Left on, the plugin's own
    // wildcard route answers first and a reload on /journey returns 404.
    wildcard: false,
    index: false,
    setHeaders(res, path) {
      // Vite fingerprints everything under /assets, so those filenames change
      // whenever their contents do and can be cached indefinitely. index.html
      // is the one file whose name never changes and whose job is to name the
      // current bundle, so caching it is how a deploy fails to take effect.
      if (path.includes("assets")) {
        res.header("cache-control", "public, max-age=31536000, immutable");
      } else {
        res.header("cache-control", "no-cache");
      }
    },
  });

  /* The headers that used to be Firebase Hosting's job, now that nothing sits
   * in front of this process. The policy is tight because it can be: the bundle
   * loads no third-party script, no web font and no remote image, and it talks
   * to exactly one origin -- its own.
   *
   * 'unsafe-inline' is present for styles and absent for scripts, which is the
   * distinction that matters. Inline styles are how React applies a style prop;
   * inline script is how an injected payload runs. */
  const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");

  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("content-security-policy", CSP);
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "same-origin");
    reply.header("x-frame-options", "DENY");
    return payload;
  });

  /* A single-page app routes in the browser, so every one of its paths is a 404
   * to the server. Handing back index.html lets the app route it. Anything
   * under /api is a real route that really is missing, and must stay JSON:
   * answering an API call with a page of HTML turns a clear 404 into a parse
   * error somewhere else entirely. */
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== "GET" || req.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "no such route" });
    }
    return reply.type("text/html").sendFile("index.html");
  });

  app.log.info({ root: WEB_DIST }, "serving the web bundle from this process");
} else {
  app.log.info("no web bundle found; serving the API only");
}

async function start() {
  // A missing session secret is a server that cannot tell its users apart. It
  // fails here, at boot, rather than on whichever request happens to be first.
  session.check();

  // Retention is enforced on every upload, which is no good to a server that has
  // been idle since the last one. A boot is the other moment anything is
  // guaranteed to run, so it runs here too.
  const swept = await vault.sweep();
  if (swept) app.log.info({ swept, retentionDays: vault.RETENTION }, "expired documents deleted");

  bundle = await loadReference();
  app.log.info(
    { hospitals: bundle.hospitals.length, sources: bundle.sources.length },
    "reference data loaded",
  );
  await app.listen({ port: PORT, host: HOST });
}

start().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/P1001|ECONNREFUSED|Can't reach database/.test(msg)) {
    app.log.error("No database at DATABASE_URL. Start one with: npm run db:up");
  } else {
    app.log.error(e);
  }
  process.exit(1);
});
