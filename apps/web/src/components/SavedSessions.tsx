import { Fragment, useEffect, useState } from "react";
import type { SavedSessionDetail, SavedSessionRow } from "@claimcast/contracts";
import { fmt, registry, setRegistry, type CaseInput } from "@claimcast/engine";
import { adminSession, adminSessions } from "../api";
import { plural, t, tx } from "../i18n";
import { RELATION_LABEL, type Relation } from "../people";

/**
 * Every session a family chose to save, as the admin sees it.
 *
 * This is where the two sides of ClaimCast meet on real records: who asked,
 * about which admission, what the engine told them, and what they asked the
 * chatbox -- which is also the memory the chatbox now recalls from.
 */
export function SavedSessions({ onOpen }: { onOpen: (c: CaseInput) => void }) {
  const [rows, setRows] = useState<SavedSessionRow[] | null | "loading">("loading");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SavedSessionDetail | null>(null);
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [hosp, setHosp] = useState("");
  const [sort, setSort] = useState<[Col, boolean]>(["saved", false]);
  const sortBy = (c: Col) => setSort(([k, asc]) => [c, k === c ? !asc : c !== "saved"]);
  const needle = q.trim().toLowerCase();
  const shown = (Array.isArray(rows) ? rows : [])
    .filter((r) => !plan || r.summary.policy === plan)
    .filter((r) => !hosp || r.summary.hospital === hosp)
    .filter(
      (r) =>
        !needle ||
        [r.name, r.policyholder, r.summary.hospital, r.summary.procedure, r.health?.diagnosis, ...r.people.flatMap((p) => [p.name, p.uid])]
          .filter(Boolean)
          .some((x) => x!.toLowerCase().includes(needle)),
    )
    .sort((x, y) => {
      const v = (r: SavedSessionRow): string | number =>
        sort[0] === "family" ? (r.name || r.policyholder || "").toLowerCase()
        : sort[0] === "stay" ? r.summary.procedure
        : sort[0] === "plan" ? r.summary.policy
        : sort[0] === "pays" ? r.summary.patientPays
        : sort[0] === "q" ? r.chatTurns
        : sort[0] === "people" ? r.people.length
        : r.updatedAt;
      const c = v(x) < v(y) ? -1 : v(x) > v(y) ? 1 : 0;
      return sort[1] ? c : -c;
    });

  const load = () => {
    setRows("loading");
    void adminSessions().then(setRows);
  };
  useEffect(load, []);

  useEffect(() => {
    setDetail(null);
    if (openId) void adminSession(openId).then(setDetail);
  }, [openId]);

  // Reopening a session priced on an uploaded policy needs that policy back in
  // the registry first; the family's browser was the only place it lived.
  const reopen = (d: SavedSessionDetail) => {
    if (d.policy) {
      const r = registry();
      setRegistry({ ...r, policies: [...r.policies.filter((p) => p.id !== d.policy!.id), d.policy] });
    }
    onOpen(d.input);
  };

  return (
    <section className="section">
      <div className="section-head">
        <h2>{t("Saved sessions")}</h2>
        <span className="aside">
          {Array.isArray(rows) ? plural(rows.length, "{n} family", "{n} families") : ""}{" "}
          <button className="switch-view" onClick={load}>
            {t("Refresh")}
          </button>
        </span>
      </div>

      {rows === "loading" && <p className="note">{t("Reading saved sessions…")}</p>}
      {rows === null && <p className="note">{t("The server did not answer.")}</p>}
      {Array.isArray(rows) && rows.length === 0 && (
        <p className="note" style={{ marginTop: 0 }}>
          {t(
            "No saved sessions yet. When a family presses “Save my session”, their details, their hospital stay, what ClaimCast worked out and their chat appear here.",
          )}
        </p>
      )}

      {Array.isArray(rows) && rows.length > 0 && (
        <div className="stable-tools">
          <input
            className="stable-search"
            type="search"
            placeholder={t("Search by name, hospital or ID…")}
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
          />
          <select value={plan} onChange={(ev) => setPlan(ev.target.value)}>
            <option value="">{t("All plans")}</option>
            {[...new Set(rows.map((r) => r.summary.policy))].sort().map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select value={hosp} onChange={(ev) => setHosp(ev.target.value)}>
            <option value="">{t("All hospitals")}</option>
            {[...new Set(rows.map((r) => r.summary.hospital))].sort().map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <span className="stable-count">{t("{a} of {b}", { a: shown.length, b: rows.length })}</span>
        </div>
      )}

      {Array.isArray(rows) && rows.length > 0 && (
        <div className="scroll">
        <table className="stable">
          <thead>
            <tr>
              {COLS.map(([key, label]) => (
                <th key={key} className={key === "pays" || key === "q" || key === "people" ? "num" : ""}>
                  <button type="button" className="stable-sort" onClick={() => sortBy(key)}>
                    {t(label)} {sort[0] === key ? (sort[1] ? "↑" : "↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
          {shown.map((r) => (
            <Fragment key={r.id}>
              <tr className={`pick ${openId === r.id ? "on" : ""}`} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                <td>
                  <b>{r.name || r.policyholder || t("Unnamed")}</b>
                  {r.uploadedPolicy && <div className="sub">{t(" · own policy uploaded").replace(" · ", "")}</div>}
                </td>
                <td>
                  {r.summary.procedure}
                  <div className="sub">{r.summary.hospital}</div>
                </td>
                <td>{r.summary.policy}</td>
                <td className="num">
                  <b className="loss">{fmt(r.summary.patientPays)}</b>
                  <div className="sub">{t("of")} {fmt(r.summary.billTotal)}</div>
                </td>
                <td className="num">{r.people.length}</td>
                <td className="num">{r.chatTurns}</td>
                <td>{new Date(r.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
              </tr>
              {openId === r.id && (
                <tr className="stable-detail"><td colSpan={7}>
                <div className="session-detail">
                  {!detail ? (
                    <p className="note">{t("Loading…")}</p>
                  ) : (
                    <>
                      <div className="session-grid">
                        <div>
                          <div className="session-k">{t("Family")}</div>
                          <div>
                            {detail.name || "—"}
                            {detail.policyholder && detail.policyholder !== detail.name
                              ? " " + t("(policy in the name of {x})", { x: detail.policyholder })
                              : ""}
                          </div>
                          <div className="session-k">{t("Hospital stay")}</div>
                          <div>
                            {t("{proc}, {hospital}, {city}, {room} room, {n} nights", {
                              proc: detail.summary.procedure,
                              hospital: detail.summary.hospital,
                              city: detail.summary.city,
                              room: tx(detail.summary.roomClass.toLowerCase()),
                              n: detail.input.days,
                            })}
                          </div>
                          <div className="session-k">{t("What ClaimCast worked out")}</div>
                          <div>
                            {t("Bill {bill} · insurance pays {paid} · family pays", {
                              bill: fmt(detail.summary.billTotal),
                              paid: fmt(detail.summary.insurerPays),
                            })}{" "}
                            <b className="loss">{fmt(detail.summary.patientPays)}</b>
                            {detail.summary.repudiated && <div className="warn-line">{tx(detail.summary.repudiated)}</div>}
                          </div>
                        </div>
                        <div>
                          <div className="session-k">{t("Not paid by insurance, and why")}</div>
                          <ul className="session-list">
                            {detail.summary.deductions.map((d, i) => (
                              <li key={i}>
                                {tx(d.line)}: {fmt(d.amount)} <span className="cite">{tx(d.clause)}</span>
                              </li>
                            ))}
                            {detail.summary.deductions.length === 0 && <li>{t("Nothing refused.")}</li>}
                          </ul>
                        </div>
                      </div>

                      <div className="session-k">{t("People in this session")}</div>
                      {detail.people.length === 0 ? (
                        <p className="note" style={{ marginTop: 4 }}>{t("Saved before people were recorded.")}</p>
                      ) : (
                        <table className="people-table">
                          <thead>
                            <tr>
                              <th>{t("Who")}</th>
                              <th>{t("Name")}</th>
                              <th className="num">{t("Age")}</th>
                              <th>{t("Unique ID (UUID)")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.people.map((p) => (
                              <tr key={p.uid}>
                                <td>
                                  {p.role === "self"
                                    ? t("Using ClaimCast")
                                    : p.role === "patient"
                                      ? t("Patient")
                                      : t(RELATION_LABEL[(p.relation ?? "other") as Relation])}
                                </td>
                                <td>{p.name || "—"}</td>
                                <td className="num">{p.age ?? "—"}</td>
                                <td>
                                  <code className="uuid">{p.uid}</code>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {detail.health && (
                        <>
                          <div className="session-k">{t("Health report")}</div>
                          <table className="people-table">
                            <tbody>
                              <tr>
                                <td>{t("Diagnosis")}</td>
                                <td>{detail.health.diagnosis ?? "—"}</td>
                              </tr>
                              <tr>
                                <td>{t("Tests and scans")}</td>
                                <td>
                                  {detail.health.tests.length
                                    ? detail.health.tests.map((x) => `${x.asWritten} (CGHS ${x.code})`).join(", ")
                                    : "—"}
                                </td>
                              </tr>
                              <tr>
                                <td>{t("Operation or hospital treatment")}</td>
                                <td>
                                  {detail.health.treatment ?? "—"}
                                  {detail.health.procedureId
                                    ? ` → ${registry().procedures.find((p) => p.id === detail.health!.procedureId)?.name ?? detail.health.procedureId}`
                                    : ""}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </>
                      )}

                      <div className="session-k">{t("Questions they asked")}</div>
                      {detail.chat.length === 0 ? (
                        <p className="note" style={{ marginTop: 4 }}>{t("No questions asked.")}</p>
                      ) : (
                        <div className="session-chatlog">
                          {detail.chat.map((turn, i) => (
                            <div key={i}>
                              <div className="chat-msg user">{turn.question}</div>
                              <div className="chat-msg assistant">
                                {turn.answer}
                                {turn.unsupportedFigures.length > 0 && (
                                  <div className="chat-warn">
                                    {t("Contained an unchecked amount ({x}), so it is not remembered", {
                                      x: turn.unsupportedFigures.join(", "),
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <button className="switch-view" onClick={() => reopen(detail)}>
                        {t("See it as the family saw it →")}
                      </button>
                    </>
                  )}
                </div>
                </td></tr>
              )}
            </Fragment>
          ))}
          {shown.length === 0 && (
            <tr>
              <td colSpan={7} className="empty">{t("No saved session matches.")}</td>
            </tr>
          )}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}

type Col = "family" | "stay" | "plan" | "pays" | "people" | "q" | "saved";
const COLS: [Col, string][] = [
  ["family", "Family"],
  ["stay", "Hospital stay"],
  ["plan", "Plan"],
  ["pays", "Family pays"],
  ["people", "People"],
  ["q", "Questions"],
  ["saved", "Saved on"],
];
