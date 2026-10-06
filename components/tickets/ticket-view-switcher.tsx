import Link from "next/link";
import { LayoutList, Rows3 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TicketWorkspaceView } from "@/types/ticket";

type TicketViewSwitcherProps = {
  activeView: TicketWorkspaceView;
  canUseKanban: boolean;
  basePath?: "/tickets" | "/my-work";
  queryString?: string;
  labels?: Partial<Record<TicketWorkspaceView, string>>;
};

function buildHref(
  basePath: "/tickets" | "/my-work",
  view: TicketWorkspaceView,
  queryString?: string,
) {
  const params = new URLSearchParams(queryString ?? "");
  params.set("view", view);
  const nextQuery = params.toString();

  return nextQuery ? `${basePath}?${nextQuery}` : basePath;
}

export function TicketViewSwitcher({
  activeView,
  canUseKanban,
  basePath = "/tickets",
  queryString,
  labels,
}: TicketViewSwitcherProps) {
  const views: Array<{
    key: TicketWorkspaceView;
    label: string;
    icon: typeof LayoutList;
    hidden?: boolean;
  }> = [
    { key: "table", label: labels?.table ?? "Table", icon: LayoutList },
    { key: "kanban", label: labels?.kanban ?? "Kanban", icon: Rows3, hidden: !canUseKanban },
  ];

  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
      {views.filter((view) => !view.hidden).map((view) => {
        const Icon = view.icon;
        const active = activeView === view.key;

        return (
          <Link
            key={view.key}
            href={buildHref(basePath, view.key, queryString)}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {view.label}
          </Link>
        );
      })}
    </div>
  );
}
