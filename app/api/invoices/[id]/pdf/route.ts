import { Buffer } from "node:buffer";

import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity/service";
import { getAuthContext } from "@/lib/auth/server";
import { generateInvoicePdf } from "@/lib/finance/invoice-pdf";
import { getInvoicePdfFileName } from "@/lib/finance/invoice-view";
import { getInvoiceById } from "@/lib/finance/service";
import { getCurrentLocale } from "@/lib/i18n/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext();
  const allowLocalPreviewAccess =
    process.env.NODE_ENV === "development" && process.env.ENABLE_LOCAL_PREVIEW_AUTH === "0";
  const effectiveRole = auth.role ?? (allowLocalPreviewAccess ? "admin" : null);

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

  if (auth.profile) {
    await logActivity({
      userId: auth.profile.id,
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
