import { useEffect, useRef, useState } from "react";
import type { ChatAnswer } from "@claimcast/contracts";
import type { Evaluated } from "@claimcast/engine";
import { askChat } from "../api";

/**
 * The chatbox: a button in the corner of every tab, and a panel over the page.
 *
 * It answers about the admission the page is showing -- priced again by the
 * server's engine -- and about the policy document, once one is uploaded. Every
 * answer shows what it rests on: the engine's facts by clause, and the policy's
 * own words by page, each quote marked if it could not be found in the document.
 * A rupee figure the model produced on its own is named under the answer rather
 * than left to read like the engine's arithmetic.
 */

export type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; answer: ChatAnswer }
  | { role: "error"; text: string };

const STARTERS = [
  "Why do I pay this much?",
  "What would a cheaper room save me?",
  "Which charges won’t be paid, whatever I choose?",
  "Can a government scheme help us?",
];

export function ChatDock({
  e,
  documentId,
  turns,
  setTurns,
}: {
  e: Evaluated;
  documentId: string | null;
  /** Held by the app, so "Save my session" can keep the conversation. */
  turns: Turn[];
  setTurns: (update: (ts: Turn[]) => Turn[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, busy, open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setDraft("");
    setBusy(true);
    const history = turns
      .filter((t): t is Exclude<Turn, { role: "error" }> => t.role !== "error")
      .slice(-6)
      .map((t) => (t.role === "user" ? { role: "user" as const, text: t.text } : { role: "assistant" as const, text: t.answer.answer }));
    setTurns((ts) => [...ts, { role: "user", text: q }]);
    const r = await askChat({
      question: q,
      case: e.input,
      // An uploaded, confirmed policy exists only in this browser, so it travels
      // with the question; a reference policy the server already has.
      ...(e.input.policyId === "pol-uploaded" ? { policy: e.policy } : {}),
      ...(documentId ? { documentId } : {}),
      history,
    });
    setTurns((ts) => [...ts, r.ok ? { role: "assistant", answer: r.answer } : { role: "error", text: r.reason }]);
    setBusy(false);
  }

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Ask about this admission">
        <span className="chat-fab-dot" aria-hidden="true" />
        Ask ClaimCast
      </button>
    );
  }

  return (
    <aside className="chat-panel" aria-label="Ask about this admission">
      <header className="chat-head">
        <div>
          <div className="chat-title">Ask ClaimCast</div>
          <div className="chat-sub">
            {e.procedure.name} · {e.hospital.name}
            {documentId ? " · your uploaded policy" : ""}
          </div>
        </div>
        <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </header>

      <div className="chat-log">
        {turns.length === 0 && (
          <div className="chat-empty">
            <p>
              Ask anything about your bill{documentId ? " or your policy" : ""}. Amounts come straight
              from ClaimCast&rsquo;s calculation, never guessed. We only help with money &mdash; please ask
              your doctor about treatment.
            </p>
            <div className="chat-starters">
              {STARTERS.map((s) => (
                <button key={s} className="chat-starter" onClick={() => void ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="chat-msg user">
              {t.text}
            </div>
          ) : t.role === "error" ? (
            <div key={i} className="chat-msg error">
              {t.text}
            </div>
          ) : (
            <Answer key={i} a={t.answer} />
          ),
        )}
        {busy && <div className="chat-msg assistant pending">Working it out…</div>}
        <div ref={end} />
      </div>

      <form
        className="chat-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          void ask(draft);
        }}
      >
        <input
          className="chat-input"
          value={draft}
          maxLength={500}
          placeholder="Type your question…"
          onChange={(ev) => setDraft(ev.target.value)}
          disabled={busy}
        />
        <button className="chat-send" type="submit" disabled={busy || !draft.trim()}>
          Ask
        </button>
      </form>
    </aside>
  );
}

function Answer({ a }: { a: ChatAnswer }) {
  return (
    <div className="chat-msg assistant">
      <div className="chat-answer">{a.answer || "No answer came back."}</div>

      {a.unsupportedFigures.length > 0 && (
        <div className="chat-warn">
          Please ignore {a.unsupportedFigures.join(", ")} &mdash; {a.unsupportedFigures.length === 1 ? "that amount is" : "those amounts are"} not
          from ClaimCast&rsquo;s calculation.
        </div>
      )}

      {(a.facts.length > 0 || a.citations.length > 0) && (
        <details className="chat-basis">
          <summary>
            Where this comes from
          </summary>
          <ul>
            {a.facts.map((f) => (
              <li key={f.id} className="chat-fact">
                {f.text}
              </li>
            ))}
            {a.citations.map((c, i) => (
              <li key={"c" + i} className={c.verified ? "chat-quote" : "chat-quote bad"}>
                &ldquo;{c.quote}&rdquo; <span className="cite">page {c.page}</span>
                {!c.verified && <span className="cite-bad"> could not be found in your document</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {a.memoryUsed > 0 && (
        <div className="chat-model">
          Learned from {a.memoryUsed} similar {a.memoryUsed === 1 ? "question" : "questions"} other families asked
        </div>
      )}
    </div>
  );
}

/** The conversation as it is kept in a saved session: each question with its answer. */
export function chatRecords(turns: Turn[]) {
  const out = [];
  for (let i = 0; i < turns.length - 1; i++) {
    const q = turns[i];
    const a = turns[i + 1];
    if (q.role === "user" && a.role === "assistant") {
      out.push({
        question: q.text,
        answer: a.answer.answer,
        factIds: a.answer.facts.map((f) => f.id),
        unsupportedFigures: a.answer.unsupportedFigures,
        model: a.answer.model,
      });
    }
  }
  return out;
}
