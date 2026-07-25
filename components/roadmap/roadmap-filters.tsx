import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import type { RoadmapFilterData, RoadmapFilters, RoadmapView } from "@/types/milestone";

export function RoadmapFilters({
  filters,
  filterData,
  view,
  period,
}: {
  filters: RoadmapFilters;
  filterData: RoadmapFilterData;
  view: RoadmapView;
  period: string;
}) {
  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.3fr_repeat(5,minmax(0,1fr))]">
      <input type="hidden" name="period" value={period} />

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          defaultValue={filters.search ?? ""}
          placeholder="Search projects"
          className="h-11 rounded-2xl border-border/70 bg-background/45 pl-10"
        />
      </div>

      <ModernSelect
        name="view"
        defaultValue={view}
        options={[
          { value: "month", label: "Month view" },
          { value: "quarter", label: "Quarter view" },
          { value: "project", label: "Project view" },
          { value: "client", label: "Client view" },
        ]}
      />

      <ModernSelect
        name="status"
        defaultValue={filters.status ?? ""}
        placeholder="All milestone statuses"
        options={[
          { value: "", label: "All milestone statuses" },
          { value: "planned", label: "Planned" },
          { value: "in_progress", label: "In progress" },
          { value: "completed", label: "Completed" },
          { value: "delayed", label: "Delayed" },
          { value: "cancelled", label: "Cancelled" },
        ]}
      />

      <ModernSelect
        name="project"
        defaultValue={filters.projectId ?? ""}
        placeholder="All projects"
        options={[
          { value: "", label: "All projects" },
          ...filterData.projects.map((project) => ({ value: project.id, label: project.name })),
        ]}
      />

      <ModernSelect
        name="client"
        defaultValue={filters.clientId ?? ""}
        placeholder="All clients"
        options={[
          { value: "", label: "All clients" },
          ...filterData.clients.map((client) => ({ value: client.id, label: client.name })),
        ]}
      />

      <div className="flex gap-3">
        <ModernSelect
          name="owner"
          defaultValue={filters.ownerId ?? ""}
          className="min-w-0 flex-1"
          placeholder="All owners"
          options={[
            { value: "", label: "All owners" },
            ...filterData.owners.map((owner) => ({ value: owner.id, label: owner.full_name })),
          ]}
        />
        <button
          type="submit"
          className="h-11 rounded-2xl border border-primary/30 bg-primary/12 px-4 text-sm font-medium text-primary transition-all hover:border-primary/40 hover:bg-primary/18"
        >
          Apply
        </button>
      </div>
    </form>
  );
}
