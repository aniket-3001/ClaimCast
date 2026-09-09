import { fmt, signed } from "../lib/money";
import { hospitalOptions, roomOptions, type CaseInput, type Evaluated, type Option } from "../lib/case";

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
      <section className="section">
        <div className="section-head">
          <h2>Every room class at {e.hospital.name}</h2>
          <span className="aside">Room limit {e.result.roomCapPerDay === null ? "none" : `${fmt(e.result.roomCapPerDay)} / day`}</span>
        </div>
        <Table
          options={rooms}
          onPick={(o) => onPick(o.next)}
          emptyNote="This hospital has one room class."
        />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Every hospital in the set</h2>
          <span className="aside">Same room class where they stock it, nearest by tariff where they do not</span>
        </div>
        <Table options={hospitals} onPick={(o) => onPick(o.next)} />
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
                {o.delta === 0 ? "—" : signed(o.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
