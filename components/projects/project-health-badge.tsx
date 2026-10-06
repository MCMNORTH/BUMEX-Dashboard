"use client";

import { Activity, ShieldAlert, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { ProjectHealth } from "@/types/project";
import { toneBadge } from "@/components/ui/tone";

const config = {
  healthy: {
    label: "Healthy",
    icon: ShieldCheck,
    className: toneBadge.success,
  },
  warning: {
    label: "Warning",
    icon: Activity,
    className: toneBadge.warning,
  },
  at_risk: {
    label: "At risk",
    icon: ShieldAlert,
    className: toneBadge.danger,
  },
  delayed: {
    label: "Delayed",
    icon: ShieldAlert,
    className: toneBadge.danger,
  },
} satisfies Record<
  ProjectHealth,
  { label: string; icon: typeof ShieldCheck; className: string }
>;

export function ProjectHealthBadge({ health }: { health: ProjectHealth }) {
  const { locale } = useI18n();
  const Icon = config[health].icon;

  return (
    <Badge
      variant="outline"
      className={config[health].className}
    >
      <Icon className="mr-1 size-3.5" />
      {locale === "fr" ? ({ healthy: "Bon", warning: "Vigilance", at_risk: "À risque", delayed: "En retard" } as const)[health] : config[health].label}
    </Badge>
  );
}
