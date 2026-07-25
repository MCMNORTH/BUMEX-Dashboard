"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { ArrowRight, GitBranch, SlidersHorizontal } from "lucide-react";

import {
  defaultTicketTableColumns,
  formatHours,
  formatTicketDate,
  getTicketDueLabel,
  getTicketDueState,
} from "@/lib/tickets/helpers";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TicketCard } from "@/components/tickets/ticket-card";
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import { TicketTypeBadge } from "@/components/tickets/ticket-type-badge";
import type { TicketRecord, TicketTableColumnKey } from "@/types/ticket";

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

const columnWidths: Record<TicketTableColumnKey, string> = {
  title: "minmax(16rem, 1.35fr)",
  type: "minmax(8rem, 0.65fr)",
  project: "minmax(12rem, 0.9fr)",
  status: "minmax(9rem, 0.7fr)",
  priority: "minmax(8rem, 0.65fr)",
  assignee: "minmax(13rem, 0.95fr)",
  due_date: "minmax(10rem, 0.75fr)",
  updated_at: "minmax(10rem, 0.75fr)",
  actions: "minmax(8rem, 0.55fr)",
};

function TicketTableComponent({ tickets }: { tickets: TicketRecord[] }) {
  const [visibleColumns, setVisibleColumns] = useState<TicketTableColumnKey[]>(defaultTicketTableColumns);

  function toggleColumn(column: TicketTableColumnKey) {
    setVisibleColumns((current) =>
      current.includes(column)
        ? (current.length === 1 ? current : current.filter((item) => item !== column))
        : [...current, column],
    );
  }

  const columnLabels: Record<TicketTableColumnKey, string> = {
    title: "Ticket",
    type: "Type",
    project: "Project",
    status: "Status",
    priority: "Priority",
    assignee: "Assignee",
    due_date: "Due date",
    updated_at: "Updated",
    actions: "Actions",
  };
  const gridTemplateColumns = visibleColumns.map((column) => columnWidths[column]).join(" ");

  return (
    <div className="space-y-4">
      <div className="hidden items-center justify-end lg:flex">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="rounded-full px-4">
              <SlidersHorizontal className="size-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(Object.keys(columnLabels) as TicketTableColumnKey[]).map((column) => (
              <DropdownMenuCheckboxItem
                key={column}
                checked={visibleColumns.includes(column)}
                onCheckedChange={() => toggleColumn(column)}
              >
                {columnLabels[column]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-4 lg:hidden">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>

      <Card className="hidden overflow-hidden border-border/80 bg-white shadow-[var(--shadow-soft)] dark:bg-card/72 lg:block">
        <div className="overflow-x-auto">
          <div className="min-w-max">
            <div
              className="grid gap-6 border-b border-border/70 bg-slate-50/80 px-5 py-3 text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase dark:bg-white/[0.03] dark:text-muted-foreground"
              style={{ gridTemplateColumns }}
            >
              {visibleColumns.map((column) => (
                <span key={column} className={column === "actions" ? "text-right" : undefined}>
                  {columnLabels[column]}
                </span>
              ))}
            </div>

            <div className="divide-y divide-border/60">
              {tickets.map((ticket) => {
                const dueState = getTicketDueState(ticket.due_date);

                return (
                  <Link
                    key={ticket.id}
                    href={`/tickets/${ticket.id}`}
                    className="grid gap-6 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                    style={{ gridTemplateColumns }}
                  >
                {visibleColumns.map((column) => {
                  if (column === "title") {
                    return (
                      <div key={column} className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <TicketTypeBadge type={ticket.type} />
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${dueTone[dueState]}`}>
                            {getTicketDueLabel(ticket.due_date)}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold tracking-[-0.02em]">{ticket.title}</p>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                            {ticket.description || "No operational summary is attached to this ticket."}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  if (column === "type") {
                    return (
                      <div key={column}>
                        <TicketTypeBadge type={ticket.type} />
                      </div>
                    );
                  }

                  if (column === "project") {
                    return (
                      <div key={column} className="space-y-1">
                        <p className="text-sm font-medium">{ticket.project?.name ?? "Not linked"}</p>
                        <p className="text-xs text-muted-foreground">{ticket.project?.client?.name ?? "No client"}</p>
                        {ticket.github_issue_url ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <GitBranch className="size-3.5" />
                            GitHub linked
                          </span>
                        ) : null}
                      </div>
                    );
                  }

                  if (column === "status") {
                    return (
                      <div key={column}>
                        <TicketStatusBadge status={ticket.status} />
                      </div>
                    );
                  }

                  if (column === "priority") {
                    return (
                      <div key={column}>
                        <TicketPriorityBadge priority={ticket.priority} />
                      </div>
                    );
                  }

                  if (column === "assignee") {
                    return (
                      <div key={column} className="flex items-center gap-2">
                        <Avatar className="size-8">
                          <AvatarFallback>{getInitials(ticket.assignee?.full_name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{ticket.assignee?.full_name ?? "Unassigned"}</p>
                          <p className="truncate text-xs text-muted-foreground">{ticket.assignee?.role ?? "No role"}</p>
                        </div>
                      </div>
                    );
                  }

                  if (column === "due_date") {
                    return (
                      <div key={column} className="space-y-1 text-sm">
                        <p className="font-medium">{formatTicketDate(ticket.due_date)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatHours(ticket.actual_hours)} used / {formatHours(ticket.estimated_hours)} est.
                        </p>
                      </div>
                    );
                  }

                  if (column === "updated_at") {
                    return (
                      <div key={column} className="space-y-1 text-sm">
                        <p className="font-medium">{formatTicketDate(ticket.updated_at)}</p>
                        <p className="text-xs text-muted-foreground">Last activity</p>
                      </div>
                    );
                  }

                  return (
                    <div key={column} className="flex items-center justify-end">
                      <Badge variant="secondary" className="rounded-full px-3 py-1">
                        Open
                        <ArrowRight className="ml-1 size-3.5" />
                      </Badge>
                    </div>
                  );
                })}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export const TicketTable = memo(TicketTableComponent);
