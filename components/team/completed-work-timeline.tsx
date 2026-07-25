import { CheckCircle2, Clock3 } from "lucide-react";

import { formatDate } from "@/lib/projects/helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompletedWorkTimelineItem } from "@/types/team";

export function CompletedWorkTimeline({ items }: { items: CompletedWorkTimelineItem[] }) {
  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardHeader>
        <CardTitle>Completed work timeline</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">Recently delivered work with timing context and project linkage.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/65 bg-background/45">
                  {item.completedOnTime ? <CheckCircle2 className="size-4 text-emerald-300" /> : <Clock3 className="size-4 text-amber-300" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.projectName ?? "No project"}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.completedOnTime ? "Completed on time" : "Completed after planned date"} / {formatDate(item.completedAt)}</p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            No recently delivered work is visible in the current scope.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
