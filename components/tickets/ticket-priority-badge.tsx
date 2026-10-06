"use client";

import { AlertTriangle, ArrowUp, Equal, Gauge } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getTicketPriorityLabel } from "@/lib/tickets/helpers";
import { useI18n } from "@/components/layout/i18n-provider";
import type { TicketPriority } from "@/types/ticket";
import { toneBadge } from "@/components/ui/tone";

const config = {
  low: {
    icon: Gauge,
    className: toneBadge.neutral,
  },
  medium: {
    icon: Equal,
    className: toneBadge.neutral,
  },
  high: {
    icon: ArrowUp,
    className: toneBadge.warning,
  },
  urgent: {
    icon: AlertTriangle,
    className: toneBadge.danger,
  },
} satisfies Record<TicketPriority, { icon: typeof Gauge; className: string }>;

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  const { locale } = useI18n();
  const Icon = config[priority].icon;

  return (
    <Badge
      variant="outline"
      className={config[priority].className}
    >
      <Icon className="mr-1 size-3.5" />
      {locale === "fr" ? ({ low: "Faible", medium: "Moyenne", high: "Haute", urgent: "Urgente" } as const)[priority] : getTicketPriorityLabel(priority)}
    </Badge>
  );
}
