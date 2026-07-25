import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContributionProjectPoint } from "@/types/team";

export function ContributionByProject({ items }: { items: ContributionProjectPoint[] }) {
  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardHeader>
        <CardTitle>Contribution by project</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">Delivered work grouped by project to show contribution spread.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <div key={item.projectId} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{item.projectName}</p>
                <p className="text-sm font-semibold">{item.completed}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary/70">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-300" style={{ width: `${Math.min(item.completed * 18, 100)}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            No completed work is visible yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
