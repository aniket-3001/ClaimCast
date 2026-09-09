import { fmt } from "../lib/money";
import { material } from "../lib/engine";
import { forecast, forks, MATERIALITY, type Evaluated } from "../lib/case";
import { CLAUSES } from "../data/clauses";

/**
 * The answer, before admission.
 *
 * Ordered the way the question is actually asked: what will this cost me, how
 * sure is that, and which of my remaining choices moves it. The itemisation
 * sits on its own tab because nobody standing at an admission desk reads
 * fourteen lines first.
 */
export function Forecast({ e }: { e: Evaluated }) {
  const f = forecast(e);
  const r = e.result;
  const { shown, restTotal, restCount } = material(r.deductions, MATERIALITY);
  const paidPct = r.billTotal ? (r.insurerPays / r.billTotal) * 100 : 0;

  return (
    <>
      <div className="headline">
        <div className="headline-row">
          <div>
            <div className="big loss">{fmt(r.patientPays)}</div>
            <div className="big-label">
              What this policy will not pay for {e.procedure.name.toLowerCase()} at {e.hospital.name}
            </div>
          </div>
          <div className="range">
            <div>
              {fmt(f.low.patientPays)} – {fmt(f.high.patientPays)}
            </div>
            <div className="big-label">on a bill of {fmt(f.low.billTotal)} – {fmt(f.high.billTotal)}</div>
          </div>
        </div>

        <div className="split" role="img" aria-label={`Insurer ${fmt(r.insurerPays)}, patient ${fmt(r.patientPays)}`}>
          <div className="split-paid" style={{ width: `${paidPct}%` }} />
          <div className="split-loss" style={{ width: `${100 - paidPct}%` }} />
        </div>
        <div className="split-legend">
          <span>
            Insurer <span className="num">{fmt(r.insurerPays)}</span>
          </span>
          <span>
            Bill <span className="num">{fmt(r.billTotal)}</span>
          </span>
          <span>
            You <span className="num">{fmt(r.patientPays)}</span>
          </span>
        </div>
      </div>

      {r.repudiated && (
        <div className="callout refused">
          <h3>This is not a claim</h3>
          {r.repudiated.reason} Nothing is payable, so the room class and the sum insured make no
          difference. <span className="cite">{CLAUSES[r.repudiated.clause].cite}</span>
        </div>
      )}

      {!r.repudiated && f.certain > 0 && (
        <div className="callout">
          <h3>{fmt(f.certain)} of that is already decided</h3>
          The rent above the limit is fixed by the tariff and the schedule. It does not depend on how
          the operation goes, and no part of the range above touches it.
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2>What is still open</h2>
          <span className="aside">Each figure is two full adjudications, differenced</span>
        </div>
        <div className="forks">
          {forks(e).map((k) => (
            <div className="fork" key={k.decision}>
              <div className="fork-stage">{k.stage}</div>
              <div className="fork-decision">{k.decision}</div>
              <div className="fork-mechanic">{k.mechanic}</div>
              <div className={`fork-amt ${k.amount === null ? "idle" : ""}`}>
                {k.amount === null ? "Nothing at stake" : fmt(k.amount)}
              </div>
              <div className="fork-detail">{k.detail}</div>
            </div>
          ))}
        </div>
      </section>

      {!r.repudiated && (
        <section className="section">
          <div className="section-head">
            <h2>Why</h2>
            <span className="aside">Deductions over {fmt(MATERIALITY)}</span>
          </div>
          {shown.length === 0 && restCount === 0 ? (
            <div className="empty">Nothing is being refused on this admission.</div>
          ) : (
            <ul className="rows">
              {shown.map((d) => (
                <li className="row" key={d.lineId + d.clause}>
                  <span className="row-l">
                    <span>{d.line}</span>
                    <span className="cite">{CLAUSES[d.clause].cite}</span>
                    <span className="row-why">{d.reason}</span>
                  </span>
                  <span className="row-amt loss">{fmt(d.amount)}</span>
                </li>
              ))}
              {restCount > 0 && (
                <li className="row">
                  <span className="row-l">
                    <span>
                      {restCount} smaller {restCount === 1 ? "deduction" : "deductions"}
                    </span>
                    <span className="row-why">
                      Each under {fmt(MATERIALITY)}. Listed in full on the Bill tab.
                    </span>
                  </span>
                  <span className="row-amt loss">{fmt(restTotal)}</span>
                </li>
              )}
              {r.copay > 0 && (
                <li className="row">
                  <span className="row-l">
                    <span>Co-payment</span>
                    <span className="cite">{CLAUSES.COPAY.cite}</span>
                    <span className="row-why">
                      {Math.round(e.policy.copayPct * 100)}% of {fmt(r.admissible)}, taken after every
                      other deduction.
                    </span>
                  </span>
                  <span className="row-amt loss">{fmt(r.copay)}</span>
                </li>
              )}
              {r.siShortfall > 0 && (
                <li className="row">
                  <span className="row-l">
                    <span>Above the sum insured</span>
                    <span className="cite">{CLAUSES.SUM_INSURED.cite}</span>
                    <span className="row-why">{r.notes[r.notes.length - 1]}</span>
                  </span>
                  <span className="row-amt loss">{fmt(r.siShortfall)}</span>
                </li>
              )}
              <li className="row total">
                <span className="row-l">Your share</span>
                <span className="row-amt loss">{fmt(r.patientPays)}</span>
              </li>
            </ul>
          )}
        </section>
      )}

      <p className="note">
        An estimate, not a guarantee. The arithmetic is the insurer&rsquo;s own and is exact; what is
        uncertain is the clinical bill it runs on.
      </p>
    </>
  );
}
