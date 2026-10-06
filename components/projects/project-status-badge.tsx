"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { ProjectStatus } from "@/types/project";
import { toneBadge } from "@/components/ui/tone";

const statusLabels: Record<ProjectStatus, string> = {
  draft: "Draft",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const statusClasses: Record<ProjectStatus, string> = {
  draft: toneBadge.neutral,
  active: toneBadge.brand,
  on_hold: toneBadge.warning,
  completed: toneBadge.success,
  cancelled: toneBadge.neutral,
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { locale } = useI18n();
  const labels = locale === "fr" ? { draft: "Brouillon", active: "Actif", on_hold: "En pause", completed: "Terminé", cancelled: "Annulé" } : statusLabels;
  return (
    <Badge
      variant="outline"
      className={statusClasses[status]}
    >
      {labels[status]}
    </Badge>
  );
}
