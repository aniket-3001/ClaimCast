import { useEffect, useState } from "react";
import type { SavedSessionDetail } from "@claimcast/contracts";
import { fmt, isNoPolicy, registry, setRegistry, type CaseInput, type Evaluated } from "@claimcast/engine";
import { mySessions } from "../api";
import { policyShort } from "../labels";
import { plural, t, tx, type Lang } from "../i18n";
import Account from "./Account";
import { LangToggle, ThemeToggle } from "./ThemeToggle";

/**
 * The family's own page: who they are, their plan, every hospital stay they
 * saved from this browser, and their preferences. Opened from the round
 * initials button at the top right of the user side.
 */
export function Profile({
  e,
  name,
  onName,
  policyholder,
  onPolicyholder,
  onAge,
  questionsNow,
  onOpen,
  onBack,
  onLang,
}: {
  e: Evaluated;
  name: string;
  onName: (v: string) => void;
  policyholder: string;
  onPolicyholder: (v: string) => void;
  onAge: (age: number) => void;
  /** Questions asked in this sitting, not yet saved. */
  questionsNow: number;
  onOpen: (c: CaseInput) => void;
  onBack: () => void;
  onLang: (l: Lang) => void;
}) {
  const [stays, setStays] = useState<SavedSessionDetail[] | null | "loading">("loading");
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    void mySessions().then(setStays);
  }, []);

  const list = Array.isArray(stays) ? stays : [];
  const asked = list.reduce((n, s) => n + s.chatTurns, 0) + questionsNow;

  const reopen = (d: SavedSessionDetail) => {
    if (d.policy) {
      const r = registry();
      setRegistry({ ...r, policies: [...r.policies.filter((p) => p.id !== d.policy!.id), d.policy] });
    }
    if (d.name) onName(d.name);
    if (d.policyholder) onPolicyholder(d.policyholder);
    onOpen(d.input);
  };

  return (
    <div className="profile">
      <button type="button" className="profile-back" onClick={onBack}>
        ← {t("Back")}
      </button>

      <section className="profile-head">
        <div className="avatar big">{initials(name || policyholder)}</div>
        <div className="profile-id">
          {editing ? (
            <div className="profile-edit">
              <label>
                <span>{t("Your name")}</span>
                <input value={name} placeholder={t("Optional")} onChange={(ev) => onName(ev.target.value)} />
              </label>
              <label>
                <span>{t("Name on the policy")}</span>
                <input
                  value={policyholder}
                  placeholder={t("Optional")}
                  onChange={(ev) => onPolicyholder(ev.target.value)}
                />
              </label>
              <label className="narrow">
                <span>{t("Patient's age")}</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={e.input.age}
                  onChange={(ev) => onAge(Math.min(120, Math.max(0, Math.round(Number(ev.target.value) || 0))))}
                />
              </label>
            </div>
          ) : (
            <>
              <h1>{name || policyholder || t("Your profile")}</h1>
              <p>
                {t("Age {n}", { n: e.input.age })}
                {policyholder && policyholder !== name ? ` · ${t("(policy in the name of {x})", { x: policyholder })}` : ""}
              </p>
            </>
          )}
        </div>
        <button type="button" className="profile-editbtn" onClick={() => setEditing(!editing)}>
          {editing ? t("Done") : t("Edit")}
        </button>
      </section>

      <div className="profile-tiles">
        <div className="profile-tile">
          <span className="k">{t("My plan")}</span>
          <span className="v small">{policyShort(e.policy)}</span>
          <span className="s">{isNoPolicy(e.policy) ? t("paying ourselves") : `${e.policy.insurer} · ${fmt(e.policy.sumInsured)}`}</span>
        </div>
        <div className="profile-tile">
          <span className="k">{t("Saved stays")}</span>
          <span className="v">{list.length}</span>
          <span className="s">{t("kept from this browser")}</span>
        </div>
        <div className="profile-tile">
          <span className="k">{t("Questions asked")}</span>
          <span className="v">{asked}</span>
          <span className="s">{t("to Ask ClaimCast")}</span>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>{t("My hospital stays")}</h2>
        </div>
        {stays === "loading" && <p className="note">{t("Loading…")}</p>}
        {stays === null && <p className="note">{t("The server did not answer.")}</p>}
        {Array.isArray(stays) && stays.length === 0 && (
          <p className="note" style={{ marginTop: 0 }}>
            {t("Nothing saved yet. Press “Save my session” at the top to keep a hospital stay here.")}
          </p>
        )}
        <ul className="profile-stays">
          {list.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => reopen(s)}>
                <span className="what">
                  <b>{s.summary.procedure}</b>
                  <span>
                    {s.summary.hospital} · {tx(s.summary.roomClass)} ·{" "}
                    {new Date(s.updatedAt).toLocaleDateString("en-IN")}
                  </span>
                </span>
                <span className="pay">
                  <span>{t("you pay")}</span>
                  <b className="loss">{fmt(s.summary.patientPays)}</b>
                </span>
                <span className="go">→</span>
              </button>
            </li>
          ))}
        </ul>
        {list.length > 0 && <p className="note">{t("Open any stay to see its path again, priced with today’s figures.")}</p>}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t("Preferences")}</h2>
        </div>
        <div className="profile-prefs">
          <div>
            <span className="k">{t("Language")}</span>
            <LangToggle onChange={onLang} />
          </div>
          <div>
            <span className="k">{t("Theme")}</span>
            <ThemeToggle />
          </div>
          <div>
            <span className="k">{t("Email sign-in")}</span>
            <Account />
          </div>
        </div>
        <p className="note">
          {plural(list.length, "{n} saved stay is linked to this browser.", "{n} saved stays are linked to this browser.")}{" "}
          {t("Sign in with email to keep them if you switch devices.")}
        </p>
      </section>
    </div>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "☺";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
