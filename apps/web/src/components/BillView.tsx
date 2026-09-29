import { fmt, pct, type LineKind, type Evaluated, registry } from "@claimcast/engine";
import { lang, t, tx } from "../i18n";

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
        {t("{proc} at {hospital}, {city}. {product} from {insurer}.", {
          proc: e.procedure.name,
          hospital: e.hospital.name,
          city: e.hospital.city,
          product: e.policy.product,
          insurer: e.policy.insurer,
        })}
      </p>

      <div className="facts">
        <div className="fact">
          <span className="k">{t("Sum insured")}</span>
          <span className="v">{fmt(e.policy.sumInsured)}</span>
        </div>
        <div className="fact">
          <span className="k">{t("Room limit")}</span>
          <span className="v">{r.roomCapPerDay === null ? t("none") : t("{x} / day", { x: fmt(r.roomCapPerDay) })}</span>
        </div>
        <div className="fact">
          <span className="k">{t("Rent charged")}</span>
          <span className="v">
            {(() => {
              const room = e.lines.find((l) => l.kind === "room");
              return room ? t("{x} / day", { x: fmt(room.perDay ?? 0) }) : t("no room line");
            })()}
          </span>
        </div>
        <div className="fact">
          <span className="k">{t("Reduction ratio")}</span>
          <span className={`v ${r.roomRatio < 1 ? "loss" : ""}`}>{r.roomRatio.toFixed(2)}</span>
        </div>
        <div className="fact">
          <span className="k">{t("Co-payment")}</span>
          <span className="v">{e.policy.copayPct ? pct(e.policy.copayPct) : t("none")}</span>
        </div>
        <div className="fact">
          <span className="k">{t("Implant sub-limit")}</span>
          <span className="v">
            {e.policy.implantSubLimit === null ? t("none") : fmt(e.policy.implantSubLimit)}
          </span>
        </div>
      </div>

      {r.roomRatio < 1 && (
        <div className="callout">
          <h3>{t("Reduction ratio {r}", { r: r.roomRatio.toFixed(2) })}</h3>
          {lang() === "hi" ? (
            t(
              "Every charge marked “room-linked” is paid at {p}% of what the hospital billed. Charges marked “not room-linked”, and intensive care, are left whole.",
              { p: Math.round(r.roomRatio * 100) },
            )
          ) : (
            <>
              Every charge marked <em>room-linked</em> is paid at {Math.round(r.roomRatio * 100)}% of what
              the hospital billed. Charges marked <em>not room-linked</em>, and intensive care, are left
              whole.
            </>
          )}{" "}
          <span className="cite">{tx(CLAUSES.PROPORTIONATE.cite)}</span>
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2>{t("The bill")}</h2>
          <span className="aside">{t("{n} lines", { n: e.lines.length })}</span>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Line")}</th>
                <th>{t("Treated as")}</th>
                <th className="num">{t("Billed")}</th>
                <th className="num">{t("Refused")}</th>
                <th className="num">{t("Allowed")}</th>
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
                      {tx(l.label)}
                      {ds.map((d, i) => (
                        <div className="sub" key={i}>
                          {tx(d.reason)} <span className="cite">{tx(CLAUSES[d.clause].cite)}</span>
                        </div>
                      ))}
                      {!ds.length && l.note && <div className="sub">{tx(l.note)}</div>}
                    </td>
                    <td>
                      <span className={`chip ${k.tone}`}>{t(k.label)}</span>
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
          <h2>{t("Settlement")}</h2>
          <span className="aside">
            {e.input.route === "cashless"
              ? t("Cashless, pre-authorisation about {h} hours", { h: e.hospital.preAuthHours ?? "" })
              : t("Reimbursement, about {d} days", { d: e.hospital.settlementDays })}
          </span>
        </div>
        <ul className="rows">
          <li className="row">
            <span className="row-l">{t("Hospital bill")}</span>
            <span className="row-amt">{fmt(r.billTotal)}</span>
          </li>
          <li className="row">
            <span className="row-l">{t("Deductions")}</span>
            <span className="row-amt loss">{fmt(-r.deductionTotal)}</span>
          </li>
          <li className="row">
            <span className="row-l">{t("Admissible")}</span>
            <span className="row-amt">{fmt(r.admissible)}</span>
          </li>
          {r.copay > 0 && (
            <li className="row">
              <span className="row-l">
                {t("Co-payment at {p}", { p: pct(e.policy.copayPct) })}
                <span className="cite">{tx(CLAUSES.COPAY.cite)}</span>
              </span>
              <span className="row-amt loss">{fmt(-r.copay)}</span>
            </li>
          )}
          {r.siShortfall > 0 && (
            <li className="row">
              <span className="row-l">
                {t("Above the sum insured")}
                <span className="cite">{tx(CLAUSES.SUM_INSURED.cite)}</span>
              </span>
              <span className="row-amt loss">{fmt(-r.siShortfall)}</span>
            </li>
          )}
          <li className="row">
            <span className="row-l">{t("Insurer pays")}</span>
            <span className="row-amt paid">{fmt(r.insurerPays)}</span>
          </li>
          <li className="row total">
            <span className="row-l">{t("You pay")}</span>
            <span className="row-amt loss">{fmt(r.patientPays)}</span>
          </li>
        </ul>
        {e.input.route === "reimbursement" && (
          <p className="note">
            {t("On this route the family pays {bill} at discharge and is repaid {x} about {d} days later.", {
              bill: fmt(r.billTotal),
              x: fmt(r.insurerPays),
              d: e.hospital.settlementDays,
            })}
          </p>
        )}
        {r.notes.map((n, i) => (
          <p className="note" key={i}>
            {tx(n)}
          </p>
        ))}
      </section>
    </>
  );
}
