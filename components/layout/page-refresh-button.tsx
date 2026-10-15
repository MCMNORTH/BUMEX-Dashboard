"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { setLiveViewer } from "@/lib/live/live-client";
import {
  getPageRefreshState,
  getServerPageRefreshState,
  refreshPage,
  subscribePageRefresh,
  type PageRefreshError,
} from "@/lib/live/page-refresh";
import { cn } from "@/lib/utils";

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}

function formatAge(renderedAt: number, now: number, locale: string) {
  const seconds = Math.max(0, Math.round((now - renderedAt) / 1000));

  if (seconds < 45) {
    return locale === "fr" ? "à l’instant" : "just now";
  }

  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.round(seconds / 60);

  return minutes < 60 ? format.format(-minutes, "minute") : format.format(-Math.round(minutes / 60), "hour");
}

const errorCopy: Record<PageRefreshError, { en: string; fr: string }> = {
  offline: { en: "Can’t reach the server. Check your connection.", fr: "Serveur injoignable. Vérifiez votre connexion." },
  "signed-out": { en: "Your session has ended.", fr: "Votre session a expiré." },
  failed: { en: "Refresh failed. Try again.", fr: "Échec de l’actualisation. Réessayez." },
};

/**
 * The header's ↻ button for the page on screen (see components/layout/page-refresh.tsx).
 * Shows how old the data is, that updates are waiting, or why a refresh failed.
 */
export function PageRefreshButton() {
  const { locale } = useI18n();
  const { profile } = useUser();
  const { page, refreshing, updateAvailable, error } = useSyncExternalStore(
    subscribePageRefresh,
    getPageRefreshState,
    getServerPageRefreshState,
  );
  const now = useNow(15_000);
  const isFr = locale === "fr";

  useEffect(() => {
    setLiveViewer(profile?.id ?? null);
  }, [profile?.id]);

  if (!page) {
    return null;
  }

  const busy = refreshing;
  const age = formatAge(page.renderedAt, now, locale);
  const label = busy
    ? (isFr ? "Actualisation…" : "Refreshing…")
    : updateAvailable
      ? (isFr ? "Nouvelles mises à jour" : "New updates")
      : (isFr ? `Mis à jour ${age}` : `Updated ${age}`);

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {error ? (
        <span role="status" className="hidden max-w-[16rem] truncate text-xs text-danger lg:inline">
          {errorCopy[error][isFr ? "fr" : "en"]}
          {error === "signed-out" ? (
            <>
              {" "}
              <Link href="/login" className="font-medium underline underline-offset-2">
                {isFr ? "Se reconnecter" : "Sign in"}
              </Link>
            </>
          ) : null}
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        className="relative px-2.5"
        disabled={busy}
        aria-busy={busy}
        aria-label={isFr ? "Actualiser la page" : "Refresh this page"}
        title={`${isFr ? "Données chargées" : "Data loaded"} ${new Date(page.renderedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}${error ? ` · ${errorCopy[error][isFr ? "fr" : "en"]}` : ""}`}
        onClick={() => void refreshPage("manual")}
      >
        <RefreshCw className={cn("size-4", busy && "animate-spin")} />
        {updateAvailable && !busy ? (
          <span aria-hidden className="absolute top-1.5 left-6 size-2 rounded-full bg-primary ring-2 ring-background" />
        ) : null}
        <span
          aria-live="polite"
          className={cn("hidden text-xs font-normal md:inline", updateAvailable && !busy ? "text-primary" : "text-muted-foreground")}
        >
          {label}
        </span>
        {error ? <span aria-hidden className="size-1.5 rounded-full bg-danger lg:hidden" /> : null}
      </Button>
    </div>
  );
}
