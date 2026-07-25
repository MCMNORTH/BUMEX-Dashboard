import Link from "next/link";
import { AlertTriangle, ArrowRight, BriefcaseBusiness, Clock3, ShieldAlert, UsersRound } from "lucide-react";

import { AlertSeverityBadge } from "@/components/alerts/alert-severity-badge";
import { RiskIndicator } from "@/components/alerts/risk-indicator";
import { Badge } from "@/components/ui/badge";
import type { PlanningAlert } from "@/types/alert";

const iconMap = {
  overdue: AlertTriangle,
  workload: UsersRound,
  deadline_risk: Clock3,
  blocked: ShieldAlert,
  unassigned: AlertTriangle,
  financial_due: BriefcaseBusiness,
  contract_due: BriefcaseBusiness,
} as const;

export function AlertCard({
  alert,
  compact = false,
}: {
  alert: PlanningAlert;
  compact?: boolean;
}) {
  const Icon = iconMap[alert.type];

  const content = (
    <div className={`rounded-[24px] border border-border/65 bg-background/40 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:bg-background/52 ${compact ? "" : "shadow-[var(--shadow-soft)]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl border border-border/65 bg-background/50">
            <Icon className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium tracking-[-0.02em]">{alert.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{alert.description}</p>
          </div>
        </div>
        <AlertSeverityBadge severity={alert.severity} />
      </div>

      <div className="mt-4 space-y-3">
        <RiskIndicator severity={alert.severity} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {alert.label ? (
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                {alert.label}
              </Badge>
            ) : null}
            {alert.metric ? (
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {alert.metric}
              </Badge>
            ) : null}
          </div>
          {alert.href ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              Open context
              <ArrowRight className="size-3.5" />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (alert.href) {
    return <Link href={alert.href}>{content}</Link>;
  }

  return content;
}
