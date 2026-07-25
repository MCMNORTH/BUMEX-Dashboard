import { Activity, ShieldAlert, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ProjectHealth } from "@/types/project";

const config = {
  healthy: {
    label: "Healthy",
    icon: ShieldCheck,
    className: "border-emerald-500/20 bg-emerald-500/12 text-emerald-700 dark:border-emerald-300/10 dark:text-emerald-100",
  },
  warning: {
    label: "Warning",
    icon: Activity,
    className: "border-amber-500/20 bg-amber-500/12 text-amber-700 dark:border-amber-300/10 dark:text-amber-100",
  },
  at_risk: {
    label: "At risk",
    icon: ShieldAlert,
    className: "border-rose-500/20 bg-rose-500/12 text-rose-700 dark:border-rose-300/10 dark:text-rose-100",
  },
  delayed: {
    label: "Delayed",
    icon: ShieldAlert,
    className: "border-rose-500/20 bg-rose-600/16 text-rose-700 dark:border-rose-300/10 dark:text-rose-100",
  },
} satisfies Record<
  ProjectHealth,
  { label: string; icon: typeof ShieldCheck; className: string }
>;

export function ProjectHealthBadge({ health }: { health: ProjectHealth }) {
  const Icon = config[health].icon;

  return (
    <Badge
      variant="outline"
      className={`rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase ${config[health].className}`}
    >
      <Icon className="mr-1 size-3.5" />
      {config[health].label}
    </Badge>
  );
}
