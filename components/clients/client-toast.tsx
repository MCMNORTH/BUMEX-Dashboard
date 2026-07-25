"use client";

import { QueryToast } from "@/components/ui/query-toast";

const toastMessages: Record<string, { title: string; description: string; tone: "success" | "error" }> = {
  "client-created": {
    title: "Client created",
    description: "The client profile has been added to the portfolio.",
    tone: "success",
  },
  "client-updated": {
    title: "Client updated",
    description: "The latest client changes are now visible across the workspace.",
    tone: "success",
  },
  "client-archived": {
    title: "Client archived",
    description: "The client was archived successfully.",
    tone: "success",
  },
  "client-archive-error": {
    title: "Archive failed",
    description: "The client could not be archived with your current access.",
    tone: "error",
  },
} as const;

export function ClientToast() {
  return <QueryToast messages={toastMessages} />;
}
