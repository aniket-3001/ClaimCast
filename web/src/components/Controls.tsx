import { rupees } from "../lib/money";
import type { CaseInput } from "../lib/case";
import { PROCEDURES } from "../data/procedures";
import { POLICIES } from "../data/policies";

/**
 * The givens.
 *
 * What is on this panel is not chosen — you have the policy you have and you
 * need the operation you need. The things that *are* chosen (where, how the
 * claim is made, which bed) belong on the tree, and appear nowhere here.
 */
export function Controls({
  value,
  onChange,
}: {
  value: CaseInput;
  onChange: (next: CaseInput) => void;
}) {
  const set = (patch: Partial<CaseInput>) => onChange({ ...value, ...patch });

  return (
    <div className="controls">
      <div className="field">
        <label htmlFor="c-proc">Procedure</label>
        <select
          id="c-proc"
          value={value.procedureId}
          onChange={(ev) => {
            const p = PROCEDURES.find((x) => x.id === ev.target.value)!;
            set({ procedureId: p.id, days: p.medianStayDays, icuDays: 0 });
          }}
        >
          {PROCEDURES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="c-pol">Policy</label>
        <select id="c-pol" value={value.policyId} onChange={(ev) => set({ policyId: ev.target.value })}>
          {POLICIES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.product} — {x.insurer}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="c-days">Nights in hospital</label>
        <input
          id="c-days"
          type="number"
          min={0}
          max={40}
          value={value.days}
          onChange={(ev) => set({ days: clamp(ev.target.value, 0, 40) })}
        />
      </div>

      <div className="field">
        <label htmlFor="c-icu">Of which in intensive care</label>
        <input
          id="c-icu"
          type="number"
          min={0}
          max={value.days}
          value={value.icuDays}
          onChange={(ev) => set({ icuDays: clamp(ev.target.value, 0, value.days) })}
        />
      </div>

      <div className="field">
        <label htmlFor="c-si">Sum insured already used</label>
        <input
          id="c-si"
          type="number"
          min={0}
          step={10000}
          value={Math.round(value.siUsed / 100)}
          onChange={(ev) => set({ siUsed: rupees(clamp(ev.target.value, 0, 10000000)) })}
        />
      </div>
    </div>
  );
}

const clamp = (raw: string, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(Number(raw) || 0)));
