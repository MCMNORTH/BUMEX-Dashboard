"use client";

import { AlertTriangle, ArrowUp, Equal, Gauge } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getTicketPriorityLabel } from "@/lib/tickets/helpers";
import { useI18n } from "@/components/layout/i18n-provider";
import type { TicketPriority } from "@/types/ticket";

const config = {
  low: {
    icon: Gauge,
    className: "border-slate-500/25 bg-slate-100 text-slate-700 dark:border-slate-300/10 dark:bg-slate-500/12 dark:text-slate-100",
  },
  medium: {
    icon: Equal,
    className: "border-amber-500/25 bg-amber-50 text-amber-700 dark:border-amber-300/10 dark:bg-amber-500/12 dark:text-amber-100",
  },
  high: {
    icon: ArrowUp,
    className: "border-orange-500/25 bg-orange-50 text-orange-700 dark:border-orange-300/10 dark:bg-orange-500/12 dark:text-orange-100",
  },
  urgent: {
    icon: AlertTriangle,
    className: "border-rose-500/25 bg-rose-50 text-rose-700 dark:border-rose-300/10 dark:bg-rose-500/12 dark:text-rose-100",
  },
} satisfies Record<TicketPriority, { icon: typeof Gauge; className: string }>;

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  const { locale } = useI18n();
  const Icon = config[priority].icon;

  return (
    <Badge
      variant="outline"
      className={`rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase ${config[priority].className}`}
    >
      <Icon className="mr-1 size-3.5" />
      {locale === "fr" ? ({ low: "Faible", medium: "Moyenne", high: "Haute", urgent: "Urgente" } as const)[priority] : getTicketPriorityLabel(priority)}
    </Badge>
  );
}
