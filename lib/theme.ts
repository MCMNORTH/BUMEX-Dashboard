"use client";

import { useSyncExternalStore } from "react";

import { DARK_QUERY, THEME_KEY } from "@/lib/theme-script";

// Light or dark, the person's choice or their system's (the Fluent redesign, 2026-11-19). Kept in the browser like the
// other display preferences: <html> carries class "dark" (BUMEX One's Tailwind tokens, app/globals.css) and
// data-theme (Vanguard's tokens, vanguard/styles.css). lib/theme-script.ts sets them before the first paint (app/layout.tsx).

export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";


export function readThemePref(): ThemePref {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(pref: ThemePref): Theme {
  if (pref !== "system") return pref;
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function applyTheme(pref: ThemePref) {
  const theme = resolveTheme(pref);
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}

const listeners = new Set<() => void>();

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // private window: the choice lasts as long as the page
  }
  applyTheme(pref);
  listeners.forEach((notify) => notify());
}

/** The person's choice, following its changes (another tab, the system's theme when they follow it). */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      const onStorage = (event: StorageEvent) => {
        if (event.key !== THEME_KEY) return;
        applyTheme(readThemePref());
        notify();
      };
      const system = window.matchMedia(DARK_QUERY);
      const onSystem = () => {
        if (readThemePref() === "system") applyTheme("system");
        notify();
      };
      window.addEventListener("storage", onStorage);
      system.addEventListener("change", onSystem);
      return () => {
        listeners.delete(notify);
        window.removeEventListener("storage", onStorage);
        system.removeEventListener("change", onSystem);
      };
    },
    readThemePref,
    () => "system",
  );
}

/** The theme shown now: the choice, or the system's. */
export function useTheme(): Theme {
  const pref = useThemePref();
  return useSyncExternalStore(
    (notify) => {
      const system = window.matchMedia(DARK_QUERY);
      system.addEventListener("change", notify);
      return () => system.removeEventListener("change", notify);
    },
    () => resolveTheme(pref),
    () => "light",
  );
}
