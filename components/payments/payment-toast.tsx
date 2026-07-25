"use client";

import { QueryToast } from "@/components/ui/query-toast";

const toastMessages: Record<string, { title: string; description: string; tone: "success" | "error" }> = {
  "payment-created": {
    title: "Payment created",
    description: "The payment record has been added successfully.",
    tone: "success",
  },
  "payment-updated": {
    title: "Payment updated",
    description: "The latest payment changes are now live.",
    tone: "success",
  },
  "payment-deleted": {
    title: "Payment deleted",
    description: "The payment record was removed from the tracker.",
    tone: "success",
  },
  "payment-delete-error": {
    title: "Delete failed",
    description: "The payment could not be deleted with your current access.",
    tone: "error",
  },
};

export function PaymentToast() {
  return <QueryToast messages={toastMessages} />;
}
