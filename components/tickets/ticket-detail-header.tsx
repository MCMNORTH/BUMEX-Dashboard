import { Trash2 } from "lucide-react";

import { deleteTicketAction } from "@/app/(app)/tickets/actions";
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
  planned: "border-sky-500/25 bg-sky-50 text-sky-700 dark:border-sky-300/10 dark:bg-sky-500/12 dark:text-sky-100",
  soon: "border-amber-500/25 bg-amber-50 text-amber-700 dark:border-amber-300/10 dark:bg-amber-500/12 dark:text-amber-100",
  overdue: "border-rose-500/25 bg-rose-50 text-rose-700 dark:border-rose-300/10 dark:bg-rose-500/12 dark:text-rose-100",
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
  const dueState = getTicketDueState(ticket.due_date);

  return (
    <div className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-soft)] xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <TicketStatusBadge status={ticket.status} />
          <TicketPriorityBadge priority={ticket.priority} />
          <TicketTypeBadge type={ticket.type} />
          <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-medium tracking-[0.16em] uppercase ${dueTone[dueState]}`}>
            {getTicketDueLabel(ticket.due_date)}
          </span>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">{ticket.title}</h1>
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            {ticket.description || "No operational summary has been attached to this ticket yet."}
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
              title="Delete ticket?"
              description={`This will permanently delete "${ticket.title}". This action cannot be undone.`}
              confirmLabel="Delete ticket"
              trigger={(
                <Button type="button" variant="ghost" className="rounded-full px-5 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100">
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              )}
            />
          ) : null}

          {role === "shareholder" ? (
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Summary-only shareholder view
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Project</p>
          <p className="mt-2 text-sm font-medium">{ticket.project?.name ?? "Not linked"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{ticket.project?.client?.name ?? "No client"}</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Assignee</p>
          <p className="mt-2 text-sm font-medium">{ticket.assignee?.full_name ?? "Unassigned"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{ticket.assignee?.email ?? "No email"}</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Reporter</p>
          <p className="mt-2 text-sm font-medium">{ticket.reporter?.full_name ?? "Unknown"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{ticket.reporter?.email ?? "No email"}</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Tracking</p>
          <p className="mt-2 text-sm font-medium">{formatHours(ticket.actual_hours)} used</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatHours(ticket.estimated_hours)} estimated
          </p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Due date</p>
          <p className="mt-2 text-sm font-medium">{formatTicketDate(ticket.due_date)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{getTicketDueLabel(ticket.due_date)}</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Last update</p>
          <p className="mt-2 text-sm font-medium">{formatTicketDate(ticket.updated_at)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Created {formatTicketDate(ticket.created_at)}</p>
        </div>
      </div>
    </div>
  );
}
