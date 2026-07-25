"use client";

import Link from "next/link";
import { CalendarClock, FolderKanban } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { formatTicketDate } from "@/lib/tickets/helpers";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import { TicketTypeBadge } from "@/components/tickets/ticket-type-badge";
import type { TicketRecord } from "@/types/ticket";

function getInitials(name: string | undefined) {
  if (!name) {
    return "NA";
  }

  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function PlanningTaskCard({
  ticket,
  summaryMode = false,
}: {
  ticket: TicketRecord;
  summaryMode?: boolean;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";

  if (summaryMode) {
    return (
      <div className="rounded-[20px] border border-border/65 bg-background/38 p-4">
        <p className="text-sm font-medium">{isFr ? "Élément de travail planifié" : "Scheduled work item"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{formatTicketDate(ticket.due_date)}</p>
      </div>
    );
  }

  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="block rounded-[20px] border border-border/65 bg-card/82 p-4 shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:border-sky-300/10 hover:bg-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <TicketTypeBadge type={ticket.type} />
        <TicketPriorityBadge priority={ticket.priority} />
      </div>
      <h4 className="mt-3 text-sm font-semibold tracking-[-0.02em]">{ticket.title}</h4>
      <div className="mt-3 grid gap-2 rounded-2xl border border-border/60 bg-background/38 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderKanban className="size-3.5" />
          <span className="truncate">{ticket.project?.name ?? (isFr ? "Aucun projet lié" : "No project linked")}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5" />
          <span>{formatTicketDate(ticket.due_date)}</span>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Avatar className="size-8">
            <AvatarFallback>{getInitials(ticket.assignee?.full_name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-xs font-medium">{ticket.assignee?.full_name ?? (isFr ? "Non assigné" : "Unassigned")}</p>
            <p className="text-[11px] text-muted-foreground">{ticket.assignee?.role ?? (isFr ? "Aucun rôle" : "No role")}</p>
          </div>
        </div>
        <TicketStatusBadge status={ticket.status} />
      </div>
    </Link>
  );
}
