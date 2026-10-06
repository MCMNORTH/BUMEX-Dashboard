"use client";

import { Bug, Building2, Cpu, LifeBuoy, Sparkles, SquareCheck } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { getTicketTypeLabel } from "@/lib/tickets/helpers";
import type { TicketType } from "@/types/ticket";
import { toneBadge } from "@/components/ui/tone";

const config = {
  task: {
    icon: SquareCheck,
    className: toneBadge.neutral,
  },
  bug: {
    icon: Bug,
    className: toneBadge.neutral,
  },
  feature: {
    icon: Sparkles,
    className: toneBadge.neutral,
  },
  support: {
    icon: LifeBuoy,
    className: toneBadge.neutral,
  },
  client_request: {
    icon: Building2,
    className: toneBadge.neutral,
  },
  internal: {
    icon: Cpu,
    className: toneBadge.neutral,
  },
} satisfies Record<TicketType, { icon: typeof SquareCheck; className: string }>;

export function TicketTypeBadge({ type }: { type: TicketType }) {
  const Icon = config[type].icon;
  const { t } = useI18n();

  return (
    <Badge
      variant="outline"
      className={config[type].className}
    >
      <Icon className="mr-1 size-3.5" />
      {t(`tickets.form.select.types.${type}`, getTicketTypeLabel(type))}
    </Badge>
  );
}

/** The type as a bare icon with a tooltip, for compact rows and cards. */
export function TicketTypeIcon({ type, className }: { type: TicketType; className?: string }) {
  const Icon = config[type].icon;
  const { t } = useI18n();
  const label = t(`tickets.form.select.types.${type}`, getTicketTypeLabel(type));

  return (
    <span title={label} className={className}>
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
