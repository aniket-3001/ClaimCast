import { useMemo, useState } from "react";
import {
  fmt,
  pct,
  adjudicate,
  ROOM_LABEL,
  type CaseInput,
  hospital,
  procedure,
  policy,
  stayDays,
  listITotal,
  registry, isNoPolicy } from "@claimcast/engine";
import { plural, t, tx } from "../i18n";

type View = "admissions" | "hospitals" | "procedures" | "policies" | "lists" | "clauses";

const VIEWS: { id: View; label: string }[] = [
  { id: "hospitals", label: "Hospitals" },
  { id: "procedures", label: "Treatments" },
  { id: "policies", label: "Insurance plans" },
  { id: "lists", label: "Never covered" },
  { id: "clauses", label: "Rules" },
  { id: "admissions", label: "Past admissions" },
];

/**
 * What the system already knows.
 *
 * Six tables and nothing hidden behind them: the settled admissions a forecast
 * is checked against, the tariffs and package rates the bill is assembled from,
 * the policy structures the arithmetic runs on, and the clause registry every
 * deduction has to cite. All of it synthetic.
 */
export function Database({ onOpen }: { onOpen: (c: CaseInput) => void }) {
  const [view, setView] = useState<View>("hospitals");

  return (
    <section className="section">
      <div className="section-head">
        <h2>{t("What ClaimCast knows")}</h2>
        <span className="aside">{t("The data behind every figure the family sees")}</span>
      </div>
      <div className="seg" style={{ marginBottom: 22 }}>
        {VIEWS.map((v) => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
            {t(v.label)}
          </button>
        ))}
      </div>

      {view === "admissions" && <Admissions onOpen={onOpen} />}
      {view === "hospitals" && <Hospitals />}
      {view === "procedures" && <Procedures />}
      {view === "policies" && <Policies />}
      {view === "lists" && <Lists />}
      {view === "clauses" && <Clauses />}
    </section>
  );
}

