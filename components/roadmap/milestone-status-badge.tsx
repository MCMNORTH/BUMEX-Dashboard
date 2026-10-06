import { Badge } from "@/components/ui/badge";
import type { MilestoneStatus } from "@/types/milestone";
import { toneBadge } from "@/components/ui/tone";

const labels: Record<MilestoneStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  delayed: "Delayed",
  cancelled: "Cancelled",
};

const classes: Record<MilestoneStatus, string> = {
  planned: toneBadge.neutral,
  in_progress: toneBadge.brand,
  completed: toneBadge.success,
  delayed: toneBadge.danger,
  cancelled: toneBadge.neutral,
};

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  return (
    <Badge className={classes[status]}>
      {labels[status]}
    </Badge>
  );
}

