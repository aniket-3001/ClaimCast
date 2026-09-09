import { ROOM_LABEL } from "../lib/bill";
import { rupees } from "../lib/money";
import type { CaseInput } from "../lib/case";
import type { RoomClass, Route } from "../lib/types";
import { HOSPITALS, hospital } from "../data/hospitals";
import { PROCEDURES } from "../data/procedures";
import { POLICIES } from "../data/policies";

/**
 * The admission, as far as it is known before it happens.
 *
 * Everything on this panel is something a caregiver can answer at the admission
 * desk or read off a policy schedule. Nothing here asks for a diagnosis, and
 * nothing asks for a number the family would have to guess.
 */
export function Controls({
  value,
  onChange,
}: {
  value: CaseInput;
  onChange: (next: CaseInput) => void;
}) {
  const h = hospital(value.hospitalId);
  const classes = h.rooms.filter((r) => r.cls !== "icu");
  const inNetwork = h.network.some((n) => n === POLICIES.find((p) => p.id === value.policyId)?.insurer);

  const set = (patch: Partial<CaseInput>) => {
    const next = { ...value, ...patch };
    // Moving hospital can strip the room class out from under the selection.
    const nh = hospital(next.hospitalId);
    if (!nh.rooms.some((r) => r.cls === next.roomClass)) {
      next.roomClass = (nh.rooms.find((r) => r.cls !== "icu")?.cls ?? "icu") as RoomClass;
    }
    if (next.icuDays > next.days) next.icuDays = next.days;
    // Cashless is not a preference. It exists only where the hospital and the
    // insurer already have an agreement.
    const pol = POLICIES.find((x) => x.id === next.policyId)!;
    if (!nh.network.includes(pol.insurer)) next.route = "reimbursement";
    onChange(next);
  };

  return (
    <>
      <div className="controls">
        <div className="field">
          <label htmlFor="c-hosp">Hospital</label>
          <select
            id="c-hosp"
            value={value.hospitalId}
            onChange={(e) => set({ hospitalId: e.target.value })}
          >
            {HOSPITALS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} — {x.city}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="c-proc">Procedure</label>
          <select
            id="c-proc"
            value={value.procedureId}
            onChange={(e) => {
              const p = PROCEDURES.find((x) => x.id === e.target.value)!;
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
          <select id="c-pol" value={value.policyId} onChange={(e) => set({ policyId: e.target.value })}>
            {POLICIES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.product} — {x.insurer}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="c-room">Room class</label>
          <select
            id="c-room"
            value={value.roomClass}
            onChange={(e) => set({ roomClass: e.target.value as RoomClass })}
          >
            {classes.map((r) => (
              <option key={r.cls} value={r.cls}>
                {ROOM_LABEL[r.cls]}
              </option>
            ))}
            {h.rooms.some((r) => r.cls === "icu") && <option value="icu">Intensive care</option>}
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
            onChange={(e) => set({ days: clamp(e.target.value, 0, 40) })}
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
            onChange={(e) => set({ icuDays: clamp(e.target.value, 0, value.days) })}
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
            onChange={(e) => set({ siUsed: rupees(clamp(e.target.value, 0, 10000000)) })}
          />
        </div>

        <div className="field">
          <label>Claim route</label>
          <div className="seg">
            {(["cashless", "reimbursement"] as Route[]).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={value.route === r}
                disabled={r === "cashless" && !inNetwork}
                onClick={() => set({ route: r })}
              >
                {r === "cashless" ? "Cashless" : "Reimbursement"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!inNetwork && (
        <p className="note">
          {h.name} has no cashless agreement with this insurer. The route is fixed at reimbursement.
        </p>
      )}
    </>
  );
}

const clamp = (raw: string, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(Number(raw) || 0)));
