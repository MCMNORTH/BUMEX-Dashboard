import { AlertList } from "@/components/alerts/alert-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlanningAlert } from "@/types/alert";

export function PlanningRiskPanel({
  alerts,
  title = "Planning alerts",
  subtitle = "Risk signals calculated from tickets, milestones, deadlines, and current workload.",
  compact = false,
  emptyMessage,
}: {
  alerts: PlanningAlert[];
  title?: string;
  subtitle?: string;
  compact?: boolean;
  emptyMessage?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <AlertList alerts={alerts} compact={compact} emptyMessage={emptyMessage} />
      </CardContent>
    </Card>
  );
}

