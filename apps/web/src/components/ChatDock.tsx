import { useEffect, useRef, useState } from "react";
import type { ChatAnswer, ConfirmedHealth } from "@claimcast/contracts";
import type { Evaluated } from "@claimcast/engine";
import { askChat } from "../api";
import { policyTravels } from "../labels";
import { lang, plural, t, type Lang } from "../i18n";
import {
  listen,
  rememberReadAloud,
  speak,
  speechInputSupported,
  speechOutputSupported,
  stopSpeaking,
  storedReadAloud,
} from "../speech";

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
  health,
}: {
  e: Evaluated;
  documentId: string | null;
  /** The confirmed health report, so questions about scans can be answered. */
  health?: ConfirmedHealth | null;
  /** Held by the app, so "Save my session" can keep the conversation. */
  turns: Turn[];
  setTurns: (update: (ts: Turn[]) => Turn[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  // The language the chat listens and answers in. Starts as the page's, and
  // can be switched here without changing the rest of the site.
  const [chatLang, setChatLang] = useState<Lang>(lang);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const stopListening = useRef<(() => void) | null>(null);
  const [readAloud, setReadAloud] = useState<boolean>(storedReadAloud);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const canListen = speechInputSupported();
  const canSpeak = speechOutputSupported();

  useEffect(() => () => {
    stopListening.current?.();
    stopSpeaking();
  }, []);

  const say = (text: string, index: number) => {
    setSpeaking(index);
    speak(text, chatLang, () => setSpeaking((cur) => (cur === index ? null : cur)));
  };

  const mic = () => {
    if (listening) {
      stopListening.current?.();
      return;
    }
    stopSpeaking();
    setMicError(null);
    setListening(true);
    stopListening.current = listen(chatLang, {
      onInterim: (text) => setDraft(text),
      onFinal: (text) => void ask(text),
      onEnd: () => setListening(false),
      onError: (code) =>
        setMicError(
          code === "not-allowed" || code === "service-not-allowed"
            ? t("Microphone permission was refused. Allow it in the browser to speak your question.")
            : code === "no-speech"
              ? t("Didn’t hear anything. Tap the microphone and try again.")
              : t("Voice input stopped. You can type your question instead."),
        ),
    });
  };

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
      ...(policyTravels(e.policy) ? { policy: e.policy } : {}),
      ...(documentId ? { documentId } : {}),
      history,
      language: chatLang,
      ...(health ? { health } : {}),
    });
    setTurns((ts) => [...ts, r.ok ? { role: "assistant", answer: r.answer } : { role: "error", text: r.reason }]);
    // The question went in at turns.length, so the answer lands one after it.
    if (readAloud) say(r.ok ? r.answer.answer : r.reason, turns.length + 1);
    setBusy(false);
  }

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => setOpen(true)} aria-label={t("Ask about this admission")}>
        <span className="chat-fab-dot" aria-hidden="true" />
        {t("Ask ClaimCast")}
      </button>
    );
  }

  return (
    <aside className="chat-panel" aria-label={t("Ask about this admission")}>
      <header className="chat-head">
        <div>
          <div className="chat-title">{t("Ask ClaimCast")}</div>
          <div className="chat-sub">
            {e.procedure.name} · {e.hospital.name}
            {documentId ? t(" · your uploaded policy") : ""}
          </div>
        </div>
        <div className="chat-tools">
          <div className="chat-lang" role="group" aria-label={t("Chat language, for voice and answers")}>
            {(["en", "hi"] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={chatLang === l}
                lang={l}
                onClick={() => setChatLang(l)}
              >
                {l === "en" ? "EN" : "हि"}
              </button>
            ))}
          </div>
          {canSpeak && (
            <button
              type="button"
              className="chat-icon"
              aria-pressed={readAloud}
              aria-label={readAloud ? t("Stop reading answers aloud") : t("Read answers aloud")}
              title={readAloud ? t("Stop reading answers aloud") : t("Read answers aloud")}
              onClick={() => {
                const on = !readAloud;
                setReadAloud(on);
                rememberReadAloud(on);
                if (!on) {
                  stopSpeaking();
                  setSpeaking(null);
                }
              }}
            >
              {readAloud ? "🔊" : "🔈"}
            </button>
          )}
          <button
            className="chat-close"
            onClick={() => {
              stopSpeaking();
              setOpen(false);
            }}
            aria-label={t("Close")}
          >
            ×
          </button>
        </div>
      </header>

      <div className="chat-log" aria-live="polite" aria-relevant="additions">
        {turns.length === 0 && (
          <div className="chat-empty">
            <p>
              {t(
                documentId
                  ? "Ask anything about your bill or your policy. Amounts come straight from ClaimCast’s calculation, never guessed. We only help with money — please ask your doctor about treatment."
                  : "Ask anything about your bill. Amounts come straight from ClaimCast’s calculation, never guessed. We only help with money — please ask your doctor about treatment.",
              )}
            </p>
            <div className="chat-starters">
              {STARTERS.map((s) => (
                <button key={s} className="chat-starter" onClick={() => void ask(t(s))}>
                  {t(s)}
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
            <Answer
              key={i}
              a={t.answer}
              speaking={speaking === i}
              onListen={
                canSpeak
                  ? () => {
                      if (speaking === i) {
                        stopSpeaking();
                        setSpeaking(null);
                      } else say(t.answer.answer, i);
                    }
                  : undefined
              }
            />
          ),
        )}
        {busy && <div className="chat-msg assistant pending">{t("Working it out…")}</div>}
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
          placeholder={listening ? t("Listening… speak now") : t("Type or speak your question…")}
          aria-label={t("Your question")}
          onChange={(ev) => setDraft(ev.target.value)}
          disabled={busy}
        />
        {canListen && (
          <button
            type="button"
            className={`chat-mic ${listening ? "on" : ""}`}
            onClick={mic}
            disabled={busy}
            aria-pressed={listening}
            aria-label={
              listening
                ? t("Stop listening")
                : chatLang === "hi"
                  ? t("Speak your question in Hindi")
                  : t("Speak your question in English")
            }
            title={chatLang === "hi" ? t("Speak your question in Hindi") : t("Speak your question in English")}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"
              />
            </svg>
          </button>
        )}
        <button className="chat-send" type="submit" disabled={busy || !draft.trim()}>
          {t("Ask")}
        </button>
      </form>
      {micError && (
        <div className="chat-micerr" role="alert">
          {micError}
        </div>
      )}
    </aside>
  );
}

