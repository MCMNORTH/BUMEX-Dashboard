"use client";

import { useI18n } from "@/components/layout/i18n-provider";
import emblemImage from "@/vanguard/assets/emblem.png";
import { Sk, SkPage } from "@/vanguard/one/skeleton";

// Vanguard's own loading screen (vanguard-shell.tsx, app/(app)/loading.tsx): the app as it comes, its title bar, its
// navigation and a page drawn as skeletons under Fluent's shimmer (vanguard/one/skeleton.tsx, 2026-11-20); and what to
// do when the ERP database cannot be reached.
const NAV = [96, 120, 84, 108, 72, 128, 92, 116, 80];

export function VanguardLoading({ failed = false }: { failed?: boolean }) {
  const { locale } = useI18n();
  const fr = locale !== "en";

  if (failed) {
    return (
      <div className="loading">
        {/* eslint-disable-next-line @next/next/no-img-element -- Vanguard's own markup (vanguard/App.tsx) */}
        <img src={emblemImage.src} alt="" />
        <div className="t"><b>BUMEX</b> Vanguard</div>
        <div className="s">
          {fr ? "Base ERP injoignable" : "ERP database unreachable"} ·{" "}
          <button className="btn sm" onClick={() => window.location.reload()}>
            {fr ? "Recharger" : "Reload"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sk-shell" role="status" aria-busy="true">
      <span className="sk-vh">{fr ? "Chargement…" : "Loading…"}</span>
      <div className="sk-shell-bar">
        <span className="sk-shell-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- Vanguard's own markup (vanguard/App.tsx) */}
          <img src={emblemImage.src} alt="" />
          <b>BUMEX</b> <span>Vanguard</span>
        </span>
        <Sk className="sk-shell-search" w="min(460px, 36vw)" h={28} />
      </div>
      <div className="sk-shell-body">
        <div className="sk-shell-nav" aria-hidden="true">
          <div className="sk-shell-ent">
            <Sk w={32} h={32} />
            <div><Sk w={96} /><Sk w={56} h={10} /></div>
          </div>
          {NAV.map((w, i) => (
            <div key={i} className={`sk-shell-item ${i === 1 || i === 5 ? "gap" : ""}`}>
              <Sk w={18} h={18} />
              <Sk w={w} />
            </div>
          ))}
        </div>
        <div className="sk-shell-main" aria-hidden="true">
          <SkPage />
        </div>
      </div>
    </div>
  );
}
