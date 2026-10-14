"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";

import { updateSidebarAppearanceAction } from "@/app/(app)/settings/appearance/actions";
import type { SidebarAppearance } from "@/lib/settings/appearance";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type SidebarAppearanceContextValue = {
  appearance: SidebarAppearance;
  status: SaveStatus;
  error: string | null;
  updateAppearance: (patch: Partial<SidebarAppearance>) => void;
};

const SidebarAppearanceContext = createContext<SidebarAppearanceContextValue | null>(null);

export function SidebarAppearanceProvider({
  initialAppearance,
  children,
}: {
  initialAppearance: SidebarAppearance;
  children: React.ReactNode;
}) {
  const [appearance, setAppearance] = useState(initialAppearance);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const currentRef = useRef(initialAppearance);
  const savedRef = useRef(initialAppearance);
  const latestRequestRef = useRef(0);

  // The root layout renders the first value; this keeps <html> in step with later choices
  // (before paint, so the page and sidebar change together) and clears it on sign-out.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.appTheme = appearance.sidebarTheme;
    return () => {
      delete root.dataset.appTheme;
    };
  }, [appearance.sidebarTheme]);

  const updateAppearance = useCallback(async (patch: Partial<SidebarAppearance>) => {
    const next = { ...currentRef.current, ...patch };
    const requestId = ++latestRequestRef.current;

    // Applied before the save so the sidebar changes on click, without a refresh.
    currentRef.current = next;
    setAppearance(next);
    setStatus("saving");
    setError(null);

    let result: { error?: string };
    try {
      result = await updateSidebarAppearanceAction(next);
    } catch {
      result = { error: "Network error." };
    }

    // Server actions run one at a time, so the last success is what is stored.
    if (!result.error) {
      savedRef.current = next;
    }

    // A newer choice is already on its way; let that one report.
    if (requestId !== latestRequestRef.current) {
      return;
    }

    if (result.error) {
      currentRef.current = savedRef.current;
      setAppearance(savedRef.current);
      setStatus("error");
      setError(result.error);
      return;
    }

    setStatus("saved");
  }, []);

  const value = useMemo(
    () => ({ appearance, status, error, updateAppearance }),
    [appearance, status, error, updateAppearance],
  );

  return <SidebarAppearanceContext.Provider value={value}>{children}</SidebarAppearanceContext.Provider>;
}

export function useSidebarAppearance() {
  const context = useContext(SidebarAppearanceContext);

  if (!context) {
    throw new Error("useSidebarAppearance must be used inside SidebarAppearanceProvider.");
  }

  return context;
}
