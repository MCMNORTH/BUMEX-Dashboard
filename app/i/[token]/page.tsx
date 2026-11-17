import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { findInvoiceByLink } from "@/lib/erp/invoice-link";
import { InvoiceFit } from "@/vanguard/one/InvoiceFit";
import { defaultInvoiceLang, InvoiceSheet, type InvoiceLang } from "@/vanguard/one/InvoiceSheet";

import { InvoiceToolbar } from "./toolbar";

// An invoice's public page, where its QR code leads (asked on 2026-11-17): the invoice as printed, for whoever has the
// link, without signing in (lib/erp/invoice-link.ts); English or French, printed or saved as PDF from the browser.
// The token stays out of any other site's logs (no referrer), and out of search engines.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "BUMEX · Invoice", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function InvoiceLinkPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string; print?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const found = await findInvoiceByLink(token).catch((error) => {
    console.error("[invoice-link]", error instanceof Error ? error.message : "unknown");
    return null;
  });
  if (!found) notFound();

  const lang: InvoiceLang = query.lang === "fr" || query.lang === "en" ? query.lang : defaultInvoiceLang(found.data.currency, found.customerCountry ?? undefined);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const url = host ? `${proto}://${host}/i/${token}` : undefined;

  return (
    <main style={{ minHeight: "100dvh", background: "#e9edf2", padding: "16px 12px 32px" }} className="ivx-screen">
      <style>{"@media print { @page { size: A4; margin: 0; } html, body, .ivx-screen { background: #fff !important; padding: 0 !important; } .ivx-noprint { display: none !important; } .ivx-screen .ivx-page { box-shadow: none !important; } }"}</style>
      <InvoiceToolbar lang={lang} number={found.data.number} autoPrint={query.print === "1"} />
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <InvoiceFit>
          <div style={{ boxShadow: "0 2px 18px rgba(15, 35, 60, .14)" }}>
            <InvoiceSheet data={{ ...found.data, url }} lang={lang} />
          </div>
        </InvoiceFit>
      </div>
    </main>
  );
}
