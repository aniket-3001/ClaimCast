import { useState } from "react";
import { fmt, pct, registry, type CaseInput, type Policy } from "@claimcast/engine";

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
  const [stage, setStage] = useState<"upload" | "extracting" | "confirmed">("upload");
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
          <span className="aside">Simulated for this demo</span>
        </div>

        {stage === "upload" && (
          <div
            className="tnode start"
            style={{ cursor: "pointer" }}
            onClick={() => {
              setStage("extracting");
              window.setTimeout(() => setStage("confirmed"), 900);
            }}
          >
            <div className="tnode-k">Upload</div>
            <div className="tnode-v" style={{ fontSize: 20 }}>
              {policy.product}.pdf
            </div>
            <div className="tnode-sub">Click to attach.</div>
          </div>
        )}

        {stage === "extracting" && (
          <div className="tnode start">
            <div className="tnode-k">Reading {policy.product}.pdf</div>
            <div className="tnode-v" style={{ fontSize: 20 }}>
              Extracting the schedule&hellip;
            </div>
          </div>
        )}

        {stage === "confirmed" && <ExtractedFields policy={policy} onConfirm={onContinue} />}
      </section>

      <p className="note" style={{ marginTop: 16 }}>
        The reader only extracts. Every field is confirmed by you before it can move a rupee.
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
    value: (p) =>
      p.roomCapPerDay
        ? `${fmt(p.roomCapPerDay)} / day`
        : p.roomCapPctOfSI
          ? `${pct(p.roomCapPctOfSI)} of sum insured`
          : "No limit",
    page: "Page 3 — Clause 4.1",
  },
  {
    label: "ICU limit",
    value: (p) =>
      p.icuCapPerDay
        ? `${fmt(p.icuCapPerDay)} / day`
        : p.icuCapPctOfSI
          ? `${pct(p.icuCapPctOfSI)} of sum insured`
          : "No limit",
    page: "Page 3 — Clause 4.2",
  },
  {
    label: "Co-payment",
    value: (p) => (p.copayPct ? pct(p.copayPct) : "None"),
    page: "Page 4 — Clause 6.1",
  },
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
  {
    label: "Day-care procedures covered",
    value: (p) => (p.dayCareCovered ? "Yes" : "No"),
    page: "Page 2 — Clause 3.3",
  },
];

function ExtractedFields({ policy, onConfirm }: { policy: Policy; onConfirm: () => void }) {
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
                <span className="cite">{f.page}</span>
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
