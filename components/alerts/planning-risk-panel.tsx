import { ShieldAlert } from "lucide-react";

import { AlertList } from "@/components/alerts/alert-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlanningAlert } from "@/types/alert";

export function PlanningRiskPanel({
  alerts,
  title = "Planning alerts",
  subtitle = "Risk signals calculated from tickets, milestones, deadlines, and current workload.",
  compact = false,
}: {
  alerts: PlanningAlert[];
  title?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <Card className="border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Operational intelligence</p>
          <CardTitle className="mt-2 text-xl">{title}</CardTitle>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background/45">
          <ShieldAlert className="size-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <AlertList alerts={alerts} compact={compact} />
      </CardContent>
    </Card>
  );
}

