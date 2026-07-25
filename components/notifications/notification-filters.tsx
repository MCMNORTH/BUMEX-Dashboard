"use client";

import { useI18n } from "@/components/layout/i18n-provider";
import { ModernSelect } from "@/components/ui/modern-select";
import type { NotificationFilters as NotificationFiltersType, NotificationType } from "@/types/notification";

export function NotificationFilters({
  filters,
  onChange,
}: {
  filters: NotificationFiltersType;
  onChange: (next: NotificationFiltersType) => void;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";

  return (
    <div className="grid gap-3 xl:grid-cols-[1.4fr_repeat(3,minmax(0,0.7fr))]">
      <input
        value={filters.search ?? ""}
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
        placeholder={isFr ? "Rechercher des notifications" : "Search notifications"}
        className="h-11 rounded-xl border border-input bg-background/70 px-4 text-sm outline-none focus-visible:ring-4 focus-visible:ring-ring/55"
      />
      <ModernSelect
        name="notification-type"
        value={filters.type ?? ""}
        onValueChange={(value) => onChange({ ...filters, type: value as NotificationType | "" })}
        placeholder={isFr ? "Tous les types" : "All types"}
        options={[
          { value: "", label: isFr ? "Tous les types" : "All types" },
          { value: "mention", label: isFr ? "Mentions" : "Mentions" },
          { value: "assignment", label: isFr ? "Affectations" : "Assignments" },
          { value: "status_change", label: isFr ? "Changements de statut" : "Status changes" },
          { value: "deadline", label: isFr ? "Échéances" : "Deadlines" },
          { value: "overdue", label: isFr ? "En retard" : "Overdue" },
          { value: "payment_due", label: isFr ? "Paiement à échéance" : "Payment due" },
          { value: "contract_due", label: isFr ? "Contrat à échéance" : "Contract due" },
          { value: "system", label: isFr ? "Système" : "System" },
        ]}
      />
      <ModernSelect
        name="notification-date"
        value={filters.date ?? "all"}
        onValueChange={(value) => onChange({ ...filters, date: value as NotificationFiltersType["date"] })}
        options={[
          { value: "all", label: isFr ? "Toutes les dates" : "All dates" },
          { value: "today", label: isFr ? "Aujourd'hui" : "Today" },
          { value: "week", label: isFr ? "7 derniers jours" : "Last 7 days" },
          { value: "month", label: isFr ? "30 derniers jours" : "Last 30 days" },
        ]}
      />
      <label className="flex h-11 items-center gap-3 rounded-xl border border-input bg-background/70 px-4 text-sm">
        <input
          type="checkbox"
          checked={Boolean(filters.unreadOnly)}
          onChange={(event) => onChange({ ...filters, unreadOnly: event.target.checked })}
          className="rounded border-input"
        />
        {isFr ? "Non lues uniquement" : "Unread only"}
      </label>
    </div>
  );
}
