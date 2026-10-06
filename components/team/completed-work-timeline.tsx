import { CheckCircle2, Clock3 } from "lucide-react";

import { formatDate } from "@/lib/projects/helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompletedWorkTimelineItem } from "@/types/team";

export function CompletedWorkTimeline({ items, isFr = false }: { items: CompletedWorkTimelineItem[]; isFr?: boolean }) {
  return (
    <Card className="border-border/70 bg-card">
      <CardHeader>
        <CardTitle>{isFr ? "Chronologie du travail terminé" : "Completed work timeline"}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">{isFr ? "Travail récemment livré avec son contexte de date et projet." : "Recently delivered work with timing context and project linkage."}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <Link href={`/tickets/${item.id}`} key={item.id} className="block rounded-xl border border-border/65 bg-background/38 p-4 transition hover:border-success/35 hover:bg-success/10 dark:hover:border-success/30 dark:hover:bg-success/5">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/65 bg-background/45">
                  {item.completedOnTime ? <CheckCircle2 className="size-4 text-success" /> : <Clock3 className="size-4 text-warning" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.projectName ?? (isFr ? "Aucun projet" : "No project")}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.completedOnTime ? (isFr ? "Terminé dans les délais" : "Completed on time") : (isFr ? "Terminé après la date prévue" : "Completed after planned date")} / {formatDate(item.completedAt)}</p>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            {isFr ? "Aucun travail récemment livré n’est visible dans ce périmètre." : "No recently delivered work is visible in the current scope."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import Link from "next/link";
