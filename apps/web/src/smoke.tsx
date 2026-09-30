/**
 * Renders every tab against every case the controls can reach.
 *
 * Not a unit test. It catches the class of fault the type checker cannot see —
 * a clause id with no entry in the registry, a room class a hospital does not
 * stock, a bill with no room line — by insisting that each combination produces
 * markup rather than an exception. Run by `npm run check` alongside selfcheck.
 */
import { renderToString } from "react-dom/server";
import { NO_POLICY, evaluate, familyPays, fmt, setRegistry, stayDays, type CaseInput } from "@claimcast/engine";
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
import { Profile } from "./components/Profile";
import { setLang } from "./i18n";
import { BillView } from "./components/BillView";
import { Alternatives } from "./components/Alternatives";
import { Intake } from "./components/Intake";
import { Database } from "./components/Database";
import { CarePlan } from "./components/CarePlan";
import type { ConfirmedHealth } from "@claimcast/contracts";

// A confirmed report for a broken ankle: an X-ray, an MRI, and the fixation.
const HEALTH: ConfirmedHealth = {
  filename: "ortho-note.pdf",
  diagnosis: "Bimalleolar fracture, right ankle",
  tests: [
    { code: "RI037", name: "X Ray Extremities (Hand/Leg/Feet/Finger/Toe) bones & Joints (Hip/ Knee/Ankle / shoulder/ Wrist / fingers/Toes, etc) AP & Lateral views", specialty: "Radiological Investigation", nonNabh: 32300, nabh: 38000, asWritten: "X-ray Rt ankle AP/Lat" },
    { code: "RI110", name: "MRI Ankle Single joint - Without contrast", specialty: "Radiological Investigation", nonNabh: 297500, nabh: 350000, asWritten: "MRI Rt ankle" },
  ],
  treatment: "ORIF with plating",
  procedureId: "p-ankle-orif",
  medicines: ["Tab Zerodol-SP", "Tab Pantop 40 mg"],
};

// The components render whatever registry is installed. In the running app
// that is what the API returned; here it is the hand-written set, so that
// `npm run check` stays a check rather than something needing a database up.
setRegistry({ ...FIXTURES, policies: [...FIXTURES.policies, NO_POLICY] });

const noop = () => {};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

// With no insurance, at every hospital.
for (const h of HOSPITALS)
  cases.push({ ...cases[0], hospitalId: h.id, policyId: NO_POLICY.id, roomClass: h.rooms.find((r) => r.cls !== "icu")?.cls ?? "icu", route: "reimbursement" });

// Every screen, in both languages: a translation that breaks a render fails here.
let rendered = 0;
for (const l of ["en", "hi"] as const) {
  setLang(l, false);
  renderToString(<Login onPick={noop} />);
  for (const c of cases) {
    const e = evaluate(c);
    renderToString(<Controls value={c} onChange={noop} procNil={false} onProcNil={noop} />);
    const path = renderToString(<Journey e={e} onPick={noop} />);
    renderToString(<ChatDock e={e} documentId={null} turns={[]} setTurns={noop} />);
    renderToString(<BillView e={e} />);
    // The two age groups, on every case: a child and a 72-year-old, scheme on and off.
    for (const age of [8, 72])
      for (const on of [true, false]) {
        const ec = evaluate({ ...c, age, ageScheme: on });
        const pays = familyPays(ec);
        const html = renderToString(<Journey e={ec} onPick={noop} />);
        const bill = renderToString(<BillView e={ec} />);
        if (l === "hi" && /applied by default|would cover this|Use my plan instead/.test(html)) {
          throw new Error("the age-scheme note has English left in it with Hindi selected");
        }
        // When a scheme is the actual payer, no "you pay" total anywhere on the
        // page may still show the raw policy figure -- that was the exact bug
        // reported: the headline said 0, the bottom of the tree said otherwise.
        if (pays.via && pays.amount !== ec.result.patientPays) {
          const raw = esc(fmt(ec.result.patientPays));
          if (new RegExp(`tnode-v[^>]*">${raw}<`).test(html)) {
            throw new Error("Journey's final You-pay node shows the raw policy figure while a scheme is paying");
          }
          if (new RegExp(`row-amt (loss|paid)">${raw}<`).test(bill)) {
            throw new Error("BillView's settlement total shows the raw policy figure while a scheme is paying");
          }
        }
      }
    renderToString(<Alternatives e={e} onPick={noop} />);
    for (const surgery of [true, false]) {
      const care = renderToString(<CarePlan e={e} health={HEALTH} surgery={surgery} onPick={noop} />);
      if (l === "hi" && /Our recommendation|Who pays|You pay about/.test(care)) {
        throw new Error("the health report plan has English left in it with Hindi selected");
      }
    }
    if (l === "hi" && !/[\u0900-\u097F]/.test(path)) {
      throw new Error("the path rendered with no Hindi in it with Hindi selected");
    }
    rendered++;
  }
  for (const step of [0, 1, 2, 3, 4])
    for (const health of [null, HEALTH])
    for (const procNil of [false, true]) {
      const html = renderToString(
        <Intake input={cases[0]} onChange={noop} name="" onName={noop} policyholder="Rajesh Kumar" onPolicyholder={noop} onContinue={noop} step={step} onStep={noop} illnessDate="" onIllnessDate={noop} people={{ selfAge: 40, patientName: "Sita", patientAge: 68, policyOwner: procNil ? "none" : "husband", family: [{ key: "a", relation: "son", name: "Ravi", age: 9 }] }} onPeople={noop} health={health} onHealth={noop} procNil={procNil} />,
      );
      // "None" on the path means there is no stay to price: the review must not show a bill.
      if (step === 4 && procNil && /As things stand, you pay|अभी की स्थिति में/.test(html)) {
        throw new Error("the review showed a bill with no treatment chosen");
      }
      if (step === 4 && !procNil && !/₹/.test(html)) throw new Error("the review lost its bill with a treatment chosen");
      if (l === "hi" && step === 3 && /Add your health report|Your health report|Remove report/.test(html)) {
        throw new Error("the health report step has English left in it with Hindi selected");
      }
    }
  renderToString(<Database onOpen={noop} />);
  renderToString(
    <Profile e={evaluate(cases[0])} name="Asha Rao" onName={noop} policyholder="" onPolicyholder={noop} onAge={noop} questionsNow={2} onOpen={noop} onBack={noop} onLang={noop} people={{ selfAge: 40, patientName: "Sita", patientAge: 68, policyOwner: "self", family: [] }} />,
  );
}
setLang("en", false);
console.log(`ok   ${rendered} cases rendered clean in English and Hindi, plus the database tab`);
