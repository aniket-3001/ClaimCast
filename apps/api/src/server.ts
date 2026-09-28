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
import { caseFacts, evaluate, repair, setRegistry, withPolicy, type Fact, type Registry } from "@claimcast/engine";
import {
  AskPdfSchema,
  ChatRequestSchema,
  BranchChoiceSchema,
  CaseInputSchema,
  ConfirmSchema,
  CredentialsSchema,
  EXTRACTED_FIELDS,
  ExtractionSchema,
  ForecastRequestSchema,
  ForecastResponseSchema,
  OutcomeSchema,
  SaveCaseSchema,
  type ReferenceBundle,
} from "@claimcast/contracts";
import * as ref from "./reference.js";
import * as vault from "./vault.js";
import { extractPolicy, pageText } from "./extract.js";
import {
  learningState,
  promptHints,
  recordConfirmation,
  settledBills,
  trainingBills,
  shakyFields,
} from "./learning.js";
import { chosen } from "./models.js";
import { answerFromPolicyPdf } from "./rag.js";
import { answerChat } from "./chat.js";
import * as session from "./session.js";
import { attempt } from "./throttle.js";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";
const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "";

/**
 * An identity token for the ML service, when there is a metadata server to ask.
 *
 * The cost model is deployed with authentication required, so that the only
 * thing on the public internet is this API. Left open it would be a CPU-burning
 * endpoint anyone could find and hold down -- and on an account kept inside a
 * free tier deliberately, a stranger's traffic is a bill.
 *
 * On Cloud Run the metadata server mints a token for the service's own identity,
 * audienced to the callee; `run.invoker` on that identity is what makes it work.
 * Off Cloud Run -- a laptop, a container on a laptop -- there is no metadata
 * server, the fetch fails fast, and the call goes out unauthenticated, which is
 * exactly right against a local uvicorn that asks for nothing.
 *
 * Tokens last an hour. This keeps one for fifty minutes rather than fetching per
 * request: the metadata server is quick but it is a network hop inside the
 * request path of a screen the user is waiting on.
 */
let mlToken: { value: string; until: number } | null = null;

async function mlAuthHeader(): Promise<Record<string, string>> {
  if (!ML_SERVICE_URL.startsWith("https://")) return {};
  if (mlToken && Date.now() < mlToken.until) {
    return { authorization: `Bearer ${mlToken.value}` };
  }
  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity" +
        `?audience=${encodeURIComponent(ML_SERVICE_URL)}`,
      { headers: { "metadata-flavor": "Google" }, signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return {};
    const value = (await res.text()).trim();
    if (!value) return {};
    mlToken = { value, until: Date.now() + 50 * 60_000 };
    return { authorization: `Bearer ${value}` };
  } catch {
    // No metadata server. Not an error: it is how this process knows it is not
    // running on Google, and the local cost model is not asking for a token.
    return {};
  }
}

/**
 * Retrain the cost model once enough settled bills have arrived that it has not
 * been trained on.
 *
 * Stateless on purpose. `/health` says how many bills the running booster was
 * trained on and the database says how many exist, so the gap is recomputed on
 * every report and nothing here has to survive a restart -- including the cost
 * model's own, which on an ephemeral disk falls back to the image's version and
 * is brought forward again by the next report. Every bill is sent, not only the
 * new ones, because the booster is rebuilt on the combined pool.
 */
const RETRAIN_EVERY = Math.max(1, Number(process.env.RETRAIN_EVERY ?? 10));
let retraining = false;

