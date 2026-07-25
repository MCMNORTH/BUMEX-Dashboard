import { AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanningTaskCard } from "@/components/planning/planning-task-card";
import { getCurrentLocale } from "@/lib/i18n/server";
import type { TicketRecord } from "@/types/ticket";

export async function OverdueTasksPanel({
  tickets,
  summaryMode = false,
}: {
  tickets: TicketRecord[];
  summaryMode?: boolean;
}) {
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";

  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-primary" />
          <CardTitle>{isFr ? "Tâches en retard" : "Overdue tasks"}</CardTitle>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{isFr ? "Travail ouvert déjà au-delà de sa date d'échéance." : "Open work already beyond its due date."}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {tickets.length ? (
          summaryMode ? (
            <div className="rounded-[22px] border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">{tickets.length} {isFr ? "éléments en retard" : "overdue items"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{isFr ? "La visibilité détaillée des tâches est masquée en mode synthèse." : "Detailed task visibility is hidden in summary mode."}</p>
            </div>
          ) : (
            tickets.slice(0, 6).map((ticket) => (
              <PlanningTaskCard key={ticket.id} ticket={ticket} />
            ))
          )
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            {isFr ? "Aucune tâche en retard dans le périmètre actuel de planification." : "No overdue tasks in the current planning scope."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
