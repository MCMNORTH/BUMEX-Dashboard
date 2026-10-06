"use client";

import Link from "next/link";

import { useI18n } from "@/components/layout/i18n-provider";
import { TicketAssignee, TicketDue } from "@/components/tickets/ticket-meta";
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import { TicketTypeIcon } from "@/components/tickets/ticket-type-badge";
import { getBumexEntity } from "@/lib/entities/config";
import type { TicketRecord } from "@/types/ticket";

// One column template shared by the header and every row so they always line up.
const columns = "md:grid-cols-[minmax(0,1fr)_8.5rem_7rem_11rem_5.5rem]";

function TicketRow({ ticket, locale }: { ticket: TicketRecord; locale: "en" | "fr" }) {
  const fr = locale === "fr";
  const context = ticket.project?.name
    ?? (fr ? "Sans projet" : "No project");
  const owner = ticket.project?.entity_code
    ? getBumexEntity(ticket.project.entity_code)?.name
    : ticket.project?.client?.name;

  return (
    <li>
      <Link
        href={`/tickets/${ticket.id}`}
        className={`grid min-w-0 gap-x-4 gap-y-1.5 px-3 py-2.5 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none md:items-center ${columns}`}
      >
        <span className="flex min-w-0 items-start gap-2.5">
          <TicketTypeIcon type={ticket.type} className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">{ticket.title}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {context}
              {owner ? ` · ${owner}` : ""}
            </span>
          </span>
        </span>

        {/* On small screens the remaining fields share one wrapped line under the title. */}
        <span className="flex min-w-0 flex-wrap items-center gap-2 pl-6.5 md:contents">
          <span className="md:block"><TicketStatusBadge status={ticket.status} /></span>
          <span className="md:block"><TicketPriorityBadge priority={ticket.priority} /></span>
          <span className="min-w-0 md:block"><TicketAssignee name={ticket.assignee?.full_name} locale={locale} /></span>
          <TicketDue ticket={ticket} locale={locale} className="text-sm md:text-right" />
        </span>
      </Link>
    </li>
  );
}

export function TicketTable({ tickets }: { tickets: TicketRecord[] }) {
  const { locale } = useI18n();
  const fr = locale === "fr";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
      <div className={`hidden gap-x-4 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground md:grid ${columns}`}>
        <span className="pl-6.5">{fr ? "Ticket" : "Ticket"}</span>
        <span>{fr ? "Statut" : "Status"}</span>
        <span>{fr ? "Priorité" : "Priority"}</span>
        <span>{fr ? "Responsable" : "Assignee"}</span>
        <span className="text-right">{fr ? "Échéance" : "Due"}</span>
      </div>
      <ul className="divide-y divide-border">
        {tickets.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} locale={locale} />)}
      </ul>
    </div>
  );
}
