import { AlertTriangle, BriefcaseBusiness } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {workload.length ? (
        <ul className="divide-y divide-border">
          {workload.slice(0, 6).map((member) => (
            <li key={member.id} className="grid items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem]">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{member.full_name}</span>
                <span className="block text-xs text-muted-foreground">{member.role}</span>
              </span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <BriefcaseBusiness className="size-4" />
                {member.assignedTickets} {isFr ? "assignés" : "assigned"}
              </span>
              <span className={`flex items-center gap-1.5 text-sm ${member.overdueTickets ? "text-danger" : "text-muted-foreground"}`}>
                <AlertTriangle className="size-4" />
                {member.overdueTickets} {isFr ? "en retard" : "overdue"}
              </span>
              <span>
                <Badge variant="outline" className={getWorkloadTone(member.activeTickets, member.overdueTickets)}>
                  {getWorkloadLabel(member.activeTickets, member.overdueTickets, isFr)}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {isFr ? "Aucune charge assignée n'est encore visible dans le périmètre actuel." : "No assignee workload is visible yet for the current scope."}
        </p>
      )}
    </Card>
  );
}
