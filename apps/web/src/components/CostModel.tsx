/**
 * The cost model on screen: where the band came from, and what is wrong with it.
 *
 * The model is the one part of this app that estimates rather than computes, and
 * it is the part a judge is most entitled to be sceptical of. So it does not
 * appear as a range with no provenance. It appears with the government tariff it
 * is anchored on, the code that rate is published under, the version of the
 * artifact that produced it, and every caveat the model itself attached.
 *
 * **Caveats are rendered, not logged.** The service returns them in the response
 * because it knows things about its own estimate that the estimate cannot carry:
 * that the band is a spread between stratum means rather than between bills, that
 * a city tier is not the survey's rural/urban split, that an implant is priced at
 * the midpoint of two published options. Keeping those in the model and out of
 * the screen would be the dishonest thing to do with them.
 *
 * **The band is fetched, the price is not.** Branch clicks re-adjudicate locally
 * and instantly; this request goes out alongside and the band widens or narrows a
 * moment later. Nothing on the page waits for it, and until it lands the screen
 * says the spread is the simulated one.
 */

import { useEffect, useState } from "react";
import { fmt, type Evaluated } from "@claimcast/engine";
import type { ForecastResponse } from "@claimcast/contracts";
import { getForecast } from "../api";

export type ModelState =
  | { status: "loading" }
  | { status: "ok"; forecast: ForecastResponse }
  | { status: "none"; reason: string };

/** The band as multiples of the centre, or nothing while it is in flight. */
export function bandOf(m: ModelState): { low: number; high: number } | undefined {
  if (m.status !== "ok") return undefined;
  const { p10, p50, p90 } = m.forecast;
  if (p50 <= 0) return undefined;
  return { low: p10 / p50, high: p90 / p50 };
}

export function useCostModel(e: Evaluated): ModelState {
  const [state, setState] = useState<ModelState>({ status: "loading" });

  const req = {
    procedureId: e.procedure.id,
    cityTier: e.hospital.tier,
    // Accreditation is not on the hospital record and every CGHS rate in the
    // reference set is quoted at NABH, so the anchor is read there. The panel
    // says so rather than letting the reader assume it was chosen for them.
    nabh: true,
    roomClass: e.input.roomClass,
    days: e.input.days,
    icuDays: e.input.icuDays,
  };
  const key = JSON.stringify(req);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    getForecast(JSON.parse(key))
      .then((r) => {
        if (!live) return;
        setState(r.ok ? { status: "ok", forecast: r.forecast } : { status: "none", reason: r.reason });
      })
      .catch(() => {
        if (live) setState({ status: "none", reason: "The cost model is not reachable." });
      });
    return () => {
      live = false;
    };
  }, [key]);

  return state;
}

export function CostModelNote({ m }: { m: ModelState }) {
  if (m.status === "loading") {
    return <div className="model model-quiet">Asking the cost model for this admission…</div>;
  }

  if (m.status === "none") {
    return (
      <div className="model model-quiet">
        <span className="model-k">No modelled band</span>
        <p className="model-why">{m.reason}</p>
        <p className="model-why">
          The range above is the simulated private spread the reference set carries, which slide 5
          declares as simulated. Nothing has been invented to fill the gap.
        </p>
      </div>
    );
  }

  const f = m.forecast;
  return (
    <div className="model">
      <div className="model-h">
        <span className="model-k">What the whole bill is likely to be</span>
        <span className="cite">
          {f.modelVersion} · trained {f.trainedOn}
        </span>
      </div>

      <div className="model-band">
        <span className="model-edge">{fmt(f.p10)}</span>
        <span className="model-mid">{fmt(f.p50)}</span>
        <span className="model-edge">{fmt(f.p90)}</span>
      </div>
      <div className="model-band-k">
        <span>tenth percentile</span>
        <span>median</span>
        <span>ninetieth</span>
      </div>

      <div className="model-anchor">
        Anchored on the {f.anchor.scheme} rate of <strong>{fmt(f.anchor.amount)}</strong> —{" "}
        <span className="cite">{f.anchor.code}</span>, {f.anchor.detail}. Accreditation is not on the
        hospital record, so the rate is read at NABH.
      </div>

      <ul className="model-split">
        {SPLIT_LABEL.map(([kind, label]) => {
          // The contract types the split as a partial record over LineKind, so a kind
          // the model did not price is absent rather than zero. Both mean the same
          // thing here: nothing to show on that line.
          const amount = f.split[kind] ?? 0;
          return amount > 0 ? (
            <li key={kind}>
              <span className="k">{label}</span>
              <span className="v">{fmt(amount)}</span>
            </li>
          ) : null;
        })}
      </ul>

      <details className="model-caveats">
        <summary>
          What is wrong with this estimate <span className="chip warn">{f.caveats.length}</span>
        </summary>
        <p className="model-basis">{f.basis}</p>
        <ul>
          {f.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/**
 * The kinds worth naming, in the order a bill is read. `outside_window` and
 * `non_payable` are missing on purpose: the model never predicts them, because
 * whether a line falls outside the policy window or appears in List I is the
 * engine's to decide from the wording, not a property of what a hospital charges.
 */
const SPLIT_LABEL: [keyof ForecastResponse["split"], string][] = [
  ["room", "Room and board"],
  ["icu", "Intensive care"],
  ["associated", "Associated medical expenses"],
  ["independent", "Pharmacy, consumables and diagnostics"],
  ["implant", "Implant"],
];
