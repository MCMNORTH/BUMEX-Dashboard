import { Sparkles } from "lucide-react";

import { AvailabilityBadge } from "@/components/team/availability-badge";
import { CapacityBar } from "@/components/team/capacity-bar";
import { WorkloadRiskBadge } from "@/components/team/workload-risk-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { AssignmentHelperRecord } from "@/types/team";

export function AssignmentHelper({
  helper,
}: {
  helper: AssignmentHelperRecord;
}) {
  return (
    <div className="space-y-3 sm:col-span-2">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Assignment helper</p>
        <h3 className="mt-2 text-base font-semibold tracking-tight">Visible assignee load</h3>
      </div>

      {helper.currentAssignee ? (
        <Card className="border-border/70 bg-background/35">
          <CardContent className="space-y-3 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{helper.currentAssignee.full_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{helper.currentAssignee.active_work_items} active / {helper.currentAssignee.estimated_hours_total.toFixed(1)}h estimated</p>
              </div>
              <WorkloadRiskBadge risk={helper.currentAssignee.workload_risk} />
            </div>
            <div className="flex flex-wrap gap-2">
              <AvailabilityBadge status={helper.currentAssignee.availability_status} />
            </div>
            <CapacityBar
              percentage={Math.min(helper.currentAssignee.utilization_percentage, 100)}
              tone={helper.currentAssignee.workload_risk === "high" ? "critical" : helper.currentAssignee.workload_risk === "moderate" ? "warning" : "default"}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-4 text-sm text-muted-foreground">
          Select an assignee to review current visible workload.
        </div>
      )}

      {helper.suggestedMembers.length ? (
        <div className="rounded-[22px] border border-border/65 bg-background/35 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-primary" />
            Suggested available people
          </div>
          <div className="mt-3 space-y-3">
            {helper.suggestedMembers.slice(0, 3).map((member) => (
              <div key={member.id} className="rounded-2xl border border-border/60 bg-background/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{member.full_name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{member.estimated_hours_total.toFixed(1)}h / {member.weekly_capacity_hours}h</p>
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">{member.utilization_percentage}%</p>
                </div>
                <div className="mt-3">
                  <CapacityBar percentage={member.utilization_percentage} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
