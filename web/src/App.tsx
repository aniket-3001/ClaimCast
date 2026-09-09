import { useMemo, useState } from "react";
import { rupees } from "./lib/money";
import { evaluate, type CaseInput } from "./lib/case";
import { Controls } from "./components/Controls";
import { Forecast } from "./components/Forecast";
import { BillView } from "./components/BillView";
import { Alternatives } from "./components/Alternatives";
import { Database } from "./components/Database";

type Tab = "forecast" | "bill" | "alternatives" | "database";

const TABS: { id: Tab; label: string }[] = [
  { id: "forecast", label: "Forecast" },
  { id: "bill", label: "Bill" },
  { id: "alternatives", label: "Alternatives" },
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
};

export default function App() {
  const [tab, setTab] = useState<Tab>("forecast");
  const [input, setInput] = useState<CaseInput>(START);
  const e = useMemo(() => evaluate(input), [input]);

  const open = (c: CaseInput) => {
    setInput(c);
    setTab("forecast");
  };

  return (
    <div className="wrap">
      <header className="masthead">
        <div>
          <div className="brand">ClaimCast</div>
          <div className="brand-sub">What the policy will not pay, before the admission</div>
        </div>
        <div className="brand-sub">Prototype · synthetic data</div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab !== "database" && <Controls value={input} onChange={setInput} />}

      {tab === "forecast" && <Forecast e={e} />}
      {tab === "bill" && <BillView e={e} />}
      {tab === "alternatives" && <Alternatives e={e} onPick={setInput} />}
      {tab === "database" && <Database onOpen={open} />}

      <footer className="foot">
        <span>
          Team Rocket · IIIT-Delhi · GE HealthCare Precision Care Challenge 2026
        </span>
        <span>
          No real patient, hospital, insurer or bill appears anywhere in this prototype.
        </span>
      </footer>
    </div>
  );
}
