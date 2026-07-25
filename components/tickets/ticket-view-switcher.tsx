import Link from "next/link";
import { LayoutList, Rows3 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TicketWorkspaceView } from "@/types/ticket";

type TicketViewSwitcherProps = {
  activeView: TicketWorkspaceView;
  canUseKanban: boolean;
  basePath?: "/tickets" | "/my-work";
  queryString?: string;
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
}: TicketViewSwitcherProps) {
  const views: Array<{
    key: TicketWorkspaceView;
    label: string;
    icon: typeof LayoutList;
    hidden?: boolean;
  }> = [
    { key: "table", label: "Table", icon: LayoutList },
    { key: "kanban", label: "Kanban", icon: Rows3, hidden: !canUseKanban },
  ];

  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
      {views.filter((view) => !view.hidden).map((view) => {
        const Icon = view.icon;
        const active = activeView === view.key;

        return (
          <Link
            key={view.key}
            href={buildHref(basePath, view.key, queryString)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(15,23,42,0.18)]"
                : "text-muted-foreground hover:bg-slate-50 hover:text-foreground dark:hover:bg-white/[0.06]",
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
