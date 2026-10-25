"use client";

import emblemImage from "@/vanguard/assets/emblem.png";

// Vanguard's own loading screen (vanguard/App.tsx), and what to do when the ERP database cannot be reached.
export function VanguardLoading({ failed = false }: { failed?: boolean }) {
  return (
    <div className="loading">
      {/* eslint-disable-next-line @next/next/no-img-element -- Vanguard's own markup (vanguard/App.tsx) */}
      <img src={emblemImage.src} alt="" />
      <div className="t">BUMEX VANGUARD</div>
      {failed ? (
        <div className="s">
          Base ERP injoignable ·{" "}
          <button className="btn sm" onClick={() => window.location.reload()}>
            Recharger
          </button>
        </div>
      ) : (
        <>
          <div className="s">Chargement…</div>
          <div className="p">
            <i />
          </div>
        </>
      )}
    </div>
  );
}
