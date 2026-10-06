import { AlertTriangle, BriefcaseBusiness, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentLocale } from "@/lib/i18n/server";
import type { TicketWorkloadRecord } from "@/types/ticket";

function getWorkloadTone(activeTickets: number, overdueTickets: number) {
  if (overdueTickets > 0 || activeTickets >= 8) {
    return "border-danger/25 bg-danger/10 text-danger dark:border-danger/10 dark:bg-danger/12";
  }

  if (activeTickets >= 5) {
    return "border-warning/25 bg-warning/10 text-warning dark:border-warning/10 dark:bg-warning/12";
  }

  return "border-success/25 bg-success/10 text-success dark:border-success/10 dark:bg-success/12";
}

function getWorkloadLabel(activeTickets: number, overdueTickets: number, isFr: boolean) {
  if (overdueTickets > 0 || activeTickets >= 8) {
    return isFr ? "Charge élevée" : "High load";
  }

  if (activeTickets >= 5) {
    return isFr ? "Équilibrée" : "Balanced";
  }

  return isFr ? "Saine" : "Healthy";
}

export async function TicketWorkloadPreview({
  workload,
  title = "Team workload preview",
  subtitle = "Assigned ticket pressure, overdue count, and active execution load.",
}: {
  workload: TicketWorkloadRecord[];
  title?: string;
  subtitle?: string;
}) {
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";

  return (
    <Card className="bg-card overflow-hidden border-primary/25 shadow-[var(--shadow-soft)] dark:border-slate-700 dark:shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-primary/80">
        <div>
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Charge" : "Workload"}</p>
          <CardTitle className="mt-2 text-xl">{title}</CardTitle>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted">
          <UsersRound className="size-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {workload.length ? (
          workload.slice(0, 6).map((member) => (
            <div
              key={member.id}
              className="grid gap-3 rounded-xl border border-border bg-muted/70 p-3 md:grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr]"
            >
              <div>
                <p className="text-sm font-medium">{member.full_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{member.role}</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <BriefcaseBusiness className="size-4 text-muted-foreground" />
                <span>{member.assignedTickets} {isFr ? "assignés" : "assigned"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="size-4 text-muted-foreground" />
                <span>{member.overdueTickets} {isFr ? "en retard" : "overdue"}</span>
              </div>
              <div>
                <Badge
                  variant="outline"
                  className={getWorkloadTone(member.activeTickets, member.overdueTickets)}
                >
                  {getWorkloadLabel(member.activeTickets, member.overdueTickets, isFr)}
                </Badge>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/70 p-4 text-sm text-muted-foreground">
            {isFr ? "Aucune charge assignée n'est encore visible dans le périmètre actuel." : "No assignee workload is visible yet for the current scope."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
