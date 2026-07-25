import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import type { TransferFilters as TransferFiltersType, TransferFiltersData } from "@/types/finance";

export function TransferFilters({
  filters,
  filterData,
}: {
  filters: TransferFiltersType;
  filterData: TransferFiltersData;
}) {
  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.2fr_repeat(6,minmax(0,1fr))_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          placeholder="Search beneficiary, reference, bank, notes"
          defaultValue={filters.search ?? ""}
          className="pl-11"
        />
      </div>

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
        name="project"
        defaultValue={filters.projectId ?? ""}
        placeholder="All projects"
        options={[
          { value: "", label: "All projects" },
          ...filterData.projects.map((project) => ({ value: project.id, label: project.name })),
        ]}
      />

      <ModernSelect
        name="status"
        defaultValue={filters.status ?? ""}
        placeholder="All statuses"
        options={[
          { value: "", label: "All statuses" },
          { value: "planned", label: "Planned" },
          { value: "pending", label: "Pending" },
          { value: "sent", label: "Sent" },
          { value: "confirmed", label: "Confirmed" },
          { value: "failed", label: "Failed" },
          { value: "cancelled", label: "Cancelled" },
        ]}
      />

      <ModernSelect
        name="category"
        defaultValue={filters.category ?? ""}
        placeholder="All categories"
        options={[
          { value: "", label: "All categories" },
          { value: "supplier", label: "Supplier" },
          { value: "salary", label: "Salary" },
          { value: "subcontractor", label: "Subcontractor" },
          { value: "software", label: "Software" },
          { value: "hosting", label: "Hosting" },
          { value: "taxes", label: "Taxes" },
          { value: "rent", label: "Rent" },
          { value: "other", label: "Other" },
        ]}
      />

      <ModernSelect
        name="entity"
        defaultValue={filters.entity ?? ""}
        placeholder="All entities"
        options={[
          { value: "", label: "All entities" },
          { value: "bumex_it", label: "BUMEX IT" },
          { value: "insec", label: "INSEC" },
          { value: "cnam_intec", label: "CNAM INTEC" },
          { value: "ltm_yh", label: "LTM-YH" },
          { value: "unassigned", label: "Unassigned" },
        ]}
      />

      <ModernSelect
        name="date"
        defaultValue={filters.dateWindow ?? "all"}
        options={[
          { value: "all", label: "Any date" },
          { value: "this_month", label: "This month" },
          { value: "next_30_days", label: "Next 30 days" },
          { value: "past_30_days", label: "Past 30 days" },
        ]}
      />

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">Apply</Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href="/finance/transfers">Reset</Link>
        </Button>
      </div>
    </form>
  );
}
