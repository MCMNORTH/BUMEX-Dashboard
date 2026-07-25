"use client";

import { QueryToast } from "@/components/ui/query-toast";

const toastMessages: Record<string, { title: string; description: string; tone: "success" | "error" }> = {
  "milestone-created": {
    title: "Milestone created",
    description: "The milestone was added to the roadmap.",
    tone: "success",
  },
  "milestone-updated": {
    title: "Milestone updated",
    description: "The roadmap now reflects the latest milestone changes.",
    tone: "success",
  },
  "milestone-deleted": {
    title: "Milestone deleted",
    description: "The milestone was removed from the roadmap.",
    tone: "success",
  },
  "milestone-completed": {
    title: "Milestone completed",
    description: "The milestone has been marked as completed.",
    tone: "success",
  },
  "milestone-delete-error": {
    title: "Delete failed",
    description: "The milestone could not be deleted with your current access.",
    tone: "error",
  },
  "milestone-update-error": {
    title: "Update failed",
    description: "The milestone change could not be saved.",
    tone: "error",
  },
} as const;

export function RoadmapToast() {
  return <QueryToast messages={toastMessages} />;
}
