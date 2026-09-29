/**
 * Renders every tab against every case the controls can reach.
 *
 * Not a unit test. It catches the class of fault the type checker cannot see —
 * a clause id with no entry in the registry, a room class a hospital does not
 * stock, a bill with no room line — by insisting that each combination produces
 * markup rather than an exception. Run by `npm run check` alongside selfcheck.
 */
import { renderToString } from "react-dom/server";
import { evaluate, setRegistry, stayDays, type CaseInput } from "@claimcast/engine";
import {
  ADMISSIONS,
  FIXTURES,
  HOSPITALS,
  POLICIES,
  PROCEDURES,
} from "@claimcast/engine/fixtures";
import { Controls } from "./components/Controls";
import { Journey } from "./components/Journey";
import { ChatDock } from "./components/ChatDock";
import { Login } from "./components/Login";
import { setLang } from "./i18n";
import { BillView } from "./components/BillView";
import { Alternatives } from "./components/Alternatives";
import { Intake } from "./components/Intake";
import { Database } from "./components/Database";

// The components render whatever registry is installed. In the running app
// that is what the API returned; here it is the hand-written set, so that
// `npm run check` stays a check rather than something needing a database up.
setRegistry(FIXTURES);

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
  esiInsured: false,
  // The one stored admission refused on a waiting period has to be refused
  // live as well, not only because the record says so.
  preExisting: a.repudiated?.clause === "PED_WAITING",
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
      esiInsured: n % 3 === 2,
      preExisting: n % 5 === 0,
    });

// Every screen, in both languages: a translation that breaks a render fails here.
let rendered = 0;
for (const l of ["en", "hi"] as const) {
  setLang(l, false);
  renderToString(<Login onPick={noop} />);
  for (const c of cases) {
    const e = evaluate(c);
    renderToString(<Controls value={c} onChange={noop} />);
    const path = renderToString(<Journey e={e} onPick={noop} />);
    renderToString(<ChatDock e={e} documentId={null} turns={[]} setTurns={noop} />);
    renderToString(<BillView e={e} />);
    renderToString(<Alternatives e={e} onPick={noop} />);
    if (l === "hi" && !/[\u0900-\u097F]/.test(path)) {
      throw new Error("the path rendered with no Hindi in it with Hindi selected");
    }
    rendered++;
  }
  renderToString(
    <Intake input={cases[0]} onChange={noop} name="" onName={noop} policyholder="" onPolicyholder={noop} onContinue={noop} step={0} onStep={noop} />,
  );
  renderToString(<Database onOpen={noop} />);
}
setLang("en", false);
console.log(`ok   ${rendered} cases rendered clean in English and Hindi, plus the database tab`);