async function maybeRetrain(log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }) {
  if (!ML_SERVICE_URL || retraining) return;
  retraining = true;
  try {
    const auth = await mlAuthHeader();
    const health = await fetch(ML_SERVICE_URL + "/health", { headers: auth });
    if (!health.ok) return;
    const trained = Number(((await health.json()) as { outcomesTrainedOn?: number }).outcomesTrainedOn ?? 0);
    const total = await ref.db.forecastOutcome.count({ where: { actualTotal: { gt: 0 } } });
    if (total - trained < RETRAIN_EVERY) return;

    const res = await fetch(ML_SERVICE_URL + "/retrain", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ outcomes: await trainingBills(ref.db) }),
    });
    if (!res.ok) {
      log.warn({ status: res.status }, "cost model retrain refused");
      return;
    }
    const done = (await res.json()) as { modelVersion?: string; outcomesTrainedOn?: number };
    log.info({ modelVersion: done.modelVersion, outcomes: done.outcomesTrainedOn }, "cost model retrained");
  } catch (e) {
    log.warn({ error: e instanceof Error ? e.message : String(e) }, "cost model retrain failed");
  } finally {
    retraining = false;
  }
}

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
 * The cost model: an XGBoost quantile booster over the published tariffs, in
 * `services/ml`.
 *
 * Where it is not configured the endpoint says so plainly -- returning a
 * plausible number from nowhere would be the single most damaging thing this
 * service could do.
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
  // Every bill anybody has reported, handed to the model with the request.
  //
  // Not filtered to this procedure on purpose. Between retrains these correct
  // the booster by one shrunk factor across the catalogue, and the model skips
  // any bill its booster was already trained on by the timestamp each carries.
  // Procedure-specific learning is the retrain's job, not this correction's.
  //
  // Two integers and a timestamp per row -- no owner, no hospital, no policy.
  // A failure to read them degrades to the forecast this service has always
  // given rather than to no forecast.
  const observed = await settledBills(ref.db).catch(() => []);

  const res = await fetch(ML_SERVICE_URL + "/forecast", {
    method: "POST",
    headers: { "content-type": "application/json", ...(await mlAuthHeader()) },
    body: JSON.stringify({ ...parsed.data, observed }),
  });
  if (res.status === 401 || res.status === 403) {
    // Worth separating from a generic 502. This one is never the model's fault
    // and never transient: it is the API's service account missing run.invoker
    // on the cost model, and it will keep happening until someone grants it.
    req.log.error({ status: res.status }, "the cost model refused this service's identity");
    return reply.code(502).send({ error: "cost model rejected this service's identity" });
  }
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
    // Corrections other people made, handed to the reader before it reads. The
    // model chosen here is the one `read()` will pick, so the hints are the ones
    // that apply to it; a failure to gather them degrades to the prompt this
    // server has always sent rather than to no extraction.
    const pick = chosen();
    const hints = pick
      ? await promptHints(ref.db, `${pick.provider}/${pick.model}`).catch(() => "")
      : "";
    const { extraction } = await extractPolicy(bytes, filename, doc.id, hints);
    await ref.db.policyDocument.update({ where: { id: doc.id }, data: { extraction } });

    // What every previous reader of this model got wrong often enough to be
    // worth saying out loud. This is the correction loop closing: nothing was
    // retrained between that person's confirmation and this one, and the
    // warning is on screen regardless. A failure to compute it costs the caller
    // an extraction they can still read, so it degrades to no warning at all.
    const shaky = await shakyFields(ref.db, extraction.model).catch(() => []);
    return { documentId: doc.id, extraction, shaky };
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

  // Everything below is the learning signal, and none of it is allowed to cost
  // the caller their confirmation. The gate above has already closed; failing to
  // record what it taught us is this server's problem, not the person's, and it
  // must not turn a confirmed policy into an error on their screen.
  let learned: { corrected: number; seen: number } | null = null;
  try {
    const body = ConfirmSchema.safeParse(req.body ?? {});
    const doc = await ref.db.policyDocument.findUnique({ where: { id } });
    const extraction = ExtractionSchema.safeParse(doc?.extraction);

    if (body.success && extraction.success) {
      const read: Parameters<typeof recordConfirmation>[1]["read"] = {};
      const confirmed: Parameters<typeof recordConfirmation>[1]["confirmed"] = {};

      for (const field of EXTRACTED_FIELDS) {
        const got = extraction.data.fields[field];
        if (!got) continue;
        read[field] = { value: got.value, verified: got.verified, span: got.span?.text ?? null };
        // A client that sends no value for a field has not corrected it, and
        // that is agreement -- an observation worth as much as a correction,
        // because a reader being right is half of what is being measured here.
        confirmed[field] = field in body.data.fields ? body.data.fields[field]! : got.value;
      }

      learned = await recordConfirmation(ref.db, {
        documentId: id,
        model: extraction.data.model,
        read,
        confirmed,
        keepExamples: body.data.keepExamples,
      });
    }
  } catch {
    // Deliberately silent, and deliberately unlogged: the only things that could
    // usefully be said about this failure are field names and values out of
    // somebody's policy schedule.
    learned = null;
  }

  return { documentId: id, confirmedAt: new Date().toISOString(), learned };
});

/**
 * A question about the policy PDF this user uploaded — answered by retrieval
 * over the document itself, not a canned clause list, and optionally
 * cross-checked against one hospital's own record. See `rag.ts`.
 *
 * `:id` is the document id from `/api/policies/extract`, not a reference
 * policy id: this reads the actual file the caller uploaded, which is why it
 * is gated by the same ownership check as `/confirm` rather than being open
 * reference data.
 */
