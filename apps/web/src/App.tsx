import { useMemo, useState } from "react";
import { rupees, evaluate, registry, repair, stayDays, type CaseInput } from "@claimcast/engine";
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

/**
 * The reference admission from the deck: RC-2401, before it happened.
 *
 * Read back out of the reference set rather than written down here, so the app
 * opens on an admission the database actually holds. What it rebuilds is the
 * input — what the family would have known on the way in — not the settled
 * bill. The last few fields have no equivalent on a settled admission because
 * they are intake facts rather than billing ones, and they start where the
 * deck's case starts.
 */
function start(): CaseInput {
  const { admissions } = registry();
  const a = admissions.find((x) => x.ref === "RC-2401") ?? admissions[0];
  if (!a) throw new Error("The reference set has no admissions to open on.");
  return repair({
    hospitalId: a.hospitalId,
    procedureId: a.procedureId,
    policyId: a.policyId,
    roomClass: a.roomClass,
    route: a.route,
    days: stayDays(a),
    icuDays: a.lines.find((l) => l.kind === "icu")?.days ?? 0,
    siUsed: a.siUsed ?? rupees(0),
    implantId: "imported",
    admittedInpatient: true,
    age: 45,
    hasPmjayCard: false,
    govtEmployeeOrPensioner: false,
  });
}

export default function App() {
  const [tab, setTab] = useState<Tab>("start");
  const [input, setInput] = useState<CaseInput>(start);
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

      {/* Numbered, because nothing else tells a first-time viewer that these
          are a sequence — who you are, what you can still choose, the
          arithmetic behind it — rather than four unrelated views. */}
      <nav className="tabs" role="tablist">
        {TABS.map((t, i) => (
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
            <span className="tab-n" aria-hidden="true">
              {i + 1}
            </span>
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
