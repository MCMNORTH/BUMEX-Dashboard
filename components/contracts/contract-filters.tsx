import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import type { ContractFilters, ContractFiltersData } from "@/types/contract";

export function ContractFilters({
  filters,
  filterData,
}: {
  filters: ContractFilters;
  filterData: ContractFiltersData;
}) {
  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          placeholder="Search contracts or numbers"
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
          ...filterData.clients.map((client) => ({
            value: client.id,
            label: client.name,
          })),
        ]}
      />

      <ModernSelect
        name="status"
        defaultValue={filters.status ?? ""}
        placeholder="All statuses"
        options={[
          { value: "", label: "All statuses" },
          { value: "draft", label: "Draft" },
          { value: "under_review", label: "Under review" },
          { value: "signed", label: "Signed" },
          { value: "active", label: "Active" },
          { value: "expired", label: "Expired" },
          { value: "cancelled", label: "Cancelled" },
          { value: "archived", label: "Archived" },
        ]}
      />

      <ModernSelect
        name="date"
        defaultValue={filters.date ?? "all"}
        options={[
          { value: "all", label: "Any date" },
          { value: "renewing_soon", label: "Renewing soon" },
          { value: "expired", label: "Expired" },
          { value: "active_window", label: "Active window" },
          { value: "none", label: "No dates" },
        ]}
      />

      <ModernSelect
        name="value"
        defaultValue={filters.value ?? "all"}
        options={[
          { value: "all", label: "Any value" },
          { value: "under_10k", label: "Under 10k" },
          { value: "10k_50k", label: "10k to 50k" },
          { value: "50k_plus", label: "50k+" },
          { value: "unset", label: "Unset" },
        ]}
      />

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">Apply</Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href="/contracts">Reset</Link>
        </Button>
      </div>
    </form>
  );
}