app.post<{ Params: { id: string } }>("/api/policies/:id/ask", async (req, reply) => {
  const parsed = AskPdfSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid question", detail: parsed.error.flatten() });
  }

  const userId = await session.current(req, reply);
  const doc = await ref.db.policyDocument.findFirst({ where: { id: req.params.id, userId } });
  if (!doc) return reply.code(404).send({ error: "no such document" });

  const bytes = await vault.get(doc.storageKey);
  if (!bytes) {
    return reply.code(410).send({
      error: "document expired",
      detail: `Uploads are kept ${vault.RETENTION} days before they are deleted. Upload the schedule again to ask about it.`,
    });
  }

  if (!bundle) bundle = await loadReference();
  const extraction = ExtractionSchema.safeParse(doc.extraction);
  const extractedInsurer =
    extraction.success && typeof extraction.data.fields.insurer?.value === "string"
      ? extraction.data.fields.insurer.value
      : null;

  try {
    const pages = await pageText(bytes);
    return await answerFromPolicyPdf({
      pages,
      question: parsed.data.question,
      hospitals: bundle.hospitals,
      hospitalId: parsed.data.hospitalId,
      extractedInsurer,
    });
  } catch (e) {
    const raw = (e as { status?: unknown }).status;
    const status = typeof raw === "number" ? raw : 502;
    return reply.code(status).send({
      error: "could not answer",
      detail:
        status === 503
          ? "No model provider is configured on this server."
          : "The question could not be answered.",
    });
  }
});

/**
 * The chatbox. Questions about the admission on screen and, when one was
 * uploaded, the policy document behind it. See `chat.ts`.
 *
 * The case is priced again here, by the same engine, so the figures the model
 * is allowed to repeat are the server's own. A confirmed uploaded policy exists
 * only in the browser, so it travels with the request and is installed for the
 * length of one synchronous evaluation. The document, when named, is read under
 * the same ownership check as `/ask`.
 */
app.post("/api/chat", async (req, reply) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid question", detail: parsed.error.flatten() });
  }
  const { question, history, policy, documentId } = parsed.data;

  if (!bundle) bundle = await loadReference();
  let facts: Fact[];
  try {
    const run = () => caseFacts(evaluate(repair(parsed.data.case)));
    facts = policy ? withPolicy(policy, run) : run();
  } catch (e) {
    return reply.code(404).send({ error: e instanceof Error ? e.message : "unknown reference" });
  }

  let pages: string[] | null = null;
  if (documentId) {
    const userId = await session.current(req, reply);
    const doc = await ref.db.policyDocument.findFirst({ where: { id: documentId, userId } });
    if (!doc) return reply.code(404).send({ error: "no such document" });
    const bytes = await vault.get(doc.storageKey);
    if (!bytes) {
      return reply.code(410).send({
        error: "document expired",
        detail: `Uploads are kept ${vault.RETENTION} days. Upload the schedule again to ask about it.`,
      });
    }
    pages = await pageText(bytes);
  }

  try {
    return await answerChat({ question, history, facts, pages });
  } catch (e) {
    const raw = (e as { status?: unknown }).status;
    const status = typeof raw === "number" ? raw : 502;
    return reply.code(status).send({
      error: "could not answer",
      detail:
        status === 503
          ? "No model provider is configured on this server, so the chat cannot answer. Set GEMINI_API_KEY, GROQ_API_KEY or ANTHROPIC_API_KEY."
          : "The question could not be answered. Try asking it another way.",
    });
  }
});

/**
 * What the system has learned, with the denominators attached.
 *
 * Open, because every number in it is a count of field names and model names and
 * there is nothing here about any person. The counts travel with the rates on
 * purpose: "improves with use" is a claim, and a claim made by something that
 * has read four documents should not read like the same claim from something
 * that has read four thousand. Showing the denominator is what keeps that honest
 * without anyone having to remember to say it out loud.
 */
app.get("/api/learning", async () => {
  const state = await learningState(ref.db);
  return { ...state, costModel: await costModelState(state.outcomes) };
});

