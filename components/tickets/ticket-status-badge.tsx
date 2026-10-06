"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import { getTicketStatusLabel } from "@/lib/tickets/helpers";
import type { TicketStatus } from "@/types/ticket";
import { toneBadge } from "@/components/ui/tone";
import { ticketStatusTone } from "@/components/tickets/ticket-meta";

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const { locale } = useI18n();
  const labels = locale === "fr" ? { backlog: "En attente", todo: "À faire", in_progress: "En cours", review: "En révision", blocked: "Bloqué", done: "Terminé", archived: "Archivé" } : null;
  return (
    <Badge
      variant="outline"
      className={toneBadge[ticketStatusTone[status]]}
    >
      {labels ? labels[status] : getTicketStatusLabel(status)}
    </Badge>
  );
}
