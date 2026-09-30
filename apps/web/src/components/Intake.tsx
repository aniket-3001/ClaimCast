import { useState } from "react";
import {
  CHILD_UNDER,
  evaluate,
  familyPays,
  fmt,
  NO_POLICY_ID,
  parseProcedureCaps,
  pct,
  registry,
  SENIOR_FROM,
  setRegistry,
  type CaseInput,
  type Policy,
} from "@claimcast/engine";
import { AgeSchemeNote } from "./Journey";
import { POLICY_OWNERS, type ConfirmedHealth, type Extraction, type ExtractedField, type PolicyOwner, type ShakyField } from "@claimcast/contracts";
import { confirmDocument, extractPolicy } from "../api";
import { lang, plural, t } from "../i18n";
import { checkIllness, showDate, todayIso } from "../illness";
import { policyLabel } from "../labels";
import { HealthReport } from "./HealthReport";
import { newMember, patientMissing, POLICY_OWNER_LABEL, RELATION_LABEL, RELATIONS, shortId, type Member, type People, type Relation } from "../people";

/**
 * The front door, not the engine.
 *
 * Nothing typed here is adjudicated — a name is not a clause. Two things do
 * feed the rest of the app: which policy is held, and the three facts about
 * the patient that decide whether a government scheme is open to them. Both
 * are asked here because this is where a family would say them first, and
 * because they are facts rather than decisions.
 */
