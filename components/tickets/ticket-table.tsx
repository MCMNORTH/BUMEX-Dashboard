"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, CircleUserRound, FolderKanban, UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import { TicketTypeBadge } from "@/components/tickets/ticket-type-badge";
import { useI18n } from "@/components/layout/i18n-provider";
import { getBumexEntity } from "@/lib/entities/config";
import { formatTicketDate, getTicketDueState } from "@/lib/tickets/helpers";
import type { TicketRecord } from "@/types/ticket";

function initials(name: string | undefined) {
  return name?.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "—";
}

function TicketRow({ ticket }: { ticket: TicketRecord }) {
  const { locale } = useI18n();
  const fr = locale === "fr";
  const dueState = getTicketDueState(ticket.due_date);
  const dueLabel = !ticket.due_date
    ? (fr ? "Aucune échéance" : "No deadline")
    : dueState === "overdue"
      ? (fr ? "En retard" : "Overdue")
      : formatTicketDate(ticket.due_date);

  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="group block min-w-0 rounded-2xl border border-border/75 bg-card p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md sm:p-5"
    >
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TicketTypeBadge type={ticket.type} />
            <TicketPriorityBadge priority={ticket.priority} />
            <TicketStatusBadge status={ticket.status} />
          </div>
          <h3 className="mt-3 break-words text-base font-semibold tracking-tight text-foreground sm:text-lg">{ticket.title}</h3>
          {ticket.description ? <p className="mt-1.5 line-clamp-2 max-w-4xl break-words text-sm leading-6 text-muted-foreground">{ticket.description}</p> : null}
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-muted/65 px-3 py-2 text-xs font-semibold text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary lg:inline-flex">
          {fr ? "Ouvrir" : "Open"}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>

      <div className="mt-4 grid min-w-0 gap-3 border-t border-border/65 pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <FolderKanban className="mt-0.5 size-4 shrink-0 text-primary/75" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{fr ? "Projet / entité" : "Project / entity"}</p>
            <p className="mt-1 break-words text-sm font-medium">{ticket.project?.name ?? (fr ? "Sans projet" : "No project")}</p>
            <p className="truncate text-xs text-muted-foreground">{ticket.project?.entity_code ? getBumexEntity(ticket.project.entity_code)?.name ?? ticket.project.entity_code : (ticket.project?.client?.name ?? (fr ? "Projet interne" : "Internal project"))}</p>
          </div>
        </div>

        <div className="flex min-w-0 items-start gap-2.5">
          <UserRound className="mt-0.5 size-4 shrink-0 text-primary/75" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{fr ? "Responsable" : "Assignee"}</p>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <Avatar className="size-6 shrink-0"><AvatarFallback className="text-[9px]">{initials(ticket.assignee?.full_name)}</AvatarFallback></Avatar>
              <span className="truncate text-sm font-medium">{ticket.assignee?.full_name ?? (fr ? "À attribuer" : "Unassigned")}</span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-start gap-2.5">
          <CircleUserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{fr ? "Créé par" : "Created by"}</p>
            <p className="mt-1 truncate text-sm font-medium">{ticket.reporter?.full_name ?? (fr ? "Profil indisponible" : "Profile unavailable")}</p>
          </div>
        </div>

        <div className="flex min-w-0 items-start gap-2.5">
          <CalendarClock className={`mt-0.5 size-4 shrink-0 ${dueState === "overdue" ? "text-rose-600" : "text-muted-foreground"}`} />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{fr ? "Échéance" : "Due date"}</p>
            <p className={`mt-1 truncate text-sm font-medium ${dueState === "overdue" ? "text-rose-600 dark:text-rose-300" : ""}`}>{dueLabel}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function TicketTable({ tickets }: { tickets: TicketRecord[] }) {
  return (
    <div className="grid min-w-0 gap-3">
      {tickets.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)}
    </div>
  );
}
