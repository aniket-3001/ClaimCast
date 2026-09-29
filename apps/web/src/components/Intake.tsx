import { useState } from "react";
import { evaluate, fmt, pct, registry, setRegistry, type CaseInput, type Policy } from "@claimcast/engine";
import type { Extraction, ExtractedField, ShakyField } from "@claimcast/contracts";
import { confirmDocument, extractPolicy } from "../api";
import { plural, t } from "../i18n";

/**
 * The front door, not the engine.
 *
 * Nothing typed here is adjudicated — a name is not a clause. Two things do
 * feed the rest of the app: which policy is held, and the three facts about
 * the patient that decide whether a government scheme is open to them. Both
 * are asked here because this is where a family would say them first, and
 * because they are facts rather than decisions.
 */
export function Intake({
  input,
  onChange,
  name,
  onName,
  policyholder,
  onPolicyholder,
  onDocument,
  onContinue,
  step,
  onStep,
}: {
  input: CaseInput;
  onChange: (next: CaseInput) => void;
  name: string;
  onName: (v: string) => void;
  policyholder: string;
  onPolicyholder: (v: string) => void;
  /** The uploaded document's id once it has been read, for the chatbox to search. */
  onDocument?: (documentId: string) => void;
  onContinue: () => void;
  /** Which wizard step is showing; held by the app so it survives a tab change. */
  step: number;
  onStep: (n: number) => void;
}) {
  const { policies: POLICIES } = registry();
  const policy = POLICIES.find((p) => p.id === input.policyId)!;
  const [up, setUp] = useState<Upload>({ stage: "idle" });

  async function read(file: File) {
    setUp({ stage: "reading", filename: file.name });
    const r = await extractPolicy(file).catch(() => ({
      ok: false as const,
      reason: "The server is not reachable.",
    }));
    setUp(
      r.ok
        ? { stage: "read", documentId: r.documentId, extraction: r.extraction, shaky: r.shaky }
        : { stage: "refused", reason: r.reason },
    );
    if (r.ok) onDocument?.(r.documentId);
  }

  /**
   * The confirmed reading becomes the policy the engine prices with.
   *
   * This is the moment the extraction stops being a proposal, and it is on the
   * far side of the button. Before it, nothing read out of the PDF has touched a
   * figure anywhere in the app; after it, the registry the journey screen
   * adjudicates against contains this policy and not the sample one.
   */
  function adoptPolicy(p: Policy) {
    const r = registry();
    setRegistry({ ...r, policies: [...r.policies.filter((x) => x.id !== p.id), p] });
    set({ policyId: p.id });
  }
  const set = (patch: Partial<CaseInput>) => onChange({ ...input, ...patch });

  const go = (n: number) => {
    onStep(Math.max(0, Math.min(STEPS.length - 1, n)));
    window.scrollTo(0, 0);
  };
  const e = evaluate(input);
  const yesNo = (value: boolean, change: (v: boolean) => void) => (
    <div className="yn">
      <button type="button" aria-pressed={value} onClick={() => change(true)}>
        {t("Yes")}
      </button>
      <button type="button" aria-pressed={!value} onClick={() => change(false)}>
        {t("No")}
      </button>
    </div>
  );

  return (
    <div className="wizard">
      <div className="wiz-progress">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`wiz-dot ${i === step ? "on" : i < step ? "done" : ""}`}
            onClick={() => go(i)}
          >
            <span className="wiz-n">{i < step ? "✓" : i + 1}</span>
            <span className="wiz-l">{t(label)}</span>
          </button>
        ))}
      </div>
      <div className="wiz-bar">
        <div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <div className="wiz-count">{t("Step {a} of {b}", { a: step + 1, b: STEPS.length })}</div>

      {step === 0 && (
        <div className="wiz-card">
          <h1 className="wiz-q">{t("Tell us about you")}</h1>
          <p className="wiz-hint">{t("Only the age matters for the bill. Names are optional.")}</p>
          <label className="wiz-field">
            <span>{t("Your name")}</span>
            <input type="text" placeholder={t("Optional")} value={name} onChange={(ev) => onName(ev.target.value)} />
          </label>
          <label className="wiz-field">
            <span>{t("Name on the policy")}</span>
            <input
              type="text"
              placeholder={t("Optional")}
              value={policyholder}
              onChange={(ev) => onPolicyholder(ev.target.value)}
            />
          </label>
          <label className="wiz-field narrow">
            <span>{t("Patient's age")}</span>
            <input
              type="number"
              min={0}
              max={120}
              value={input.age}
              onChange={(ev) => set({ age: clamp(ev.target.value, 0, 120) })}
            />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="wiz-card">
          <h1 className="wiz-q">{t("Which health insurance plan do you have?")}</h1>
          <label className="wiz-field">
            <span>{t("Your health insurance plan")}</span>
            <select
              value={input.policyId}
              onChange={(ev) => {
                set({ policyId: ev.target.value });
                setUp({ stage: "idle" });
              }}
            >
              {POLICIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product} — {p.insurer}
                </option>
              ))}
            </select>
          </label>
          <p className="wiz-or">{t("or")}</p>
      <section className="section">
        <div className="section-head">
          <h2>{t("Your policy schedule")}</h2>
          <span className="aside">
            {up.stage === "read" ? t("Read from your PDF") : t("Sample plan for this demo")}
          </span>
        </div>

        {up.stage === "idle" && (
          <label className="tnode start" style={{ cursor: "pointer", display: "block" }}>
            <div className="tnode-k">{t("Optional")}</div>
            <div className="tnode-v" style={{ fontSize: 20 }}>
              {t("Upload your policy document (PDF)")}
            </div>
            <div className="tnode-sub">
              {t(
                "Click to choose the file. We read your limits from it for you to check. It is kept private and deleted after a few days.",
              )}
            </div>
            <input
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={(ev) => {
                const file = ev.target.files?.[0];
                if (file) read(file);
              }}
            />
          </label>
        )}

        {up.stage === "reading" && (
          <div className="tnode start">
            <div className="tnode-k">{t("Reading {file}", { file: up.filename })}</div>
            <div className="tnode-v" style={{ fontSize: 20 }}>
              {t("Reading your policy…")}
            </div>
            <div className="tnode-sub">
              {t("Each detail comes with the exact line it was found on, so you can check it.")}
            </div>
          </div>
        )}

        {up.stage === "refused" && (
          <>
            <div className="tnode start">
              <div className="tnode-k">{t("Could not read the file")}</div>
              <div className="tnode-v" style={{ fontSize: 20 }}>
                {t("Please check your plan's details below")}
              </div>
              <div className="tnode-sub">{up.reason}</div>
            </div>
            {/* The picker above is the by-hand path, and it is a real one: these
                are the terms of the policy chosen there, not an extraction
                dressed up as one. */}
            <HandEntered policy={policy} onConfirm={() => go(2)} />
          </>
        )}

        {up.stage === "read" && (
          <ExtractionPanel
            extraction={up.extraction}
            fallback={policy}
            shaky={up.shaky}
            onConfirm={(p, fields, keepExamples) => {
              adoptPolicy(p);
              // Not awaited, and its failure is swallowed inside. The
              // confirmation that governs this app happened in the browser a
              // line ago; the server's note of it, and the correction it
              // carries, must not hold anybody at the door.
              void confirmDocument(up.documentId, fields, keepExamples);
              go(2);
            }}
          />
        )}
      </section>
        </div>
      )}

      {step === 2 && (
        <div className="wiz-card">
          <h1 className="wiz-q">{t("Can a government scheme help?")}</h1>
          <p className="wiz-hint">{t("These decide whether a scheme could pay for the stay instead.")}</p>
          <div className="wiz-yn">
            <span>{t("Ayushman Bharat card at home?")}</span>
            {yesNo(input.hasPmjayCard, (v) => set({ hasPmjayCard: v }))}
          </div>
          <div className="wiz-yn">
            <span>{t("Central govt. employee or pensioner?")}</span>
            {yesNo(input.govtEmployeeOrPensioner, (v) => set({ govtEmployeeOrPensioner: v }))}
          </div>
          <div className="wiz-yn">
            <span>{t("Covered by ESI at work?")}</span>
            {yesNo(input.esiInsured, (v) => set({ esiInsured: v }))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wiz-card">
          <h1 className="wiz-q">{t("Illness began before the policy?")}</h1>
          <p className="wiz-hint">
            {t("Policies wait a while before covering an illness you already had. We check that wait for you.")}
          </p>
          <div className="wiz-yn big">{yesNo(input.preExisting, (v) => set({ preExisting: v }))}</div>
        </div>
      )}

      {step === 4 && (
        <div className="wiz-card">
          <h1 className="wiz-q">{t("Here is where you stand")}</h1>
          <div className="wiz-result">
            <span className="k">{t("As things stand, you pay")}</span>
            <span className="v">{fmt(e.result.patientPays)}</span>
            <span className="s">
              {t("Insurer pays")} {fmt(e.result.insurerPays)} · {t("Bill")} {fmt(e.result.billTotal)}
            </span>
          </div>
          <ul className="wiz-review">
            {[
              [t("Your name"), name || "—", 0],
              [t("Patient's age"), String(input.age), 0],
              [t("Your health insurance plan"), `${e.policy.product} — ${e.policy.insurer}`, 1],
              [t("Ayushman Bharat card at home?"), input.hasPmjayCard ? t("Yes") : t("No"), 2],
              [t("Central govt. employee or pensioner?"), input.govtEmployeeOrPensioner ? t("Yes") : t("No"), 2],
              [t("Covered by ESI at work?"), input.esiInsured ? t("Yes") : t("No"), 2],
              [t("Illness began before the policy?"), input.preExisting ? t("Yes") : t("No"), 3],
            ].map(([k, v, s]) => (
              <li key={String(k)}>
                <span>{k}</span>
                <b>{v}</b>
                <button type="button" className="wiz-edit" onClick={() => go(Number(s))}>
                  {t("Edit")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="wiz-nav">
        {step > 0 ? (
          <button type="button" className="wiz-back" onClick={() => go(step - 1)}>
            ← {t("Back")}
          </button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className="wiz-next" onClick={() => go(step + 1)}>
            {t("Next")} →
          </button>
        ) : (
          <button type="button" className="wiz-next" onClick={onContinue}>
            {t("See my bill")} →
          </button>
        )}
      </div>
    </div>
  );
}

const STEPS = ["About you", "Your insurance", "Government schemes", "Your health", "Review"];

interface HandRow {
  label: string;
  value: (p: Policy) => string | null;
  clause: string;
}

const FIELDS: HandRow[] = [
  { label: "Total cover per year", value: (p) => fmt(p.sumInsured), clause: "Schedule of Benefits" },
  {
    label: "Room rent limit",
    value: (p) =>
      p.roomCapPerDay
        ? t("{x} / day", { x: fmt(p.roomCapPerDay) })
        : p.roomCapPctOfSI
          ? t("{x} of sum insured", { x: pct(p.roomCapPctOfSI) })
          : t("No limit"),
    clause: "Clause 4.1",
  },
  {
    label: "ICU limit",
    value: (p) =>
      p.icuCapPerDay
        ? t("{x} / day", { x: fmt(p.icuCapPerDay) })
        : p.icuCapPctOfSI
          ? t("{x} of sum insured", { x: pct(p.icuCapPctOfSI) })
          : t("No limit"),
    clause: "Clause 4.2",
  },
  {
    label: "Co-payment",
    value: (p) => (p.copayPct ? pct(p.copayPct) : t("None")),
    clause: "Clause 6.1",
  },
  {
    label: "Limit on implants",
    value: (p) => (p.implantSubLimit ? fmt(p.implantSubLimit) : t("No sub-limit")),
    clause: "Clause 4.5",
  },
  {
    label: "Costs covered before / after the stay",
    value: (p) => t("{a} / {b} days", { a: p.preHospDays, b: p.postHospDays }),
    clause: "Clause 7.1",
  },
  {
    label: "Short (day-care) procedures covered",
    value: (p) => (p.dayCareCovered ? t("Yes") : t("No")),
    clause: "Clause 3.3",
  },
];

function HandEntered({ policy, onConfirm }: { policy: Policy; onConfirm: () => void }) {
  return (
    <div className="tnode fixed">
      <div className="tnode-k">{t("Your plan at a glance")}</div>
      <ul className="rows">
        {FIELDS.map((f) => {
          const v = f.value(policy);
          if (v === null) return null;
          return (
            <li className="row" key={f.label}>
              <span className="row-l">
                <span>{t(f.label)}</span>
                <span className="cite">{f.clause}</span>
              </span>
              <span className="row-amt">{v}</span>
            </li>
          );
        })}
      </ul>
      <button type="button" style={{ marginTop: 14 }} onClick={onConfirm}>
        {t("Confirm and continue")}
      </button>
    </div>
  );
}

const clamp = (raw: string, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(Number(raw) || 0)));

type Upload =
  | { stage: "idle" }
  | { stage: "reading"; filename: string }
  | { stage: "read"; documentId: string; extraction: Extraction; shaky: ShakyField[] }
  | { stage: "refused"; reason: string };

/**
 * A field's value as it travels: the same union the extraction uses.
 */
type Value = number | boolean | string | null;

/**
 * How a field is edited, which is not always how it is stored.
 *
 * Money is paise everywhere behind this screen and rupees on it, and a ratio is
 * a fraction behind it and a percentage on it. Asking somebody to confirm their
 * room rent limit by typing 500000 would be a way of guaranteeing a correction
 * that corrects nothing, so the conversion happens here and the round trip is
 * exact in both directions.
 */
type Kind = "text" | "money" | "pct" | "count" | "bool";

/** How each extracted field is named, shown and edited, in the order a schedule reads. */
const READ_ROWS: { field: ExtractedField; label: string; kind: Kind; unit?: string }[] = [
  { field: "insurer", label: "Insurer", kind: "text" },
  { field: "product", label: "Product", kind: "text" },
  { field: "sumInsured", label: "Total cover per year", kind: "money", unit: "\u20b9" },
  { field: "roomCapPerDay", label: "Room rent limit", kind: "money", unit: "\u20b9 / day" },
  { field: "roomCapPctOfSI", label: "Room limit (as % of cover)", kind: "pct", unit: "%" },
  { field: "icuCapPerDay", label: "ICU limit", kind: "money", unit: "\u20b9 / day" },
  { field: "icuCapPctOfSI", label: "ICU limit (as % of cover)", kind: "pct", unit: "%" },
  { field: "proportionateDeduction", label: "Cuts other charges if room is too costly", kind: "bool" },
  { field: "copayPct", label: "Co-payment", kind: "pct", unit: "%" },
  { field: "implantSubLimit", label: "Limit on implants", kind: "money", unit: "\u20b9" },
  { field: "preHospDays", label: "Covers costs before admission for", kind: "count", unit: "days" },
  { field: "postHospDays", label: "Covers costs after discharge for", kind: "count", unit: "days" },
  { field: "dayCareCovered", label: "Short (day-care) procedures covered", kind: "bool" },
  { field: "pedWaitingMonths", label: "Wait before old illnesses are covered", kind: "count", unit: "months" },
  { field: "moratoriumMonths", label: "After this, claims cannot be disputed", kind: "count", unit: "months" },
  { field: "exclusions", label: "Not covered", kind: "text" },
];

/**
 * The stored value, in the units a person types.
 *
 * Deliberately lossless: paise divide by exactly a hundred and a fraction
 * multiplies by exactly a hundred, so a field nobody touches converts out and
 * back to the number it started as. A rounding step here would manufacture
 * corrections out of untouched fields and quietly poison every rate on the
 * learning screen -- the `toPrecision` is there for that reason, because
 * 0.1 * 100 is not 10 in binary floating point.
 */
function toDraft(kind: Kind, v: Value): string {
  if (v === null) return "";
  if (kind === "bool") return v ? "yes" : "no";
  if (kind === "money") return String(Number(v) / 100);
  if (kind === "pct") return String(Number((Number(v) * 100).toPrecision(12)));
  return String(v);
}

/** And back into the units the engine and the schema use. */
function fromDraft(kind: Kind, raw: string, was: Value): Value {
  const t = raw.trim();
  if (kind === "bool") return t === "yes";
  // An emptied field is the document saying nothing, which the engine reads as
  // "no limit" -- a real answer, and often the right one.
  if (t === "") return null;
  if (kind === "text") return t;
  const n = Number(t);
  // Mid-edit junk keeps the value it had rather than blanking the row under the
  // person's cursor. Nothing is confirmed until the button, so a half-typed
  // number is never a value anybody is committed to.
  if (!Number.isFinite(n)) return was;
  if (kind === "money") return Math.round(n * 100);
  if (kind === "pct") return n / 100;
  return Math.round(n);
}

/** Display form, for the fields that are read rather than edited. */
function show(kind: Kind, v: Value): string {
  if (v === null) return t("Not stated");
  if (kind === "bool") return v ? t("Yes") : t("No");
  if (kind === "money") return fmt(Number(v));
  if (kind === "pct") return pct(Number(v));
  return String(v);
}

/**
 * What was read, what it was read from, and whether that quote is really there.
 *
 * Three things share every row: the value, the sentence the model cited, and a
 * mark saying whether that sentence was found in the PDF's own text. The third
 * is the one that matters. A model asked to cite will occasionally produce a
 * quote that reads exactly like the document and is not in it, so the server
 * searches for each one and the answer travels here. An unfound quote is shown
 * as unfound rather than dropped, because a reader who is being asked to confirm
 * a number is entitled to know the citation behind it did not check out.
 *
 * Every row is editable, and that is not a convenience. The confirmation gate
 * is the architectural promise this application makes -- no extracted value
 * prices anything until a person has agreed to it -- and a gate whose only
 * answer is yes is not a gate. It is also the only place the system is ever
 * handed a true label on a real schedule by the one person who can see both the
 * reading and the document, which is what the correction loop is built out of.
 *
 * Nothing here has touched the engine. The button below is where that happens.
 */
function ExtractionPanel({
  extraction,
  fallback,
  shaky,
  onConfirm,
}: {
  extraction: Extraction;
  fallback: Policy;
  shaky: ShakyField[];
  onConfirm: (
    p: Policy,
    fields: Partial<Record<ExtractedField, Value>>,
    keepExamples: boolean,
  ) => void;
}) {
  // Not on a schedule, and not derivable from one: a policy renewed for eight
  // years and one bought in January carry the same period of insurance. It
  // decides whether the waiting period above has expired, so it is asked rather
  // than guessed, and it starts from the sample policy only so the field is
  // never silently zero.
  const [months, setMonths] = useState(String(fallback.monthsInForce));

  // What the person has typed, keyed by field, and empty until they type. The
  // reading itself is never mutated: the row the server sent has to survive
  // intact to the end, because a correction is only meaningful as a difference
  // from what was actually read.
  const [draft, setDraft] = useState<Partial<Record<ExtractedField, string>>>({});

  // Off unless it is switched on, and switched on by the person whose schedule
  // it is. Consent that has to be withheld is not consent.
  const [keepExamples, setKeepExamples] = useState(false);

  const unverified = extraction.unverified.length;
  const warned = new Map(shaky.map((w) => [w.field, w]));

  // Only fields the reader actually produced. A field it said nothing about was
  // not read, and putting an empty box on screen would invite somebody to fill
  // in a term their schedule may not contain.
  const rows = READ_ROWS.filter((r) => {
    const got = extraction.fields[r.field];
    return got !== undefined && got.value !== null;
  });

  const rawOf = (f: ExtractedField, kind: Kind) =>
    draft[f] ?? toDraft(kind, extraction.fields[f]?.value ?? null);

  const confirmed: Partial<Record<ExtractedField, Value>> = {};
  for (const r of rows) {
    confirmed[r.field] = fromDraft(r.kind, rawOf(r.field, r.kind), extraction.fields[r.field]!.value);
  }

  // Compared as strings, exactly as the server compares them, so the count on
  // screen is the count that gets written down.
  const norm = (v: Value | undefined) => (v === null || v === undefined ? "" : String(v));
  const edited = rows.filter(
    (r) => norm(confirmed[r.field]) !== norm(extraction.fields[r.field]!.value),
  ).length;

  return (
    <div className="tnode fixed">
      <div className="tnode-k">{t("Please check what we read")}</div>
      <p className="note" style={{ marginTop: 0 }}>
        {t(
          "We read {pages} pages of {file}. Next to each detail is the line we found it on — change anything that looks wrong.",
          { pages: extraction.pages, file: extraction.filename },
        )}
      </p>

      {unverified > 0 && (
        <p className="warn-line">
          {plural(
            unverified,
            "{n} detail could not be matched to a line in your document. It is marked below — please check it against your copy.",
            "{n} details could not be matched to a line in your document. They are marked below — please check them against your copy.",
          )}
        </p>
      )}

      <ul className="rows">
        {rows.map((r) => {
          const got = extraction.fields[r.field]!;
          const warn = warned.get(r.field);
          const id = "x-" + r.field;
          return (
            <li className="row read-row" key={r.field}>
              <span className="row-l">
                <label htmlFor={id}>{t(r.label)}</label>
                {got.span ? (
                  <span className={got.verified ? "cite" : "cite cite-bad"}>
                    “{got.span.text}” — {t("page {n}", { n: got.span.page })}
                    {got.verified ? "" : " · " + t("please check this one")}
                  </span>
                ) : (
                  <span className="cite cite-bad">{t("not found in your document")}</span>
                )}
                {/* What the reader had said, kept on screen beside the
                    change. A person who has just overwritten a figure is owed a
                    view of what they overwrote -- and it is the difference, not
                    the new value, that is about to be recorded. */}
                {norm(confirmed[r.field]) !== norm(got.value) && (
                  <span className="cite cite-edited">
                    {t("we read {v} — you changed it", { v: show(r.kind, got.value) })}
                  </span>
                )}
                {/* The correction loop, closing. Nothing was retrained
                    between the reading that produced this count and the one on
                    screen; the count is what everybody before saw fit to
                    change, and it travels with its denominator so it can be
                    weighed rather than obeyed. */}
                {warn && (
                  <span className="cite cite-warn">
                    {t("others often correct this one ({a} of {b} times) — worth a second look", {
                      a: warn.corrected,
                      b: warn.seen,
                    })}
                  </span>
                )}
              </span>
              <span className="row-edit">
                {r.kind === "bool" ? (
                  <select
                    id={id}
                    value={rawOf(r.field, r.kind)}
                    onChange={(ev) => setDraft({ ...draft, [r.field]: ev.target.value })}
                  >
                    <option value="yes">{t("Yes")}</option>
                    <option value="no">{t("No")}</option>
                  </select>
                ) : (
                  <input
                    id={id}
                    type={r.kind === "text" ? "text" : "number"}
                    inputMode={r.kind === "text" ? undefined : "decimal"}
                    value={rawOf(r.field, r.kind)}
                    onChange={(ev) => setDraft({ ...draft, [r.field]: ev.target.value })}
                  />
                )}
                {r.unit && <span className="unit">{t(r.unit)}</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="given narrow" style={{ marginTop: 14 }}>
        <label htmlFor="i-months">{t("How many months you have had this cover")}</label>
        <input
          id="i-months"
          type="number"
          min={0}
          max={600}
          value={months}
          onChange={(ev) => setMonths(ev.target.value)}
        />
      </div>
      <p className="note" style={{ marginTop: 6 }}>
        {t(
          "Your document shows this year's dates, not how long you have been insured without a break. Waiting periods depend on it, so please tell us.",
        )}
      </p>

      {/* Asked here rather than in a settings screen nobody opens, and asked
          about one specific thing rather than as a blanket permission. What is
          being requested is narrow enough to describe in a sentence, which is
          the test of whether it should be requested at all. */}
      <label className="consent">
        <input
          type="checkbox"
          checked={keepExamples}
          onChange={(ev) => setKeepExamples(ev.target.checked)}
        />
        <span>
          {t(
            "Help ClaimCast improve: keep the lines I corrected as examples. Only the details you changed are kept.",
          )}
        </span>
      </label>
      <p className="note" style={{ marginTop: 6 }}>
        {t(
          "Leave it unticked and nothing from your document is kept — only a count of which details needed fixing, with nothing about you.",
        )}
      </p>

      <button
        type="button"
        style={{ marginTop: 14 }}
        onClick={() =>
          onConfirm(
            asPolicy(confirmed, extraction, fallback, clamp(months, 0, 600)),
            confirmed,
            keepExamples,
          )
        }
      >
        {edited === 0
          ? t("Confirm and continue")
          : plural(edited, "Correct {n} field and continue", "Correct {n} fields and continue")}
      </button>
    </div>
  );
}

/**
 * The confirmed reading, as the policy the engine will price with.
 *
 * Where the document said nothing, the field is null and the engine treats it as
 * the absence of that limit — which is what a schedule that does not mention a
 * co-pay means. The one exception is the two fields a claim cannot be
 * adjudicated without: if the document did not give a sum insured or a waiting
 * period, the sample policy's value stands in, and it is visible on screen that
 * it did.
 */
function asPolicy(
  /**
   * What the person settled on, not what the reader proposed. The extraction is
   * still passed in, but only for the provenance line: the figures below come
   * from the panel, because the panel is where a human looked at them.
   */
  confirmed: Partial<Record<ExtractedField, Value>>,
  e: Extraction,
  fallback: Policy,
  monthsInForce: number,
): Policy {
  const num = (f: ExtractedField): number | null => {
    const v = confirmed[f];
    return typeof v === "number" ? v : null;
  };
  const str = (f: ExtractedField, or: string): string => {
    const v = confirmed[f];
    return typeof v === "string" && v.trim() ? v : or;
  };
  const bool = (f: ExtractedField, or: boolean): boolean => {
    const v = confirmed[f];
    return typeof v === "boolean" ? v : or;
  };

  return {
    ...fallback,
    id: "pol-uploaded",
    insurer: str("insurer", fallback.insurer),
    product: str("product", fallback.product),
    sumInsured: num("sumInsured") ?? fallback.sumInsured,
    roomCapPerDay: num("roomCapPerDay"),
    roomCapPctOfSI: num("roomCapPctOfSI"),
    icuCapPerDay: num("icuCapPerDay"),
    icuCapPctOfSI: num("icuCapPctOfSI"),
    proportionateDeduction: bool("proportionateDeduction", false),
    copayPct: num("copayPct") ?? 0,
    implantSubLimit: num("implantSubLimit"),
    preHospDays: num("preHospDays") ?? 0,
    postHospDays: num("postHospDays") ?? 0,
    dayCareCovered: bool("dayCareCovered", false),
    monthsInForce,
    pedWaitingMonths: num("pedWaitingMonths") ?? fallback.pedWaitingMonths,
    moratoriumMonths: num("moratoriumMonths") ?? fallback.moratoriumMonths,
    exclusions: str("exclusions", "") || null,
    notes: `Read from ${e.filename} on ${e.extractedAt.slice(0, 10)} and confirmed field by field.`,
  };
}
