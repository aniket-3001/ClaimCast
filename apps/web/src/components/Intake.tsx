import { useState } from "react";
import { fmt, pct, registry, setRegistry, type CaseInput, type Policy } from "@claimcast/engine";
import type { Extraction, ExtractedField, ShakyField } from "@claimcast/contracts";
import { confirmDocument, extractPolicy } from "../api";

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
  onContinue,
}: {
  input: CaseInput;
  onChange: (next: CaseInput) => void;
  name: string;
  onName: (v: string) => void;
  policyholder: string;
  onPolicyholder: (v: string) => void;
  onContinue: () => void;
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

  return (
    <>
      <div className="givens">
        <div className="given">
          <label htmlFor="i-name">Your name</label>
          <input
            id="i-name"
            type="text"
            placeholder="Optional"
            value={name}
            onChange={(ev) => onName(ev.target.value)}
          />
        </div>
        <div className="given">
          <label htmlFor="i-policyholder">Policyholder</label>
          <input
            id="i-policyholder"
            type="text"
            placeholder="Optional"
            value={policyholder}
            onChange={(ev) => onPolicyholder(ev.target.value)}
          />
        </div>
        <div className="given wide">
          <label htmlFor="i-policy">Policy held</label>
          <select
            id="i-policy"
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
        </div>
      </div>

      {/* The facts that decide whether a government scheme is open, and whether
          a waiting period still stands between this condition and cover. They
          are asked once, here, and answered on the tree — never as a tab of
          their own, because a scheme is a way of paying, not a topic. */}
      <div className="givens">
        <div className="given narrow">
          <label htmlFor="i-age">Patient&rsquo;s age</label>
          <input
            id="i-age"
            type="number"
            min={0}
            max={120}
            value={input.age}
            onChange={(ev) => set({ age: clamp(ev.target.value, 0, 120) })}
          />
        </div>
        <div className="given">
          <label htmlFor="i-pmjay">PM-JAY card in the household</label>
          <select
            id="i-pmjay"
            value={input.hasPmjayCard ? "yes" : "no"}
            onChange={(ev) => set({ hasPmjayCard: ev.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        <div className="given">
          <label htmlFor="i-cghs">Central govt service or pension</label>
          <select
            id="i-cghs"
            value={input.govtEmployeeOrPensioner ? "yes" : "no"}
            onChange={(ev) => set({ govtEmployeeOrPensioner: ev.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        <div className="given">
          <label htmlFor="i-esi">ESI insured or dependant</label>
          <select
            id="i-esi"
            value={input.esiInsured ? "yes" : "no"}
            onChange={(ev) => set({ esiInsured: ev.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        <div className="given">
          <label htmlFor="i-ped">Pre-existing condition</label>
          <select
            id="i-ped"
            value={input.preExisting ? "yes" : "no"}
            onChange={(ev) => set({ preExisting: ev.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Your policy schedule</h2>
          <span className="aside">
            {up.stage === "read" ? "Read from your PDF" : "Simulated for this demo"}
          </span>
        </div>

        {up.stage === "idle" && (
          <label className="tnode start" style={{ cursor: "pointer", display: "block" }}>
            <div className="tnode-k">Upload</div>
            <div className="tnode-v" style={{ fontSize: 20 }}>
              Your policy schedule, as a PDF
            </div>
            <div className="tnode-sub">
              Click to attach. It is encrypted before it is read and deleted afterwards; nothing
              in it is logged.
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
            <div className="tnode-k">Reading {up.filename}</div>
            <div className="tnode-v" style={{ fontSize: 20 }}>
              Extracting the schedule&hellip;
            </div>
            <div className="tnode-sub">
              Each field comes back with the sentence it was taken from, and every sentence is
              checked against the document before you see it.
            </div>
          </div>
        )}

        {up.stage === "refused" && (
          <>
            <div className="tnode start">
              <div className="tnode-k">Not read</div>
              <div className="tnode-v" style={{ fontSize: 20 }}>
                The schedule has to be entered by hand
              </div>
              <div className="tnode-sub">{up.reason}</div>
            </div>
            {/* The picker above is the by-hand path, and it is a real one: these
                are the terms of the policy chosen there, not an extraction
                dressed up as one. */}
            <HandEntered policy={policy} onConfirm={onContinue} />
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
              onContinue();
            }}
          />
        )}
      </section>

      <p className="note" style={{ marginTop: 16 }}>
        The reader only extracts. Every field is confirmed by you before it can move a rupee, and
        every correction you make is what teaches it which fields to stop being confident about.
      </p>
    </>
  );
}

interface HandRow {
  label: string;
  value: (p: Policy) => string | null;
  clause: string;
}

const FIELDS: HandRow[] = [
  { label: "Sum insured", value: (p) => fmt(p.sumInsured), clause: "Schedule of Benefits" },
  {
    label: "Room rent limit",
    value: (p) =>
      p.roomCapPerDay
        ? `${fmt(p.roomCapPerDay)} / day`
        : p.roomCapPctOfSI
          ? `${pct(p.roomCapPctOfSI)} of sum insured`
          : "No limit",
    clause: "Clause 4.1",
  },
  {
    label: "ICU limit",
    value: (p) =>
      p.icuCapPerDay
        ? `${fmt(p.icuCapPerDay)} / day`
        : p.icuCapPctOfSI
          ? `${pct(p.icuCapPctOfSI)} of sum insured`
          : "No limit",
    clause: "Clause 4.2",
  },
  {
    label: "Co-payment",
    value: (p) => (p.copayPct ? pct(p.copayPct) : "None"),
    clause: "Clause 6.1",
  },
  {
    label: "Implant sub-limit",
    value: (p) => (p.implantSubLimit ? fmt(p.implantSubLimit) : "No sub-limit"),
    clause: "Clause 4.5",
  },
  {
    label: "Pre / post-hospitalisation window",
    value: (p) => `${p.preHospDays} / ${p.postHospDays} days`,
    clause: "Clause 7.1",
  },
  {
    label: "Day-care procedures covered",
    value: (p) => (p.dayCareCovered ? "Yes" : "No"),
    clause: "Clause 3.3",
  },
];

function HandEntered({ policy, onConfirm }: { policy: Policy; onConfirm: () => void }) {
  return (
    <div className="tnode fixed">
      <div className="tnode-k">Confirm each field</div>
      <ul className="rows">
        {FIELDS.map((f) => {
          const v = f.value(policy);
          if (v === null) return null;
          return (
            <li className="row" key={f.label}>
              <span className="row-l">
                <span>{f.label}</span>
                <span className="cite">{f.clause}</span>
              </span>
              <span className="row-amt">{v}</span>
            </li>
          );
        })}
      </ul>
      <button type="button" style={{ marginTop: 14 }} onClick={onConfirm}>
        Confirm and continue
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
  { field: "sumInsured", label: "Sum insured", kind: "money", unit: "\u20b9" },
  { field: "roomCapPerDay", label: "Room rent limit", kind: "money", unit: "\u20b9 / day" },
  { field: "roomCapPctOfSI", label: "Room limit as % of sum insured", kind: "pct", unit: "%" },
  { field: "icuCapPerDay", label: "ICU limit", kind: "money", unit: "\u20b9 / day" },
  { field: "icuCapPctOfSI", label: "ICU limit as % of sum insured", kind: "pct", unit: "%" },
  { field: "proportionateDeduction", label: "Proportionate deduction", kind: "bool" },
  { field: "copayPct", label: "Co-payment", kind: "pct", unit: "%" },
  { field: "implantSubLimit", label: "Implant sub-limit", kind: "money", unit: "\u20b9" },
  { field: "preHospDays", label: "Pre-hospitalisation window", kind: "count", unit: "days" },
  { field: "postHospDays", label: "Post-hospitalisation window", kind: "count", unit: "days" },
  { field: "dayCareCovered", label: "Day-care procedures", kind: "bool" },
  { field: "pedWaitingMonths", label: "Pre-existing disease waiting", kind: "count", unit: "months" },
  { field: "moratoriumMonths", label: "Moratorium", kind: "count", unit: "months" },
  { field: "exclusions", label: "Exclusions", kind: "text" },
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
  if (v === null) return "Not stated";
  if (kind === "bool") return v ? "Yes" : "No";
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
      <div className="tnode-k">Confirm each field</div>
      <p className="note" style={{ marginTop: 0 }}>
        Read from {extraction.filename}, {extraction.pages} pages, by {extraction.model}
        {extraction.retrievedPassages !== undefined &&
          `, grounded in ${extraction.retrievedPassages} passages retrieved from the document`}
        . Every quote below was searched for in the document itself.
      </p>

      {unverified > 0 && (
        <p className="warn-line">
          {unverified} {unverified === 1 ? "quote was" : "quotes were"} not found in the document.
          Those fields are marked below. Check them against your own copy before confirming.
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
                <label htmlFor={id}>{r.label}</label>
                {got.span ? (
                  <span className={got.verified ? "cite" : "cite cite-bad"}>
                    “{got.span.text}” — page {got.span.page}
                    {got.verified ? "" : " · not found in the document"}
                  </span>
                ) : (
                  <span className="cite cite-bad">cited nothing</span>
                )}
                {/* What the reader had said, kept on screen beside the
                    change. A person who has just overwritten a figure is owed a
                    view of what they overwrote -- and it is the difference, not
                    the new value, that is about to be recorded. */}
                {norm(confirmed[r.field]) !== norm(got.value) && (
                  <span className="cite cite-edited">
                    read as {show(r.kind, got.value)} &mdash; you changed it
                  </span>
                )}
                {/* The correction loop, closing. Nothing was retrained
                    between the reading that produced this count and the one on
                    screen; the count is what everybody before saw fit to
                    change, and it travels with its denominator so it can be
                    weighed rather than obeyed. */}
                {warn && (
                  <span className="cite cite-warn">
                    readers corrected this field {warn.corrected} times in {warn.seen} readings
                    &mdash; worth checking against your own copy
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
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
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
                {r.unit && <span className="unit">{r.unit}</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="given narrow" style={{ marginTop: 14 }}>
        <label htmlFor="i-months">Months the cover has run</label>
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
        A schedule states the period of insurance, which is this policy year — not how long the
        cover has been continuously in force. The reader is told not to guess it, so you say it.
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
          Keep the wording of the fields I corrected, so the reader can be shown them as worked
          examples. Only the fields you changed, and only the sentence quoted beside them.
        </span>
      </label>
      <p className="note" style={{ marginTop: 6 }}>
        Leave it unticked and nothing from your schedule is kept. What is recorded either way is a
        count &mdash; which field, which reader, changed or not &mdash; and that carries nothing
        about you or your policy.
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
          ? "Confirm and continue"
          : `Correct ${edited} ${edited === 1 ? "field" : "fields"} and continue`}
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
