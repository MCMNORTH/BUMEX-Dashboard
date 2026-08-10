"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import { getTicketStatusLabel } from "@/lib/tickets/helpers";
import type { TicketStatus } from "@/types/ticket";

const statusClasses: Record<TicketStatus, string> = {
  backlog: "border-slate-500/25 bg-slate-100 text-slate-700 dark:border-slate-300/10 dark:bg-slate-500/12 dark:text-slate-100",
  todo: "border-indigo-500/25 bg-indigo-50 text-indigo-700 dark:border-indigo-300/10 dark:bg-indigo-500/12 dark:text-indigo-100",
  in_progress: "border-sky-500/25 bg-sky-50 text-sky-700 dark:border-sky-300/10 dark:bg-sky-500/12 dark:text-sky-100",
  review: "border-violet-500/25 bg-violet-50 text-violet-700 dark:border-violet-300/10 dark:bg-violet-500/12 dark:text-violet-100",
  blocked: "border-rose-500/25 bg-rose-50 text-rose-700 dark:border-rose-300/10 dark:bg-rose-500/12 dark:text-rose-100",
  done: "border-emerald-500/25 bg-emerald-50 text-emerald-700 dark:border-emerald-300/10 dark:bg-emerald-500/12 dark:text-emerald-100",
  archived: "border-zinc-500/25 bg-zinc-100 text-zinc-700 dark:border-zinc-300/10 dark:bg-zinc-500/12 dark:text-zinc-200",
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const { locale } = useI18n();
  const labels = locale === "fr" ? { backlog: "En attente", todo: "À faire", in_progress: "En cours", review: "En révision", blocked: "Bloqué", done: "Terminé", archived: "Archivé" } : null;
  return (
    <Badge
      variant="outline"
      className={`rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase ${statusClasses[status]}`}
    >
      {labels ? labels[status] : getTicketStatusLabel(status)}
    </Badge>
  );
}
