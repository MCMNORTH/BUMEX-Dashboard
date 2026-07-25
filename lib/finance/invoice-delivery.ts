import "server-only";

import { Buffer } from "node:buffer";

import { logActivity } from "@/lib/activity/service";
import { upsertBinaryDocument } from "@/lib/documents/service";
import { sendMail } from "@/lib/email/server";
import {
  GENERATED_INVOICE_DESCRIPTION,
  getInvoiceDocumentTitle,
  getInvoiceEmailHtml,
  getInvoiceEmailSubject,
  getInvoiceEmailText,
  getInvoicePdfFileName,
} from "@/lib/finance/invoice-view";
import { generateInvoicePdf } from "@/lib/finance/invoice-pdf";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceRecord } from "@/types/finance";

async function getExistingGeneratedInvoiceDocumentId(invoiceId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .eq("related_type", "invoice")
    .eq("related_id", invoiceId)
    .eq("document_type", "invoice")
    .eq("description", GENERATED_INVOICE_DESCRIPTION)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

export async function ensureInvoicePdfDocument(invoice: InvoiceRecord, actorUserId: string) {
  const pdfBytes = await generateInvoicePdf(invoice);
  const existingDocumentId = await getExistingGeneratedInvoiceDocumentId(invoice.id);

  const documentId = await upsertBinaryDocument({
    existingDocumentId,
    title: getInvoiceDocumentTitle(invoice),
    description: GENERATED_INVOICE_DESCRIPTION,
    documentType: "invoice",
    relatedType: "invoice",
    relatedId: invoice.id,
    visibility: "management",
    fileName: getInvoicePdfFileName(invoice),
    mimeType: "application/pdf",
    bytes: Buffer.from(pdfBytes),
    actorUserId,
  });

  return {
    documentId,
    pdfBytes: Buffer.from(pdfBytes),
  };
}

export async function sendInvoiceToRecipient(
  invoice: InvoiceRecord,
  recipientEmail: string,
  actorUserId: string,
) {
  const { pdfBytes } = await ensureInvoicePdfDocument(invoice, actorUserId);

  await sendMail({
    to: recipientEmail,
    subject: getInvoiceEmailSubject(invoice),
    html: getInvoiceEmailHtml(invoice),
    text: getInvoiceEmailText(invoice),
    attachments: [
      {
        filename: getInvoicePdfFileName(invoice),
        content: pdfBytes,
        contentType: "application/pdf",
      },
    ],
  });

  await logActivity({
    userId: actorUserId,
    action: "Sent invoice by email",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: {
      kind: "update",
      field: "email_delivery",
      to: recipientEmail,
      summary: `Invoice emailed to ${recipientEmail}`,
    },
  });
}
