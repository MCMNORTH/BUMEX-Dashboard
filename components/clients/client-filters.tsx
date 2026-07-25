import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import type { ClientFilters, ClientFiltersData } from "@/types/client";

export function ClientFilters({
  filters,
  filterData,
}: {
  filters: ClientFilters;
  filterData: ClientFiltersData;
}) {
  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.3fr_repeat(3,minmax(0,1fr))_auto]">
      <div className="relative xl:col-span-1">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          placeholder="Search clients, industries, or legal entities"
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
          { value: "prospect", label: "Prospect" },
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
          { value: "suspended", label: "Suspended" },
          { value: "archived", label: "Archived" },
        ]}
      />

      <ModernSelect
        name="type"
        defaultValue={filters.type ?? ""}
        placeholder="All client types"
        options={[
          { value: "", label: "All client types" },
          { value: "company", label: "Company" },
          { value: "public_institution", label: "Public institution" },
          { value: "ngo", label: "NGO" },
          { value: "individual", label: "Individual" },
          { value: "other", label: "Other" },
        ]}
      />

      <ModernSelect
        name="manager"
        defaultValue={filters.accountManagerId ?? ""}
        placeholder="All account managers"
        options={[
          { value: "", label: "All account managers" },
          ...filterData.accountManagers.map((manager) => ({
            value: manager.id,
            label: manager.full_name,
          })),
        ]}
      />

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">
          Apply
        </Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href="/clients">Reset</Link>
        </Button>
      </div>
    </form>
  );
}
