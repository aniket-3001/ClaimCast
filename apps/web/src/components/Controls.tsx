import { rupees, registry, type CaseInput } from "@claimcast/engine";

/**
 * The givens.
 *
 * What is on this strip is not chosen — you have the policy you have and you
 * need the operation you need. The things that *are* chosen (where, which
 * bed, how the claim is made) belong on the tree, and appear nowhere here.
 *
 * So it is drawn as one line of facts rather than a form: no boxes, no
 * submit, just the case as it stands, divided by hairlines. It sits above
 * every tab that reasons about this admission, which is why it has to read
 * as a header rather than as something waiting to be filled in.
 */
export function Controls({
  value,
  onChange,
}: {
  value: CaseInput;
  onChange: (next: CaseInput) => void;
}) {
  const { procedures: PROCEDURES, policies: POLICIES } = registry();
  const set = (patch: Partial<CaseInput>) => onChange({ ...value, ...patch });

  return (
    <div className="givens">
      <div className="given wide">
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

      <div className="given wide">
        <label htmlFor="c-pol">Policy</label>
        <select
          id="c-pol"
          value={value.policyId}
          onChange={(ev) => set({ policyId: ev.target.value })}
        >
          {POLICIES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.product} — {x.insurer}
            </option>
          ))}
        </select>
      </div>

      <div className="given narrow">
        <label htmlFor="c-days">Nights</label>
        <input
          id="c-days"
          type="number"
          min={0}
          max={40}
          value={value.days}
          onChange={(ev) => set({ days: clamp(ev.target.value, 0, 40) })}
        />
      </div>

      <div className="given narrow">
        <label htmlFor="c-icu">In ICU</label>
        <input
          id="c-icu"
          type="number"
          min={0}
          max={value.days}
          value={value.icuDays}
          onChange={(ev) => set({ icuDays: clamp(ev.target.value, 0, value.days) })}
        />
      </div>

      <div className="given">
        <label htmlFor="c-si">Sum insured used</label>
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
