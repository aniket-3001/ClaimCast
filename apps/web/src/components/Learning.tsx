/**
 * What the system has learned since it was deployed.
 *
 * This screen exists because the claim it describes is easy to make and hard to
 * evidence. Plenty of things say they learn; almost none of them will show you
 * the counters. So this one shows the counters, and it shows them with their
 * denominators, because a rate without one is a way of sounding confident about
 * four observations.
 *
 * Two speeds. The counters moved the moment somebody confirmed a field, reported
 * a bill or took a branch, and were already moving the next request by the time
 * the screen rendered. The cost model is the slow path: its XGBoost booster is
 * rebuilt on published tariffs plus every settled bill once enough new bills
 * have arrived, and the section below shows which version is serving and how
 * close the next retrain is. The things this application depends on -- how
 * insurers word schedules, what hospitals charge, which sub-limits are in
 * fashion -- do not hold still, and a model fitted once is a photograph of the
 * day it was fitted.
 *
 * The three signals are not worth the same and are not presented as though they
 * were. Corrections are true labels on real documents. Settled bills are the
 * only evidence that can say whether a forecast was any good, and the scarcest.
 * Branch choices are cheap, plentiful, and good only for deciding what to offer
 * first -- which is said here in as many words, because the temptation to let a
 * big number stand in for a useful one is exactly what this screen is against.
 */

import { useEffect, useState } from "react";
import type { LearningState } from "@claimcast/contracts";
import { learningState } from "../api";
import { plural, t } from "../i18n";

/** How each field is named here, matching the wording on the intake screen. */
const LABEL: Record<string, string> = {
  insurer: "Insurer",
  product: "Product",
  sumInsured: "Sum insured",
  roomCapPerDay: "Room rent limit",
  roomCapPctOfSI: "Room limit as % of sum insured",
  icuCapPerDay: "ICU limit",
  icuCapPctOfSI: "ICU limit as % of sum insured",
  proportionateDeduction: "Proportionate deduction",
  copayPct: "Co-payment",
  implantSubLimit: "Implant sub-limit",
  preHospDays: "Pre-hospitalisation window",
  postHospDays: "Post-hospitalisation window",
  dayCareCovered: "Day-care procedures",
  monthsInForce: "Months the cover has run",
  pedWaitingMonths: "Pre-existing disease waiting",
  moratoriumMonths: "Moratorium",
};

