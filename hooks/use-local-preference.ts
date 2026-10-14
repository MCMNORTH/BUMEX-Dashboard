"use client";

import { useCallback, useSyncExternalStore } from "react";

// Every hook instance re-reads when any of them writes; other tabs report through "storage".
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A small preference remembered in this browser, such as the last project picked.
 * It is null while the server renders and during hydration, then the stored value;
 * when storage is blocked, nothing is remembered and nothing breaks.
 */
export function useLocalPreference(key: string | null): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(subscribe, () => (key ? read(key) : null), () => null);
  const setValue = useCallback(
    (next: string) => {
      if (!key) {
        return;
      }

      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Not remembered; the current page still works.
      }

      listeners.forEach((listener) => listener());
    },
    [key],
  );

  return [value, setValue];
}
