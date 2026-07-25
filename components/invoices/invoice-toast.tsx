"use client";

import { QueryToast } from "@/components/ui/query-toast";

const toastMessages: Record<string, { title: string; description: string; tone: "success" | "error" }> = {
  "invoice-created": { title: "Invoice created", description: "The invoice record has been added successfully.", tone: "success" },
  "invoice-updated": { title: "Invoice updated", description: "The latest invoice changes are now live.", tone: "success" },
  "invoice-deleted": { title: "Invoice deleted", description: "The invoice record was removed from the tracker.", tone: "success" },
  "invoice-delete-error": { title: "Delete failed", description: "The invoice could not be deleted with your current access.", tone: "error" },
  "receipt-created": { title: "Receipt created", description: "The receipt record has been linked successfully.", tone: "success" },
  "invoice-sent": { title: "Invoice sent", description: "The invoice email has been sent to the selected recipient.", tone: "success" },
};

export function InvoiceToast() {
  return <QueryToast messages={toastMessages} />;
}
