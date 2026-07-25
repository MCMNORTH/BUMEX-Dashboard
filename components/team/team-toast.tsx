"use client";

import { QueryToast } from "@/components/ui/query-toast";

const toastMessages: Record<string, { title: string; description: string; tone: "success" | "error" }> = {
  "team-updated": {
    title: "Profile updated",
    description: "The team member profile changes are now live.",
    tone: "success",
  },
} as const;

export function TeamToast() {
  return <QueryToast messages={toastMessages} />;
}
