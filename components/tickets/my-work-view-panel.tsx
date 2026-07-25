"use client";

import { Activity, useState } from "react";
import { LayoutList, Rows3 } from "lucide-react";

import { TicketCard } from "@/components/tickets/ticket-card";
import { TicketKanban } from "@/components/tickets/ticket-kanban";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TicketRecord, TicketWorkspaceView } from "@/types/ticket";

type MyWorkViewPanelProps = {
  initialView: TicketWorkspaceView;
  locale: "en" | "fr";
  tickets: TicketRecord[];
};

function buildUrl(view: TicketWorkspaceView) {
  const params = new URLSearchParams(window.location.search);
  params.set("view", view);
  const nextQuery = params.toString();
  return nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
}

export function MyWorkViewPanel({
  initialView,
  locale,
  tickets,
}: MyWorkViewPanelProps) {
  const isFr = locale === "fr";
  const [activeView, setActiveView] = useState<TicketWorkspaceView>(initialView);

  const visibleTickets = tickets.filter((ticket) => ticket.status !== "archived");

  return (
    <CardShell
      activeView={activeView}
      isFr={isFr}
      ticketCount={tickets.length}
      onViewChange={(view) => {
        setActiveView(view);
        window.history.replaceState(window.history.state, "", buildUrl(view));
      }}
    >
      {tickets.length ? (
        <>
          <Activity mode={activeView === "table" ? "visible" : "hidden"}>
            <div className="grid gap-4">
              {tickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))}
            </div>
          </Activity>
          <Activity mode={activeView === "kanban" ? "visible" : "hidden"}>
            <TicketKanban tickets={visibleTickets} canDrag />
          </Activity>
        </>
      ) : (
        <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
          {isFr
            ? "Aucun ticket ne vous est assigne dans le perimetre actuel."
            : "No tickets are assigned to you in the current scope."}
        </div>
      )}
    </CardShell>
  );
}

function CardShell({
  activeView,
  children,
  isFr,
  onViewChange,
  ticketCount,
}: {
  activeView: TicketWorkspaceView;
  children: React.ReactNode;
  isFr: boolean;
  onViewChange: (view: TicketWorkspaceView) => void;
  ticketCount: number;
}) {
  const views: Array<{
    key: TicketWorkspaceView;
    label: string;
    icon: typeof LayoutList;
  }> = [
    { key: "table", label: "Table", icon: LayoutList },
    { key: "kanban", label: "Kanban", icon: Rows3 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            {isFr ? "File prioritaire" : "Focus queue"}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            {activeView === "kanban"
              ? isFr
                ? "Mon tableau Kanban"
                : "My Kanban board"
              : isFr
                ? "Liste de mes tickets assignes"
                : "Assigned ticket list"}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {ticketCount} {isFr ? "tickets" : "tickets"}
          </Badge>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
            {views.map((view) => {
              const Icon = view.icon;
              const isActive = activeView === view.key;

              return (
                <button
                  key={view.key}
                  type="button"
                  onClick={() => onViewChange(view.key)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(15,23,42,0.18)]"
                      : "text-muted-foreground hover:bg-slate-50 hover:text-foreground dark:hover:bg-white/[0.06]",
                  )}
                  aria-pressed={isActive}
                >
                  <Icon className="size-4" />
                  {view.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
