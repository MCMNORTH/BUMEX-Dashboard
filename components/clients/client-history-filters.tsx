"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { ClientTimelineFilter } from "@/types/client";

export function ClientHistoryFilters({
  selected,
  total,
}: {
  selected: ClientTimelineFilter;
  total: number;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const filters: Array<{ value: ClientTimelineFilter; label: string }> = [
    { value: "all", label: isFr ? "Tout" : "All" },
    { value: "projects", label: isFr ? "Projets" : "Projects" },
    { value: "tickets", label: isFr ? "Tickets" : "Tickets" },
    { value: "contracts", label: isFr ? "Contrats" : "Contracts" },
    { value: "documents", label: isFr ? "Documents" : "Documents" },
    { value: "client", label: isFr ? "Client" : "Client" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Button
            key={filter.value}
            asChild
            variant={selected === filter.value ? "secondary" : "ghost"}
            className="rounded-full px-4"
          >
            <a href={filter.value === "all" ? "?" : `?history=${filter.value}`}>{filter.label}</a>
          </Button>
        ))}
      </div>
      <Badge variant="secondary" className="rounded-full px-3 py-1">
        {total} {isFr ? "événements" : "events"}
      </Badge>
    </div>
  );
}
