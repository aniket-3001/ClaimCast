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
  registry,
} from "@claimcast/engine";

type View = "admissions" | "hospitals" | "procedures" | "policies" | "lists" | "clauses";

const VIEWS: { id: View; label: string }[] = [
  { id: "admissions", label: "Admissions" },
  { id: "hospitals", label: "Hospitals" },
  { id: "procedures", label: "Procedures" },
  { id: "policies", label: "Policies" },
  { id: "lists", label: "Non-payables" },
  { id: "clauses", label: "Clauses" },
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
  const [view, setView] = useState<View>("admissions");

  return (
    <>
      <div className="seg" style={{ marginBottom: 22 }}>
        {VIEWS.map((v) => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {view === "admissions" && <Admissions onOpen={onOpen} />}
      {view === "hospitals" && <Hospitals />}
      {view === "procedures" && <Procedures />}
      {view === "policies" && <Policies />}
      {view === "lists" && <Lists />}
      {view === "clauses" && <Clauses />}
    </>
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

  return (
    <>
      <p className="lede">
        Sixteen settled admissions, each here for what it breaks. Open any row to carry it into
        the forecast.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Ref</th>
              <th>Admission</th>
              <th>Policy</th>
              <th className="num">Bill</th>
              <th className="num">Patient</th>
              <th className="num">Ratio</th>
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
                    {hospital(a.hospitalId).name} · {ROOM_LABEL[a.roomClass].toLowerCase()} · {days}{" "}
                    {days === 1 ? "day" : "days"}
                    {icuDays > 0 && `, ${icuDays} in ICU`} · {a.route}
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
                      <span className="chip loss">refused</span>
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
        Tariffs are per day. The clinical index prices everything that is not the room against a
        metro corporate hospital at 1.00.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Hospital</th>
              <th>Band</th>
              <th className="num">General</th>
              <th className="num">Semi-private</th>
              <th className="num">Private</th>
              <th className="num">ICU</th>
              <th className="num">Clinical</th>
              <th className="num">Settles in</th>
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
                      {h.city} · {h.beds} beds ·{" "}
                      {h.network.length ? `${h.network.length} cashless tie-ups` : "no cashless tie-ups"}
                      {h.pmjayEmpanelled && " · PM-JAY empanelled"}
                    </div>
                    {h.flags?.map((f) => (
                      <div className="sub" key={f}>
                        {f}
                      </div>
                    ))}
                  </td>
                  <td>{h.tier}</td>
                  <td className="num">{at("general") ? fmt(at("general")!.perDay) : "—"}</td>
                  <td className="num">{at("semi_private") ? fmt(at("semi_private")!.perDay) : "—"}</td>
                  <td className="num">{at("private") ? fmt(at("private")!.perDay) : "—"}</td>
                  <td className="num">{at("icu") ? fmt(at("icu")!.perDay) : "—"}</td>
                  <td className="num">{h.costIndex.toFixed(2)}</td>
                  <td className="num">{h.settlementDays} d</td>
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
        Public reference rates beside the private spread. Codes follow the NHA and CGHS registries;
        values are illustrative.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Procedure</th>
              <th>Code</th>
              <th className="num">PM-JAY</th>
              <th className="num">CGHS</th>
              <th className="num">Private range</th>
              <th className="num">Stay</th>
            </tr>
          </thead>
          <tbody>
            {PROCEDURES.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name}
                  <div className="sub">
                    {p.specialty}
                    {p.dayCare && " · day-care listed"}
                    {p.usesImplant && " · implant"}
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
                  {p.medianStayDays} {p.medianStayDays === 1 ? "day" : "days"}
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
        Names are invented. Every field is one that appears on a real schedule.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Sum insured</th>
              <th className="num">Room limit</th>
              <th className="num">ICU limit</th>
              <th className="num">Co-pay</th>
              <th className="num">Implant</th>
              <th>Scales</th>
            </tr>
          </thead>
          <tbody>
            {POLICIES.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.product}
                  <div className="sub">
                    {p.insurer} · in force {p.monthsInForce} months · pre-existing wait{" "}
                    {p.pedWaitingMonths} months
                    {p.monthsInForce >= p.moratoriumMonths && " · past moratorium"}
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
                    <span className="chip loss">yes</span>
                  ) : (
                    <span className="chip paid">no</span>
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
        IRDAI keeps four lists. Only the first reaches the patient&rsquo;s bill.
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
          <h2>List I, as billed</h2>
          <span className="aside">
            {LIST_I.length} items · {fmt(listITotal())} on a five-day metro admission
          </span>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Group</th>
                <th className="num">Typical</th>
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
          The one part of the bill no policy decision can move.
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
        Every deduction names one of these. A number with no clause behind it cannot reduce a payout.
      </p>
      <ul className="rows">
        {Object.values(CLAUSES).map((c) => (
          <li className="row" key={c.id}>
            <span className="row-l">
              <span>{c.cite}</span>
              <span className="chip">{c.source}</span>
              <span className="row-why">{c.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
