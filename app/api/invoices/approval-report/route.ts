import { NextResponse } from "next/server";

import { getAuthContext, getDevPreviewAuthContext, isDevPreviewAuthEnabled } from "@/lib/auth/server";
import { getInvoices } from "@/lib/finance/service";
import type { InvoiceRecord } from "@/types/finance";

export async function GET() {
  const auth = await getAuthContext();
  const previewAuth = isDevPreviewAuthEnabled() ? getDevPreviewAuthContext() : null;
  const effectiveAuth = auth.user && auth.profile && auth.role ? auth : previewAuth;

  if (!effectiveAuth?.role || effectiveAuth.role !== "admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const invoices = await getInvoices("admin", {});
  const header = [
    "Facture", "Entité", "Client", "Projet", "Montant TTC", "Devise", "État de validation",
    "Créée par", "Date de création", "Validée par", "Date de validation", "Délai de validation (heures)",
    "Demandes de correction", "Dernier motif de correction",
  ];
  const rows = invoices.map((invoice) => {
    const requests = getRevisionRequests(invoice);
    const latestRequest = requests[0];
    const approvalHours = invoice.approved_at
      ? Math.max(0, Math.round(((new Date(invoice.approved_at).getTime() - new Date(invoice.created_at).getTime()) / 3_600_000) * 10) / 10)
      : "";
    return [
      invoice.invoice_number,
      invoice.entity_code ?? "",
      invoice.client?.name ?? "",
      invoice.project?.name ?? "",
      invoice.amount_ttc,
      invoice.currency,
      getApprovalState(invoice),
      invoice.createdBy?.full_name ?? "",
      invoice.created_at,
      invoice.approvedBy?.full_name ?? "",
      invoice.approved_at ?? "",
      approvalHours,
      requests.length,
      latestRequest?.metadata.summary ?? "",
    ];
  });
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(toCsvCell).join(";")).join("\r\n")}`;
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rapport-validations-factures-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function getRevisionRequests(invoice: InvoiceRecord) {
  return invoice.recentActivity
    .filter((activity) => activity.action === "Invoice changes requested")
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

function getApprovalState(invoice: InvoiceRecord) {
  if (invoice.approval_status === "approved") return "Validée";
  const latestRequest = getRevisionRequests(invoice)[0];
  if (latestRequest && new Date(latestRequest.created_at).getTime() > new Date(invoice.updated_at).getTime()) return "À corriger";
  return "À valider";
}

function toCsvCell(value: string | number) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
