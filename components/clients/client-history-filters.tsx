import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ClientTimelineFilter } from "@/types/client";

const filters: Array<{ value: ClientTimelineFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "projects", label: "Projects" },
  { value: "tickets", label: "Tickets" },
  { value: "contracts", label: "Contracts" },
  { value: "documents", label: "Documents" },
  { value: "client", label: "Client" },
];

export function ClientHistoryFilters({
  selected,
  total,
}: {
  selected: ClientTimelineFilter;
  total: number;
}) {
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
        {total} events
      </Badge>
    </div>
  );
}
