import { AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function BlockersSummary({
  items,
}: {
  items: Array<{ projectName: string; count: number }>;
}) {
  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-primary" />
          <CardTitle>Blockers summary</CardTitle>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">Projects with visible blocked work requiring support or sequencing attention.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <div key={item.projectName} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{item.projectName}</p>
                <p className="text-sm font-semibold">{item.count}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            No blockers are currently visible in the selected scope.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
