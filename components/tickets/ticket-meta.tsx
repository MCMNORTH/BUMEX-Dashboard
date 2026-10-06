"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";
import type { TicketRecord, TicketStatus } from "@/types/ticket";

/** Which tone each ticket status uses, everywhere a status is shown. */
export const ticketStatusTone: Record<TicketStatus, Tone> = {
  backlog: "neutral",
  todo: "neutral",
  in_progress: "brand",
  review: "brand",
  blocked: "danger",
  done: "success",
  archived: "neutral",
};

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
