import { Bug, Building2, Cpu, LifeBuoy, Sparkles, SquareCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getTicketTypeLabel } from "@/lib/tickets/helpers";
import type { TicketType } from "@/types/ticket";

const config = {
  task: {
    icon: SquareCheck,
    className: "border-sky-500/25 bg-sky-50 text-sky-700 dark:border-sky-300/10 dark:bg-sky-500/12 dark:text-sky-100",
  },
  bug: {
    icon: Bug,
    className: "border-rose-500/25 bg-rose-50 text-rose-700 dark:border-rose-300/10 dark:bg-rose-500/12 dark:text-rose-100",
  },
  feature: {
    icon: Sparkles,
    className: "border-violet-500/25 bg-violet-50 text-violet-700 dark:border-violet-300/10 dark:bg-violet-500/12 dark:text-violet-100",
  },
  support: {
    icon: LifeBuoy,
    className: "border-amber-500/25 bg-amber-50 text-amber-700 dark:border-amber-300/10 dark:bg-amber-500/12 dark:text-amber-100",
  },
  client_request: {
    icon: Building2,
    className: "border-cyan-500/25 bg-cyan-50 text-cyan-700 dark:border-cyan-300/10 dark:bg-cyan-500/12 dark:text-cyan-100",
  },
  internal: {
    icon: Cpu,
    className: "border-slate-500/25 bg-slate-100 text-slate-700 dark:border-slate-300/10 dark:bg-slate-500/12 dark:text-slate-100",
  },
} satisfies Record<TicketType, { icon: typeof SquareCheck; className: string }>;

export function TicketTypeBadge({ type }: { type: TicketType }) {
  const Icon = config[type].icon;

  return (
    <Badge
      variant="outline"
      className={`rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase ${config[type].className}`}
    >
      <Icon className="mr-1 size-3.5" />
      {getTicketTypeLabel(type)}
    </Badge>
  );
}
