import { useEffect, useMemo, useState } from "react";
import { rupees, evaluate, registry, repair, type CaseInput } from "@claimcast/engine";
import { isPreExisting } from "./illness";
import { policyTravels } from "./labels";
import { EMPTY_PEOPLE, toPersons, withUids, type People } from "./people";
import { Intake } from "./components/Intake";
import { Controls } from "./components/Controls";
import { Journey } from "./components/Journey";
import { BillView } from "./components/BillView";
import { Alternatives } from "./components/Alternatives";
import { Database } from "./components/Database";
import { Learning } from "./components/Learning";
import { ChatDock, chatRecords, type Turn } from "./components/ChatDock";
import { SavedSessions } from "./components/SavedSessions";
import { Profile, initials } from "./components/Profile";
import { Login, type Role } from "./components/Login";
import { CornerControls } from "./components/ThemeToggle";
import { lang, setLang, t, type Lang } from "./i18n";
import { recordChoice, saveSession } from "./api";

type Tab = "start" | "journey" | "working" | "database" | "learning" | "profile";

/**
 * The two sides of ClaimCast. A family sees their admission; the admin sees
 * the data every figure comes from and what the system has learned from use.
 */
const TABS: Record<Role, { id: Tab; label: string }[]> = {
  user: [
    { id: "start", label: "Start" },
    { id: "journey", label: "The path" },
    { id: "working", label: "The working" },
  ],
  admin: [
    { id: "database", label: "Database" },
    { id: "learning", label: "What it has learned" },
  ],
};

const ROLE_KEY = "claimcast.role";

