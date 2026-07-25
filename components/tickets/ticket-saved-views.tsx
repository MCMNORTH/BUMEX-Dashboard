import Link from "next/link";
import { Bookmark, Clock3, ShieldAlert, Sparkles } from "lucide-react";

import { getTicketSavedViewLabel } from "@/lib/tickets/helpers";
import type { TicketSavedViewKey } from "@/types/ticket";

type TicketSavedViewsProps = {
  currentUserId: string;
  basePath?: "/tickets" | "/my-work";
};

const config: Record<
  TicketSavedViewKey,
  { icon: typeof Bookmark; href: (userId: string) => string; description: string }
> = {
  my_open: {
    icon: Bookmark,
    href: (userId) => `/tickets?assignee=${userId}&status=todo&view=table`,
    description: "Personal queue placeholder",
  },
  overdue: {
    icon: ShieldAlert,
    href: () => "/tickets?due=overdue&view=table",
    description: "Deadline pressure focus",
  },
  high_priority: {
    icon: Sparkles,
    href: () => "/tickets?priority=urgent&view=table",
    description: "Escalation-ready view",
  },
  waiting_review: {
    icon: Clock3,
    href: () => "/tickets?status=review&view=table",
    description: "Approval bottlenecks",
  },
};

export function TicketSavedViews({
  currentUserId,
  basePath = "/tickets",
}: TicketSavedViewsProps) {
  const views = (Object.keys(config) as TicketSavedViewKey[]).map((key) => ({
    key,
    ...config[key],
  }));

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Saved views</p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight">Quick work slices</h3>
        </div>
        <span className="rounded-full border border-border/70 bg-background/40 px-3 py-1 text-xs text-muted-foreground">
          UI placeholders
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        {views.map((view) => {
          const Icon = view.icon;
          const href = basePath === "/my-work" && view.key === "my_open"
            ? `/my-work?view=table`
            : view.href(currentUserId);

          return (
            <Link
              key={view.key}
              href={href}
              className="group rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition-colors hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/16 dark:hover:bg-white/[0.06]"
            >
              <div className="flex size-10 items-center justify-center rounded-2xl border border-border/65 bg-background/50 text-primary">
                <Icon className="size-4.5" />
              </div>
              <p className="mt-4 text-sm font-medium">{getTicketSavedViewLabel(view.key)}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{view.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
