import { useState } from "react";
import { fmt, registry, type CaseInput, type DiagnosticTest } from "@claimcast/engine";
import type { ConfirmedHealth, HealthReading } from "@claimcast/contracts";
import { readHealthReport, searchTests } from "../api";
import { lang, plural, t } from "../i18n";
import { showDate } from "../illness";

/**
 * The health report or prescription, on the "Your health" step.
 *
 * The same gate as the policy upload. What was read is a proposal, shown line
 * by line beside the words it came from, and nothing is priced until the
 * family confirms it. A reading can be wrong in two different ways and both are
 * fixable here: the report was misread (untick it, or add the test that was
 * missed), or the right line was matched to the wrong CGHS test (pick another).
 *
 * Entirely optional. Without a report the app is exactly what it was.
 */
export function HealthReport({
  input,
  health,
  onConfirm,
  onRemove,
  illnessDate,
  onIllnessDate,
  onAge,
}: {
  input: CaseInput;
  health: ConfirmedHealth | null;
  onConfirm: (h: ConfirmedHealth) => void;
  onRemove: () => void;
  illnessDate: string;
  onIllnessDate: (iso: string) => void;
  onAge: (age: number) => void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");

  async function read(what: File | string) {
    setStage({ kind: "reading", name: typeof what === "string" ? t("what you typed") : what.name });
    const r = await readHealthReport(what);
    setStage(r.ok ? { kind: "read", reading: r.reading } : { kind: "refused", reason: r.reason });
  }

  if (health && stage.kind !== "read")
    return (
      <div className="hr-card hr-done">
        <div className="hr-k">{t("Your health report")}</div>
        <div className="hr-title">{health.diagnosis ?? t("Report added")}</div>
        <ul className="hr-summary">
          <li>{plural(health.tests.length, "{n} test or scan to price", "{n} tests or scans to price")}</li>
          <li>
            {health.procedureId
              ? t("Operation: {x}", { x: registry().procedures.find((p) => p.id === health.procedureId)?.name ?? "—" })
              : t("No operation — tests only")}
          </li>
        </ul>
        <p className="hr-note">{t("Where to have each one, and what you would pay, is on “The path”.")}</p>
        <div className="hr-actions">
          <button type="button" className="hr-secondary" onClick={onRemove}>
            {t("Remove report")}
          </button>
        </div>
      </div>
    );

  return (
    <div className="hr-card">
      <div className="hr-k">{t("Optional")}</div>
      <div className="hr-title">{t("Add your health report or prescription")}</div>
      <p className="hr-note">
        {t(
          "For example an X-ray report and the doctor’s note for a broken ankle. We find the tests and the operation it asks for, and show where each can be done and what you would pay.",
        )}
      </p>

      {(stage.kind === "idle" || stage.kind === "refused") && (
        <>
          {stage.kind === "refused" && <p className="warn-line">{stage.reason}</p>}
          <div className="hr-upload">
            <label className="hr-drop">
              <span className="hr-drop-v">{t("Upload the report (PDF or photo)")}</span>
              <span className="hr-drop-s">{t("It is read once and not kept.")}</span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                style={{ display: "none" }}
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  if (f) void read(f);
                  ev.target.value = "";
                }}
              />
            </label>
            <button type="button" className="wiz-link" onClick={() => setTyping(!typing)}>
              {typing ? t("Hide") : t("or type what the report says")}
            </button>
          </div>
          {typing && (
            <div className="hr-type">
              <textarea
                rows={6}
                value={typed}
                placeholder={t("Diagnosis: …\nInvestigations: X-ray …, MRI …\nAdvised: …")}
                onChange={(ev) => setTyped(ev.target.value)}
              />
              <button type="button" disabled={typed.trim().length < 3} onClick={() => void read(typed)}>
                {t("Read this")}
              </button>
            </div>
          )}
        </>
      )}

      {stage.kind === "reading" && (
        <p className="hr-reading" aria-live="polite">
          {t("Reading {file}…", { file: stage.name })}
        </p>
      )}

      {stage.kind === "read" && (
        <Review
          reading={stage.reading}
          input={input}
          illnessDate={illnessDate}
          onIllnessDate={onIllnessDate}
          onAge={onAge}
          onCancel={() => setStage({ kind: "idle" })}
          onConfirm={(h) => {
            onConfirm(h);
            setStage({ kind: "idle" });
          }}
        />
      )}

      <p className="hr-fine">
        {t("ClaimCast does not interpret your report medically. It prices what your doctor has already asked for.")}
      </p>
    </div>
  );
}

