"use client";

import { QueryToast } from "@/components/ui/query-toast";

const toastMessages: Record<string, { title: string; description: string; tone: "success" | "error" }> = {
  "document-uploaded": {
    title: "Document uploaded",
    description: "The file is now stored and linked in the workspace.",
    tone: "success",
  },
  "document-updated": {
    title: "Document updated",
    description: "The document metadata has been refreshed successfully.",
    tone: "success",
  },
  "document-archived": {
    title: "Document archived",
    description: "The document has been moved to the archive view.",
    tone: "success",
  },
  "document-restored": {
    title: "Document restored",
    description: "The document is active in the library again.",
    tone: "success",
  },
  "document-deleted": {
    title: "Document deleted",
    description: "The document record has been removed.",
    tone: "success",
  },
  "document-action-error": {
    title: "Document action failed",
    description: "The workspace could not complete that document action.",
    tone: "error",
  },
} as const;

export function DocumentToast() {
  return <QueryToast messages={toastMessages} />;
}
