"use client";

import { QueryToast } from "@/components/ui/query-toast";

const toastMessages: Record<string, { title: string; description: string; tone: "success" | "error" }> = {
  "ticket-created": {
    title: "Ticket created",
    description: "The ticket has been added successfully.",
    tone: "success",
  },
  "ticket-updated": {
    title: "Ticket updated",
    description: "The latest ticket changes are now live.",
    tone: "success",
  },
  "ticket-deleted": {
    title: "Ticket deleted",
    description: "The ticket was removed from the workspace.",
    tone: "success",
  },
  "ticket-delete-error": {
    title: "Delete failed",
    description: "The ticket could not be deleted with your current access.",
    tone: "error",
  },
} as const;

export function TicketToast() {
  return <QueryToast messages={toastMessages} />;
}
