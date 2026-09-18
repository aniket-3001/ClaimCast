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

import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { evaluate, repair, setRegistry, type Registry } from "@claimcast/engine";
import {
  CaseInputSchema,
  ForecastRequestSchema,
  ForecastResponseSchema,
  SaveCaseSchema,
  type ReferenceBundle,
} from "@claimcast/contracts";
import * as ref from "./reference.js";
import * as vault from "./vault.js";
import { extractPolicy } from "./extract.js";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";
const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "";

const app = Fastify({
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
});

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
  const row = await ref.db.case.create({
    data: {
      input: parsed.data.input,
      label: parsed.data.label ?? null,
    },
  });
  return reply.code(201).send({ id: row.id, createdAt: row.createdAt.toISOString() });
});

app.get<{ Params: { id: string } }>("/api/cases/:id", async (req, reply) => {
  const row = await ref.db.case.findUnique({ where: { id: req.params.id } });
  if (!row) return reply.code(404).send({ error: "no such case" });

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
  const doc = await ref.db.policyDocument.create({ data: { filename, storageKey } });

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
  try {
    const doc = await ref.db.policyDocument.update({
      where: { id },
      data: { confirmedAt: new Date() },
    });
    return { documentId: doc.id, confirmedAt: doc.confirmedAt };
  } catch {
    return reply.code(404).send({ error: "no such document" });
  }
});

async function start() {
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