export function Intake({
  input,
  onChange,
  name,
  onName,
  policyholder,
  onPolicyholder,
  onDocument,
  onContinue,
  step,
  onStep,
  illnessDate,
  onIllnessDate,
  people,
  onPeople,
  health,
  onHealth,
  procNil = false,
}: {
  input: CaseInput;
  onChange: (next: CaseInput) => void;
  name: string;
  onName: (v: string) => void;
  policyholder: string;
  onPolicyholder: (v: string) => void;
  /** The uploaded document's id once it has been read, for the chatbox to search. */
  onDocument?: (documentId: string) => void;
  onContinue: () => void;
  /** Which wizard step is showing; held by the app so it survives a tab change. */
  step: number;
  onStep: (n: number) => void;
  /** When the illness began, YYYY-MM-DD or "". The app turns it into pre-existing or not. */
  illnessDate: string;
  onIllnessDate: (iso: string) => void;
  people: People;
  onPeople: (p: People) => void;
  /** The confirmed health report, or null. Optional: without one the app prices as it always did. */
  health: ConfirmedHealth | null;
  onHealth: (h: ConfirmedHealth | null) => void;
  /** "None" chosen for the treatment on the path: nothing to price, so the review shows no bill. */
  procNil?: boolean;
}) {
  const { policies: POLICIES } = registry();
  // Every PDF the family has read this sitting, each kept under its own id --
  // uploading a second policy adds a choice, it never replaces the first.
  const uploadedPolicies = POLICIES.filter((p) => p.id.startsWith("pol-uploaded"));
  const policy = POLICIES.find((p) => p.id === input.policyId)!;
  const [up, setUp] = useState<Upload>({ stage: "idle" });

  async function read(file: File) {
    setUp({ stage: "reading", filename: file.name });
    const r = await extractPolicy(file, people.patientName).catch(() => ({
      ok: false as const,
      reason: "The server is not reachable.",
    }));
    setUp(
      r.ok
        ? { stage: "read", documentId: r.documentId, extraction: r.extraction, shaky: r.shaky }
        : { stage: "refused", reason: r.reason },
    );
    if (r.ok) onDocument?.(r.documentId);
  }

  /**
   * The confirmed reading becomes the policy the engine prices with.
   *
   * This is the moment the extraction stops being a proposal, and it is on the
   * far side of the button. Before it, nothing read out of the PDF has touched a
   * figure anywhere in the app; after it, the registry the journey screen
   * adjudicates against contains this policy and not the sample one.
   */
  function adoptPolicy(p: Policy) {
    const r = registry();
    setRegistry({ ...r, policies: [...r.policies.filter((x) => x.id !== p.id), p] });
    set({ policyId: p.id });
  }
  const set = (patch: Partial<CaseInput>) => onChange({ ...input, ...patch });

  // The patient's details are required: nothing past the first step until they are in.
  const missing = patientMissing(people, policyholder);
  const [tried, setTried] = useState(false);
  const bad = (f: (typeof missing)[number]) => tried && missing.includes(f);
  const go = (n: number) => {
    const to = Math.max(0, Math.min(STEPS.length - 1, n));
    if (to > 0 && missing.length) {
      setTried(true);
      onStep(0);
      return;
    }
    onStep(to);
    window.scrollTo(0, 0);
  };
  const e = evaluate(input);
  const yesNo = (value: boolean, change: (v: boolean) => void) => (
    <div className="yn">
      <button type="button" aria-pressed={value} onClick={() => change(true)}>
        {t("Yes")}
      </button>
      <button type="button" aria-pressed={!value} onClick={() => change(false)}>
        {t("No")}
      </button>
    </div>
  );

  return (
    <div className="wizard">
      <div className="wiz-progress">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`wiz-dot ${i === step ? "on" : i < step ? "done" : ""}`}
            onClick={() => go(i)}
          >
            <span className="wiz-n">{i < step ? "✓" : i + 1}</span>
            <span className="wiz-l">{t(label)}</span>
          </button>
        ))}
      </div>
      <div className="wiz-bar">
        <div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <div className="wiz-count">{t("Step {a} of {b}", { a: step + 1, b: STEPS.length })}</div>

      {step === 0 && (
        <div className="wiz-card">
          <h1 className="wiz-q">{t("Who is the patient?")}</h1>
          <p className="wiz-hint">{t("The patient’s details are needed to price the stay. Telling us about yourself is optional.")}</p>

          <section className="wiz-part">
            <div className="wiz-part-head">
              <span>{t("The patient’s details")}</span>
              <span className="wiz-req">{t("Required")}</span>
            </div>
            <div className="wiz-pair">
              <label className={`wiz-field ${bad("name") ? "invalid" : ""}`}>
                <span>{t("Patient’s name")} *</span>
                <input
                  type="text"
                  required
                  aria-invalid={bad("name")}
                  value={people.patientName}
                  onChange={(ev) => onPeople({ ...people, patientName: ev.target.value })}
                />
              </label>
              <label className={`wiz-field ${bad("age") ? "invalid" : ""}`}>
                <span>{t("Patient’s age")} *</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  required
                  aria-invalid={bad("age")}
                  value={people.patientAge ?? ""}
                  onChange={(ev) => {
                    if (ev.target.value === "") return onPeople({ ...people, patientAge: null });
                    const age = clamp(ev.target.value, 0, 120);
                    onPeople({ ...people, patientAge: age });
                    set({ age });
                  }}
                />
              </label>
              <PersonId uid={people.patientUid} />
            </div>
            <div className="wiz-pair">
              <label className={`wiz-field ${bad("holder") ? "invalid" : ""}`}>
                <span>
                  {t("Name on the policy")}
                  {people.policyOwner === "none" ? "" : " *"}
                </span>
                <input
                  type="text"
                  disabled={people.policyOwner === "none"}
                  aria-invalid={bad("holder")}
                  placeholder={people.policyOwner === "none" ? t("Not needed") : ""}
                  value={people.policyOwner === "none" ? "" : policyholder}
                  onChange={(ev) => onPolicyholder(ev.target.value)}
                />
              </label>
              <label className={`wiz-field ${bad("owner") ? "invalid" : ""}`}>
                <span>{t("Whose policy is it?")} *</span>
                <select
                  required
                  aria-invalid={bad("owner")}
                  value={people.policyOwner ?? ""}
                  onChange={(ev) => {
                    const owner = (ev.target.value || null) as PolicyOwner | null;
                    onPeople({ ...people, policyOwner: owner });
                    // The patient's own policy is in the patient's name, unless they typed another.
                    if (owner === "self" && !policyholder.trim()) onPolicyholder(people.patientName);
                    // Not insured: the path prices it with no policy at all.
                    if (owner === "none") set({ policyId: NO_POLICY_ID });
                  }}
                >
                  <option value="">{t("Choose…")}</option>
                  {POLICY_OWNERS.map((o) => (
                    <option key={o} value={o}>
                      {t(POLICY_OWNER_LABEL[o])}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <AgeHint age={people.patientAge} />
            {tried && missing.length > 0 && (
              <p className="wiz-note bad" role="alert">
                {t("Please fill in the patient’s details marked * to continue.")}
              </p>
            )}
          </section>

          <section className="wiz-part optional">
            <div className="wiz-part-head">
              <span>{t("Register and tell us about you")}</span>
              <span className="wiz-opt">{t("Optional")}</span>
            </div>
            <div className="wiz-pair">
              <label className="wiz-field">
                <span>{t("Your name")}</span>
                <input type="text" placeholder={t("Optional")} value={name} onChange={(ev) => onName(ev.target.value)} />
              </label>
              <label className="wiz-field">
                <span>{t("Your age")}</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  placeholder={t("Optional")}
                  value={people.selfAge ?? ""}
                  onChange={(ev) => onPeople({ ...people, selfAge: ev.target.value === "" ? null : clamp(ev.target.value, 0, 120) })}
                />
              </label>
              <PersonId uid={people.selfUid} />
            </div>
            <button
              type="button"
              className="wiz-link"
              onClick={() => {
                onName(people.patientName);
                onPeople({ ...people, selfAge: people.patientAge });
              }}
            >
              {t("I am the patient")}
            </button>

            <div className="wiz-family">
              <div className="wiz-family-head">
                <span>{t("Family members")}</span>
                <button
                  type="button"
                  className="wiz-add"
                  onClick={() => onPeople({ ...people, family: [...people.family, newMember()] })}
                  aria-label={t("Add a family member")}
                >
                  + {t("Add")}
                </button>
              </div>
              {people.family.length === 0 && <p className="wiz-empty">{t("Add a husband, wife, children or parents with the + button.")}</p>}
              {people.family.map((m, i) => {
                const put = (patch: Partial<Member>) =>
                  onPeople({ ...people, family: people.family.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <div className="wiz-member" key={m.key}>
                    <select value={m.relation} onChange={(ev) => put({ relation: ev.target.value as Relation })} aria-label={t("Relation")}>
                      {RELATIONS.map((r) => (
                        <option key={r} value={r}>
                          {t(RELATION_LABEL[r])}
                        </option>
                      ))}
                    </select>
                    <input type="text" placeholder={t("Name")} value={m.name} onChange={(ev) => put({ name: ev.target.value })} />
                    <input
                      type="number"
                      min={0}
                      max={120}
                      placeholder={t("Age")}
                      value={m.age ?? ""}
                      onChange={(ev) => put({ age: ev.target.value === "" ? null : clamp(ev.target.value, 0, 120) })}
                    />
                    <button
                      type="button"
                      className="wiz-remove"
                      aria-label={t("Remove")}
                      onClick={() => onPeople({ ...people, family: people.family.filter((_, j) => j !== i) })}
                    >
                      ×
                    </button>
                    <PersonId uid={m.uid} />
                  </div>
                );
              })}
              <p className="wiz-empty">{t("Everyone gets their own ID when you press “Save my session”, so no two people are ever mixed up.")}</p>
            </div>
          </section>
        </div>
      )}

      {step === 1 && (
        <div className="wiz-card">
          <h1 className="wiz-q">{t("Which health insurance plan do you have?")}</h1>
          <label className="wiz-field">
            <span>{t("Your health insurance plan")}</span>
            <select
              value={input.policyId}
              onChange={(ev) => {
                set({ policyId: ev.target.value });
                setUp({ stage: "idle" });
              }}
            >
              {POLICIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {policyLabel(p)}
                </option>
              ))}
            </select>
          </label>
          {uploadedPolicies.length > 1 && (
            <p className="wiz-note good">
              {t("{n} policies uploaded this sitting — pick the one to price with above.", { n: uploadedPolicies.length })}
            </p>
          )}
          <p className="wiz-or">{t("or")}</p>
      <section className="section">
        <div className="section-head">
          <h2>{t("Your policy schedule")}</h2>
          <span className="aside">
            {policy.id.startsWith("pol-uploaded") ? t("Read from your PDF") : t("Sample plan for this demo")}
          </span>
        </div>

        {up.stage === "idle" && (
          <label className="tnode start" style={{ cursor: "pointer", display: "block" }}>
            <div className="tnode-k">{t("Optional")}</div>
            <div className="tnode-v" style={{ fontSize: 20 }}>
              {uploadedPolicies.length ? t("Upload another policy document (PDF)") : t("Upload your policy document (PDF)")}
            </div>
            <div className="tnode-sub">
              {t(
                "Click to choose the file. We read your limits from it for you to check. It is kept private and deleted after a few days.",
              )}
              {uploadedPolicies.length > 0 &&
                " " + t("Each family member's policy can be uploaded separately; nothing already added is lost.")}
            </div>
            <input
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={(ev) => {
                const file = ev.target.files?.[0];
                if (file) read(file);
              }}
            />
          </label>
        )}

        {up.stage === "reading" && (
          <div className="tnode start">
            <div className="tnode-k">{t("Reading {file}", { file: up.filename })}</div>
            <div className="tnode-v" style={{ fontSize: 20 }}>
              {t("Reading your policy…")}
            </div>
            <div className="tnode-sub">
              {t("Each detail comes with the exact line it was found on, so you can check it.")}
            </div>
          </div>
        )}

        {up.stage === "refused" && (
          <>
            <div className="tnode start">
              <div className="tnode-k">{t("Could not read the file")}</div>
              <div className="tnode-v" style={{ fontSize: 20 }}>
                {t("Please check your plan's details below")}
              </div>
              <div className="tnode-sub">{up.reason}</div>
            </div>
            {/* The picker above is the by-hand path, and it is a real one: these
                are the terms of the policy chosen there, not an extraction
                dressed up as one. */}
            <HandEntered policy={policy} onConfirm={() => go(2)} />
            <button type="button" className="wiz-link" onClick={() => setUp({ stage: "idle" })}>
              {t("Try a different file")}
            </button>
          </>
        )}

        {up.stage === "read" && (
          <>
            <ExtractionPanel
              extraction={up.extraction}
              fallback={policy}
              shaky={up.shaky}
              onConfirm={(p, fields, keepExamples) => {
                adoptPolicy(p);
                // Not awaited, and its failure is swallowed inside. The
                // confirmation that governs this app happened in the browser a
                // line ago; the server's note of it, and the correction it
                // carries, must not hold anybody at the door.
                void confirmDocument(up.documentId, fields, keepExamples);
                go(2);
              }}
            />
            {/* Nothing here is adopted until Confirm above is pressed, so
                leaving for another file loses nothing already chosen. */}
            <button type="button" className="wiz-link" onClick={() => setUp({ stage: "idle" })}>
              {t("Upload a different policy instead")}
            </button>
          </>
        )}
      </section>
        </div>
      )}

      {step === 2 && (
        <div className="wiz-card">
          <h1 className="wiz-q">{t("Can a government scheme help?")}</h1>
          <p className="wiz-hint">{t("These decide whether a scheme could pay for the stay instead.")}</p>
          <AgeHint age={people.patientAge ?? input.age} boxed />
          <div className="wiz-yn">
            <span>{t("Ayushman Bharat card at home?")}</span>
            {yesNo(input.hasPmjayCard, (v) => set({ hasPmjayCard: v }))}
          </div>
          <div className="wiz-yn">
            <span>{t("Central govt. employee or pensioner?")}</span>
            {yesNo(input.govtEmployeeOrPensioner, (v) => set({ govtEmployeeOrPensioner: v }))}
          </div>
          <div className="wiz-yn">
            <span>{t("Covered by ESI at work?")}</span>
            {yesNo(input.esiInsured, (v) => set({ esiInsured: v }))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wiz-card">
          <h1 className="wiz-q">{t("When did this illness begin?")}</h1>
          <p className="wiz-hint">
            {t("Policies wait a while before covering an illness you already had. We check that wait for you.")}
          </p>
          <label className="wiz-field">
            <span>{t("Date the illness began")}</span>
            <input
              type="date"
              max={todayIso()}
              value={illnessDate}
              onChange={(ev) => onIllnessDate(ev.target.value)}
            />
          </label>
          <IllnessNote iso={illnessDate} policy={policy} />
          <HealthReport
            input={input}
            health={health}
            onConfirm={onHealth}
            onRemove={() => onHealth(null)}
            illnessDate={illnessDate}
            onIllnessDate={onIllnessDate}
            onAge={(age) => set({ age })}
          />
        </div>
      )}

      {step === 4 && (
        <div className="wiz-card">
          <h1 className="wiz-q">{t("Here is where you stand")}</h1>
          {procNil ? (
            // "None" chosen for the treatment on the path: there is no stay to price, so no bill.
            <div className="wiz-result nil">
              <span className="k">{t("No treatment chosen yet")}</span>
              <span className="s">
                {health && health.tests.length
                  ? t("Your tests are priced on “The path”. Pick a treatment there to see what a stay would cost.")
                  : t("Pick the treatment on “The path” to see what you would pay.")}
              </span>
            </div>
          ) : (
            <>
              <div className="wiz-result">
                <span className="k">{t("As things stand, you pay")}</span>
                <span className="v">{fmt(familyPays(e).amount)}</span>
                <span className="s">
                  {familyPays(e).via
                    ? `${t("With your plan instead")} ${fmt(e.result.patientPays)}`
                    : `${t("Insurer pays")} ${fmt(e.result.insurerPays)}`}{" "}
                  · {t("Bill")} {fmt(e.result.billTotal)}
                </span>
              </div>
              <AgeSchemeNote e={e} onPick={onChange} />
            </>
          )}
          <ul className="wiz-review">
            {[
              [t("Patient"), `${people.patientName || "—"} · ${t("Age {n}", { n: people.patientAge ?? input.age })}`, 0],
              [
                t("Name on the policy"),
                people.policyOwner === "none"
                  ? t(POLICY_OWNER_LABEL.none)
                  : `${policyholder || "—"}${people.policyOwner ? ` (${t(POLICY_OWNER_LABEL[people.policyOwner])})` : ""}`,
                0,
              ],
              [t("Your name"), name || t("Not registered"), 0],
              [
                t("Family members"),
                people.family.length
                  ? people.family.map((m) => `${m.name || "—"} (${t(RELATION_LABEL[m.relation])})`).join(", ")
                  : t("None added"),
                0,
              ],
              [t("Your health insurance plan"), policyLabel(e.policy), 1],
              [t("Ayushman Bharat card at home?"), input.hasPmjayCard ? t("Yes") : t("No"), 2],
              [t("Central govt. employee or pensioner?"), input.govtEmployeeOrPensioner ? t("Yes") : t("No"), 2],
              [t("Covered by ESI at work?"), input.esiInsured ? t("Yes") : t("No"), 2],
              [
                t("Date the illness began"),
                illnessDate
                  ? `${showDate(new Date(illnessDate + "T00:00:00"), lang())}${input.preExisting ? " · " + t("pre-existing") : ""}`
                  : t("Not given"),
                3,
              ],
              [
                t("Health report"),
                health
                  ? [health.diagnosis ?? t("Report added"), plural(health.tests.length, "{n} test or scan", "{n} tests or scans")].join(" · ")
                  : t("Not added"),
                3,
              ],
            ].map(([k, v, s]) => (
              <li key={String(k)}>
                <span>{k}</span>
                <b>{v}</b>
                <button type="button" className="wiz-edit" onClick={() => go(Number(s))}>
                  {t("Edit")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="wiz-nav">
        {step > 0 ? (
          <button type="button" className="wiz-back" onClick={() => go(step - 1)}>
            ← {t("Back")}
          </button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className="wiz-next" onClick={() => go(step + 1)}>
            {t("Next")} →
          </button>
        ) : (
          <button type="button" className="wiz-next" onClick={onContinue}>
            {t("Estimate my bill")} →
          </button>
        )}
      </div>
    </div>
  );
}

const STEPS = ["About you", "Your insurance", "Government schemes", "Your health", "Review"];

interface HandRow {
  label: string;
  value: (p: Policy) => string | null;
  clause: string;
}

const FIELDS: HandRow[] = [
  { label: "Total cover per year", value: (p) => fmt(p.sumInsured), clause: "Schedule of Benefits" },
  {
    label: "Room rent limit",
    value: (p) =>
      p.roomCapPerDay
        ? t("{x} / day", { x: fmt(p.roomCapPerDay) })
        : p.roomCapPctOfSI
          ? t("{x} of sum insured", { x: pct(p.roomCapPctOfSI) })
          : t("No limit"),
    clause: "Clause 4.1",
  },
  {
    label: "ICU limit",
    value: (p) =>
      p.icuCapPerDay
        ? t("{x} / day", { x: fmt(p.icuCapPerDay) })
        : p.icuCapPctOfSI
          ? t("{x} of sum insured", { x: pct(p.icuCapPctOfSI) })
          : t("No limit"),
    clause: "Clause 4.2",
  },
  {
    label: "Co-payment",
    value: (p) => (p.copayPct ? pct(p.copayPct) : t("None")),
    clause: "Clause 6.1",
  },
  {
    label: "Limit on implants",
    value: (p) => (p.implantSubLimit ? fmt(p.implantSubLimit) : t("No sub-limit")),
    clause: "Clause 4.5",
  },
  {
    label: "Costs covered before / after the stay",
    value: (p) => t("{a} / {b} days", { a: p.preHospDays, b: p.postHospDays }),
    clause: "Clause 7.1",
  },
  {
    label: "Short (day-care) procedures covered",
    value: (p) => (p.dayCareCovered ? t("Yes") : t("No")),
    clause: "Clause 3.3",
  },
];

function HandEntered({ policy, onConfirm }: { policy: Policy; onConfirm: () => void }) {
  return (
    <div className="tnode fixed">
      <div className="tnode-k">{t("Your plan at a glance")}</div>
      <ul className="rows">
        {FIELDS.map((f) => {
          const v = f.value(policy);
          if (v === null) return null;
          return (
            <li className="row" key={f.label}>
              <span className="row-l">
                <span>{t(f.label)}</span>
                <span className="cite">{f.clause}</span>
              </span>
              <span className="row-amt">{v}</span>
            </li>
          );
        })}
      </ul>
      <button type="button" style={{ marginTop: 14 }} onClick={onConfirm}>
        {t("Confirm and continue")}
      </button>
    </div>
  );
}

const clamp = (raw: string, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(Number(raw) || 0)));

type Upload =
  | { stage: "idle" }
  | { stage: "reading"; filename: string }
  | { stage: "read"; documentId: string; extraction: Extraction; shaky: ShakyField[] }
  | { stage: "refused"; reason: string };

/**
 * A field's value as it travels: the same union the extraction uses.
 */
type Value = number | boolean | string | null;

/**
 * How a field is edited, which is not always how it is stored.
 *
 * Money is paise everywhere behind this screen and rupees on it, and a ratio is
 * a fraction behind it and a percentage on it. Asking somebody to confirm their
 * room rent limit by typing 500000 would be a way of guaranteeing a correction
 * that corrects nothing, so the conversion happens here and the round trip is
 * exact in both directions.
 */
type Kind = "text" | "money" | "pct" | "count" | "bool";

/** How each extracted field is named, shown and edited, in the order a schedule reads. */
const READ_ROWS: { field: ExtractedField; label: string; kind: Kind; unit?: string }[] = [
  { field: "insurer", label: "Insurer", kind: "text" },
  { field: "product", label: "Product", kind: "text" },
  { field: "sumInsured", label: "Total cover per year", kind: "money", unit: "\u20b9" },
  { field: "roomCapPerDay", label: "Room rent limit", kind: "money", unit: "\u20b9 / day" },
  { field: "roomCapPctOfSI", label: "Room limit (as % of cover)", kind: "pct", unit: "%" },
  { field: "icuCapPerDay", label: "ICU limit", kind: "money", unit: "\u20b9 / day" },
  { field: "icuCapPctOfSI", label: "ICU limit (as % of cover)", kind: "pct", unit: "%" },
  { field: "proportionateDeduction", label: "Cuts other charges if room is too costly", kind: "bool" },
  { field: "copayPct", label: "Co-payment", kind: "pct", unit: "%" },
  { field: "implantSubLimit", label: "Limit on implants", kind: "money", unit: "\u20b9" },
  { field: "preHospDays", label: "Covers costs before admission for", kind: "count", unit: "days" },
  { field: "postHospDays", label: "Covers costs after discharge for", kind: "count", unit: "days" },
  { field: "dayCareCovered", label: "Short (day-care) procedures covered", kind: "bool" },
  { field: "pedWaitingMonths", label: "Wait before old illnesses are covered", kind: "count", unit: "months" },
  { field: "moratoriumMonths", label: "After this, claims cannot be disputed", kind: "count", unit: "months" },
  { field: "exclusions", label: "Not covered", kind: "text" },
  { field: "parentCopayPct", label: "Co-payment if the patient is a dependent parent", kind: "pct", unit: "%" },
  { field: "procedureCaps", label: "Limit on the whole admission for a procedure", kind: "text" },
  { field: "nonNetworkPct", label: "Share paid outside the insurer's network", kind: "pct", unit: "%" },
];

/**
 * The stored value, in the units a person types.
 *
 * Deliberately lossless: paise divide by exactly a hundred and a fraction
 * multiplies by exactly a hundred, so a field nobody touches converts out and
 * back to the number it started as. A rounding step here would manufacture
 * corrections out of untouched fields and quietly poison every rate on the
 * learning screen -- the `toPrecision` is there for that reason, because
 * 0.1 * 100 is not 10 in binary floating point.
 */
function toDraft(kind: Kind, v: Value): string {
  if (v === null) return "";
  if (kind === "bool") return v ? "yes" : "no";
  if (kind === "money") return String(Number(v) / 100);
  if (kind === "pct") return String(Number((Number(v) * 100).toPrecision(12)));
  return String(v);
}

/** And back into the units the engine and the schema use. */
function fromDraft(kind: Kind, raw: string, was: Value): Value {
  const t = raw.trim();
  if (kind === "bool") return t === "yes";
  // An emptied field is the document saying nothing, which the engine reads as
  // "no limit" -- a real answer, and often the right one.
  if (t === "") return null;
  if (kind === "text") return t;
  const n = Number(t);
  // Mid-edit junk keeps the value it had rather than blanking the row under the
  // person's cursor. Nothing is confirmed until the button, so a half-typed
  // number is never a value anybody is committed to.
  if (!Number.isFinite(n)) return was;
  if (kind === "money") return Math.round(n * 100);
  if (kind === "pct") return n / 100;
  return Math.round(n);
}

/** Display form, for the fields that are read rather than edited. */
function show(kind: Kind, v: Value): string {
  if (v === null) return t("Not stated");
  if (kind === "bool") return v ? t("Yes") : t("No");
  if (kind === "money") return fmt(Number(v));
  if (kind === "pct") return pct(Number(v));
  return String(v);
}

/**
 * What was read, what it was read from, and whether that quote is really there.
 *
 * Three things share every row: the value, the sentence the model cited, and a
 * mark saying whether that sentence was found in the PDF's own text. The third
 * is the one that matters. A model asked to cite will occasionally produce a
 * quote that reads exactly like the document and is not in it, so the server
 * searches for each one and the answer travels here. An unfound quote is shown
 * as unfound rather than dropped, because a reader who is being asked to confirm
 * a number is entitled to know the citation behind it did not check out.
 *
 * Every row is editable, and that is not a convenience. The confirmation gate
 * is the architectural promise this application makes -- no extracted value
 * prices anything until a person has agreed to it -- and a gate whose only
 * answer is yes is not a gate. It is also the only place the system is ever
 * handed a true label on a real schedule by the one person who can see both the
 * reading and the document, which is what the correction loop is built out of.
 *
 * Nothing here has touched the engine. The button below is where that happens.
 */
function ExtractionPanel({
  extraction,
  fallback,
  shaky,
  onConfirm,
}: {
  extraction: Extraction;
  fallback: Policy;
  shaky: ShakyField[];
  onConfirm: (
    p: Policy,
    fields: Partial<Record<ExtractedField, Value>>,
    keepExamples: boolean,
  ) => void;
}) {
  // Not on a schedule, and not derivable from one: a policy renewed for eight
  // years and one bought in January carry the same period of insurance. It
  // decides whether the waiting period above has expired, so it is asked rather
  // than guessed. It starts from what the document states for this patient, where it does (a
  // certificate of continuous cover does), and is otherwise empty. Starting from a sample plan left
  // a wrong number sitting there looking as if it had been confirmed.
  const stated = extraction.fields.monthsInForce;
  const statedMonths = typeof stated?.value === "number" ? stated.value : null;
  const [months, setMonths] = useState(statedMonths !== null ? String(statedMonths) : "");
  const monthsOk = months.trim() !== "" && Number.isFinite(Number(months)) && Number(months) >= 0;

  // What the person has typed, keyed by field, and empty until they type. The
  // reading itself is never mutated: the row the server sent has to survive
  // intact to the end, because a correction is only meaningful as a difference
  // from what was actually read.
  const [draft, setDraft] = useState<Partial<Record<ExtractedField, string>>>({});

  // Off unless it is switched on, and switched on by the person whose schedule
  // it is. Consent that has to be withheld is not consent.
  const [keepExamples, setKeepExamples] = useState(false);

  const unverified = extraction.unverified.length;
  const warned = new Map(shaky.map((w) => [w.field, w]));

  // Only fields the reader actually produced. A field it said nothing about was
  // not read, and putting an empty box on screen would invite somebody to fill
  // in a term their schedule may not contain.
  const rows = READ_ROWS.filter((r) => {
    const got = extraction.fields[r.field];
    return got !== undefined && got.value !== null;
  });

  const rawOf = (f: ExtractedField, kind: Kind) =>
    draft[f] ?? toDraft(kind, extraction.fields[f]?.value ?? null);

  const confirmed: Partial<Record<ExtractedField, Value>> = {};
  for (const r of rows) {
    confirmed[r.field] = fromDraft(r.kind, rawOf(r.field, r.kind), extraction.fields[r.field]!.value);
  }

  // Compared as strings, exactly as the server compares them, so the count on
  // screen is the count that gets written down.
  const norm = (v: Value | undefined) => (v === null || v === undefined ? "" : String(v));
  const edited = rows.filter(
    (r) => norm(confirmed[r.field]) !== norm(extraction.fields[r.field]!.value),
  ).length;

  return (
    <div className="tnode fixed">
      <div className="tnode-k">{t("Please check what we read")}</div>
      <p className="note" style={{ marginTop: 0 }}>
        {t(
          "We read {pages} pages of {file}. Next to each detail is the line we found it on — change anything that looks wrong.",
          { pages: extraction.pages, file: extraction.filename },
        )}
      </p>

      {unverified > 0 && (
        <p className="warn-line">
          {plural(
            unverified,
            "{n} detail could not be matched to a line in your document. It is marked below — please check it against your copy.",
            "{n} details could not be matched to a line in your document. They are marked below — please check them against your copy.",
          )}
        </p>
      )}

      <ul className="rows">
        {rows.map((r) => {
          const got = extraction.fields[r.field]!;
          const warn = warned.get(r.field);
          const id = "x-" + r.field;
          return (
            <li className="row read-row" key={r.field}>
              <span className="row-l">
                <label htmlFor={id}>{t(r.label)}</label>
                {got.span ? (
                  <span className={got.verified ? "cite" : "cite cite-bad"}>
                    “{got.span.text}” — {t("page {n}", { n: got.span.page })}
                    {got.verified ? "" : " · " + t("please check this one")}
                  </span>
                ) : (
                  <span className="cite cite-bad">{t("not found in your document")}</span>
                )}
                {/* What the reader had said, kept on screen beside the
                    change. A person who has just overwritten a figure is owed a
                    view of what they overwrote -- and it is the difference, not
                    the new value, that is about to be recorded. */}
                {norm(confirmed[r.field]) !== norm(got.value) && (
                  <span className="cite cite-edited">
                    {t("we read {v} — you changed it", { v: show(r.kind, got.value) })}
                  </span>
                )}
                {/* The correction loop, closing. Nothing was retrained
                    between the reading that produced this count and the one on
                    screen; the count is what everybody before saw fit to
                    change, and it travels with its denominator so it can be
                    weighed rather than obeyed. */}
                {warn && (
                  <span className="cite cite-warn">
                    {t("others often correct this one ({a} of {b} times) — worth a second look", {
                      a: warn.corrected,
                      b: warn.seen,
                    })}
                  </span>
                )}
              </span>
              <span className="row-edit">
                {r.kind === "bool" ? (
                  <select
                    id={id}
                    value={rawOf(r.field, r.kind)}
                    onChange={(ev) => setDraft({ ...draft, [r.field]: ev.target.value })}
                  >
                    <option value="yes">{t("Yes")}</option>
                    <option value="no">{t("No")}</option>
                  </select>
                ) : (
                  <input
                    id={id}
                    type={r.kind === "text" ? "text" : "number"}
                    inputMode={r.kind === "text" ? undefined : "decimal"}
                    value={rawOf(r.field, r.kind)}
                    onChange={(ev) => setDraft({ ...draft, [r.field]: ev.target.value })}
                  />
                )}
                {r.unit && <span className="unit">{t(r.unit)}</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="given narrow" style={{ marginTop: 14 }}>
        <label htmlFor="i-months">{t("How many months you have had this cover")}</label>
        <input
          id="i-months"
          type="number"
          min={0}
          max={600}
          value={months}
          onChange={(ev) => setMonths(ev.target.value)}
        />
      </div>
      {statedMonths !== null && stated?.span && months === String(statedMonths) ? (
        <p className="note" style={{ marginTop: 6 }}>
          {t("Read from your document")}: {"“"}
          {stated.span.text}
          {"”"} {"—"} {t("page {n}", { n: stated.span.page })}
        </p>
      ) : (
        <p className={monthsOk ? "note" : "warn-line"} style={{ marginTop: 6 }}>
          {monthsOk
            ? t(
                "Your document shows this year's dates, not how long you have been insured without a break. Waiting periods depend on it, so please tell us.",
              )
            : t("Type how many months you have had this cover to continue.")}
        </p>
      )}

      {/* Asked here rather than in a settings screen nobody opens, and asked
          about one specific thing rather than as a blanket permission. What is
          being requested is narrow enough to describe in a sentence, which is
          the test of whether it should be requested at all. */}
      <label className="consent">
        <input
          type="checkbox"
          checked={keepExamples}
          onChange={(ev) => setKeepExamples(ev.target.checked)}
        />
        <span>
          {t(
            "Help ClaimCast improve: keep the lines I corrected as examples. Only the details you changed are kept.",
          )}
        </span>
      </label>
      <p className="note" style={{ marginTop: 6 }}>
        {t(
          "Leave it unticked and nothing from your document is kept — only a count of which details needed fixing, with nothing about you.",
        )}
      </p>

      <button
        type="button"
        style={{ marginTop: 14 }}
        disabled={!monthsOk}
        onClick={() =>
          onConfirm(
            asPolicy(confirmed, extraction, fallback, clamp(months, 0, 600)),
            confirmed,
            keepExamples,
          )
        }
      >
        {edited === 0
          ? t("Confirm and continue")
          : plural(edited, "Correct {n} field and continue", "Correct {n} fields and continue")}
      </button>
    </div>
  );
}

/**
 * The confirmed reading, as the policy the engine will price with.
 *
 * Where the document said nothing, the field is null and the engine treats it as
 * the absence of that limit — which is what a schedule that does not mention a
 * co-pay means. The one exception is the two fields a claim cannot be
 * adjudicated without: if the document did not give a sum insured or a waiting
 * period, the sample policy's value stands in, and it is visible on screen that
 * it did.
 */
function asPolicy(
  /**
   * What the person settled on, not what the reader proposed. The extraction is
   * still passed in, but only for the provenance line: the figures below come
   * from the panel, because the panel is where a human looked at them.
   */
  confirmed: Partial<Record<ExtractedField, Value>>,
  e: Extraction,
  fallback: Policy,
  monthsInForce: number,
): Policy {
  const num = (f: ExtractedField): number | null => {
    const v = confirmed[f];
    return typeof v === "number" ? v : null;
  };
  const str = (f: ExtractedField, or: string): string => {
    const v = confirmed[f];
    return typeof v === "string" && v.trim() ? v : or;
  };
  const bool = (f: ExtractedField, or: boolean): boolean => {
    const v = confirmed[f];
    return typeof v === "boolean" ? v : or;
  };

  return {
    ...fallback,
    // Each upload gets its own id, from the document it was read from, so a
    // second policy adds to the family's choices instead of replacing the
    // first -- adoptPolicy() below only ever overwrites an id it already saw.
    id: `pol-uploaded-${e.documentId}`,
    insurer: str("insurer", fallback.insurer),
    product: str("product", fallback.product),
    sumInsured: num("sumInsured") ?? fallback.sumInsured,
    roomCapPerDay: num("roomCapPerDay"),
    roomCapPctOfSI: num("roomCapPctOfSI"),
    icuCapPerDay: num("icuCapPerDay"),
    icuCapPctOfSI: num("icuCapPctOfSI"),
    proportionateDeduction: bool("proportionateDeduction", false),
    copayPct: num("copayPct") ?? 0,
    implantSubLimit: num("implantSubLimit"),
    preHospDays: num("preHospDays") ?? 0,
    postHospDays: num("postHospDays") ?? 0,
    dayCareCovered: bool("dayCareCovered", false),
    monthsInForce,
    pedWaitingMonths: num("pedWaitingMonths") ?? fallback.pedWaitingMonths,
    moratoriumMonths: num("moratoriumMonths") ?? fallback.moratoriumMonths,
    exclusions: str("exclusions", "") || null,
    // Both come off the wording itself and are confirmed on the same screen as the rest. The caps are
    // typed as lines a person can read and correct, and turned into limits here; a share outside
    // 0 to 100 is discarded rather than trusted, since it would pay more than the bill or nothing.
    parentCopayPct: (() => {
      const v = num("parentCopayPct");
      return v !== null && v >= 0 && v <= 1 ? v : null;
    })(),
    procedureCaps: parseProcedureCaps(str("procedureCaps", ""), registry().procedures),
    nonNetworkPct: (() => {
      const v = num("nonNetworkPct");
      return v !== null && v > 0 && v <= 1 ? v : null;
    })(),
    notes: `Read from ${e.filename} on ${e.extractedAt.slice(0, 10)} and confirmed field by field.`,
  };
}

/** What the illness date means under this policy, said plainly. */
function IllnessNote({ iso, policy }: { iso: string; policy: Policy }) {
  const c = checkIllness(iso, policy);
  const l = lang();
  if (c.kind === "none")
    return <p className="wiz-note">{t("Leave it blank if there is no illness you already had. You can come back and add it.")}</p>;
  if (c.kind === "future") return <p className="wiz-note bad">{t("That date is in the future. Please pick the day the illness began.")}</p>;
  if (c.kind === "after-start")
    return (
      <p className="wiz-note good">
        {t("Your policy started around {start}. This illness began after that, so it is covered like any new illness.", {
          start: showDate(c.start, l),
        })}
      </p>
    );
  return (
    <p className={`wiz-note ${c.waitOver ? "good" : "bad"}`}>
      {t("Your policy started around {start}. This illness began before that, so it counts as pre-existing.", {
        start: showDate(c.start, l),
      })}{" "}
      {c.waitOver
        ? t("The {n}-month wait ended on {date}, so it is now covered.", {
            n: policy.pedWaitingMonths,
            date: showDate(c.coveredFrom, l),
          })
        : t("It is covered only from {date} — about {m} more months. Until then this admission would be refused.", {
            date: showDate(c.coveredFrom, l),
            m: c.monthsLeft,
          })}
    </p>
  );
}

/** A person's UUID, shortened, once the server has given one. */
function PersonId({ uid }: { uid?: string }) {
  if (!uid) return null;
  return (
    <span className="person-id" title={uid}>
      ID {shortId(uid)}
    </span>
  );
}

/**
 * What the patient's age turns on, said as soon as it is typed: the only two
 * age groups a government scheme covers on age alone.
 */
function AgeHint({ age, boxed = false }: { age: number | null; boxed?: boolean }) {
  if (age === null) return null;
  const text =
    age < CHILD_UNDER
      ? t("Under 18: RBSK is checked by default. It treats listed childhood conditions free at government and empanelled hospitals.")
      : age >= SENIOR_FROM
        ? t("70 and above: Ayushman Vay Vandana is applied by default. It covers up to ₹5 lakh a year, cashless, at PM-JAY hospitals.")
        : null;
  if (!text) return null;
  return <p className={boxed ? "wiz-note good" : "wiz-age-hint"}>{text}</p>;
}
