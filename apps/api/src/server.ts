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
import { evaluate, repair, setRegistry, type Registry } from "@claimcast/engine";
import {
  CaseInputSchema,
  ForecastRequestSchema,
  SaveCaseSchema,
  type ReferenceBundle,
} from "@claimcast/contracts";
import * as ref from "./reference.js";

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
  if (!res.ok) {
    return reply.code(502).send({ error: "cost model failed", status: res.status });
  }
  return res.json();
});

/** Phase 5. Kept as a declared route so the shape is agreed before it is built. */
app.post("/api/policies/extract", async (_req, reply) =>
  reply.code(503).send({
    error: "not built yet",
    detail: "Policy extraction lands in Phase 5. Enter the schedule by hand until then.",
  }),
);

async function start() {
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
