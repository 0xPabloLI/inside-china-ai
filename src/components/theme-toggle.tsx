import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

const THEME_QUERY = "(prefers-color-scheme: dark)";

function getSnapshot(): Theme {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia(THEME_QUERY).matches ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Follow system preference and cross-tab writes; local toggles notify via
  // emitChange() after persisting.
  const mql = window.matchMedia(THEME_QUERY);
  mql.addEventListener("change", listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    mql.removeEventListener("change", listener);
    window.removeEventListener("storage", listener);
  };
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

/**
 * Theme toggle button — switches between light and dark mode.
 *
 * Persists choice in localStorage. Falls back to system preference
 * (prefers-color-scheme) on first visit. Applies `.dark` class on
 * <html> element, which Tailwind's dark variant targets.
 *
 * Theme lives in an external store (localStorage + prefers-color-scheme), so
 * it is read via useSyncExternalStore: pure snapshot during render, no
 * setState-in-effect, and hydration-safe without a mounted flag — React
 * renders the server snapshot first, then re-renders with the client value.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // DOM side effect only — keeps <html> in sync with the resolved theme.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", next);
    emitChange();
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
