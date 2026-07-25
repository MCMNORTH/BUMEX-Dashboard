import { AlertCard } from "@/components/alerts/alert-card";
import type { PlanningAlert } from "@/types/alert";

export function AlertList({
  alerts,
  compact = false,
  emptyMessage = "No planning alerts in the current scope.",
}: {
  alerts: PlanningAlert[];
  compact?: boolean;
  emptyMessage?: string;
}) {
  if (!alerts.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {alerts.map((alert) => (
        <AlertCard key={alert.id} alert={alert} compact={compact} />
      ))}
    </div>
  );
}

