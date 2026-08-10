"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, FolderKanban, GitBranch, TimerReset } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import {
  formatHours,
  formatTicketDate,
  getTicketDueLabel,
  getTicketDueState,
} from "@/lib/tickets/helpers";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

const dueTone = {
  none: "border-border/65 bg-background/38 text-muted-foreground",
  planned: "border-sky-500/25 bg-sky-50 text-sky-700 dark:border-sky-300/10 dark:bg-sky-500/12 dark:text-sky-100",
  soon: "border-amber-500/25 bg-amber-50 text-amber-700 dark:border-amber-300/10 dark:bg-amber-500/12 dark:text-amber-100",
  overdue: "border-rose-500/25 bg-rose-50 text-rose-700 dark:border-rose-300/10 dark:bg-rose-500/12 dark:text-rose-100",
} as const;

export function TicketCard({ ticket }: { ticket: TicketRecord }) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const dueState = getTicketDueState(ticket.due_date);

  return (
    <Link href={`/tickets/${ticket.id}`} className="block">
      <Card className="group relative overflow-hidden border-border/70 bg-card/72 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow] duration-200 hover:border-primary/25 dark:border-white/10 dark:bg-slate-950/42 dark:shadow-none">
        <CardContent className="relative space-y-4 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <TicketStatusBadge status={ticket.status} />
                <TicketPriorityBadge priority={ticket.priority} />
                <TicketTypeBadge type={ticket.type} />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-semibold tracking-[-0.015em] transition-colors group-hover:text-primary dark:group-hover:text-white">
                  {ticket.title}
                </h3>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {ticket.description || (isFr ? "Aucune description n'a encore été ajoutée à ce ticket." : "No ticket description has been added yet.")}
                </p>
              </div>
            </div>
            <div className="hidden size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/45 sm:flex dark:border-white/10 dark:bg-slate-900/60">
              <FolderKanban className="size-5 text-primary" />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-background/45 p-3 dark:border-white/10 dark:bg-slate-900/58">
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Projet" : "Project"}</p>
              <p className="mt-2 text-sm font-medium">{ticket.project?.name ?? (isFr ? "Non lié" : "Not linked")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{ticket.project?.client?.name ?? (isFr ? "Aucun client" : "No client")}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/45 p-3 dark:border-white/10 dark:bg-slate-900/58">
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Échéance" : "Deadline"}</p>
              <p className="mt-2 text-sm font-medium">{formatTicketDate(ticket.due_date)}</p>
              <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${dueTone[dueState]}`}>
                {getTicketDueLabel(ticket.due_date)}
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/45 p-3 dark:border-white/10 dark:bg-slate-900/58">
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Assigné" : "Assignee"}</p>
              <div className="mt-2 flex items-center gap-2">
                <Avatar className="size-8">
                  <AvatarFallback>{getInitials(ticket.assignee?.full_name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{ticket.assignee?.full_name ?? (isFr ? "Non assigné" : "Unassigned")}</p>
                  <p className="text-xs text-muted-foreground">{ticket.assignee?.role ?? (isFr ? "Aucun rôle" : "No role")}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/45 p-3 dark:border-white/10 dark:bg-slate-900/58">
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Suivi" : "Tracking"}</p>
              <div className="mt-2 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <TimerReset className="size-4" />
                    Est.
                  </span>
                  <span className="font-medium">{formatHours(ticket.estimated_hours)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <CalendarClock className="size-4" />
                    Act.
                  </span>
                  <span className="font-medium">{formatHours(ticket.actual_hours)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{isFr ? "Reporteur" : "Reporter"} {ticket.reporter?.full_name ?? (isFr ? "Inconnu" : "Unknown")}</span>
              {ticket.github_issue_url ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/65 bg-background/40 px-2.5 py-1">
                  <GitBranch className="size-3.5" />
                  {isFr ? "GitHub lié" : "GitHub linked"}
                </span>
              ) : null}
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {isFr ? "Voir le détail" : "View detail"}
              <ArrowRight className="ml-1 size-3.5" />
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
