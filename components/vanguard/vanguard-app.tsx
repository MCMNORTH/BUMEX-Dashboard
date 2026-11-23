"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/components/layout/i18n-provider";
import { persistLocale } from "@/components/layout/language-switcher";
import { reloadVanguardAction } from "@/lib/erp/vanguard/actions";
import type { VanguardData } from "@/lib/erp/vanguard/run";
import { VanguardLoading } from "@/components/vanguard/vanguard-loading";
import { App } from "@/vanguard/App";
import { useStore } from "@/vanguard/store";

// BUMEX VANGUARD as the ERP team delivered it (vanguard/), in the frame of every page (vanguard-shell.tsx). Replaces
// their main.tsx. The state is read once when the frame mounts, then kept across pages and refreshed from the database.
export default function VanguardApp({ userId }: { userId: string }) {
  const { locale, setLocale } = useI18n();
  // the state in this tab's memory is someone else's (signed out and in again without the page reloading, a session
  // that ended in another tab): the page starts over, so nothing read for them (the state, the pages' cache) is shown
  const [someoneElse] = useState(() => useStore.getState().loadedAt > 0 && useStore.getState().state.session.userId !== userId);
  const [ready, setReady] = useState(() => useStore.getState().loadedAt > 0 && !someoneElse);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (someoneElse) window.location.reload();
  }, [someoneElse]);

  useEffect(() => {
    if (ready || someoneElse) return;
    let live = true;
    reloadVanguardAction()
      .then((result) => {
        if (!live) return;
        if (result.state) {
          useStore.getState().hydrate(result as VanguardData);
          setReady(true);
        } else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [ready, someoneElse]);

  useEffect(() => {
    // What others change shows up: a cheap check every 30 seconds while the page is in view, and on coming back to it;
    // what moved is read (the tickets alone when only they did: vanguard/store.ts sync).
    const check = () => document.visibilityState === "visible" && useStore.getState().refreshIfChanged();
    const timer = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  useEffect(() => {
    // The store is reachable from the console and the smoke test, as in the prototype (window.__vanguard.getState()).
    (window as unknown as { __vanguard: typeof useStore }).__vanguard = useStore;
  }, []);

  useEffect(() => {
    // One language for both apps: Vanguard opens in BUMEX One's, and its FR/EN switch changes BUMEX One's too.
    if (useStore.getState().ui.lang !== locale) useStore.getState().setLang(locale);
    return useStore.subscribe((next, previous) => {
      if (next.ui.lang === previous.ui.lang) return;
      persistLocale(next.ui.lang);
      setLocale(next.ui.lang);
    });
  }, [locale, setLocale]);

  if (!ready) return <VanguardLoading failed={failed} />;
  return <App />;
}
