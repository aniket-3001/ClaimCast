import { useState } from "react";
import { fmt, pct } from "../lib/money";
import type { CaseInput } from "../lib/case";
import type { Policy } from "../lib/types";
import { POLICIES } from "../data/policies";

/**
 * The front door, not the engine.
 *
 * Nothing typed here is adjudicated — a name is not a clause. The one thing
 * that does feed the rest of the app is which policy is picked, because
 * that's the same choice Controls exposes elsewhere; this is just where a
 * family would naturally make it first, alongside the document that says so.
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
  const policy = POLICIES.find((p) => p.id === input.policyId)!;
  const [stage, setStage] = useState<"upload" | "extracting" | "confirmed">("upload");

  const upload = () => {
    setStage("extracting");
    window.setTimeout(() => setStage("confirmed"), 900);
  };

  return (
    <>
      <div className="controls">
        <div className="field">
          <label htmlFor="i-name">Your name</label>
          <input
            id="i-name"
            type="text"
            placeholder="Whoever is asking"
            value={name}
            onChange={(ev) => onName(ev.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="i-policyholder">Policyholder&rsquo;s name</label>
          <input
            id="i-policyholder"
            type="text"
            placeholder="Whoever the policy is in"
            value={policyholder}
            onChange={(ev) => onPolicyholder(ev.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="i-policy">Which policy do you hold</label>
          <select
            id="i-policy"
            value={input.policyId}
            onChange={(ev) => {
              onChange({ ...input, policyId: ev.target.value });
              setStage("upload");
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

      <section className="section">
        <div className="section-head">
          <h2>The document you have of it</h2>
          <span className="aside">Simulated for this demo</span>
        </div>

        {stage === "upload" && (
          <div className="tnode start" style={{ cursor: "pointer" }} onClick={upload}>
            <div className="tnode-k">Upload your policy schedule</div>
            <div className="tnode-v" style={{ fontSize: 20 }}>
              {policy.product}.pdf
            </div>
            <div className="tnode-sub">Click to attach — any file works here, this step is staged for the demo.</div>
          </div>
        )}

        {stage === "extracting" && (
          <div className="tnode start">
            <div className="tnode-k">Reading {policy.product}.pdf</div>
            <div className="tnode-v" style={{ fontSize: 20 }}>
              Extracting the schedule…
            </div>
          </div>
        )}

        {stage === "confirmed" && <ExtractedFields policy={policy} onConfirm={onContinue} />}
      </section>

      <p className="note" style={{ marginTop: 18 }}>
        In production, an LLM reads the uploaded PDF and cites the clause behind every field —
        it only extracts, and every field is still confirmed by you, exactly like the fields below,
        before it can change a rupee. That extraction step is next to build; what you're about to
        see run is the real, deterministic engine.
      </p>
    </>
  );
}

interface ExtractedField {
  label: string;
  value: (p: Policy) => string | null;
  page: string;
}

const FIELDS: ExtractedField[] = [
  { label: "Sum insured", value: (p) => fmt(p.sumInsured), page: "Page 2 — Schedule of Benefits" },
  {
    label: "Room rent limit",
    value: (p) => (p.roomCapPerDay ? `${fmt(p.roomCapPerDay)} / day` : p.roomCapPctOfSI ? `${pct(p.roomCapPctOfSI)} of sum insured` : "No limit"),
    page: "Page 3 — Clause 4.1",
  },
  {
    label: "ICU limit",
    value: (p) => (p.icuCapPerDay ? `${fmt(p.icuCapPerDay)} / day` : p.icuCapPctOfSI ? `${pct(p.icuCapPctOfSI)} of sum insured` : "No limit"),
    page: "Page 3 — Clause 4.2",
  },
  { label: "Co-payment", value: (p) => (p.copayPct ? pct(p.copayPct) : "None"), page: "Page 4 — Clause 6.1" },
  {
    label: "Implant sub-limit",
    value: (p) => (p.implantSubLimit ? fmt(p.implantSubLimit) : "No sub-limit"),
    page: "Page 3 — Clause 4.5",
  },
  {
    label: "Pre / post-hospitalisation window",
    value: (p) => `${p.preHospDays} / ${p.postHospDays} days`,
    page: "Page 5 — Clause 7.1",
  },
  { label: "Day-care procedures covered", value: (p) => (p.dayCareCovered ? "Yes" : "No"), page: "Page 2 — Clause 3.3" },
];

function ExtractedFields({ policy, onConfirm }: { policy: Policy; onConfirm: () => void }) {
  return (
    <div className="tnode fixed">
      <div className="tnode-k">Extracted from the document — confirm each field</div>
      <ul className="rows">
        {FIELDS.map((f) => {
          const v = f.value(policy);
          if (v === null) return null;
          return (
            <li className="row" key={f.label}>
              <span className="row-l">
                <span>{f.label}</span>
                <span className="cite">{f.page}</span>
              </span>
              <span className="row-amt">{v}</span>
            </li>
          );
        })}
      </ul>
      <div className="tnode-sub">
        A misread field fails safe here — flagged for you, never silently applied.
      </div>
      <button type="button" style={{ marginTop: 14 }} onClick={onConfirm}>
        Confirm and continue to the claim
      </button>
    </div>
  );
}
