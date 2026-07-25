"use client";

import { QueryToast } from "@/components/ui/query-toast";

const toastMessages: Record<string, { title: string; description: string; tone: "success" | "error" }> = {
  "project-created": {
    title: "Project created",
    description: "The project has been added to the delivery workspace.",
    tone: "success",
  },
  "project-updated": {
    title: "Project updated",
    description: "The latest project changes are now visible to the team.",
    tone: "success",
  },
  "project-deleted": {
    title: "Project deleted",
    description: "The project record was removed from the workspace.",
    tone: "success",
  },
  "project-delete-error": {
    title: "Delete failed",
    description: "The project could not be deleted with your current access.",
    tone: "error",
  },
} as const;

export function ProjectToast() {
  return <QueryToast messages={toastMessages} />;
}
