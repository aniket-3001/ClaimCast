import { useState } from "react";

/**
 * Light or dark. Light is the default; the choice is kept in this browser and
 * applied to <html> before the first paint (see main.tsx), so a reload does not
 * flash the other theme.
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
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const next: Theme = theme === "light" ? "dark" : "light";

  const flip = () => {
    applyTheme(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the switch still works for this page load.
    }
    setTheme(next);
  };

  return (
    <button className="theme-toggle" onClick={flip} aria-label={`Switch to ${next} theme`}>
      <span className="theme-toggle-icon" aria-hidden="true">
        {theme === "light" ? "☾" : "☀"}
      </span>
      {theme === "light" ? "Dark mode" : "Light mode"}
    </button>
  );
}
