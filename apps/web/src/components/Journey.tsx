import { Fragment } from "react";
import { bandOf, useCostModel, CostModelNote } from "./CostModel";
import {
  fmt,
  signed,
  fixedRegardless,
  forecast,
  gate,
  journey,
  schemeOptions,
  ageScheme,
  familyPays,
  MATERIALITY,
  type Branch,
  type CaseInput,
  type Evaluated,
  type Stage,
  registry,
  isNoPolicy,
} from "@claimcast/engine";
import { plural, t, tx } from "../i18n";
import { policyShort } from "../labels";

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
  const { clauses: CLAUSES } = registry();
  const g = gate(e);
  // The model supplies the spread; the hospital's own tariff still supplies the
  // level. Until the request lands, `bandOf` returns nothing and the engine falls
  // back to the simulated range -- the page never waits and never blanks.
  const m = useCostModel(e);
  const f = forecast(e, bandOf(m));
  const fixed = fixedRegardless(e);
  const fixedTotal = fixed.reduce((t, x) => t + x.amount, 0);
  const r = e.result;
  // The age-group scheme (RBSK under 18, Vay Vandana 70+) is the default payer when it reaches here.
  const pays = familyPays(e);

  return (
    <>
      {/* The answer before the reasoning. Someone seeing this page for the
          first time has no way to know the tree ends in a number, and would
          have to scroll to the bottom to find out. It moves the moment a
          branch is clicked, which is the point of the whole page. */}
      <div className="outcome">
        <div className="outcome-main">
          <span className="outcome-k">{t("As things stand, you pay")}</span>
          <span className={`outcome-v ${pays.via ? "paid" : ""}`}>{fmt(pays.amount)}</span>
        </div>
        {pays.via ? (
          <div className="outcome-of">
            <span className="k">{t("With your plan instead")}</span>
            <span className="v">{fmt(r.patientPays)}</span>
          </div>
        ) : (
          <div className="outcome-of">
            <span className="k">{t("Insurer pays")}</span>
            <span className="v paid">{fmt(r.insurerPays)}</span>
          </div>
        )}
        <div className="outcome-of">
          <span className="k">{t("Bill")}</span>
          <span className="v">{fmt(r.billTotal)}</span>
        </div>
      </div>
      <AgeSchemeNote e={e} onPick={onPick} />

      <div className="tree">
        <div className="tnode start">
          <div className="tnode-k">{t("The admission")}</div>
          <div className="tnode-v">{e.procedure.name}</div>
          <div className="tnode-sub">
            {plural(e.input.days, "{n} night", "{n} nights")}
            {e.input.icuDays > 0 && t(", {n} in intensive care", { n: e.input.icuDays })} · {policyShort(e.policy)}
            {!isNoPolicy(e.policy) && <>, {t("{x} sum insured", { x: fmt(e.policy.sumInsured) })}</>}
          </div>
        </div>

        <GovtFork e={e} />

        <Link />

        <div className={`tgate ${g.passed ? "pass" : "fail"}`}>
          <div className="tgate-q">{tx(g.question)}</div>
          <div className="tgate-test">
            {tx(g.test)} <span className="cite">{tx(CLAUSES[g.clause].cite)}</span>
          </div>
          <div className="tgate-verdict">{g.passed ? t("Yes") : t("No")}</div>
          <div className="tgate-detail">{tx(g.detail)}</div>
        </div>

        <Link />

        {!g.passed ? (
          <div className="tnode end refused">
            <div className="tnode-k">{t("Nothing is payable")}</div>
            <div className="tnode-v loss">{fmt(r.billTotal)}</div>
            <div className="tnode-sub">
              {t("The claim fails before any deduction. The whole bill is the family’s.")}
            </div>
          </div>
        ) : (
          <>
            {journey(e).map((s, i, all) => (
              <Fragment key={s.id}>
                {s.phase !== all[i - 1]?.phase && <div className="phase">{tx(s.phase)}</div>}
                <StageBlock stage={s} onPick={onPick} />
                <Link />
              </Fragment>
            ))}

            {fixedTotal > 0 && (
              <>
                <div className="phase">{tx("Procedure")}</div>
                <div className="tnode fixed">
                  <div className="tnode-k">{t("Refused whichever path you take")}</div>
                  <ul className="rows">
                    {fixed.map((x) => (
                      <li className="row" key={x.clause}>
                        <span className="row-l">
                          <span>{tx(x.label)}</span>
                          <span className="cite">{tx(CLAUSES[x.clause].cite)}</span>
                        </span>
                        <span className="row-amt loss">{fmt(x.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="tnode-sub">
                    {t(
                      "These come off the procedure, never off the room tariff. No cheaper bed and no other hospital moves them.",
                    )}
                  </div>
                </div>
                <Link />
              </>
            )}

            <div className="tnode end">
              <div className="tnode-k">{t("You pay")}</div>
              <div className="tnode-v loss">{fmt(r.patientPays)}</div>
              <div className="tnode-sub">
                {t(
                  f.spread === "fitted"
                    ? "{lo} – {hi} once the clinical bill is known, on the fitted spread. The insurer pays {paid} of {bill}."
                    : "{lo} – {hi} once the clinical bill is known, on the simulated spread. The insurer pays {paid} of {bill}.",
                  {
                    lo: fmt(f.low.patientPays),
                    hi: fmt(f.high.patientPays),
                    paid: fmt(r.insurerPays),
                    bill: fmt(r.billTotal),
                  },
                )}
              </div>
              <Split insurer={r.insurerPays} total={r.billTotal} patient={r.patientPays} />
              <CostModelNote m={m} />
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
  const { clauses: CLAUSES } = registry();
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
        <div className="fork-k">{t("Who pays for this admission")}</div>
        <div className="fork-v">
          {saved > 0 ? (
            <>
              {t("{way} would leave {x} to find, not {y}", {
                way: tx(best.label),
                x: fmt(best.patientPays!),
                y: fmt(e.result.patientPays),
              })}
            </>
          ) : (
            <>{t("The private policy is still the better of the paths open here")}</>
          )}
        </div>
        <div className="fork-ways">
          {ways.map((s) => (
            <div key={s.id} className={`way ${s.id === best.id && saved > 0 ? "on" : ""}`}>
              <span className="way-label">{tx(s.label)}</span>
              {s.patientPays !== null && <span className="way-pay">{fmt(s.patientPays)}</span>}
              <span className="way-note">
                {tx(s.detail)} <span className="cite">{tx(CLAUSES[s.clause].cite)}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="tnode-sub" style={{ textAlign: "center" }}>
          {t("One path per admission")} &mdash;{" "}
          <span className="cite">{tx(CLAUSES.SINGLE_CLAIM_PATH.cite)}</span>.{" "}
          {t("The rest of this tree follows the private claim.")}
        </div>
      </div>
    </>
  );
}

/**
 * The small line under the headline: which government scheme the patient's
 * age puts them in, whether it is paying here, and a switch to see the claim
 * on the policy instead. Nothing is shown between 18 and 69.
 */
export function AgeSchemeNote({ e, onPick }: { e: Evaluated; onPick?: (next: CaseInput) => void }) {
  const a = ageScheme(e);
  if (!a) return null;
  const { clauses: CLAUSES } = registry();
  const who = a.group === "child" ? t("Under 18") : t("Age 70 and above");
  const name = tx(a.scheme.label);
  return (
    <div className={`age-note ${a.applied ? "on" : ""}`} role="note">
      <span className="age-i" aria-hidden="true">i</span>
      <span className="age-t">
        <b>
          {who} · {name}
        </b>{" "}
        {a.applied
          ? t("applied by default: you pay {x}, not {y} on your plan.", {
              x: fmt(a.scheme.patientPays!),
              y: fmt(e.result.patientPays),
            })
          : a.applies
            ? t("would cover this: you would pay {x}, not {y}.", { x: fmt(a.scheme.patientPays!), y: fmt(e.result.patientPays) })
            : tx(a.scheme.detail)}{" "}
        <span className="cite">{tx(CLAUSES[a.scheme.clause].cite)}</span>
      </span>
      {a.applies && onPick && (
        <button type="button" className="age-switch" onClick={() => onPick({ ...e.input, ageScheme: !a.applied })}>
          {a.applied ? t("Use my plan instead") : t("Apply it")}
        </button>
      )}
    </div>
  );
}

function StageBlock({ stage, onPick }: { stage: Stage; onPick: (next: CaseInput) => void }) {
  // Where every branch settles for the same money, the figures are noise and
  // the difference is timing. Say that instead of printing it four times.
  const { clauses: CLAUSES } = registry();
  const sameMoney = new Set(stage.branches.map((b) => b.patientPays)).size === 1;

  return (
    <div className="stage">
      <div className="stage-q">
        <span className="stage-n">{stage.step}</span>
        <span className="stage-t">
          <span className="stage-h">{tx(stage.question)}</span>
          <span className="stage-m">
            {tx(stage.mechanic)}
            {stage.clause && <span className="cite">{tx(CLAUSES[stage.clause].cite)}</span>}
          </span>
        </span>
      </div>

      <Link />

      <div className="branches" style={{ ["--n" as string]: stage.branches.length }}>
        {stage.branches.map((b) => (
          <BranchCard key={b.key} b={b} money={!sameMoney} onPick={onPick} />
        ))}
      </div>

      {stage.settled && <div className="stage-settled">{tx(stage.settled)}</div>}
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
      <span className="branch-label">{tx(b.label)}</span>
      <span className="branch-note">{tx(b.blocked ?? b.note)}</span>
      {money && !b.blocked && (
        <>
          <span className="branch-pay">{fmt(b.patientPays)}</span>
          <span className={`branch-delta ${!worth ? "" : b.delta < 0 ? "good" : "bad"}`}>
            {b.chosen
              ? t("on this path")
              : b.delta === 0
                ? t("no change")
                : !worth
                  ? t("under {x}", { x: fmt(MATERIALITY) })
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