export function Learning() {
  const [state, setState] = useState<LearningState | null | "loading">("loading");

  useEffect(() => {
    let live = true;
    learningState().then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, []);

  if (state === "loading") {
    return <div className="model model-quiet">{t("Loading…")}</div>;
  }

  if (state === null) {
    return (
      <div className="model model-quiet">
        <span className="model-k">{t("Not reachable")}</span>
        <p className="model-why">
          {t("Could not reach the server. The family’s screens are not affected.")}
        </p>
      </div>
    );
  }

  const total = state.fields.reduce((n, f) => n + f.seen, 0);
  const corrected = state.fields.reduce((n, f) => n + f.corrected, 0);

  // Worst first, and only fields anybody has actually judged. A field nobody has
  // confirmed yet has no record, and an empty row would read as a clean one.
  const ranked = [...state.fields]
    .filter((f) => f.seen > 0)
    .sort((a, b) => b.corrected / b.seen - a.corrected / a.seen || b.seen - a.seen);

  return (
    <>
      <section className="section">
        <div className="section-head">
          <h2>{t("How ClaimCast learns from families")}</h2>
          <span className="aside">{t("Updates as people use it")}</span>
        </div>

        <p className="note" style={{ marginTop: 0 }}>
          {t("Every time a family uses ClaimCast, it learns something. These counts go up as soon as it happens — the very next family benefits.")}
        </p>

        <div className="signals">
          <Signal
            n={state.confirmations}
            k={t("Policy details checked")}
            why={t("Families checked the details ClaimCast read from their policy document. Each fix teaches it which details to read more carefully.")}
          />
          <Signal
            n={state.outcomes}
            k={t("Final bills shared")}
            why={t("Families told us what their hospital bill finally came to. This is how ClaimCast finds out whether its estimates were right.")}
          />
          <Signal
            n={state.choices}
            k={t("Choices made")}
            why={t("Which hospital, room or option families picked on their path. Counted so the team can see what families choose; never linked to a person.")}
          />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t("The chat assistant’s memory")}</h2>
          <span className="aside">{t("Grows with every saved session")}</span>
        </div>
        <p className="note" style={{ marginTop: 0 }}>
          {t(
            "When a family saves their session, their questions and the answers they got are remembered. When someone asks something similar later, the assistant looks back at how it was explained before — so it keeps getting better at what families actually ask. The rupee amounts always come from the new family’s own bill, never from someone else’s.",
          )}
        </p>
        <div className="signals">
          <Signal
            n={state.savedSessions ?? 0}
            k={t("Saved sessions")}
            why={t("Families who pressed “Save my session”. You can see each one on the Database tab.")}
          />
          <Signal
            n={state.chatMemory ?? 0}
            k={t("Answers remembered")}
            why={t("Past answers the assistant can look back on. Answers containing a wrong amount are left out.")}
          />
        </div>
      </section>

      <CostModelLearning m={state.costModel ?? null} />

      <section className="section">
        <div className="section-head">
          <h2>{t("Policy details that are often misread")}</h2>
          <span className="aside">
            {total === 0 ? t("None checked yet") : t("{a} fixed out of {b} checked", { a: corrected, b: total })}
          </span>
        </div>

        {ranked.length === 0 ? (
          <p className="note" style={{ marginTop: 0 }}>
            {t(
              "No family has checked an uploaded policy yet. Once they do, the details that most often need fixing will show up here.",
            )}
          </p>
        ) : (
          <>
            <p className="note" style={{ marginTop: 0 }}>
              {t(
                "The details at the top are the ones families fix most often. ClaimCast now warns the next family to double-check those details when they upload their policy.",
              )}
            </p>
            <ul className="rows">
              {ranked.map((f) => {
                const rate = f.corrected / f.seen;
                return (
                  <li className="row" key={f.field + "/" + f.model}>
                    <span className="row-l">
                      <span>{t(LABEL[f.field] ?? f.field)}</span>
                      <span className="cite">
                        {f.model}
                        {f.unverified > 0 &&
                          " · " + t("{a} of {b} could not be matched to the document", { a: f.unverified, b: f.seen })}
                      </span>
                    </span>
                    <span className={rate >= 0.25 ? "row-amt loss" : "row-amt"}>
                      {f.corrected} of {f.seen}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <p className="note" style={{ marginTop: 16 }}>
        {t("Privacy: we keep counts, not documents. A family’s policy wording is kept only if they ticked the box to share it, and choices on the path are never linked to a person.")}
      </p>
    </>
  );
}

function Signal({ n, k, why }: { n: number; k: string; why: string }) {
  return (
    <div className="signal">
      <div className="signal-n">{n.toLocaleString("en-IN")}</div>
      <div className="signal-k">{k}</div>
      <p className="signal-why">{why}</p>
    </div>
  );
}

/**
 * The cost model's own learning loop, as the admin sees it: which booster
 * version is serving, what it was trained on, and how many settled bills until
 * it rebuilds itself on the combined pool.
 */
function CostModelLearning({ m }: { m: NonNullable<LearningState["costModel"]> | null }) {
  if (!m) {
    return (
      <section className="section">
        <div className="section-head">
          <h2>{t("The bill estimator")}</h2>
          <span className="aside">{t("Not connected")}</span>
        </div>
        <p className="note" style={{ marginTop: 0 }}>
          {t("The bill estimator is not running right now, so its learning progress cannot be shown.")}
        </p>
      </section>
    );
  }
  const toNext = Math.max(0, m.retrainEvery - m.pending);
  return (
    <section className="section">
      <div className="section-head">
        <h2>{t("The bill estimator teaches itself")}</h2>
        <span className="aside">{t("Machine learning model (XGBoost)")}</span>
      </div>
      <p className="note" style={{ marginTop: 0 }}>
        {t("ClaimCast estimates a hospital bill using a machine learning model trained on every government price list for treatments in India. When families share their final bills, it learns from them: after every {n} new bills, it retrains itself on everything it knows and starts using the improved version straight away.", { n: m.retrainEvery })}
      </p>
      <div className="signals">
        <Signal
          n={m.outcomesTrainedOn}
          k={t("Real bills learned from")}
          why={t("Current version {v}, trained on {rows} government prices plus these bills.", {
            v: m.modelVersion,
            rows: m.tariffRows.toLocaleString("en-IN"),
          })}
        />
        <Signal
          n={m.pending}
          k={t("New bills waiting")}
          why={
            toNext === 0
              ? t("Enough new bills are in — it retrains with the next one.")
              : plural(toNext, "{n} more bill and it retrains itself.", "{n} more bills and it retrains itself.")
          }
        />
        <Signal
          n={Math.round((Object.values(m.heldOutCoverage)[0] ?? 0) * 100)}
          k={t("Accuracy check, %")}
          why={t("Tested on prices it had not seen: {p}% fell inside its predicted range, as designed (target 80%).", {
            p: Math.round((Object.values(m.heldOutCoverage)[0] ?? 0) * 100),
          })}
        />
      </div>
    </section>
  );
}
