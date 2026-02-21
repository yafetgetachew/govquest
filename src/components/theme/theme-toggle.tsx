"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "gvt-theme";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
}

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);
    setReady(true);
  }, []);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <button
      type="button"
      className={cn(
        "relative h-7 w-[4.25rem] shrink-0 overflow-hidden rounded-full border border-border/60 p-0 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !ready && "opacity-70",
      )}
      onClick={toggleTheme}
      disabled={!ready}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span aria-hidden className="absolute inset-0">
        <span className="absolute inset-0 bg-[linear-gradient(90deg,#dff2ff_0%,#b6e2ff_22%,#90c8ff_40%,#6c81c7_54%,#48508b_66%,#26325c_80%,#0b1428_100%)]" />
        <span
          className={cn(
            "absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.34)_0%,rgba(255,255,255,0.06)_52%,rgba(10,20,48,0.15)_100%)] transition-opacity duration-500",
            theme === "light" ? "opacity-100" : "opacity-65",
          )}
        />
        <span
          className={cn(
            "absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.26)_0%,rgba(255,255,255,0.08)_38%,rgba(17,24,39,0.18)_60%,rgba(2,6,23,0.42)_100%)] transition-opacity duration-500",
            theme === "dark" ? "opacity-100" : "opacity-62",
          )}
        />
        <span className="theme-toggle-cloud absolute left-1.5 top-1.5 h-1.5 w-4.5 rounded-full bg-white/85 blur-[0.2px]" />
        <span className="theme-toggle-cloud absolute left-3 top-3 h-1.5 w-3.5 rounded-full bg-white/75 blur-[0.2px] [animation-delay:0.5s]" />
        <span className="theme-toggle-cloud absolute left-1 top-4 h-1 w-2.5 rounded-full bg-white/70 blur-[0.2px] [animation-delay:1.1s]" />

        <span className="absolute right-1 top-1 h-5 w-7 bg-[radial-gradient(circle_at_40%_50%,rgba(148,163,184,0.45),transparent_68%)]" />
        <span className="theme-toggle-star absolute right-2 top-1.5 h-1 w-1 rounded-full bg-slate-100" />
        <span className="theme-toggle-star absolute right-4.5 top-2.5 h-1 w-1 rounded-full bg-slate-100/90 [animation-delay:0.45s]" />
        <span className="theme-toggle-star absolute right-6.5 top-1.5 h-1 w-1 rounded-full bg-slate-100/75 [animation-delay:1.1s]" />
        <span className="theme-toggle-star absolute right-3.5 top-4 h-1 w-1 rounded-full bg-slate-100/85 [animation-delay:1.7s]" />
        <span className="theme-toggle-star absolute right-7 top-4.5 h-1 w-1 rounded-full bg-slate-100/70 [animation-delay:2.2s]" />
      </span>

      <span
        aria-hidden
        className={cn(
          "absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.7)_0%,rgba(226,232,240,0.45)_100%)] text-foreground backdrop-blur-md shadow-[0_4px_12px_rgba(15,23,42,0.35)] transition-transform duration-300",
          theme === "dark" ? "translate-x-[39px]" : "translate-x-0",
        )}
      >
        <span className="grid h-full w-full place-items-center">
          {theme === "dark" ? <Moon className="h-2.5 w-2.5 text-slate-100 drop-shadow-[0_0_5px_rgba(226,232,240,0.9)]" /> : <Sun className="h-2.5 w-2.5 text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.8)]" />}
        </span>
      </span>
      <span className="sr-only">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
