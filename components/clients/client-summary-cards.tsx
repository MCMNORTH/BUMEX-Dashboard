"use client";

import { AlertTriangle, FileStack, FolderKanban, PanelsTopLeft, ReceiptText } from "lucide-react";

import { RelationshipHealthBadge } from "@/components/clients/relationship-health-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/formatters";
import { formatDate } from "@/lib/projects/helpers";
import { useI18n } from "@/components/layout/i18n-provider";
import type { ClientRelationshipSummary } from "@/types/client";

export function ClientSummaryCards({ summary }: { summary: ClientRelationshipSummary }) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const cards = [
    {
      icon: FolderKanban,
      label: isFr ? "Projets" : "Projects",
      value: `${formatNumber(summary.activeProjects)}/${formatNumber(summary.totalProjects)}`,
      detail: isFr ? "Projets actifs sur le total" : "Active versus total delivery streams",
    },
    {
      icon: PanelsTopLeft,
      label: isFr ? "Tickets ouverts" : "Open tickets",
      value: formatNumber(summary.openTickets),
      detail: isFr ? `${formatNumber(summary.overdueTickets)} en retard` : `${formatNumber(summary.overdueTickets)} overdue in visible scope`,
    },
    {
      icon: ReceiptText,
      label: isFr ? "Contrats" : "Contracts",
      value: formatNumber(summary.activeContracts),
      detail: isFr ? `${formatNumber(summary.expiredContracts)} contrat${summary.expiredContracts === 1 ? "" : "s"} expiré${summary.expiredContracts === 1 ? "" : "s"}` : `${formatNumber(summary.expiredContracts)} expired contract${summary.expiredContracts === 1 ? "" : "s"}`,
    },
    {
      icon: FileStack,
      label: isFr ? "Documents" : "Documents",
      value: formatNumber(summary.documentsCount),
      detail: isFr ? `${formatNumber(summary.archivedDocumentsCount)} document${summary.archivedDocumentsCount === 1 ? "" : "s"} archivé${summary.archivedDocumentsCount === 1 ? "" : "s"}` : `${formatNumber(summary.archivedDocumentsCount)} archived records`,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-4">
        {cards.map(({ icon: Icon, label, value, detail }) => (
          <Card key={label} className="surface-highlight relative overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
            <CardContent className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">{label}</p>
                  <p className="mt-2.5 text-[1.7rem] font-semibold tracking-[-0.05em]">{value}</p>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">{detail}</p>
                </div>
                <div className="flex size-9 items-center justify-center rounded-[16px] border border-border/70 bg-background/45">
                  <Icon className="size-4 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="grid gap-3 px-4 py-4 sm:grid-cols-3">
            <div className="rounded-[16px] border border-border/65 bg-background/38 p-3">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">{isFr ? "Dernière activité" : "Last activity"}</p>
              <p className="mt-1.5 text-[13px] font-medium">{formatDate(summary.lastActivityDate)}</p>
            </div>
            <div className="rounded-[16px] border border-border/65 bg-background/38 p-3">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">{isFr ? "Prochain renouvellement" : "Upcoming renewal"}</p>
              <p className="mt-1.5 text-[13px] font-medium">{summary.upcomingContractRenewal?.title ?? (isFr ? "Aucun prévu" : "None scheduled")}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(summary.upcomingContractRenewal?.renewal_date ?? summary.upcomingContractRenewal?.end_date ?? null)}</p>
            </div>
            <div className="rounded-[16px] border border-border/65 bg-background/38 p-3">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">{isFr ? "Prochaine échéance" : "Upcoming deadline"}</p>
              <p className="mt-1.5 text-[13px] font-medium">{summary.upcomingProjectDeadline?.name ?? (isFr ? "Aucune échéance" : "No project deadline")}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(summary.upcomingProjectDeadline?.end_date ?? null)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-3 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">{isFr ? "Santé de la relation" : "Relationship health"}</p>
                <h3 className="mt-1.5 text-base font-semibold tracking-tight">{isFr ? "État de la relation client" : "Client relationship signal"}</h3>
              </div>
              <RelationshipHealthBadge health={summary.relationshipHealth} />
            </div>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <div className="rounded-[16px] border border-border/65 bg-background/38 p-3">
                <p className="text-[12px] font-medium">{isFr ? "Projets en retard" : "Delayed projects"}</p>
                <p className="mt-1.5 text-[1.45rem] font-semibold tracking-[-0.04em]">{formatNumber(summary.delayedProjects)}</p>
              </div>
              <div className="rounded-[16px] border border-border/65 bg-background/38 p-3">
                <p className="text-[12px] font-medium">{isFr ? "Tickets en retard" : "Overdue tickets"}</p>
                <p className="mt-1.5 text-[1.45rem] font-semibold tracking-[-0.04em]">{formatNumber(summary.overdueTickets)}</p>
              </div>
              <div className="rounded-[16px] border border-border/65 bg-background/38 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-medium">{isFr ? "Risque contrat" : "Contract risk"}</p>
                  <AlertTriangle className="size-3.5 text-primary" />
                </div>
                <p className="mt-1.5 text-[1.45rem] font-semibold tracking-[-0.04em]">{formatNumber(summary.expiredContracts)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