/** What the cost model says about itself, for the admin's learning screen. */
async function costModelState(outcomes: number) {
  if (!ML_SERVICE_URL) return null;
  try {
    const res = await fetch(ML_SERVICE_URL + "/health", {
      headers: await mlAuthHeader(),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const h = (await res.json()) as {
      modelVersion: string;
      model?: string;
      trainedOn: string;
      trainingRows?: { tariff?: number } | null;
      outcomesTrainedOn?: number;
      heldOutCoverage?: Record<string, number>;
    };
    const trained = h.outcomesTrainedOn ?? 0;
    return {
      modelVersion: h.modelVersion,
      model: h.model ?? "unknown",
      trainedOn: h.trainedOn,
      tariffRows: h.trainingRows?.tariff ?? 0,
      outcomesTrainedOn: trained,
      pending: Math.max(0, outcomes - trained),
      retrainEvery: RETRAIN_EVERY,
      heldOutCoverage: h.heldOutCoverage ?? {},
    };
  } catch {
    return null;
  }
}

/**
 * A bill that actually settled.
 *
 * The only evidence in this system that can say whether a forecast was any good,
 * and the scarcest, because it has to be volunteered weeks after the admission.
 * Scoped to the session that reports it so a person can be shown their own, and
 * read by the cost model as a direct observation of the ratio its multiplier
 * estimates.
 *
 * The band is stored as sent rather than recomputed: the point of the row is to
 * record what this system said at the time, not what it would say now. A caller
 * who misreports it corrupts one row, and the ratio that row implies then sits
 * alongside every other one in an average rather than replacing anything.
 */
app.post("/api/outcomes", async (req, reply) => {
  const userId = await session.current(req, reply);
  const parsed = OutcomeSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "bad outcome", detail: parsed.error.flatten() });
  }

  const { request, p10, p50, p90, anchorTotal, actualTotal } = parsed.data;
  const row = await ref.db.forecastOutcome.create({
    data: {
      userId,
      request,
      p10,
      p50,
      p90,
      anchorTotal,
      actualTotal,
      // Lifted out of the request so the calibration query does not have to dig
      // through JSON on every read.
      procedureId: request.procedureId,
      cityTier: request.cityTier,
      hospitalId: request.hospitalId ?? null,
    },
  });

  // The self-learning loop. Not awaited: the person reporting a bill is owed
  // their answer now, and a retrain that fails costs the model a version, not
  // them a response.
  void maybeRetrain(req.log);

  // Where the reported bill fell against the band we gave. Returned because
  // somebody who has just told us something true about their own admission is
  // owed an answer about what it meant, and because "inside the band" is the
  // claim this table exists to test.
  return reply.code(201).send({ id: row.id, within: actualTotal >= p10 && actualTotal <= p90 });
});

/**
 * One branch taken in the journey.
 *
 * The weakest of the three signals, and labelled that way wherever it is used:
 * it orders what the tree offers first and makes no number more accurate. Not
 * scoped to a session and carrying no owner column, because a record of which
 * illnesses and room classes a particular person was contemplating is not a
 * thing worth keeping in order to sort a menu.
 *
 * Answers 204 and nothing else, including when the body is junk. A client should
 * not be waiting on this, and a malformed click is not worth an error page.
 */
app.post("/api/journey/choice", async (req, reply) => {
  const parsed = BranchChoiceSchema.safeParse(req.body);
  if (parsed.success) await ref.db.branchChoice.create({ data: parsed.data }).catch(() => {});
  return reply.code(204).send();
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

  bundle = await withDatabaseReady(loadReference);
  app.log.info(
    { hospitals: bundle.hospitals.length, sources: bundle.sources.length },
    "reference data loaded",
  );
  await app.listen({ port: PORT, host: HOST });
}

/**
 * Give the network a moment to exist before deciding the database does not.
 *
 * On a laptop the first query works or the database is genuinely not running,
 * so failing immediately is the useful behaviour and it is kept: the first
 * attempt is not delayed, and a real absence still ends the process rather than
 * leaving a server up that answers every request with an error.
 *
 * On Cloud Run with direct VPC egress the container is started before its
 * network interface is necessarily ready, so the first connection to a private
 * address can be refused for a second or two on a perfectly healthy deployment.
 * Fail-fast turns that into a failed revision, and the log says "no database",
 * which sends you to look at the database -- where everything is fine. This cost
 * two deploys and a firewall investigation to learn.
 *
 * Bounded deliberately. A database that is still unreachable after half a minute
 * is not slow, it is misconfigured, and a container that keeps retrying forever
 * hides that behind a health check that never goes green.
 */
async function withDatabaseReady<T>(work: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 30_000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const reachability = /P1001|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|Can't reach database/.test(
        msg,
      );
      if (!reachability || Date.now() >= deadline) throw e;
      app.log.warn({ attempt }, "database not reachable yet, retrying");
      await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 4000)));
    }
  }
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
