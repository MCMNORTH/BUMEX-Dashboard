import { Clock3, PanelsTopLeft, TimerReset } from "lucide-react";

import { AvailabilityBadge } from "@/components/team/availability-badge";
import { CapacityBar } from "@/components/team/capacity-bar";
import { WorkloadRiskBadge } from "@/components/team/workload-risk-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/formatters";
import type { TeamWorkloadRecord } from "@/types/team";

function getTone(record: TeamWorkloadRecord) {
  if (record.workload_risk === "high") {
    return "critical" as const;
  }

  if (record.workload_risk === "moderate") {
    return "warning" as const;
  }

  return "default" as const;
}

export function WorkloadCard({ record }: { record: TeamWorkloadRecord }) {
  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardContent className="space-y-4 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold tracking-tight">{record.full_name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{record.job_title ?? record.role}</p>
          </div>
          <WorkloadRiskBadge risk={record.workload_risk} />
        </div>

        <div className="flex flex-wrap gap-2">
          <AvailabilityBadge status={record.availability_status} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Capacity usage</span>
            <span className="font-medium">{formatNumber(record.utilization_percentage)}%</span>
          </div>
          <CapacityBar percentage={record.utilization_percentage} tone={getTone(record)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric icon={PanelsTopLeft} label="Active" value={formatNumber(record.active_work_items)} />
          <Metric icon={TimerReset} label="Estimate" value={`${formatNumber(Number(record.estimated_hours_total.toFixed(1)))}h`} />
          <Metric icon={Clock3} label="Overdue" value={formatNumber(record.overdue_items)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof PanelsTopLeft; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-3 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}
