"use client";

import Link from "next/link";

import { useI18n } from "@/components/layout/i18n-provider";
import { TicketAssignee, TicketDue, ticketStatusTone } from "@/components/tickets/ticket-meta";
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge";
import { TicketTypeIcon } from "@/components/tickets/ticket-type-badge";
import { toneDot } from "@/components/ui/tone";
import { cn } from "@/lib/utils";
import type { TicketRecord } from "@/types/ticket";

export function PlanningTaskCard({
  ticket,
  summaryMode = false,
}: {
  ticket: TicketRecord;
  summaryMode?: boolean;
}) {
  const { locale, t } = useI18n();
  const isFr = locale === "fr";

  if (summaryMode) {
    return (
      <div className="rounded-lg border border-border bg-card p-2.5">
        <p className="text-sm font-medium">{isFr ? "Élément de travail planifié" : "Scheduled work item"}</p>
        <TicketDue ticket={ticket} locale={locale} className="text-xs" />
      </div>
    );
  }

  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="block min-w-0 rounded-lg border border-border bg-card p-2.5 shadow-[var(--shadow-soft)] transition-colors hover:border-primary/40"
    >
      <p className="line-clamp-2 break-words text-sm font-medium text-foreground">{ticket.title}</p>
      <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <TicketTypeIcon type={ticket.type} className="shrink-0 [&_svg]:size-3.5" />
        <span className="truncate">{ticket.project?.name ?? (isFr ? "Sans projet" : "No project")}</span>
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className={cn("size-2 rounded-full", toneDot[ticketStatusTone[ticket.status]])} aria-hidden="true" />
            {t(`tickets.form.select.statuses.${ticket.status}`, ticket.status)}
          </span>
          {ticket.priority === "high" || ticket.priority === "urgent" ? <TicketPriorityBadge priority={ticket.priority} /> : null}
          <TicketDue ticket={ticket} locale={locale} />
        </span>
        <TicketAssignee name={ticket.assignee?.full_name} locale={locale} showName={false} />
      </div>
    </Link>
  );
}
