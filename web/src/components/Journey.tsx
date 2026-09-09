import { Fragment } from "react";
import { fmt, signed } from "../lib/money";
import {
  fixedRegardless,
  forecast,
  gate,
  journey,
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
 * Read top to bottom it is the order the decisions are actually faced, along
 * the care journey the deck sets out: whether this counts as hospitalisation
 * at all, then where and which bed at admission, then how the claim is made.
 * Every branch carries what the family would pay on that path — a full re-adjudication, not an adjustment — so choosing is a matter of
 * reading two numbers rather than trusting a recommendation.
 */
export function Journey({ e, onPick }: { e: Evaluated; onPick: (next: CaseInput) => void }) {
  const g = gate(e);
  const f = forecast(e);
  const fixed = fixedRegardless(e);
  const fixedTotal = fixed.reduce((t, x) => t + x.amount, 0);
  const r = e.result;

  return (
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
            The claim fails before any deduction is reached, so no choice further down the path
            changes it. The whole bill is the family&rsquo;s.
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
                  These come off the procedure and the policy schedule, never off the room tariff.
                  No cheaper bed and no other hospital moves them.
                </div>
              </div>
              <Link />
            </>
          )}

          <div className="tnode end">
            <div className="tnode-k">You pay</div>
            <div className="tnode-v loss">{fmt(r.patientPays)}</div>
            <div className="tnode-sub">
              {fmt(f.low.patientPays)} – {fmt(f.high.patientPays)} once the clinical bill is known,
              on a bill of {fmt(r.billTotal)}. The insurer pays {fmt(r.insurerPays)}.
            </div>
            <Split insurer={r.insurerPays} total={r.billTotal} patient={r.patientPays} />
          </div>
        </>
      )}
    </div>
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
