import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function PerformanceCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="border-border/70 bg-card">
      <CardContent className="px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
          </div>
          <div className="flex size-11 items-center justify-center rounded-xl border border-border/70 bg-background/45">
            <Icon className="size-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
