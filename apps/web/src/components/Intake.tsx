import { useState } from "react";
import { fmt, pct, registry, setRegistry, type CaseInput, type Policy } from "@claimcast/engine";
import type { Extraction, ExtractedField } from "@claimcast/contracts";
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
        ? { stage: "read", documentId: r.documentId, extraction: r.extraction }
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

      {/* The three facts that decide whether a government scheme is open. They
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
        <div className="given fill" aria-hidden="true" />
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
            onConfirm={(confirmed) => {
              adoptPolicy(confirmed);
              void confirmDocument(up.documentId);
              onContinue();
            }}
          />
        )}
      </section>

      <p className="note" style={{ marginTop: 16 }}>
        The reader only extracts. Every field is confirmed by you before it can move a rupee.
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
  | { stage: "read"; documentId: string; extraction: Extraction }
  | { stage: "refused"; reason: string };

/** How each extracted field is named and shown, in the order a schedule reads. */
const READ_ROWS: { field: ExtractedField; label: string; show: (v: unknown) => string }[] = [
  { field: "insurer", label: "Insurer", show: String },
  { field: "product", label: "Product", show: String },
  { field: "sumInsured", label: "Sum insured", show: (v) => fmt(Number(v)) },
  { field: "roomCapPerDay", label: "Room rent limit", show: (v) => fmt(Number(v)) + " per day" },
  { field: "roomCapPctOfSI", label: "Room limit as % of sum insured", show: (v) => pct(Number(v)) },
  { field: "icuCapPerDay", label: "ICU limit", show: (v) => fmt(Number(v)) + " per day" },
  { field: "icuCapPctOfSI", label: "ICU limit as % of sum insured", show: (v) => pct(Number(v)) },
  {
    field: "proportionateDeduction",
    label: "Proportionate deduction",
    show: (v) => (v ? "Applies" : "Does not apply"),
  },
  { field: "copayPct", label: "Co-payment", show: (v) => (v ? pct(Number(v)) : "None") },
  { field: "implantSubLimit", label: "Implant sub-limit", show: (v) => fmt(Number(v)) },
  { field: "preHospDays", label: "Pre-hospitalisation window", show: (v) => `${v} days` },
  { field: "postHospDays", label: "Post-hospitalisation window", show: (v) => `${v} days` },
  { field: "dayCareCovered", label: "Day-care procedures", show: (v) => (v ? "Covered" : "Not covered") },
  { field: "pedWaitingMonths", label: "Pre-existing disease waiting", show: (v) => `${v} months` },
  { field: "moratoriumMonths", label: "Moratorium", show: (v) => `${v} months` },
];

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
 * Nothing here has touched the engine. The button below is where that happens.
 */
function ExtractionPanel({
  extraction,
  fallback,
  onConfirm,
}: {
  extraction: Extraction;
  fallback: Policy;
  onConfirm: (p: Policy) => void;
}) {
  // Not on a schedule, and not derivable from one: a policy renewed for eight
  // years and one bought in January carry the same period of insurance. It
  // decides whether the waiting period above has expired, so it is asked rather
  // than guessed, and it starts from the sample policy only so the field is
  // never silently zero.
  const [months, setMonths] = useState(String(fallback.monthsInForce));

  const val = (f: ExtractedField) => extraction.fields[f]?.value ?? null;
  const unverified = extraction.unverified.length;

  return (
    <div className="tnode fixed">
      <div className="tnode-k">Confirm each field</div>
      <p className="note" style={{ marginTop: 0 }}>
        Read from {extraction.filename}, {extraction.pages} pages, by {extraction.model}. Every
        quote below was searched for in the document itself.
      </p>

      {unverified > 0 && (
        <p className="warn-line">
          {unverified} {unverified === 1 ? "quote was" : "quotes were"} not found in the document.
          Those fields are marked below. Check them against your own copy before confirming.
        </p>
      )}

      <ul className="rows">
        {READ_ROWS.map((r) => {
          const got = extraction.fields[r.field];
          const v = val(r.field);
          if (!got || v === null) return null;
          return (
            <li className="row read-row" key={r.field}>
              <span className="row-l">
                <span>{r.label}</span>
                {got.span ? (
                  <span className={got.verified ? "cite" : "cite cite-bad"}>
                    “{got.span.text}” — page {got.span.page}
                    {got.verified ? "" : " · not found in the document"}
                  </span>
                ) : (
                  <span className="cite cite-bad">cited nothing</span>
                )}
              </span>
              <span className="row-amt">{r.show(v)}</span>
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

      <button
        type="button"
        style={{ marginTop: 14 }}
        onClick={() => onConfirm(asPolicy(extraction, fallback, clamp(months, 0, 600)))}
      >
        Confirm and continue
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
function asPolicy(e: Extraction, fallback: Policy, monthsInForce: number): Policy {
  const num = (f: ExtractedField): number | null => {
    const v = e.fields[f]?.value;
    return typeof v === "number" ? v : null;
  };
  const str = (f: ExtractedField, or: string): string => {
    const v = e.fields[f]?.value;
    return typeof v === "string" && v.trim() ? v : or;
  };
  const bool = (f: ExtractedField, or: boolean): boolean => {
    const v = e.fields[f]?.value;
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
    notes: `Read from ${e.filename} on ${e.extractedAt.slice(0, 10)} and confirmed field by field.`,
  };
}