/** The side last chosen in this browser, so a reload does not bounce back to the login. */
function rememberedRole(): Role | null {
  try {
    const v = window.localStorage.getItem(ROLE_KEY);
    return v === "user" || v === "admin" ? v : null;
  } catch {
    return null;
  }
}

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
  const [role, setRoleState] = useState<Role | null>(rememberedRole);
  // Held here so a change of language re-renders every screen from the top;
  // the components read the language from i18n as they render.
  const [, setLangState] = useState<Lang>(lang);
  const changeLang = (l: Lang) => {
    setLang(l);
    setLangState(l);
  };
  const [tab, setTab] = useState<Tab>(() => (rememberedRole() === "admin" ? "database" : "start"));
  const [input, setInput] = useState<CaseInput>(start);
  // The uploaded policy document, once there is one. Held here rather than in
  // Intake so the chatbox on every tab can search it after Intake unmounts.
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [chatTurns, setChatTurns] = useState<Turn[]>([]);
  const [wizardStep, setWizardStep] = useState(0);
  const [illnessDate, setIllnessDate] = useState("");
  // The path's "none" option for the procedure: nothing to price until one is picked.
  const [procNil, setProcNil] = useState(false);
  const [people, setPeople] = useState<People>(EMPTY_PEOPLE);
  // One saved record per sitting: the first save creates it, later ones update it.
  const [saved, setSaved] = useState<{ id: string; at: Date } | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | string>("idle");
  const [name, setName] = useState("");
  const [policyholder, setPolicyholder] = useState("");
  const e = useMemo(() => evaluate(input), [input]);

  // The illness date decides "pre-existing", against whichever policy is chosen
  // now -- so changing the plan later, on any tab, re-checks it.
  useEffect(() => {
    const pol = registry().policies.find((p) => p.id === input.policyId);
    if (!pol) return;
    const pre = isPreExisting(illnessDate, pol);
    if (pre !== input.preExisting) setInput((cur) => ({ ...cur, preExisting: pre }));
  }, [illnessDate, input.policyId, input.preExisting]);

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
  const setRole = (r: Role | null) => {
    try {
      if (r) window.localStorage.setItem(ROLE_KEY, r);
      else window.localStorage.removeItem(ROLE_KEY);
    } catch {
      // Private window or storage blocked: the choice just lasts this page load.
    }
    setRoleState(r);
    if (r) setTab(TABS[r][0].id);
    window.scrollTo(0, 0);
  };
  // From the admin's Database: open a stored admission the way the family sees it.
  const open = (c: CaseInput) => {
    setProcNil(false);
    pick(c);
    setRoleState("user");
    try {
      window.localStorage.setItem(ROLE_KEY, "user");
    } catch {
      // As above.
    }
    setTab("journey");
    window.scrollTo(0, 0);
  };

  const saveNow = async () => {
    setSaving("saving");
    const r = await saveSession({
      ...(saved ? { id: saved.id } : {}),
      ...(name ? { name } : {}),
      ...(policyholder ? { policyholder } : {}),
      case: e.input,
      ...(policyTravels(e.policy) ? { policy: e.policy } : {}),
      ...(documentId ? { documentId } : {}),
      chat: chatRecords(chatTurns),
      people: toPersons(people, name, input.age),
    });
    if (r.ok) {
      setSaved({ id: r.id, at: new Date() });
      setPeople((p) => withUids(p, r.people));
      setSaving("idle");
    } else setSaving(r.reason);
  };

  if (!role)
    return (
      <>
        <Login onPick={setRole} />
        <CornerControls onLang={changeLang} />
      </>
    );

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand-block">
          <div className="brand">ClaimCast</div>
          <span className={`role-pill ${role}`}>
            {role === "admin"
              ? t("Team view")
              : name || policyholder
                ? t("For {name}", { name: name || policyholder })
                : t("Family view")}
          </span>
        </div>
        <div className="masthead-right">
          {role === "user" && (
            <button className="save-session" onClick={() => void saveNow()} disabled={saving === "saving"}>
              {saving === "saving"
                ? t("Saving…")
                : saved
                  ? t("Saved {time} · save again", {
                      time: saved.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
                    })
                  : t("Save my session")}
            </button>
          )}
          <button className="switch-view" onClick={() => setRole(null)}>
            {t("Switch view")}
          </button>
          {role === "user" && (
            <button
              type="button"
              className={`avatar ${tab === "profile" ? "on" : ""}`}
              aria-label={t("Your profile")}
              title={t("Your profile")}
              onClick={() => {
                setTab("profile");
                window.scrollTo(0, 0);
              }}
            >
              {initials(name || policyholder)}
            </button>
          )}
          {saving !== "idle" && saving !== "saving" && <div className="warn-line">{saving}</div>}
        </div>
      </header>

      {/* Numbered, because nothing else tells a first-time viewer that these
          are a sequence — who you are, what you can still choose, the
          arithmetic behind it — rather than four unrelated views. */}
      <nav className="tabs" role="tablist">
        {TABS[role].map((tb, i) => (
          <button
            key={tb.id}
            role="tab"
            className="tab"
            aria-selected={tab === tb.id}
            onClick={() => {
              setTab(tb.id);
              window.scrollTo(0, 0);
            }}
          >
            <span className="tab-n" aria-hidden="true">
              {i + 1}
            </span>
            {t(tb.label)}
          </button>
        ))}
      </nav>

      {(tab === "journey" || tab === "working") && (
        <Controls value={input} onChange={pick} procNil={procNil} onProcNil={setProcNil} />
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
          step={wizardStep}
          onStep={setWizardStep}
          illnessDate={illnessDate}
          onIllnessDate={setIllnessDate}
          people={people}
          onPeople={setPeople}
          onContinue={() => {
            setTab("journey");
            window.scrollTo(0, 0);
          }}
        />
      )}
      {tab === "profile" && (
        <Profile
          e={e}
          name={name}
          onName={setName}
          policyholder={policyholder}
          onPolicyholder={setPolicyholder}
          onAge={(age) => pick({ ...input, age })}
          questionsNow={chatTurns.filter((x) => x.role === "user").length}
          onOpen={open}
          onBack={() => setTab("start")}
          onLang={changeLang}
          people={people}
        />
      )}
      {procNil && (tab === "journey" || tab === "working") && (
        <div className="nil-card">
          <div className="nil-k">{t("No procedure chosen")}</div>
          <p>{t("Pick the treatment above to see what it would cost and what your insurance would pay.")}</p>
        </div>
      )}
      {!procNil && tab === "journey" && <Journey e={e} onPick={pick} />}
      {!procNil && tab === "working" && (
        <>
          <BillView e={e} />
          <Alternatives e={e} onPick={pick} />
        </>
      )}
      {tab === "database" && (
        <>
          <SavedSessions onOpen={open} />
          <Database onOpen={open} />
        </>
      )}
      {tab === "learning" && <Learning />}

      {role === "user" && !procNil && (
        <ChatDock e={e} documentId={documentId} turns={chatTurns} setTurns={setChatTurns} />
      )}

      <CornerControls onLang={changeLang} />

      <footer className="foot">
        <span>ClaimCast · Team Rocket, IIIT-Delhi · GE HealthCare Precision Care Challenge 2026</span>
        <span>{t("Demo data only. Estimates, not guarantees. Not medical advice.")}</span>
      </footer>
    </div>
  );
}
