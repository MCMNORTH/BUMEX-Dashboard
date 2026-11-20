"use client";

import { useEffect, type CSSProperties } from "react";

// The invoice page's bar (not printed): English / French, print or save as PDF; ?print=1 opens the print dialog at once
// (Vanguard's "Imprimer / PDF").
export function InvoiceToolbar({ lang, number, autoPrint }: { lang: "en" | "fr"; number?: string; autoPrint: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const id = window.setTimeout(() => window.print(), 400); // the logo and fonts drawn first
    return () => window.clearTimeout(id);
  }, [autoPrint]);

  const fr = lang === "fr";
  const link = (l: "en" | "fr") => `?lang=${l}`;
  const pill = (on: boolean): CSSProperties => ({
    padding: "5px 12px", borderRadius: 2, fontSize: 13, fontWeight: 600, textDecoration: "none",
    background: on ? "#1c3552" : "transparent", color: on ? "#fff" : "#1c3552",
  });

  return (
    <div className="ivx-noprint" style={{ maxWidth: 820, margin: "0 auto 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontFamily: "Helvetica, Arial, sans-serif" }}>
      <div style={{ fontWeight: 700, color: "#1c3552", fontSize: 15 }}>{fr ? "Facture" : "Invoice"} {number ?? (fr ? "(brouillon)" : "(draft)")}</div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 2, background: "#fff", borderRadius: 2, padding: 2, border: "1px solid #cfd8e3" }}>
        <a href={link("en")} style={pill(!fr)}>EN</a>
        <a href={link("fr")} style={pill(fr)}>FR</a>
      </div>
      <button
        type="button"
        onClick={() => window.print()}
        style={{ padding: "7px 14px", borderRadius: 2, border: 0, background: "#2e5c89", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
      >
        {fr ? "Imprimer / PDF" : "Print / PDF"}
      </button>
    </div>
  );
}
