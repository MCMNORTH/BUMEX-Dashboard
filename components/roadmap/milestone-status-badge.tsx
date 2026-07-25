import { Badge } from "@/components/ui/badge";
import type { MilestoneStatus } from "@/types/milestone";

const labels: Record<MilestoneStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  delayed: "Delayed",
  cancelled: "Cancelled",
};

const classes: Record<MilestoneStatus, string> = {
  planned: "border-sky-500/20 bg-sky-500/10 text-sky-100",
  in_progress: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
  completed: "border-emerald-500/20 bg-emerald-500/10 text-emerald-100",
  delayed: "border-amber-500/20 bg-amber-500/10 text-amber-100",
  cancelled: "border-slate-500/20 bg-slate-500/10 text-slate-300",
};

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  return (
    <Badge className={`rounded-full px-3 py-1 text-[11px] tracking-[0.12em] uppercase ${classes[status]}`}>
      {labels[status]}
    </Badge>
  );
}

