"use client";

import { QueryToast } from "@/components/ui/query-toast";

const toastMessages: Record<string, { title: string; description: string; tone: "success" | "error" }> = {
  "contract-created": {
    title: "Contract created",
    description: "The contract has been added successfully.",
    tone: "success",
  },
  "contract-updated": {
    title: "Contract updated",
    description: "The latest contract changes are now live.",
    tone: "success",
  },
  "contract-archived": {
    title: "Contract archived",
    description: "The contract was archived successfully.",
    tone: "success",
  },
  "contract-archive-error": {
    title: "Archive failed",
    description: "The contract could not be archived with your current access.",
    tone: "error",
  },
} as const;

export function ContractToast() {
  return <QueryToast messages={toastMessages} />;
}
