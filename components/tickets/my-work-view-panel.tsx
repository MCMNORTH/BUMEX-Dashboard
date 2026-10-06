"use client";

import { Activity, useState } from "react";
import { LayoutList, Rows3 } from "lucide-react";

import { TicketTable } from "@/components/tickets/ticket-table";
import { TicketKanban } from "@/components/tickets/ticket-kanban";
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
            <TicketTable tickets={tickets} />
          </Activity>
          <Activity mode={activeView === "kanban" ? "visible" : "hidden"}>
            <TicketKanban tickets={visibleTickets} canDrag />
          </Activity>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
          {isFr
            ? "Aucun ticket ne vous est assigné dans le périmètre actuel."
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
    { key: "table", label: isFr ? "Liste" : "List", icon: LayoutList },
    { key: "kanban", label: "Kanban", icon: Rows3 },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            {isFr ? "Mes tickets" : "My tickets"}
          </h2>
          <span className="text-sm text-muted-foreground">{ticketCount}</span>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {views.map((view) => {
            const Icon = view.icon;
            const isActive = activeView === view.key;

            return (
              <button
                key={view.key}
                type="button"
                onClick={() => onViewChange(view.key)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                  isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
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

      {children}
    </div>
  );
}
