"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import { getTicketStatusLabel } from "@/lib/tickets/helpers";
import type { TicketStatus } from "@/types/ticket";
import { toneBadge } from "@/components/ui/tone";
import { ticketStatusTone } from "@/components/tickets/ticket-meta";

/** `label` shows a board's own stage name in the status's color. */
export function TicketStatusBadge({ status, label }: { status: TicketStatus; label?: string }) {
  const { locale } = useI18n();
  const labels = locale === "fr" ? { backlog: "En attente", todo: "À faire", in_progress: "En cours", review: "En révision", blocked: "Bloqué", done: "Terminé", archived: "Archivé" } : null;
  return (
    <Badge
      variant="outline"
      className={toneBadge[ticketStatusTone[status]]}
    >
      {label ?? (labels ? labels[status] : getTicketStatusLabel(status))}
    </Badge>
  );
}
