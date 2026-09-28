import { useMemo, useState } from "react";
import Account from "./components/Account";
import { rupees, evaluate, registry, repair, type CaseInput } from "@claimcast/engine";
import { Intake } from "./components/Intake";
import { Controls } from "./components/Controls";
import { Journey } from "./components/Journey";
import { BillView } from "./components/BillView";
import { Alternatives } from "./components/Alternatives";
import { Database } from "./components/Database";
import { Learning } from "./components/Learning";
import { ChatDock } from "./components/ChatDock";
import { recordChoice } from "./api";

type Tab = "start" | "journey" | "working" | "database" | "learning";

const TABS: { id: Tab; label: string }[] = [
  { id: "start", label: "Start" },
  { id: "journey", label: "The path" },
  { id: "working", label: "The working" },
  { id: "database", label: "Database" },
  { id: "learning", label: "What it has learned" },
];

/**
 * The fields a branch click actually moves, and the only ones recorded.
 *
 * Deliberately short. Age, the PM-JAY card and central government service are
 * left out because they are facts about a person rather than choices in a tree,
 * and length of stay is left out because it is a clinical fact rather than a
 * decision anybody makes at a fork. What remains is the four the journey screen
 * actually branches on, and none of them says anything about who was clicking.
 */
const CHOICE_FIELDS = ["hospitalId", "procedureId", "roomClass", "route"] as const;

/**
 * Where the app opens: the deck's reference case, as it stood on the way in.
 *
 * Written down here rather than recovered from a settled admission, because a
 * deployment no longer ships with one. That was always a slightly strange place
 * to read these from — every field below is an intake fact, something a family
 * knows before the admission rather than after the bill, and the last five had
 * no equivalent in a settled record at all.
 *
 * The three ids are checked against the reference set rather than trusted. A
 * hospital renamed or retired in the database would otherwise open the app on a
 * combination that cannot be priced, and the first screen a judge sees is the
 * worst place to find that out.
 */
function start(): CaseInput {
  const { hospitals, procedures, policies } = registry();
  const known = <T extends { id: string }>(xs: readonly T[], want: string, what: string) => {
    if (xs.some((x) => x.id === want)) return want;
    const first = xs[0];
    if (!first) throw new Error("The reference set has no " + what + " to open on.");
    return first.id;
  };
  return repair({
    hospitalId: known(hospitals, "h-meridian", "hospitals"),
    procedureId: known(procedures, "p-spine-fusion", "procedures"),
    policyId: known(policies, "pol-classic", "policies"),
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
    esiInsured: false,
    preExisting: false,
  });
}

export default function App() {
  const [tab, setTab] = useState<Tab>("start");
  const [input, setInput] = useState<CaseInput>(start);
  // The uploaded policy document, once there is one. Held here rather than in
  // Intake so the chatbox on every tab can search it after Intake unmounts.
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [policyholder, setPolicyholder] = useState("");
  const e = useMemo(() => evaluate(input), [input]);

  // One entry point for every change, so no unreachable combination is ever
  // put on screen — a hospital that has no private room, a cashless route at a
  // hospital outside the network.
  //
  // It is also the one place every branch click passes through, which is why the
  // journey signal is recorded here rather than in the components that render
  // the forks. A component that draws a fork can forget to report it; a diff
  // taken at the single point where the case changes cannot. `repair` runs
  // first, so what is recorded is the branch the app actually took rather than
  // the one that was asked for — those differ whenever a choice is impossible
  // at the selected hospital.
  const pick = (c: CaseInput) => {
    const next = repair(c);
    for (const k of CHOICE_FIELDS) {
      if (input[k] !== next[k]) recordChoice(k, String(next[k]));
    }
    setInput(next);
  };
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
        <div className="masthead-right">
          <div className="brand-sub">
            {name || policyholder ? `For ${name || policyholder}` : "Prototype"} · synthetic data
          </div>
          <Account />
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

      {tab !== "start" && tab !== "database" && tab !== "learning" && (
        <Controls value={input} onChange={pick} />
      )}

      {tab === "start" && (
        <Intake
          input={input}
          onChange={pick}
          name={name}
          onName={setName}
          policyholder={policyholder}
          onPolicyholder={setPolicyholder}
          onDocument={setDocumentId}
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
      {tab === "learning" && <Learning />}

      <ChatDock e={e} documentId={documentId} />

      <footer className="foot">
        <span>Team Rocket · IIIT-Delhi · GE HealthCare Precision Care Challenge 2026</span>
        <span>No real patient, hospital, insurer or bill appears anywhere in this prototype.</span>
      </footer>
    </div>
  );
}
