/**
 * Speaking to the chatbox, and hearing it answer.
 *
 * Both use what the browser already has: the Web Speech API's recognition for
 * voice input and speech synthesis for reading answers aloud. Nothing new to
 * install and nothing billed. Recognition is set to Indian English (en-IN) or
 * Hindi (hi-IN) by the language chosen in the chat, so a question spoken in
 * Hindi is heard as Hindi. Chrome and Edge send the recorded audio to their
 * own speech service to transcribe it; Safari transcribes on the device.
 *
 * Where a browser has neither, the buttons are simply not shown.
 */

import type { Lang } from "./i18n";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

const Ctor = (): (new () => Recognition) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const speechInputSupported = () => Ctor() !== null;
export const speechOutputSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

const LOCALE: Record<Lang, string> = { en: "en-IN", hi: "hi-IN" };

/**
 * Listen once. Words appear through `onInterim` as they are recognised; the
 * whole question arrives through `onFinal` when the speaker pauses. Returns a
 * function that stops listening.
 */
export function listen(
  lang: Lang,
  on: { onInterim: (text: string) => void; onFinal: (text: string) => void; onEnd: () => void; onError: (code: string) => void },
): () => void {
  const R = Ctor();
  if (!R) {
    on.onError("not-supported");
    on.onEnd();
    return () => {};
  }
  const rec = new R();
  rec.lang = LOCALE[lang];
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = "";
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    on.onInterim((finalText + interim).trim());
  };
  rec.onerror = (ev) => on.onError(ev.error);
  rec.onend = () => {
    if (finalText.trim()) on.onFinal(finalText.trim());
    on.onEnd();
  };
  rec.start();
  return () => rec.stop();
}

/** Text as it should be read out: ₹ said as a word, the figures kept. */
export function speakable(text: string, lang: Lang): string {
  const word = lang === "hi" ? "रुपये " : "rupees ";
  return text.replace(/₹\s?/g, word).replace(/\s+/g, " ").trim();
}

function voiceFor(lang: Lang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const want = LOCALE[lang].toLowerCase();
  const base = lang;
  return (
    voices.find((v) => v.lang.toLowerCase() === want) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    null
  );
}

/** Read `text` aloud, stopping anything already being read. */
export function speak(text: string, lang: Lang, onEnd?: () => void) {
  if (!speechOutputSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text, lang));
  u.lang = LOCALE[lang];
  const v = voiceFor(lang);
  if (v) u.voice = v;
  u.rate = 0.95;
  if (onEnd) {
    u.onend = onEnd;
    u.onerror = onEnd;
  }
  synth.speak(u);
}

export function stopSpeaking() {
  if (speechOutputSupported()) window.speechSynthesis.cancel();
}

const READ_KEY = "claimcast.readAloud";
export function storedReadAloud(): boolean {
  try {
    return window.localStorage.getItem(READ_KEY) === "1";
  } catch {
    return false;
  }
}
export function rememberReadAloud(on: boolean) {
  try {
    window.localStorage.setItem(READ_KEY, on ? "1" : "0");
  } catch {
    // Storage blocked: the setting lasts this page load.
  }
}
