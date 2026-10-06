"use client";

import { Trash2 } from "lucide-react";

import { deleteTicketAction } from "@/app/(app)/tickets/actions";
import { useI18n } from "@/components/layout/i18n-provider";
import {
  formatHours,
  formatTicketDate,
  getTicketDueLabel,
  getTicketDueState,
} from "@/lib/tickets/helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmActionForm } from "@/components/shared/confirm-action-form";
import { TicketForm } from "@/components/tickets/ticket-form";
import type { TeamWorkloadRecord } from "@/types/team";
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import { TicketTypeBadge } from "@/components/tickets/ticket-type-badge";
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
  none: "border-border/65 bg-background/38 text-muted-foreground",
  planned: "border-primary/25 bg-primary/10 text-primary dark:border-primary/10 dark:bg-primary/12",
  soon: "border-warning/25 bg-warning/10 text-warning dark:border-warning/10 dark:bg-warning/12",
  overdue: "border-danger/25 bg-danger/10 text-danger dark:border-danger/10 dark:bg-danger/12",
} as const;

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

  return (
    <div className="grid gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-soft)] xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <TicketStatusBadge status={ticket.status} />
          <TicketPriorityBadge priority={ticket.priority} />
          <TicketTypeBadge type={ticket.type} />
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium tracking-wider uppercase ${dueTone[dueState]}`}>
            {dueLabel}
          </span>
        </div>

        <div className="space-y-3">
          <h1 className="break-words text-2xl font-semibold tracking-tight">{ticket.title}</h1>
          <p className="max-w-3xl whitespace-pre-line break-words text-sm leading-7 text-muted-foreground sm:text-base">
            {ticket.description || (isFr ? "Aucun résumé opérationnel n'a encore été rattaché à ce ticket." : "No operational summary has been attached to this ticket yet.")}
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
                <Button type="button" variant="ghost" className="rounded-full px-5 text-danger hover:bg-danger/10 hover:text-danger">
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Projet" : "Project"}</p>
          <p className="mt-2 text-sm font-medium">{ticket.project?.name ?? (isFr ? "Non lié" : "Not linked")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{ticket.project?.client?.name ?? (isFr ? "Aucun client" : "No client")}</p>
        </div>
        <div className="rounded-xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Assigné" : "Assignee"}</p>
          <p className="mt-2 text-sm font-medium">{ticket.assignee?.full_name ?? (isFr ? "Non assigné" : "Unassigned")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{ticket.assignee?.email ?? (isFr ? "Aucun e-mail" : "No email")}</p>
        </div>
        <div className="rounded-xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Reporteur" : "Reporter"}</p>
          <p className="mt-2 text-sm font-medium">{ticket.reporter?.full_name ?? (isFr ? "Inconnu" : "Unknown")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{ticket.reporter?.email ?? (isFr ? "Aucun e-mail" : "No email")}</p>
        </div>
        <div className="rounded-xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Suivi" : "Tracking"}</p>
          <p className="mt-2 text-sm font-medium">{formatHours(ticket.actual_hours)} {isFr ? "utilisées" : "used"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatHours(ticket.estimated_hours)} {isFr ? "estimées" : "estimated"}
          </p>
        </div>
        <div className="rounded-xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Date d'échéance" : "Due date"}</p>
          <p className="mt-2 text-sm font-medium">{formatTicketDate(ticket.due_date)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{dueLabel}</p>
        </div>
        <div className="rounded-xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Dernière mise à jour" : "Last update"}</p>
          <p className="mt-2 text-sm font-medium">{formatTicketDate(ticket.updated_at)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{isFr ? "Créé" : "Created"} {formatTicketDate(ticket.created_at)}</p>
        </div>
      </div>
    </div>
  );
}
