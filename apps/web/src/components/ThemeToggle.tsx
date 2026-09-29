import { useEffect, useState } from "react";
import { lang, t, type Lang } from "../i18n";

/**
 * Light or dark, and English or Hindi: two buttons in the bottom-left corner of
 * every page. Both choices are kept in this browser and applied before the
 * first paint (see main.tsx), so a reload shows the same page it left.
 */
export type Theme = "light" | "dark";

const KEY = "claimcast.theme";

export function storedTheme(): Theme {
  try {
    return window.localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
}

export function ThemeToggle() {
  // Read from the page itself, and listen for changes, so every theme button on
  // screen (the corner one and the profile page's) always agrees.
  const current = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const [theme, setTheme] = useState<Theme>(() => (typeof document === "undefined" ? "light" : current()));
  useEffect(() => {
    const on = () => setTheme(current());
    window.addEventListener("claimcast-theme", on);
    return () => window.removeEventListener("claimcast-theme", on);
  }, []);
  const next: Theme = theme === "light" ? "dark" : "light";

  const flip = () => {
    applyTheme(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the switch still works for this page load.
    }
    window.dispatchEvent(new Event("claimcast-theme"));
  };

  return (
    <button className="theme-toggle" onClick={flip} aria-label={`Switch to ${next} theme`}>
      <span className="theme-toggle-icon" aria-hidden="true">
        {theme === "light" ? "☾" : "☀"}
      </span>
      {theme === "light" ? t("Dark mode") : t("Light mode")}
    </button>
  );
}

/** Shows the language you would switch to, in that language. */
export function LangToggle({ onChange }: { onChange: (l: Lang) => void }) {
  const next: Lang = lang() === "en" ? "hi" : "en";
  return (
    <button
      className="theme-toggle"
      onClick={() => onChange(next)}
      aria-label={next === "hi" ? "हिन्दी में देखें" : "View in English"}
      lang={next}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {next === "hi" ? "अ" : "A"}
      </span>
      {next === "hi" ? "हिन्दी" : "English"}
    </button>
  );
}

export function CornerControls({ onLang }: { onLang: (l: Lang) => void }) {
  return (
    <div className="corner-controls">
      <LangToggle onChange={onLang} />
      <ThemeToggle />
    </div>
  );
}
