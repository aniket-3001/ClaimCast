import { useState } from "react";
import { fmt } from "../lib/money";
import { schemeOptions, type CaseInput, type Evaluated, type Scheme, type SchemeId } from "../lib/case";
import { CLAUSES } from "../data/clauses";

/**
 * The private policy is one path to being paid for this admission, not the
 * only one. Unlike the choices on the tree, these do not add up — a family
 * picks one path per admission, the way a checkout takes one discount code
 * and not two. The one most worth surfacing is the one nobody thinks to ask
 * about: Vay Vandana turns on nothing but age, so a family already deep into
 * a private claim can be sitting on a free alternative and not know it.
 */
export function GovtSchemes({ e, onPick }: { e: Evaluated; onPick: (next: CaseInput) => void }) {
  const [selected, setSelected] = useState<SchemeId>("private");
  const schemes = schemeOptions(e);
  const set = (patch: Partial<CaseInput>) => onPick({ ...e.input, ...patch });
  const vayVandana = schemes.find((s) => s.id === "vayvandana")!;

  return (
    <>
      <div className="controls">
        <div className="field">
          <label htmlFor="g-age">Patient&rsquo;s age</label>
          <input
            id="g-age"
            type="number"
            min={0}
            max={120}
            value={e.input.age}
            onChange={(ev) => set({ age: clamp(ev.target.value, 0, 120) })}
          />
        </div>
        <div className="field">
          <label htmlFor="g-pmjay">Household already holds a PM-JAY card</label>
          <select
            id="g-pmjay"
            value={e.input.hasPmjayCard ? "yes" : "no"}
            onChange={(ev) => set({ hasPmjayCard: ev.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="g-cghs">Serving or retired central govt employee</label>
          <select
            id="g-cghs"
            value={e.input.govtEmployeeOrPensioner ? "yes" : "no"}
            onChange={(ev) => set({ govtEmployeeOrPensioner: ev.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
      </div>

      {vayVandana.eligible && (
        <div className="callout good">
          <h3>Eligible for Vay Vandana, on age alone</h3>
          At {e.input.age}, this admission may qualify for a scheme most families have never heard
          of — it did not exist before October 2024, and it applies regardless of the private
          policy or any PM-JAY card already in the household.{" "}
          <span className="cite">{CLAUSES.VAY_VANDANA.cite}</span>
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Every path to being paid</h2>
          <span className="aside">Choose one — {CLAUSES.SINGLE_CLAIM_PATH.cite}</span>
        </div>

        <div className="branches" style={{ ["--n" as string]: schemes.length }}>
          {schemes.map((s) => (
            <SchemeCard
              key={s.id}
              s={s}
              chosen={s.id === selected}
              onPick={() => s.eligible && setSelected(s.id)}
            />
          ))}
        </div>

        <p className="note" style={{ marginTop: 14 }}>
          {CLAUSES.SINGLE_CLAIM_PATH.text}
        </p>
      </section>
    </>
  );
}

function SchemeCard({ s, chosen, onPick }: { s: Scheme; chosen: boolean; onPick: () => void }) {
  const cls = ["branch", chosen ? "on" : "", !s.eligible ? "shut" : ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} disabled={!s.eligible || chosen} onClick={onPick}>
      <span className="branch-label">{s.label}</span>
      <span className="branch-note">{s.eligible ? s.detail : s.reason}</span>
      {s.patientPays !== null && (
        <span
          className="branch-pay"
          style={{
            color: s.id === "private" ? "var(--loss)" : s.eligible ? "var(--paid)" : "var(--ink-3)",
          }}
        >
          {fmt(s.patientPays)}
          {!s.eligible && " if eligible"}
        </span>
      )}
      <span className="branch-delta">{chosen ? "on this path" : s.eligible ? "choose this path" : ""}</span>
      <span className="cite" style={{ display: "block", marginTop: 6 }}>
        {CLAUSES[s.clause].cite}
      </span>
    </button>
  );
}

const clamp = (raw: string, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(Number(raw) || 0)));
