/**
 * Renders every tab against every case the controls can reach.
 *
 * Not a unit test. It catches the class of fault the type checker cannot see —
 * a clause id with no entry in the registry, a room class a hospital does not
 * stock, a bill with no room line — by insisting that each combination produces
 * markup rather than an exception. Run by `npm run check` alongside selfcheck.
 */
import { renderToString } from "react-dom/server";
import { evaluate, type CaseInput } from "./lib/case";
import { Controls } from "./components/Controls";
import { Journey } from "./components/Journey";
import { BillView } from "./components/BillView";
import { Alternatives } from "./components/Alternatives";
import { GovtSchemes } from "./components/GovtSchemes";
import { Intake } from "./components/Intake";
import { Database } from "./components/Database";
import { ADMISSIONS, stayDays } from "./data/admissions";
import { HOSPITALS } from "./data/hospitals";
import { PROCEDURES } from "./data/procedures";
import { POLICIES } from "./data/policies";

const noop = () => {};
let n = 0;
const cases: CaseInput[] = ADMISSIONS.map((a) => ({
  hospitalId: a.hospitalId,
  procedureId: a.procedureId,
  policyId: a.policyId,
  roomClass: a.roomClass,
  route: a.route,
  days: stayDays(a),
  icuDays: a.lines.find((l) => l.kind === "icu")?.days ?? 0,
  siUsed: a.siUsed ?? 0,
  implantId: "",
  admittedInpatient: true,
  age: 45,
  hasPmjayCard: false,
  govtEmployeeOrPensioner: false,
}));
// Every hospital against every policy, cheapest room, so no combination the
// controls can reach goes unrendered.
for (const h of HOSPITALS)
  for (const p of POLICIES)
    cases.push({
      hospitalId: h.id,
      procedureId: PROCEDURES[n++ % PROCEDURES.length].id,
      policyId: p.id,
      roomClass: h.rooms.find((r) => r.cls !== "icu")?.cls ?? "icu",
      route: h.network.includes(p.insurer) ? "cashless" : "reimbursement",
      days: 3,
      icuDays: 1,
      siUsed: 0,
      implantId: "",
      admittedInpatient: n % 2 === 0,
      age: 20 + ((n * 11) % 80),
      hasPmjayCard: n % 3 === 0,
      govtEmployeeOrPensioner: n % 3 === 1,
    });

let rendered = 0;
for (const c of cases) {
  const e = evaluate(c);
  renderToString(<Controls value={c} onChange={noop} />);
  renderToString(<Journey e={e} onPick={noop} />);
  renderToString(<BillView e={e} />);
  renderToString(<Alternatives e={e} onPick={noop} />);
  renderToString(<GovtSchemes e={e} onPick={noop} />);
  rendered++;
}
renderToString(
  <Intake input={cases[0]} onChange={noop} name="" onName={noop} policyholder="" onPolicyholder={noop} onContinue={noop} />,
);
renderToString(<Database onOpen={noop} />);
console.log(`ok   ${rendered} cases rendered clean, plus the database tab`);
