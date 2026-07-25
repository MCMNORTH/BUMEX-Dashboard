import type { CalendarEvent } from "@/types/calendar";

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

export function getPlaceholderCalendarEvents(): CalendarEvent[] {
  const today = new Date();

  return [
    {
      id: "placeholder-payment-cycle",
      title: "Client billing review window",
      type: "payment_due",
      date: formatDateKey(addDays(today, 5)),
      status: "upcoming",
      href: "/finance",
      entityId: "placeholder-payment-cycle",
      entityType: "placeholder",
      description: "Placeholder financial due-date signal until the finance module is fully enabled.",
    },
    {
      id: "placeholder-contract-renewal",
      title: "Contract renewal checkpoint",
      type: "contract_renewal",
      date: formatDateKey(addDays(today, 14)),
      status: "upcoming",
      href: "/contracts",
      entityId: "placeholder-contract-renewal",
      entityType: "placeholder",
      description: "Placeholder renewal visibility until commercial lifecycle tracking is implemented.",
    },
    {
      id: "placeholder-internal-event",
      title: "Operations leadership sync",
      type: "internal_event",
      date: formatDateKey(addDays(today, 2)),
      status: "scheduled",
      href: "/overview",
      entityId: "placeholder-internal-event",
      entityType: "placeholder",
      description: "Internal planning placeholder for operational rituals and leadership checkpoints.",
    },
  ];
}

