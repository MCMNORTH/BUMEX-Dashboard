import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContributionProjectPoint } from "@/types/team";

export function ContributionByProject({ items, isFr = false }: { items: ContributionProjectPoint[]; isFr?: boolean }) {
  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardHeader>
        <CardTitle>{isFr ? "Contribution par projet" : "Contribution by project"}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">{isFr ? "Travail livré regroupé par projet pour visualiser la répartition de la contribution." : "Delivered work grouped by project to show contribution spread."}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <Link href={`/projects/${item.projectId}`} key={item.projectId} className="group block rounded-[22px] border border-border/65 bg-background/38 p-4 transition hover:border-blue-300 hover:bg-blue-50/45 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/5">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-medium">{item.projectName}<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></p>
                <p className="text-sm font-semibold">{item.completed}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary/70">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-300" style={{ width: `${Math.min(item.completed * 18, 100)}%` }} />
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            {isFr ? "Aucun travail terminé n’est encore visible." : "No completed work is visible yet."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import Link from "next/link";
import { ArrowRight } from "lucide-react";
