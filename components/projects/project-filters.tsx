import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import type { ProjectFilters, ProjectFiltersData } from "@/types/project";

type ProjectFiltersProps = {
  filters: ProjectFilters;
  filterData: ProjectFiltersData;
};

export function ProjectFilters({ filters, filterData }: ProjectFiltersProps) {
  return (
    <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none xl:grid-cols-[1.3fr_repeat(4,minmax(0,1fr))_auto]">
      <div className="relative xl:col-span-1">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          placeholder="Search projects, delivery streams, or clients"
          defaultValue={filters.search ?? ""}
          className="pl-11"
        />
      </div>

      <ModernSelect
        name="status"
        defaultValue={filters.status ?? ""}
        placeholder="All statuses"
        options={[
          { value: "", label: "All statuses" },
          { value: "draft", label: "Draft" },
          { value: "active", label: "Active" },
          { value: "on_hold", label: "On hold" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
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

      <ModernSelect
        name="owner"
        defaultValue={filters.ownerId ?? ""}
        placeholder="All owners"
        options={[
          { value: "", label: "All owners" },
          ...filterData.owners.map((owner) => ({ value: owner.id, label: owner.full_name })),
        ]}
      />

      <ModernSelect
        name="deadline"
        defaultValue={filters.deadline ?? "all"}
        options={[
          { value: "all", label: "Any deadline" },
          { value: "overdue", label: "Overdue" },
          { value: "this_week", label: "Due in 7 days" },
          { value: "this_month", label: "Due in 30 days" },
          { value: "none", label: "No deadline" },
        ]}
      />

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">
          Apply
        </Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href="/projects">Reset</Link>
        </Button>
      </div>
    </form>
  );
}
