// FOODPRO Theme Provider — dark / light / system.
//
// Three sources of truth, in priority order:
//   1. Explicit user choice persisted in localStorage (`foodoro-theme`)
//   2. `prefers-color-scheme` media query (when user picks "system")
//   3. Falls back to "dark" — our default brand theme.
//
// To avoid a white flash on cold load, an inline script in index.html sets
// the `.dark` class on <html> BEFORE React mounts. This provider just keeps
// that state in sync at runtime.

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "system";

interface ThemeContextValue {
  mode: ThemeMode;                              // what the user picked
  resolved: "dark" | "light";                   // what's actually rendered
  setMode: (m: ThemeMode) => void;
}

const STORAGE_KEY = "foodoro-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "dark" || raw === "light" || raw === "system") return raw;
  } catch { /* SSR / locked storage */ }
  return "system";
}

function resolveMode(mode: ThemeMode): "dark" | "light" {
  if (mode === "system") {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
    return "dark";
  }
  return mode;
}

function applyClass(resolved: "dark" | "light"): void {
  const html = document.documentElement;
  html.classList.toggle("dark", resolved === "dark");
  html.dataset.theme = resolved;
  // Update meta theme-color for mobile chrome bar
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = resolved === "dark" ? "#111827" : "#F8FAFC";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored());
  const [resolved, setResolved] = useState<"dark" | "light">(() => resolveMode(readStored()));

  // Apply on mount and whenever mode changes
  useEffect(() => {
    const r = resolveMode(mode);
    setResolved(r);
    applyClass(r);
  }, [mode]);

  // When user picks "system", react to OS changes live
  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const r: "dark" | "light" = mql.matches ? "light" : "dark";
      setResolved(r);
      applyClass(r);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    try { localStorage.setItem(STORAGE_KEY, m); } catch { /* ignore */ }
    setModeState(m);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
