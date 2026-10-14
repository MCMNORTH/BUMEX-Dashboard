"use client";

import { ListChecks } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { TicketRecord } from "@/types/ticket";

export { ticketStatusTone } from "@/lib/tickets/helpers";

export function getInitials(name: string | undefined) {
  return name?.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "—";
}

function isOverdue(ticket: Pick<TicketRecord, "due_date" | "status">) {
  if (!ticket.due_date || ticket.status === "done" || ticket.status === "archived") {
    return false;
  }

  return ticket.due_date < new Date().toISOString().slice(0, 10);
}

/** "6 Oct", or "6 Oct 2025" outside the current year; red when the ticket is late. */
export function TicketDue({
  ticket,
  locale,
  className,
}: {
  ticket: Pick<TicketRecord, "due_date" | "status">;
  locale: "en" | "fr";
  className?: string;
}) {
  if (!ticket.due_date) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }

  const date = new Date(ticket.due_date);
  const label = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
  const late = isOverdue(ticket);

  return (
    <span
      className={cn("whitespace-nowrap tabular-nums", late ? "font-medium text-danger" : "text-muted-foreground", className)}
      title={late ? (locale === "fr" ? "En retard" : "Overdue") : undefined}
    >
      {label}
    </span>
  );
}

/** "2/5" sub-tasks done; renders nothing for tickets without sub-tasks. */
export function TicketSubtaskProgress({
  ticket,
  locale,
  className,
}: {
  ticket: Pick<TicketRecord, "subtasks_total" | "subtasks_done">;
  locale: "en" | "fr";
  className?: string;
}) {
  const total = ticket.subtasks_total ?? 0;

  if (!total) {
    return null;
  }

  const done = ticket.subtasks_done ?? 0;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums", done === total ? "text-success" : "text-muted-foreground", className)}
      title={locale === "fr" ? `${done} sous-tâche(s) terminée(s) sur ${total}` : `${done} of ${total} sub-tasks done`}
    >
      <ListChecks className="size-3.5" aria-hidden="true" />
      {done}/{total}
    </span>
  );
}

export function TicketAssignee({
  name,
  locale,
  showName = true,
}: {
  name: string | undefined;
  locale: "en" | "fr";
  showName?: boolean;
}) {
  const fallback = locale === "fr" ? "Non assigné" : "Unassigned";

  return (
    <span className="flex min-w-0 items-center gap-2" title={name ?? fallback}>
      <Avatar className="size-6 shrink-0">
        <AvatarFallback className="text-xs">{name ? getInitials(name) : "?"}</AvatarFallback>
      </Avatar>
      {showName ? (
        <span className={cn("truncate text-sm", !name && "text-muted-foreground")}>{name ?? fallback}</span>
      ) : null}
    </span>
  );
}
