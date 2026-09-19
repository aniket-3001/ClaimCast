/**
 * What the system has learned since it was deployed.
 *
 * This screen exists because the claim it describes is easy to make and hard to
 * evidence. Plenty of things say they learn; almost none of them will show you
 * the counters. So this one shows the counters, and it shows them with their
 * denominators, because a rate without one is a way of sounding confident about
 * four observations.
 *
 * There is no training run behind any of it. Every number here moved the moment
 * somebody confirmed a field, reported a bill or took a branch, and it was
 * already moving the next request by the time the screen rendered. That is the
 * design, not an implementation detail: the things this application depends on
 * -- how insurers word schedules, what hospitals charge, which sub-limits are
 * in fashion -- do not hold still, and a model fitted once is a photograph of
 * the day it was fitted.
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
    return <div className="model model-quiet">Reading the counters&hellip;</div>;
  }

  if (state === null) {
    return (
      <div className="model model-quiet">
        <span className="model-k">Not reachable</span>
        <p className="model-why">
          The server did not answer. Nothing on the other screens depends on this one.
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
          <h2>What it has learned</h2>
          <span className="aside">Live &mdash; no training run</span>
        </div>

        <p className="note" style={{ marginTop: 0 }}>
          Three things in this application answer back, and each one is written down as it
          arrives. Nothing here waits for a nightly job and there is no retrained model to ship:
          an observation recorded by one request is read by the next one.
        </p>

        <div className="signals">
          <Signal
            n={state.confirmations}
            k="Field confirmations"
            why="A person looked at what the reader pulled out of their schedule and said whether it was right. A true label on a real document, produced by a step that had to happen anyway."
          />
          <Signal
            n={state.outcomes}
            k="Settled bills reported"
            why="What an admission actually came to, against the band we gave for it. The only evidence that can say whether the forecast was any good, and the hardest to come by -- it has to be volunteered weeks later."
          />
          <Signal
            n={state.choices}
            k="Branches taken"
            why="Which way people went at each fork. Cheap and plentiful, and worth exactly one thing: deciding what the tree offers first. It makes no figure on any screen more accurate."
          />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Where the reader is weakest</h2>
          <span className="aside">
            {total === 0 ? "Nothing judged yet" : `${corrected} corrected of ${total} judged`}
          </span>
        </div>

        {ranked.length === 0 ? (
          <p className="note" style={{ marginTop: 0 }}>
            Nobody has confirmed an extraction on this deployment yet, so there is nothing to
            report. That is the honest state of a system that learns from use on the day it goes
            up, and it is shown rather than hidden behind a plausible-looking chart.
          </p>
        ) : (
          <>
            <p className="note" style={{ marginTop: 0 }}>
              Read down, not across. A field corrected often is one to check against your own copy
              before confirming it, and that warning is already on the intake screen for anybody
              uploading a schedule now. What this does not do is make the reader better at its
              job: it is a hosted model nobody here fits, and the honest claim is that the system
              learns where to distrust it.
            </p>
            <ul className="rows">
              {ranked.map((f) => {
                const rate = f.corrected / f.seen;
                return (
                  <li className="row" key={f.field + "/" + f.model}>
                    <span className="row-l">
                      <span>{LABEL[f.field] ?? f.field}</span>
                      <span className="cite">
                        {f.model}
                        {f.unverified > 0 &&
                          ` · ${f.unverified} of ${f.seen} cited a quote that was not in the document`}
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
        What is stored is a count: which field, which reader, changed or not. The wording of
        anybody&rsquo;s schedule is kept only where that person ticked the box asking to keep it,
        and only for the fields they corrected. Branch choices carry no owner at all.
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
