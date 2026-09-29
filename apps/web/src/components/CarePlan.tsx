import { Fragment, useMemo, useState } from "react";
import { carePlan, fmt, type CaseInput, type Evaluated, type Payer, type SurgeryAt, type TestAt } from "@claimcast/engine";
import type { ConfirmedHealth } from "@claimcast/contracts";
import { plural, t, tx } from "../i18n";
import { short } from "./HealthReport";

/**
 * What the health report means in rupees, at the top of the path.
 *
 * One recommendation first -- the hospital where the scans and the operation
 * together cost this family least -- and then the working behind it: each scan
 * at every hospital, and the operation at every hospital, each with who pays.
 * Choosing a hospital here moves the path below to it, so the tree and the bill
 * stay the one worked example they always were.
 */
export function CarePlan({
  e,
  health,
  surgery,
  onPick,
}: {
  e: Evaluated;
  health: ConfirmedHealth;
  /** Whether the path is pricing an operation. False when the report is tests only. */
  surgery: boolean;
  onPick: (c: CaseInput) => void;
}) {
  const plan = useMemo(() => carePlan(e, health.tests, surgery), [e, health.tests, surgery]);
  const [city, setCity] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const cities = [...new Set(plan.oneStop.map((o) => o.hospital.city))].sort();
  const inCity = <T extends { hospital: { city: string } }>(xs: T[]) => (city ? xs.filter((x) => x.hospital.city === city) : xs);

  const best = inCity(plan.oneStop)[0];
  const here = plan.oneStop.find((o) => o.hospital.id === e.input.hospitalId);
  const nothing = health.tests.length === 0 && !surgery;

  return (
    <section className="care">
      <div className="care-head">
        <div>
          <div className="care-k">{t("From your health report")}</div>
          <h2 className="care-title">{health.diagnosis ?? t("Your health report")}</h2>
          <p className="care-sub">
            {[
              plural(health.tests.length, "{n} test or scan", "{n} tests or scans"),
              surgery ? e.procedure.name : t("no operation"),
            ].join(" · ")}
          </p>
        </div>
        {cities.length > 1 && (
          <label className="care-city">
            <span>{t("City")}</span>
            <select value={city} onChange={(ev) => setCity(ev.target.value)}>
              <option value="">{t("All cities")}</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {nothing && <p className="care-note">{t("Nothing on the report to price. Add tests or an operation on “Start”.")}</p>}

      {best && !nothing && (
        <div className="care-best">
          <div className="care-best-k">{t("Our recommendation")}</div>
          <div className="care-best-v">
            {surgery
              ? t("Have the scans and the operation at {h}, {c}", { h: best.hospital.name, c: best.hospital.city })
              : t("Have the tests at {h}, {c}", { h: best.hospital.name, c: best.hospital.city })}
          </div>
          <div className="care-best-pay">
            <span>{t("You pay about")}</span>
            <b>{fmt(best.total)}</b>
            {surgery && (
              <span className="care-split">
                {t("scans {a} + operation {b}", { a: fmt(best.scans), b: fmt(best.surgery ?? 0) })}
              </span>
            )}
          </div>
          {here && here.hospital.id !== best.hospital.id && surgery && (
            <p className="care-note">
              {t("At {h}, chosen on the path now, the same would cost you {x}.", { h: here.hospital.name, x: fmt(here.total) })}
            </p>
          )}
          {best.next && best.hospital.id !== e.input.hospitalId && (
            <button type="button" className="care-go" onClick={() => onPick(best.next!)}>
              {t("Show this hospital on the path")}
            </button>
          )}
        </div>
      )}

      {plan.tests.length > 0 && (
        <div className="care-block">
          <div className="care-block-head">
            <h3>{t("Tests and scans")}</h3>
            <span className="care-aside">{t("cheapest place for you, for each")}</span>
          </div>
          <div className="care-table-wrap">
            <table className="care-table">
              <thead>
                <tr>
                  <th>{t("Test")}</th>
                  <th>{t("Cheapest for you")}</th>
                  <th className="num">{t("Price, about")}</th>
                  <th className="num">{t("You pay")}</th>
                  <th>{t("Who pays")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plan.tests.map(({ test, at }) => {
                  const rows = inCity(at);
                  const top = rows[0];
                  const all = open[test.code];
                  if (!top) return null;
                  return (
                    <Fragment key={test.code}>
                      <tr>
                        <td title={test.name}>
                          <b>{short(test.name, 48)}</b>
                          <span>{t("CGHS rate {x}", { x: fmt(test.nabh) })}</span>
                        </td>
                        <td>
                          <b>{top.hospital.name}</b>
                          <span>{top.hospital.city}</span>
                        </td>
                        <td className="num">{fmt(top.price)}</td>
                        <td className="num">
                          <b>{fmt(top.youPay)}</b>
                        </td>
                        <td>{testPayer(top)}</td>
                        <td>
                          <button
                            type="button"
                            className="care-pick care-more"
                            aria-expanded={!!all}
                            onClick={() => setOpen({ ...open, [test.code]: !all })}
                          >
                            {all ? t("Hide") : t("Compare")}
                          </button>
                        </td>
                      </tr>
                      {all &&
                        rows.map((a) => (
                          <tr key={a.hospital.id} className="care-sub-row">
                            <td />
                            <td>
                              <b>{a.hospital.name}</b>
                              <span>{a.hospital.city}</span>
                            </td>
                            <td className="num">{fmt(a.price)}</td>
                            <td className="num">{fmt(a.youPay)}</td>
                            <td>{testPayer(a)}</td>
                            <td />
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {plan.surgery && (
        <div className="care-block">
          <div className="care-block-head">
            <h3>{t("The operation: {x}", { x: e.procedure.name })}</h3>
            <span className="care-aside">{t("like-for-like room at each hospital")}</span>
          </div>
          <div className="care-table-wrap">
            <table className="care-table">
              <thead>
                <tr>
                  <th>{t("Hospital")}</th>
                  <th className="num">{t("Bill")}</th>
                  <th className="num">{t("With your plan")}</th>
                  <th className="num">{t("You pay")}</th>
                  <th>{t("Who pays")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(open.__op ? inCity(plan.surgery) : inCity(plan.surgery).slice(0, 5)).map((s, i) => (
                  <tr key={s.hospital.id} className={`${i === 0 ? "best" : ""} ${s.current ? "current" : ""}`}>
                    <td>
                      <b>{s.hospital.name}</b>
                      <span>{s.hospital.city}</span>
                    </td>
                    <td className="num">{fmt(s.billTotal)}</td>
                    <td className="num">{fmt(s.withPolicy)}</td>
                    <td className="num">
                      <b>{fmt(s.youPay)}</b>
                    </td>
                    <td>{surgeryPayer(s)}</td>
                    <td>
                      {s.current ? (
                        <span className="care-on">{t("On the path")}</span>
                      ) : (
                        <button type="button" className="care-pick" onClick={() => onPick(s.next)}>
                          {t("Choose")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {inCity(plan.surgery).length > 5 && (
            <button type="button" className="wiz-link" onClick={() => setOpen({ ...open, __op: !open.__op })}>
              {open.__op ? t("Show fewer") : t("Show all {n} hospitals", { n: inCity(plan.surgery).length })}
            </button>
          )}
        </div>
      )}

      {health.medicines.length > 0 && (
        <p className="care-note">
          {e.policy.postHospDays > 0 && surgery
            ? t("Medicines after the operation are repaid by your plan for {n} days after discharge. Keep the bills.", {
                n: e.policy.postHospDays,
              })
            : t("Medicines bought outside a hospital stay are not covered by most plans. Keep the bills.")}
        </p>
      )}
      <p className="care-fine">
        {t(
          "Scan prices are estimates: about twice the government (CGHS) rate, adjusted for each hospital’s costs. Ask the hospital for its price list. ESI and CGHS need a referral from your dispensary.",
        )}
      </p>
    </section>
  );
}

function testPayer(a: TestAt): string {
  const words: Record<Payer, string> = {
    esi: t("ESI, on a referral"),
    cghs: t("CGHS, at its rate"),
    pmjay: t("PM-JAY, with the operation here"),
    policy: t("Your plan, if within {n} days before admission", { n: a.windowDays }),
    self: t("You"),
  };
  return words[a.payer];
}

function surgeryPayer(s: SurgeryAt): string {
  if (s.payer === "policy") return t("Your plan");
  if (s.payer === "self") return t("You (no insurance)");
  return tx(s.scheme?.label ?? "");
}
