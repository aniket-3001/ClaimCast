import { fmt } from "../lib/money";
import { hospitalOptions, roomOptions, type CaseInput, type Evaluated, type Option } from "../lib/case";
import type { RoomClass } from "../lib/types";
import { hospital } from "../data/hospitals";

/**
 * The same admission, counted again under every choice still available.
 *
 * Ranked by what the family pays, not by what the bill comes to, because those
 * two orders are frequently different — a dearer hospital inside the network
 * can leave less to find on the day than a cheaper one outside it.
 */
export function Alternatives({ e, onPick }: { e: Evaluated; onPick: (next: CaseInput) => void }) {
  const rooms = roomOptions(e);
  const hospitals = hospitalOptions(e);

  return (
    <>
      <p className="lede">
        Every row is a full re-adjudication of this admission, not a rule of thumb. Pick one to carry
        it through to the other tabs.
      </p>

      <section className="section">
        <div className="section-head">
          <h2>Room class at {e.hospital.name}</h2>
          <span className="aside">Room limit {e.result.roomCapPerDay === null ? "none" : `${fmt(e.result.roomCapPerDay)} / day`}</span>
        </div>
        <Table
          options={rooms}
          onPick={(o) => onPick({ ...e.input, roomClass: o.key as RoomClass })}
          emptyNote="This hospital has one room class."
        />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Hospital</h2>
          <span className="aside">Cheapest room class at each, same procedure and policy</span>
        </div>
        <Table
          options={hospitals}
          onPick={(o) => {
            const h = hospital(o.key);
            const best = h.rooms.filter((r) => r.cls !== "icu");
            const cls = best.length ? best[0].cls : "icu";
            onPick({
              ...e.input,
              hospitalId: o.key,
              roomClass: cls,
              route: h.network.includes(e.policy.insurer) ? e.input.route : "reimbursement",
            });
          }}
        />
      </section>
    </>
  );
}

function Table({
  options,
  onPick,
  emptyNote,
}: {
  options: Option[];
  onPick: (o: Option) => void;
  emptyNote?: string;
}) {
  if (options.length <= 1 && emptyNote) return <div className="empty">{emptyNote}</div>;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th className="num">Bill</th>
            <th className="num">You pay</th>
            <th className="num">Against now</th>
          </tr>
        </thead>
        <tbody>
          {options.map((o) => (
            <tr className="pick" key={o.key} onClick={() => onPick(o)}>
              <td>
                {o.label}
                {o.current && <span className="chip here" style={{ marginLeft: 8 }}>current</span>}
                {!o.available && <span className="chip warn" style={{ marginLeft: 8 }}>no cashless</span>}
                <div className="sub">{o.detail}</div>
              </td>
              <td className="num">{fmt(o.billTotal)}</td>
              <td className="num">{fmt(o.patientPays)}</td>
              <td className="num" style={{ color: o.delta < 0 ? "var(--paid)" : o.delta > 0 ? "var(--loss)" : undefined }}>
                {o.delta === 0 ? "—" : (o.delta < 0 ? "−" : "+") + fmt(Math.abs(o.delta)).slice(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
