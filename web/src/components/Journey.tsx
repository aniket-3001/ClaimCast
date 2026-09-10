import { Fragment } from "react";
import { fmt, signed } from "../lib/money";
import {
  fixedRegardless,
  forecast,
  gate,
  journey,
  schemeOptions,
  MATERIALITY,
  type Branch,
  type CaseInput,
  type Evaluated,
  type Stage,
} from "../lib/case";
import { CLAUSES } from "../data/clauses";

/**
 * The admission as a path, not a form.
 *
 * Read top to bottom it is the order the decisions are actually faced: how
 * the admission gets paid for at all, whether it counts as hospitalisation,
 * then where and which bed, then how the claim is made. Every branch carries
 * what the family would pay on that path — a full re-adjudication, not an
 * adjustment — so choosing is a matter of reading two numbers.
 */
export function Journey({ e, onPick }: { e: Evaluated; onPick: (next: CaseInput) => void }) {
  const g = gate(e);
  const f = forecast(e);
  const fixed = fixedRegardless(e);
  const fixedTotal = fixed.reduce((t, x) => t + x.amount, 0);
  const r = e.result;

  return (
    <>
      {/* The answer before the reasoning. Someone seeing this page for the
          first time has no way to know the tree ends in a number, and would
          have to scroll to the bottom to find out. It moves the moment a
          branch is clicked, which is the point of the whole page. */}
      <div className="outcome">
        <div className="outcome-main">
          <span className="outcome-k">As things stand, you pay</span>
          <span className="outcome-v">{fmt(r.patientPays)}</span>
        </div>
        <div className="outcome-of">
          <span className="k">Insurer pays</span>
          <span className="v paid">{fmt(r.insurerPays)}</span>
        </div>
        <div className="outcome-of">
          <span className="k">Bill</span>
          <span className="v">{fmt(r.billTotal)}</span>
        </div>
      </div>

      <div className="tree">
        <div className="tnode start">
          <div className="tnode-k">The admission</div>
          <div className="tnode-v">{e.procedure.name}</div>
          <div className="tnode-sub">
            {e.input.days} {e.input.days === 1 ? "night" : "nights"}
            {e.input.icuDays > 0 && `, ${e.input.icuDays} in intensive care`} · {e.policy.product},{" "}
            {fmt(e.policy.sumInsured)} sum insured
          </div>
        </div>

        <GovtFork e={e} />

        <Link />

        <div className={`tgate ${g.passed ? "pass" : "fail"}`}>
          <div className="tgate-q">{g.question}</div>
          <div className="tgate-test">
            {g.test} <span className="cite">{CLAUSES[g.clause].cite}</span>
          </div>
          <div className="tgate-verdict">{g.passed ? "Yes" : "No"}</div>
          <div className="tgate-detail">{g.detail}</div>
        </div>

        <Link />

        {!g.passed ? (
          <div className="tnode end refused">
            <div className="tnode-k">Nothing is payable</div>
            <div className="tnode-v loss">{fmt(r.billTotal)}</div>
            <div className="tnode-sub">
              The claim fails before any deduction. The whole bill is the family&rsquo;s.
            </div>
          </div>
        ) : (
          <>
            {journey(e).map((s, i, all) => (
              <Fragment key={s.id}>
                {s.phase !== all[i - 1]?.phase && <div className="phase">{s.phase}</div>}
                <StageBlock stage={s} onPick={onPick} />
                <Link />
              </Fragment>
            ))}

            {fixedTotal > 0 && (
              <>
                <div className="phase">Procedure</div>
                <div className="tnode fixed">
                  <div className="tnode-k">Refused whichever path you take</div>
                  <ul className="rows">
                    {fixed.map((x) => (
                      <li className="row" key={x.clause}>
                        <span className="row-l">
                          <span>{x.label}</span>
                          <span className="cite">{CLAUSES[x.clause].cite}</span>
                        </span>
                        <span className="row-amt loss">{fmt(x.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="tnode-sub">
                    These come off the procedure, never off the room tariff. No cheaper bed and no
                    other hospital moves them.
                  </div>
                </div>
                <Link />
              </>
            )}

            <div className="tnode end">
              <div className="tnode-k">You pay</div>
              <div className="tnode-v loss">{fmt(r.patientPays)}</div>
              <div className="tnode-sub">
                {fmt(f.low.patientPays)} – {fmt(f.high.patientPays)} once the clinical bill is known.
                The insurer pays {fmt(r.insurerPays)} of {fmt(r.billTotal)}.
              </div>
              <Split insurer={r.insurerPays} total={r.billTotal} patient={r.patientPays} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

/**
 * The first fork, and the one nobody thinks to take.
 *
 * A government scheme is not a deduction and not a branch of the private
 * claim: it is a different payer for the same admission, and a family takes
 * one or the other, never both. So it sits above everything the policy does,
 * and it appears only when someone is actually eligible — an empty fork on
 * every case would be a tab in disguise.
 */
function GovtFork({ e }: { e: Evaluated }) {
  const ways = schemeOptions(e).filter((s) => s.id === "private" || s.eligible);
  if (ways.length < 2) return null;

  const best = ways
    .filter((s) => s.id !== "private")
    .reduce((b, s) => (s.patientPays! < b.patientPays! ? s : b));
  const saved = e.result.patientPays - best.patientPays!;

  return (
    <>
      <Link />
      <div className="fork">
        <div className="fork-k">Who pays for this admission</div>
        <div className="fork-v">
          {saved > 0 ? (
            <>
              {best.label} would leave {fmt(best.patientPays!)} to find, not{" "}
              {fmt(e.result.patientPays)}
            </>
          ) : (
            <>The private policy is still the better of the paths open here</>
          )}
        </div>
        <div className="fork-ways">
          {ways.map((s) => (
            <div key={s.id} className={`way ${s.id === best.id && saved > 0 ? "on" : ""}`}>
              <span className="way-label">{s.label}</span>
              {s.patientPays !== null && <span className="way-pay">{fmt(s.patientPays)}</span>}
              <span className="way-note">
                {s.detail} <span className="cite">{CLAUSES[s.clause].cite}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="tnode-sub" style={{ textAlign: "center" }}>
          One path per admission &mdash; <span className="cite">{CLAUSES.SINGLE_CLAIM_PATH.cite}</span>. The
          rest of this tree follows the private claim.
        </div>
      </div>
    </>
  );
}

function StageBlock({ stage, onPick }: { stage: Stage; onPick: (next: CaseInput) => void }) {
  // Where every branch settles for the same money, the figures are noise and
  // the difference is timing. Say that instead of printing it four times.
  const sameMoney = new Set(stage.branches.map((b) => b.patientPays)).size === 1;

  return (
    <div className="stage">
      <div className="stage-q">
        <span className="stage-n">{stage.step}</span>
        <span className="stage-t">
          <span className="stage-h">{stage.question}</span>
          <span className="stage-m">
            {stage.mechanic}
            {stage.clause && <span className="cite">{CLAUSES[stage.clause].cite}</span>}
          </span>
        </span>
      </div>

      <Link />

      <div className="branches" style={{ ["--n" as string]: stage.branches.length }}>
        {stage.branches.map((b) => (
          <BranchCard key={b.key} b={b} money={!sameMoney} onPick={onPick} />
        ))}
      </div>

      {stage.settled && <div className="stage-settled">{stage.settled}</div>}
    </div>
  );
}

function BranchCard({
  b,
  money,
  onPick,
}: {
  b: Branch;
  money: boolean;
  onPick: (next: CaseInput) => void;
}) {
  const cls = ["branch", b.chosen ? "on" : "", b.blocked ? "shut" : ""].filter(Boolean).join(" ");
  // The difference is real below the threshold too, but it is not a reason to
  // move a patient, so it is stated without being urged.
  const worth = Math.abs(b.delta) >= MATERIALITY;
  return (
    <button
      type="button"
      className={cls}
      disabled={!!b.blocked || b.chosen}
      aria-current={b.chosen}
      onClick={() => onPick(b.next)}
    >
      <span className="branch-label">{b.label}</span>
      <span className="branch-note">{b.blocked ?? b.note}</span>
      {money && !b.blocked && (
        <>
          <span className="branch-pay">{fmt(b.patientPays)}</span>
          <span className={`branch-delta ${!worth ? "" : b.delta < 0 ? "good" : "bad"}`}>
            {b.chosen
              ? "on this path"
              : b.delta === 0
                ? "no change"
                : !worth
                  ? "under " + fmt(MATERIALITY)
                  : signed(b.delta)}
          </span>
        </>
      )}
    </button>
  );
}

function Split({ insurer, total, patient }: { insurer: number; total: number; patient: number }) {
  const paid = total ? (insurer / total) * 100 : 0;
  return (
    <div
      className="split"
      role="img"
      aria-label={`Insurer ${fmt(insurer)}, patient ${fmt(patient)}`}
    >
      <div className="split-paid" style={{ width: `${paid}%` }} />
      <div className="split-loss" style={{ width: `${100 - paid}%` }} />
    </div>
  );
}

const Link = () => <div className="tlink" aria-hidden="true" />;
