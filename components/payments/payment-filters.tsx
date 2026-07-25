import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import type { FinanceFilters, PaymentFiltersData } from "@/types/finance";

export function PaymentFilters({
  filters,
  filterData,
}: {
  filters: FinanceFilters;
  filterData: PaymentFiltersData;
}) {
  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.15fr_repeat(5,minmax(0,1fr))_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          placeholder="Search by reference or notes"
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
        name="contract"
        defaultValue={filters.contractId ?? ""}
        placeholder="All contracts"
        options={[
          { value: "", label: "All contracts" },
          ...filterData.contracts.map((contract) => ({ value: contract.id, label: contract.title })),
        ]}
      />

      <ModernSelect
        name="status"
        defaultValue={filters.status ?? ""}
        placeholder="All statuses"
        options={[
          { value: "", label: "All statuses" },
          { value: "expected", label: "Expected" },
          { value: "received", label: "Received" },
          { value: "late", label: "Late" },
          { value: "cancelled", label: "Cancelled" },
          { value: "reconciled", label: "Reconciled" },
        ]}
      />

      <ModernSelect
        name="method"
        defaultValue={filters.method ?? ""}
        placeholder="All methods"
        options={[
          { value: "", label: "All methods" },
          { value: "bank_transfer", label: "Bank transfer" },
          { value: "card", label: "Card" },
          { value: "cash", label: "Cash" },
          { value: "check", label: "Check" },
          { value: "mobile_money", label: "Mobile money" },
          { value: "other", label: "Other" },
        ]}
      />

      <ModernSelect
        name="due"
        defaultValue={filters.dueWindow ?? "all"}
        options={[
          { value: "all", label: "Any due date" },
          { value: "overdue", label: "Overdue" },
          { value: "next_7_days", label: "Next 7 days" },
          { value: "next_30_days", label: "Next 30 days" },
        ]}
      />

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">Apply</Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href="/finance/payments">Reset</Link>
        </Button>
      </div>
    </form>
  );
}
