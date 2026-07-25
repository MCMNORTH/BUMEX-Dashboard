"use client";

import { QueryToast } from "@/components/ui/query-toast";

const toastMessages: Record<string, { title: string; description: string; tone: "success" | "error" }> = {
  "transfer-created": {
    title: "Transfer created",
    description: "The outgoing transfer has been added successfully.",
    tone: "success",
  },
  "transfer-updated": {
    title: "Transfer updated",
    description: "The latest transfer changes are now live.",
    tone: "success",
  },
  "transfer-deleted": {
    title: "Transfer deleted",
    description: "The transfer record was removed from the tracker.",
    tone: "success",
  },
  "transfer-delete-error": {
    title: "Delete failed",
    description: "The transfer could not be deleted with your current access.",
    tone: "error",
  },
};

export function TransferToast() {
  return <QueryToast messages={toastMessages} />;
}