function Admissions({ onOpen }: { onOpen: (c: CaseInput) => void }) {
  const { admissions: ADMISSIONS } = registry();
  const rows = useMemo(
    () =>
      ADMISSIONS.map((a) => {
        const res = adjudicate({
          lines: a.lines,
          policy: policy(a.policyId),
          siUsed: a.siUsed,
          repudiated: a.repudiated ?? null,
        });
        const icuDays = a.lines.find((l) => l.kind === "icu")?.days ?? 0;
        return { a, res, icuDays, days: stayDays(a) };
      }),
    [],
  );

  if (rows.length === 0) {
    return (
      <p className="lede">
        {t(
          "No past admissions recorded yet. We do not fill this table with made-up patients — rows appear here only when real claims are settled. The families who used ClaimCast are listed above, under Saved sessions.",
        )}
      </p>
    );
  }

  return (
    <>
      <p className="lede">
        {t("{n} settled admissions from this deployment. Open any row to see it as the family would.", {
          n: rows.length,
        })}
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>{t("No.")}</th>
              <th>{t("Admission")}</th>
              <th>{t("Policy")}</th>
              <th className="num">{t("Bill")}</th>
              <th className="num">{t("Family pays")}</th>
              <th className="num">{t("Room cut")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, res, icuDays, days }) => (
              <tr
                className="pick"
                key={a.id}
                onClick={() =>
                  onOpen({
                    hospitalId: a.hospitalId,
                    procedureId: a.procedureId,
                    policyId: a.policyId,
                    roomClass: a.roomClass,
                    route: a.route,
                    days,
                    icuDays,
                    siUsed: a.siUsed ?? 0,
                    implantId: "",
                    admittedInpatient: true,
                    age: 45,
                    hasPmjayCard: false,
                    govtEmployeeOrPensioner: false,
                    esiInsured: false,
                    preExisting: false,
                  })
                }
              >
                <td>
                  <span className="cite">{a.ref}</span>
                  <div className="sub">{a.date}</div>
                </td>
                <td>
                  {procedure(a.procedureId).name}
                  <div className="sub">
                    {hospital(a.hospitalId).name} · {tx(ROOM_LABEL[a.roomClass].toLowerCase())} ·{" "}
                    {plural(days, "{n} day", "{n} days")}
                    {icuDays > 0 && t(", {n} in ICU", { n: icuDays })} · {tx(a.route)}
                  </div>
                  {a.edgeCase && <div className="sub">{a.edgeCase}</div>}
                </td>
                <td>
                  {policy(a.policyId).product}
                  <div className="sub">{policy(a.policyId).insurer}</div>
                </td>
                <td className="num">{fmt(res.billTotal)}</td>
                <td className="num" style={{ color: "var(--loss)" }}>
                  {fmt(res.patientPays)}
                  {res.repudiated && (
                    <div className="sub">
                      <span className="chip loss">{t("refused")}</span>
                    </div>
                  )}
                </td>
                <td className="num">{res.roomRatio === 1 ? "—" : res.roomRatio.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Hospitals() {
  const { hospitals: HOSPITALS } = registry();
  return (
    <>
      <p className="lede">
        {t(
          "Room prices are per day. “Clinical” shows how expensive the hospital’s treatment charges are compared with a big-city private hospital (1.00).",
        )}
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Hospital")}</th>
              <th>{t("Price tier")}</th>
              <th className="num">{t("General")}</th>
              <th className="num">{t("Semi-private")}</th>
              <th className="num">{t("Private")}</th>
              <th className="num">{t("ICU")}</th>
              <th className="num">{t("Clinical")}</th>
              <th className="num">{t("Refund takes")}</th>
            </tr>
          </thead>
          <tbody>
            {HOSPITALS.map((h) => {
              const at = (c: string) => h.rooms.find((r) => r.cls === c);
              return (
                <tr key={h.id}>
                  <td>
                    {h.name}
                    <div className="sub">
                      {h.city} · {t("{n} beds", { n: h.beds })} ·{" "}
                      {h.network.length
                        ? plural(h.network.length, "cashless with {n} insurer", "cashless with {n} insurers")
                        : t("no cashless insurers")}
                      {h.pmjayEmpanelled && " · " + t("accepts Ayushman Bharat")}
                      {h.esicTieUp && " · " + t("accepts ESI")}
                    </div>
                    {h.flags?.map((f) => (
                      <div className="sub" key={f}>
                        {tx(f)}
                      </div>
                    ))}
                  </td>
                  <td>{h.tier}</td>
                  <td className="num">{at("general") ? fmt(at("general")!.perDay) : "—"}</td>
                  <td className="num">{at("semi_private") ? fmt(at("semi_private")!.perDay) : "—"}</td>
                  <td className="num">{at("private") ? fmt(at("private")!.perDay) : "—"}</td>
                  <td className="num">{at("icu") ? fmt(at("icu")!.perDay) : "—"}</td>
                  <td className="num">{h.costIndex.toFixed(2)}</td>
                  <td className="num">{t("{n} d", { n: h.settlementDays })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Procedures() {
  const { procedures: PROCEDURES } = registry();
  return (
    <>
      <p className="lede">
        {t(
          "Public reference rates beside the private spread. Codes follow the NHA and CGHS registries; values are illustrative.",
        )}
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Treatment")}</th>
              <th>{t("Code")}</th>
              <th className="num">{t("Govt. rate (PM-JAY)")}</th>
              <th className="num">{t("Govt. rate (CGHS)")}</th>
              <th className="num">{t("Private hospitals")}</th>
              <th className="num">{t("Stay")}</th>
            </tr>
          </thead>
          <tbody>
            {PROCEDURES.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name}
                  <div className="sub">
                    {p.specialty}
                    {p.dayCare && " · " + t("day-care listed")}
                    {p.usesImplant && " · " + t("implant")}
                  </div>
                </td>
                <td>
                  <span className="cite">{p.hbpCode ?? "—"}</span>
                </td>
                <td className="num">{p.pmjayRate ? fmt(p.pmjayRate) : "—"}</td>
                <td className="num">{p.cghsRate ? fmt(p.cghsRate) : "—"}</td>
                <td className="num">
                  {fmt(p.privateLow)} – {fmt(p.privateHigh)}
                </td>
                <td className="num">
                  {plural(p.medianStayDays, "{n} day", "{n} days")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Policies() {
  const { policies: POLICIES } = registry();
  return (
    <>
      <p className="lede">
        {t("Sample plans with invented names, built from the limits real Indian policies use.")}
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Plan")}</th>
              <th className="num">{t("Cover")}</th>
              <th className="num">{t("Room limit")}</th>
              <th className="num">{t("ICU limit")}</th>
              <th className="num">{t("Co-pay")}</th>
              <th className="num">{t("Implant")}</th>
              <th>{t("Cuts other charges")}</th>
            </tr>
          </thead>
          <tbody>
            {POLICIES.filter((p) => !isNoPolicy(p)).map((p) => (
              <tr key={p.id}>
                <td>
                  {p.product}
                  <div className="sub">
                    {p.insurer} ·{" "}
                    {t("in force {a} months · pre-existing wait {b} months", {
                      a: p.monthsInForce,
                      b: p.pedWaitingMonths,
                    })}
                    {p.monthsInForce >= p.moratoriumMonths && " · " + t("past moratorium")}
                  </div>
                  {p.notes && <div className="sub">{p.notes}</div>}
                </td>
                <td className="num">{fmt(p.sumInsured)}</td>
                <td className="num">{cap(p.roomCapPerDay, p.roomCapPctOfSI)}</td>
                <td className="num">{cap(p.icuCapPerDay, p.icuCapPctOfSI)}</td>
                <td className="num">{p.copayPct ? pct(p.copayPct) : "—"}</td>
                <td className="num">{p.implantSubLimit ? fmt(p.implantSubLimit) : "—"}</td>
                <td>
                  {p.proportionateDeduction ? (
                    <span className="chip loss">{t("yes")}</span>
                  ) : (
                    <span className="chip paid">{t("no")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const cap = (abs: number | null, pctOfSI: number | null) => {
  const parts: string[] = [];
  if (pctOfSI !== null) parts.push(pct(pctOfSI));
  if (abs !== null) parts.push(fmt(abs));
  return parts.length ? parts.join(" / ") : "none";
};

function Lists() {
  const { listI: LIST_I, listFramework: LIST_FRAMEWORK } = registry();
  return (
    <>
      <p className="lede">
        {t(
          "The insurance regulator (IRDAI) keeps four lists of items. Only the first — things no policy ever pays for — ends up on the family’s bill.",
        )}
      </p>
      <ul className="rows">
        {LIST_FRAMEWORK.map((l) => (
          <li className="row" key={l.id}>
            <span className="row-l">
              <span>{l.title}</span>
              <span className="row-why">{l.effect}</span>
            </span>
          </li>
        ))}
      </ul>

      <section className="section">
        <div className="section-head">
          <h2>{t("Items no policy pays for")}</h2>
          <span className="aside">
            {t("{n} items · {x} on a five-day metro admission", { n: LIST_I.length, x: fmt(listITotal()) })}
          </span>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Item")}</th>
                <th>{t("Group")}</th>
                <th className="num">{t("Typical")}</th>
              </tr>
            </thead>
            <tbody>
              {LIST_I.map((i) => (
                <tr key={i.item}>
                  <td>{i.item}</td>
                  <td>
                    <span className="chip">{i.group}</span>
                  </td>
                  <td className="num">{i.typical ? fmt(i.typical) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          {t("No choice of hospital, room or plan changes these.")}
        </p>
      </section>
    </>
  );
}

function Clauses() {
  const { clauses: CLAUSES } = registry();
  return (
    <>
      <p className="lede">
        {t("Every amount ClaimCast says will not be paid points to one of these rules.")}
      </p>
      <ul className="rows">
        {Object.values(CLAUSES).map((c) => (
          <li className="row" key={c.id}>
            <span className="row-l">
              <span>{tx(c.cite)}</span>
              <span className="chip">{c.source}</span>
              <span className="row-why">{c.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
