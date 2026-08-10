"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { ProjectStatus } from "@/types/project";

const statusLabels: Record<ProjectStatus, string> = {
  draft: "Draft",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const statusClasses: Record<ProjectStatus, string> = {
  draft: "border-slate-500/20 bg-slate-500/12 text-slate-700 dark:border-slate-300/10 dark:text-slate-200",
  active: "border-sky-500/20 bg-sky-500/12 text-sky-700 dark:border-sky-300/10 dark:text-sky-100",
  on_hold: "border-amber-500/20 bg-amber-500/12 text-amber-700 dark:border-amber-300/10 dark:text-amber-100",
  completed: "border-emerald-500/20 bg-emerald-500/12 text-emerald-700 dark:border-emerald-300/10 dark:text-emerald-100",
  cancelled: "border-rose-500/20 bg-rose-500/12 text-rose-700 dark:border-rose-300/10 dark:text-rose-100",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { locale } = useI18n();
  const labels = locale === "fr" ? { draft: "Brouillon", active: "Actif", on_hold: "En pause", completed: "Terminé", cancelled: "Annulé" } : statusLabels;
  return (
    <Badge
      variant="outline"
      className={`rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase ${statusClasses[status]}`}
    >
      {labels[status]}
    </Badge>
  );
}