function Answer({ a, speaking, onListen }: { a: ChatAnswer; speaking: boolean; onListen?: () => void }) {
  return (
    <div className="chat-msg assistant">
      {onListen && (
        <button
          type="button"
          className={`chat-listen ${speaking ? "on" : ""}`}
          onClick={onListen}
          aria-label={speaking ? t("Stop reading") : t("Listen to this answer")}
        >
          {speaking ? "■ " + t("Stop") : "🔊 " + t("Listen")}
        </button>
      )}
      <div className="chat-answer">{a.answer || t("No answer came back.")}</div>

      {a.unsupportedFigures.length > 0 && (
        <div className="chat-warn">
          {t(
            a.unsupportedFigures.length === 1
              ? "Please ignore {x} — that amount is not from ClaimCast’s calculation."
              : "Please ignore {x} — those amounts are not from ClaimCast’s calculation.",
            { x: a.unsupportedFigures.join(", ") },
          )}
        </div>
      )}

      {(a.facts.length > 0 || a.citations.length > 0) && (
        <details className="chat-basis">
          <summary>
            {t("Where this comes from")}
          </summary>
          <ul>
            {a.facts.map((f) => (
              <li key={f.id} className="chat-fact">
                {f.text}
              </li>
            ))}
            {a.citations.map((c, i) => (
              <li key={"c" + i} className={c.verified ? "chat-quote" : "chat-quote bad"}>
                &ldquo;{c.quote}&rdquo; <span className="cite">{t("page {n}", { n: c.page })}</span>
                {!c.verified && <span className="cite-bad"> {t("could not be found in your document")}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {a.memoryUsed > 0 && (
        <div className="chat-model">
          {plural(
            a.memoryUsed,
            "Learned from {n} similar question other families asked",
            "Learned from {n} similar questions other families asked",
          )}
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
