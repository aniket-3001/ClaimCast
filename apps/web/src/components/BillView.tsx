import { fmt, pct, type LineKind, type Evaluated, registry } from "@claimcast/engine";

const KIND: Record<LineKind, { label: string; tone: string }> = {
  room: { label: "room", tone: "" },
  associated: { label: "room-linked", tone: "warn" },
  icu: { label: "intensive care", tone: "" },
  independent: { label: "not room-linked", tone: "paid" },
  implant: { label: "sub-limit", tone: "warn" },
  outside_window: { label: "outside window", tone: "loss" },
  non_payable: { label: "List I", tone: "loss" },
};

/**
 * The bill, with the insurer's working shown against it.
 *
 * Every line carries the classification that decided its fate, because that
 * classification is the disputed thing. A patient who can see that pharmacy is
 * marked "not room-linked" can check the settlement letter against it.
 */
export function BillView({ e }: { e: Evaluated }) {
  const { clauses: CLAUSES } = registry();
  const r = e.result;
  const byLine = new Map<string, { amount: number; clause: string; reason: string }[]>();
  for (const d of r.deductions) {
    if (!byLine.has(d.lineId)) byLine.set(d.lineId, []);
    byLine.get(d.lineId)!.push(d);
  }

  return (
    <>
      <p className="lede">
        {e.procedure.name} at {e.hospital.name}, {e.hospital.city}. {e.policy.product} from{" "}
        {e.policy.insurer}.
      </p>

      <div className="facts">
        <div className="fact">
          <span className="k">Sum insured</span>
          <span className="v">{fmt(e.policy.sumInsured)}</span>
        </div>
        <div className="fact">
          <span className="k">Room limit</span>
          <span className="v">{r.roomCapPerDay === null ? "none" : `${fmt(r.roomCapPerDay)} / day`}</span>
        </div>
        <div className="fact">
          <span className="k">Rent charged</span>
          <span className="v">
            {(() => {
              const room = e.lines.find((l) => l.kind === "room");
              return room ? `${fmt(room.perDay ?? 0)} / day` : "no room line";
            })()}
          </span>
        </div>
        <div className="fact">
          <span className="k">Reduction ratio</span>
          <span className={`v ${r.roomRatio < 1 ? "loss" : ""}`}>{r.roomRatio.toFixed(2)}</span>
        </div>
        <div className="fact">
          <span className="k">Co-payment</span>
          <span className="v">{e.policy.copayPct ? pct(e.policy.copayPct) : "none"}</span>
        </div>
        <div className="fact">
          <span className="k">Implant sub-limit</span>
          <span className="v">
            {e.policy.implantSubLimit === null ? "none" : fmt(e.policy.implantSubLimit)}
          </span>
        </div>
      </div>

      {r.roomRatio < 1 && (
        <div className="callout">
          <h3>Reduction ratio {r.roomRatio.toFixed(2)}</h3>
          Every charge marked <em>room-linked</em> is paid at {Math.round(r.roomRatio * 100)}% of what
          the hospital billed. Charges marked <em>not room-linked</em>, and intensive care, are left
          whole. <span className="cite">{CLAUSES.PROPORTIONATE.cite}</span>
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2>The bill</h2>
          <span className="aside">{e.lines.length} lines</span>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th>Treated as</th>
                <th className="num">Billed</th>
                <th className="num">Refused</th>
                <th className="num">Allowed</th>
              </tr>
            </thead>
            <tbody>
              {e.lines.map((l) => {
                const ds = byLine.get(l.id) ?? [];
                const cut = ds.reduce((t, d) => t + d.amount, 0);
                const k = KIND[l.kind];
                return (
                  <tr key={l.id}>
                    <td>
                      {l.label}
                      {ds.map((d, i) => (
                        <div className="sub" key={i}>
                          {d.reason} <span className="cite">{CLAUSES[d.clause].cite}</span>
                        </div>
                      ))}
                      {!ds.length && l.note && <div className="sub">{l.note}</div>}
                    </td>
                    <td>
                      <span className={`chip ${k.tone}`}>{k.label}</span>
                    </td>
                    <td className="num">{fmt(l.amount)}</td>
                    <td className="num">{cut ? <span style={{ color: "var(--loss)" }}>{fmt(cut)}</span> : "—"}</td>
                    <td className="num">{fmt(l.amount - cut)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Settlement</h2>
          <span className="aside">
            {e.input.route === "cashless"
              ? `Cashless, pre-authorisation about ${e.hospital.preAuthHours} hours`
              : `Reimbursement, about ${e.hospital.settlementDays} days`}
          </span>
        </div>
        <ul className="rows">
          <li className="row">
            <span className="row-l">Hospital bill</span>
            <span className="row-amt">{fmt(r.billTotal)}</span>
          </li>
          <li className="row">
            <span className="row-l">Deductions</span>
            <span className="row-amt loss">{fmt(-r.deductionTotal)}</span>
          </li>
          <li className="row">
            <span className="row-l">Admissible</span>
            <span className="row-amt">{fmt(r.admissible)}</span>
          </li>
          {r.copay > 0 && (
            <li className="row">
              <span className="row-l">
                Co-payment at {pct(e.policy.copayPct)}
                <span className="cite">{CLAUSES.COPAY.cite}</span>
              </span>
              <span className="row-amt loss">{fmt(-r.copay)}</span>
            </li>
          )}
          {r.siShortfall > 0 && (
            <li className="row">
              <span className="row-l">
                Above the sum insured
                <span className="cite">{CLAUSES.SUM_INSURED.cite}</span>
              </span>
              <span className="row-amt loss">{fmt(-r.siShortfall)}</span>
            </li>
          )}
          <li className="row">
            <span className="row-l">Insurer pays</span>
            <span className="row-amt paid">{fmt(r.insurerPays)}</span>
          </li>
          <li className="row total">
            <span className="row-l">You pay</span>
            <span className="row-amt loss">{fmt(r.patientPays)}</span>
          </li>
        </ul>
        {e.input.route === "reimbursement" && (
          <p className="note">
            On this route the family pays {fmt(r.billTotal)} at discharge and is repaid{" "}
            {fmt(r.insurerPays)} about {e.hospital.settlementDays} days later.
          </p>
        )}
        {r.notes.map((n, i) => (
          <p className="note" key={i}>
            {n}
          </p>
        ))}
      </section>
    </>
  );
}
