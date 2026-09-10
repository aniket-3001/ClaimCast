import { useMemo, useState } from "react";
import { rupees } from "./lib/money";
import { evaluate, repair, type CaseInput } from "./lib/case";
import { Intake } from "./components/Intake";
import { Controls } from "./components/Controls";
import { Journey } from "./components/Journey";
import { BillView } from "./components/BillView";
import { Alternatives } from "./components/Alternatives";
import { Database } from "./components/Database";

type Tab = "start" | "journey" | "working" | "database";

const TABS: { id: Tab; label: string }[] = [
  { id: "start", label: "Start" },
  { id: "journey", label: "The path" },
  { id: "working", label: "The working" },
  { id: "database", label: "Database" },
];

/** The reference admission from the deck: RC-2401, before it happened. */
const START: CaseInput = {
  hospitalId: "h-meridian",
  procedureId: "p-spine-fusion",
  policyId: "pol-classic",
  roomClass: "private",
  route: "cashless",
  days: 5,
  icuDays: 0,
  siUsed: rupees(0),
  implantId: "imported",
  admittedInpatient: true,
  age: 45,
  hasPmjayCard: false,
  govtEmployeeOrPensioner: false,
};

export default function App() {
  const [tab, setTab] = useState<Tab>("start");
  const [input, setInput] = useState<CaseInput>(repair(START));
  const [name, setName] = useState("");
  const [policyholder, setPolicyholder] = useState("");
  const e = useMemo(() => evaluate(input), [input]);

  // One entry point for every change, so no unreachable combination is ever
  // put on screen — a hospital that has no private room, a cashless route at a
  // hospital outside the network.
  const pick = (c: CaseInput) => setInput(repair(c));
  const open = (c: CaseInput) => {
    pick(c);
    setTab("journey");
    window.scrollTo(0, 0);
  };

  return (
    <div className="wrap">
      <header className="masthead">
        <div>
          <div className="brand">ClaimCast</div>
          <div className="brand-sub">What the policy will not pay, before the admission</div>
        </div>
        <div className="brand-sub">
          {name || policyholder ? `For ${name || policyholder}` : "Prototype"} · synthetic data
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              window.scrollTo(0, 0);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab !== "start" && tab !== "database" && <Controls value={input} onChange={pick} />}

      {tab === "start" && (
        <Intake
          input={input}
          onChange={pick}
          name={name}
          onName={setName}
          policyholder={policyholder}
          onPolicyholder={setPolicyholder}
          onContinue={() => {
            setTab("journey");
            window.scrollTo(0, 0);
          }}
        />
      )}
      {tab === "journey" && <Journey e={e} onPick={pick} />}
      {tab === "working" && (
        <>
          <BillView e={e} />
          <Alternatives e={e} onPick={pick} />
        </>
      )}
      {tab === "database" && <Database onOpen={open} />}

      <footer className="foot">
        <span>Team Rocket · IIIT-Delhi · GE HealthCare Precision Care Challenge 2026</span>
        <span>No real patient, hospital, insurer or bill appears anywhere in this prototype.</span>
      </footer>
    </div>
  );
}
