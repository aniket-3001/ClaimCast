import { useEffect, useState } from "react";
import type { SavedSessionDetail, SavedSessionRow } from "@claimcast/contracts";
import { fmt, registry, setRegistry, type CaseInput } from "@claimcast/engine";
import { adminSession, adminSessions } from "../api";

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
        <h2>Saved sessions</h2>
        <span className="aside">
          {Array.isArray(rows) ? `${rows.length} ${rows.length === 1 ? "family" : "families"}` : ""}{" "}
          <button className="switch-view" onClick={load}>
            Refresh
          </button>
        </span>
      </div>

      {rows === "loading" && <p className="note">Reading saved sessions&hellip;</p>}
      {rows === null && <p className="note">The server did not answer.</p>}
      {Array.isArray(rows) && rows.length === 0 && (
        <p className="note" style={{ marginTop: 0 }}>
          No saved sessions yet. When a family presses &ldquo;Save my session&rdquo;, their details, their
          hospital stay, what ClaimCast worked out and their chat appear here.
        </p>
      )}

      {Array.isArray(rows) && rows.length > 0 && (
        <div className="sessions">
          {rows.map((r) => (
            <div key={r.id} className={`session ${openId === r.id ? "open" : ""}`}>
              <button className="session-row" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                <span className="session-who">
                  {r.name || r.policyholder || "Unnamed"}
                  <span className="session-when">{new Date(r.updatedAt).toLocaleString("en-IN")}</span>
                </span>
                <span className="session-what">
                  {r.summary.procedure} · {r.summary.hospital} · {r.summary.policy}
                  {r.uploadedPolicy ? " · own policy uploaded" : ""}
                </span>
                <span className="session-pays">
                  pays <b className="loss">{fmt(r.summary.patientPays)}</b> of {fmt(r.summary.billTotal)}
                  {r.chatTurns > 0 && <span className="session-chat"> · {r.chatTurns} {r.chatTurns === 1 ? "question" : "questions"} asked</span>}
                </span>
              </button>

              {openId === r.id && (
                <div className="session-detail">
                  {!detail ? (
                    <p className="note">Loading&hellip;</p>
                  ) : (
                    <>
                      <div className="session-grid">
                        <div>
                          <div className="session-k">Family</div>
                          <div>
                            {detail.name || "—"}
                            {detail.policyholder && detail.policyholder !== detail.name
                              ? ` (policy in the name of ${detail.policyholder})`
                              : ""}
                          </div>
                          <div className="session-k">Hospital stay</div>
                          <div>
                            {detail.summary.procedure}, {detail.summary.hospital}, {detail.summary.city},{" "}
                            {detail.summary.roomClass.toLowerCase()} room, {detail.input.days} nights
                          </div>
                          <div className="session-k">What ClaimCast worked out</div>
                          <div>
                            Bill {fmt(detail.summary.billTotal)} · insurance pays {fmt(detail.summary.insurerPays)} ·
                            family pays <b className="loss">{fmt(detail.summary.patientPays)}</b>
                            {detail.summary.repudiated && <div className="warn-line">{detail.summary.repudiated}</div>}
                          </div>
                        </div>
                        <div>
                          <div className="session-k">Not paid by insurance, and why</div>
                          <ul className="session-list">
                            {detail.summary.deductions.map((d, i) => (
                              <li key={i}>
                                {d.line}: {fmt(d.amount)} <span className="cite">{d.clause}</span>
                              </li>
                            ))}
                            {detail.summary.deductions.length === 0 && <li>Nothing refused.</li>}
                          </ul>
                        </div>
                      </div>

                      <div className="session-k">Questions they asked</div>
                      {detail.chat.length === 0 ? (
                        <p className="note" style={{ marginTop: 4 }}>No questions asked.</p>
                      ) : (
                        <div className="session-chatlog">
                          {detail.chat.map((t, i) => (
                            <div key={i}>
                              <div className="chat-msg user">{t.question}</div>
                              <div className="chat-msg assistant">
                                {t.answer}
                                {t.unsupportedFigures.length > 0 && (
                                  <div className="chat-warn">
                                    Contained an unchecked amount ({t.unsupportedFigures.join(", ")}), so it is not remembered
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <button className="switch-view" onClick={() => reopen(detail)}>
                        See it as the family saw it →
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
