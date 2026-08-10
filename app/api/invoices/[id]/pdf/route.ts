import { Buffer } from "node:buffer";

import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity/service";
import { getAuthContext, getDevPreviewAuthContext, isDevPreviewAuthEnabled } from "@/lib/auth/server";
import { generateInvoicePdf } from "@/lib/finance/invoice-pdf";
import { getInvoicePdfFileName } from "@/lib/finance/invoice-view";
import { getInvoiceById } from "@/lib/finance/service";
import { getCurrentLocale } from "@/lib/i18n/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext();
  const previewAuth = isDevPreviewAuthEnabled() ? getDevPreviewAuthContext() : null;
  const effectiveAuth = auth.user && auth.profile && auth.role ? auth : previewAuth;
  const effectiveRole = effectiveAuth?.role ?? null;

  if (!effectiveRole) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const locale = await getCurrentLocale();
  const invoice = await getInvoiceById(id, effectiveRole);

  if (!invoice) {
    return new NextResponse("Not found", { status: 404 });
  }

  const pdfBytes = await generateInvoicePdf(invoice, locale);
  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";

  if (effectiveAuth?.profile) {
    await logActivity({
      userId: effectiveAuth.profile.id,
      action: download ? "Downloaded invoice PDF" : "Viewed invoice PDF",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        kind: "view",
        summary: download ? "Invoice PDF downloaded" : "Invoice PDF opened",
      },
    });
  }

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${getInvoicePdfFileName(invoice)}"`,
    },
  });
}
