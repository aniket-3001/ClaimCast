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
        <h2>What ClaimCast knows</h2>
        <span className="aside">The data behind every figure the family sees</span>
      </div>
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
        No past admissions recorded yet. We do not fill this table with made-up patients &mdash;
        rows appear here only when real claims are settled. The families who used ClaimCast are
        listed above, under Saved sessions.
      </p>
    );
  }

  return (
    <>
      <p className="lede">
        {rows.length} settled {rows.length === 1 ? "admission" : "admissions"}, adjudicated
        from what this deployment holds. Open any row to carry it into the forecast.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Admission</th>
              <th>Policy</th>
              <th className="num">Bill</th>
              <th className="num">Family pays</th>
              <th className="num">Room cut</th>
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
        Room prices are per day. &ldquo;Clinical&rdquo; shows how expensive the hospital&rsquo;s
        treatment charges are compared with a big-city private hospital (1.00).
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Hospital</th>
              <th>Price tier</th>
              <th className="num">General</th>
              <th className="num">Semi-private</th>
              <th className="num">Private</th>
              <th className="num">ICU</th>
              <th className="num">Clinical</th>
              <th className="num">Refund takes</th>
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
                      {h.network.length ? `cashless with ${h.network.length} ${h.network.length === 1 ? "insurer" : "insurers"}` : "no cashless insurers"}
                      {h.pmjayEmpanelled && " · accepts Ayushman Bharat"}
                      {h.esicTieUp && " · accepts ESI"}
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
              <th>Treatment</th>
              <th>Code</th>
              <th className="num">Govt. rate (PM-JAY)</th>
              <th className="num">Govt. rate (CGHS)</th>
              <th className="num">Private hospitals</th>
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
        Sample plans with invented names, built from the limits real Indian policies use.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Plan</th>
              <th className="num">Cover</th>
              <th className="num">Room limit</th>
              <th className="num">ICU limit</th>
              <th className="num">Co-pay</th>
              <th className="num">Implant</th>
              <th>Cuts other charges</th>
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
        The insurance regulator (IRDAI) keeps four lists of items. Only the first &mdash; things no
        policy ever pays for &mdash; ends up on the family&rsquo;s bill.
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
          <h2>Items no policy pays for</h2>
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
          No choice of hospital, room or plan changes these.
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
        Every amount ClaimCast says will not be paid points to one of these rules.
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
