import { useEffect, useState } from "react";
import type { SavedSessionDetail, SavedSessionRow } from "@claimcast/contracts";
import { fmt, registry, setRegistry, type CaseInput } from "@claimcast/engine";
import { adminSession, adminSessions } from "../api";
import { plural, t, tx } from "../i18n";

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
        <div className="sessions">
          {rows.map((r) => (
            <div key={r.id} className={`session ${openId === r.id ? "open" : ""}`}>
              <button className="session-row" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                <span className="session-who">
                  {r.name || r.policyholder || t("Unnamed")}
                  <span className="session-when">{new Date(r.updatedAt).toLocaleString("en-IN")}</span>
                </span>
                <span className="session-what">
                  {r.summary.procedure} · {r.summary.hospital} · {r.summary.policy}
                  {r.uploadedPolicy ? t(" · own policy uploaded") : ""}
                </span>
                <span className="session-pays">
                  {t("pays")} <b className="loss">{fmt(r.summary.patientPays)}</b> {t("of")} {fmt(r.summary.billTotal)}
                  {r.chatTurns > 0 && <span className="session-chat"> · {plural(r.chatTurns, "{n} question asked", "{n} questions asked")}</span>}
                </span>
              </button>

              {openId === r.id && (
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
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