type Stage =
  | { kind: "idle" }
  | { kind: "reading"; name: string }
  | { kind: "read"; reading: HealthReading }
  | { kind: "refused"; reason: string };

interface Row {
  key: string;
  keep: boolean;
  asWritten: string;
  quote: HealthReading["tests"][number]["quote"];
  choice: DiagnosticTest | null;
  options: DiagnosticTest[];
  added?: boolean;
}

function Review({
  reading,
  input,
  illnessDate,
  onIllnessDate,
  onAge,
  onCancel,
  onConfirm,
}: {
  reading: HealthReading;
  input: CaseInput;
  illnessDate: string;
  onIllnessDate: (iso: string) => void;
  onAge: (age: number) => void;
  onCancel: () => void;
  onConfirm: (h: ConfirmedHealth) => void;
}) {
  const { procedures } = registry();
  // A test is ticked when it was both found in the report and matched to a
  // priced test. Anything less is shown, unticked, for the family to decide.
  const [rows, setRows] = useState<Row[]>(() =>
    reading.tests.map((x, i) => ({
      key: "r" + i,
      keep: x.match !== null && (x.quote?.verified ?? false),
      asWritten: x.asWritten,
      quote: x.quote,
      choice: x.match,
      options: x.candidates,
    })),
  );
  const [procedureId, setProcedureId] = useState(reading.treatment?.procedureId ?? "");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<DiagnosticTest[]>([]);
  const l = lang();

  const put = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const kept = rows.filter((r) => r.keep && r.choice);

  const onset = reading.onsetDate;
  const ageDiffers = reading.patient.age !== null && reading.patient.age !== input.age;

  return (
    <div className="hr-review">
      <div className="hr-k">{t("Please check what we read")}</div>
      <p className="hr-note">
        {reading.source === "image"
          ? t("Read from a photo of {file}. Check each line against your paper copy.", { file: reading.filename })
          : t("Read from {file}. Next to each item is the line we found it on.", { file: reading.filename })}
        {reading.model === "rules" ? " " + t("Read without an AI model, so some items may be missed — add them below.") : ""}
      </p>
      {reading.unverified > 0 && (
        <p className="warn-line">
          {plural(
            reading.unverified,
            "{n} item could not be matched to a line in your report. It is marked and left unticked.",
            "{n} items could not be matched to a line in your report. They are marked and left unticked.",
          )}
        </p>
      )}

      <div className="hr-block">
        <span className="hr-label">{t("Diagnosis")}</span>
        <b>{reading.diagnosis?.text ?? t("Not stated")}</b>
        <Quote q={reading.diagnosis?.quote ?? null} />
      </div>

      {(ageDiffers || (onset && onset !== illnessDate)) && (
        <div className="hr-suggest">
          {ageDiffers && (
            <button type="button" className="hr-chip" onClick={() => onAge(reading.patient.age!)}>
              {t("Use age {n} from the report", { n: reading.patient.age! })}
            </button>
          )}
          {onset && onset !== illnessDate && (
            <button type="button" className="hr-chip" onClick={() => onIllnessDate(onset)}>
              {t("Use {date} as the date it began", { date: showDate(new Date(onset + "T00:00:00"), l) })}
            </button>
          )}
        </div>
      )}

      <div className="hr-block">
        <span className="hr-label">{t("Tests and scans")}</span>
        {rows.length === 0 && <p className="hr-note">{t("None found. Add any your doctor asked for below.")}</p>}
        <ul className="hr-tests">
          {rows.map((r, i) => (
            <li key={r.key} className={r.keep ? "" : "off"}>
              <label className="hr-tick">
                <input
                  type="checkbox"
                  checked={r.keep}
                  disabled={!r.choice}
                  onChange={(ev) => put(i, { keep: ev.target.checked })}
                />
                <span>{r.asWritten}</span>
              </label>
              {!r.added && <Quote q={r.quote} />}
              <select
                aria-label={t("Priced as")}
                value={r.choice?.code ?? ""}
                onChange={(ev) => {
                  const c = r.options.find((o) => o.code === ev.target.value) ?? null;
                  put(i, { choice: c, keep: c !== null });
                }}
              >
                <option value="">{t("— No matching test —")}</option>
                {r.options.map((o) => (
                  <option key={o.code} value={o.code}>
                    {short(o.name)} · CGHS {fmt(o.nabh)}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <div className="hr-add">
          <input
            type="search"
            value={q}
            placeholder={t("Add a test: e.g. MRI knee, CBC, ECG")}
            onChange={(ev) => {
              const v = ev.target.value;
              setQ(v);
              if (v.trim().length >= 2) void searchTests(v).then(setFound);
              else setFound([]);
            }}
          />
          {found.length > 0 && (
            <ul className="hr-found">
              {found.map((o) => (
                <li key={o.code}>
                  <button
                    type="button"
                    onClick={() => {
                      setRows([
                        ...rows,
                        { key: "a" + o.code + rows.length, keep: true, asWritten: q.trim(), quote: null, choice: o, options: found, added: true },
                      ]);
                      setQ("");
                      setFound([]);
                    }}
                  >
                    + {short(o.name)} <span>CGHS {fmt(o.nabh)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="hr-block">
        <span className="hr-label">{t("Operation or hospital treatment")}</span>
        {reading.treatment ? (
          <>
            <b>{reading.treatment.text}</b>
            <Quote q={reading.treatment.quote} />
          </>
        ) : (
          <p className="hr-note">{t("The report does not advise an operation.")}</p>
        )}
        <label className="wiz-field hr-proc">
          <span>{t("Price it as")}</span>
          <select value={procedureId} onChange={(ev) => setProcedureId(ev.target.value)}>
            <option value="">{t("No operation — tests only")}</option>
            {procedures.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {reading.treatment && !reading.treatment.procedureId && (
          <p className="hr-note">
            {t("This treatment is not one we can price yet. Pick the closest, or leave it as tests only.")}
          </p>
        )}
      </div>

      {reading.medicines.length > 0 && (
        <div className="hr-block">
          <span className="hr-label">{t("Medicines")}</span>
          <ul className="hr-meds">
            {reading.medicines.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="hr-actions">
        <button type="button" className="hr-secondary" onClick={onCancel}>
          {t("Cancel")}
        </button>
        <button
          type="button"
          onClick={() =>
            onConfirm({
              filename: reading.filename,
              diagnosis: reading.diagnosis?.text ?? null,
              tests: kept.map((r) => ({ ...r.choice!, asWritten: r.asWritten })),
              treatment: reading.treatment?.text ?? null,
              procedureId: procedureId || null,
              medicines: reading.medicines,
            })
          }
        >
          {t("Confirm and continue")}
        </button>
      </div>
    </div>
  );
}

function Quote({ q }: { q: HealthReading["tests"][number]["quote"] }) {
  if (!q) return null;
  return (
    <span className={q.verified ? "cite" : "cite cite-bad"}>
      “{q.text}”{q.page && q.page > 1 ? ` — ${t("page {n}", { n: q.page })}` : ""}
      {q.verified ? "" : " · " + t("not found in your report")}
    </span>
  );
}

/** CGHS names run long; the full one is in the title. */
export const short = (name: string, max = 70) => (name.length > max ? name.slice(0, max - 2).trimEnd() + "…" : name);
