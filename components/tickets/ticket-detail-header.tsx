"use client";

import { Trash2 } from "lucide-react";

import { deleteTicketAction } from "@/app/(app)/tickets/actions";
import { useI18n } from "@/components/layout/i18n-provider";
import { getTicketDueLabel, getTicketDueState } from "@/lib/tickets/helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmActionForm } from "@/components/shared/confirm-action-form";
import { TicketForm } from "@/components/tickets/ticket-form";
import type { TeamWorkloadRecord } from "@/types/team";
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import { TicketTypeBadge } from "@/components/tickets/ticket-type-badge";
import { toneBadge } from "@/components/ui/tone";
import type { AppRole } from "@/types/auth";
import type { TicketFiltersData, TicketRecord } from "@/types/ticket";

type TicketDetailHeaderProps = {
  ticket: TicketRecord;
  role: AppRole;
  canManage: boolean;
  canUpdate: boolean;
  filterData: TicketFiltersData;
  assigneeWorkloads: TeamWorkloadRecord[];
  suggestedAssignees: TeamWorkloadRecord[];
};

const dueTone = {
  none: toneBadge.neutral,
  planned: toneBadge.neutral,
  soon: toneBadge.warning,
  overdue: toneBadge.danger,
} as const;

function DetailTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium break-words">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground break-words">{detail}</p>
    </div>
  );
}

export function TicketDetailHeader({
  ticket,
  role,
  canManage,
  canUpdate,
  filterData,
  assigneeWorkloads,
  suggestedAssignees,
}: TicketDetailHeaderProps) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const dueState = getTicketDueState(ticket.due_date);
  const dueLabel = isFr
    ? ({ none: "Aucune échéance", planned: "Planifiée", soon: "Échéance proche", overdue: "En retard" } as const)[dueState]
    : getTicketDueLabel(ticket.due_date);
  const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat(isFr ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
    : (isFr ? "Non définie" : "Not set");
  const formatHours = (value: number | null) => (value === null ? null : `${Number(value.toFixed(2))} h`);
  const usedHours = formatHours(ticket.actual_hours);
  const estimatedHours = formatHours(ticket.estimated_hours);

  return (
    <div className="grid gap-5 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <TicketStatusBadge status={ticket.status} />
          <TicketPriorityBadge priority={ticket.priority} />
          <TicketTypeBadge type={ticket.type} />
          <Badge variant="outline" className={dueTone[dueState]}>
            {dueLabel}
          </Badge>
        </div>

        <div className="space-y-3">
          <h1 className="break-words text-2xl font-semibold tracking-tight">{ticket.title}</h1>
          <p className="max-w-3xl whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
            {ticket.description || (isFr ? "Aucune description." : "No description yet.")}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {canUpdate ? (
            <TicketForm
              mode="edit"
              role={role}
              filterData={filterData}
              defaults={{
                ticket_id: ticket.id,
                title: ticket.title,
                description: ticket.description ?? "",
                project_id: ticket.project_id,
                assignee_id: ticket.assignee_id ?? "",
                reporter_id: ticket.reporter_id ?? "",
                status: ticket.status,
                priority: ticket.priority,
                type: ticket.type,
                due_date: ticket.due_date ?? "",
                estimated_hours: ticket.estimated_hours?.toString() ?? "",
                actual_hours: ticket.actual_hours?.toString() ?? "",
                github_issue_url: ticket.github_issue_url ?? "",
              }}
              assigneeWorkloads={assigneeWorkloads}
              suggestedAssignees={suggestedAssignees}
            />
          ) : null}

          {canManage ? (
            <ConfirmActionForm
              action={deleteTicketAction}
              fields={{ ticket_id: ticket.id }}
              title={isFr ? "Supprimer le ticket ?" : "Delete ticket?"}
              description={isFr ? `Cela supprimera définitivement "${ticket.title}". Cette action est irréversible.` : `This will permanently delete "${ticket.title}". This action cannot be undone.`}
              confirmLabel={isFr ? "Supprimer le ticket" : "Delete ticket"}
              trigger={(
                <Button type="button" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="size-4" />
                  {isFr ? "Supprimer" : "Delete"}
                </Button>
              )}
            />
          ) : null}

          {role === "shareholder" ? (
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {isFr ? "Vue synthèse actionnaire" : "Summary-only shareholder view"}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid content-start gap-2 sm:grid-cols-2">
        <DetailTile
          label={isFr ? "Projet" : "Project"}
          value={ticket.project?.name ?? (isFr ? "Non lié" : "Not linked")}
          detail={ticket.project?.client?.name ?? (isFr ? "Aucun client" : "No client")}
        />
        <DetailTile
          label={isFr ? "Responsable" : "Assignee"}
          value={ticket.assignee?.full_name ?? (isFr ? "Non assigné" : "Unassigned")}
          detail={ticket.assignee?.email ?? "—"}
        />
        <DetailTile
          label={isFr ? "Rapporteur" : "Reporter"}
          value={ticket.reporter?.full_name ?? (isFr ? "Inconnu" : "Unknown")}
          detail={ticket.reporter?.email ?? "—"}
        />
        <DetailTile
          label={isFr ? "Temps" : "Time"}
          value={usedHours ? (isFr ? `${usedHours} passées` : `${usedHours} logged`) : (isFr ? "Aucun temps saisi" : "No time logged")}
          detail={estimatedHours ? (isFr ? `${estimatedHours} estimées` : `${estimatedHours} estimated`) : (isFr ? "Pas d’estimation" : "No estimate")}
        />
        <DetailTile
          label={isFr ? "Échéance" : "Due date"}
          value={formatDate(ticket.due_date)}
          detail={dueLabel}
        />
        <DetailTile
          label={isFr ? "Dernière mise à jour" : "Last update"}
          value={formatDate(ticket.updated_at)}
          detail={`${isFr ? "Créé le" : "Created"} ${formatDate(ticket.created_at)}`}
        />
      </div>
    </div>
  );
}
