"use client";

import Link from "next/link";
import { Search } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
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
  const { locale } = useI18n();
  const isFr = locale === "fr";

  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.15fr_repeat(5,minmax(0,1fr))_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          placeholder={isFr ? "Rechercher par référence ou notes" : "Search by reference or notes"}
          defaultValue={filters.search ?? ""}
          className="pl-11"
        />
      </div>

      <ModernSelect
        name="client"
        defaultValue={filters.clientId ?? ""}
        placeholder={isFr ? "Tous les clients" : "All clients"}
        options={[
          { value: "", label: isFr ? "Tous les clients" : "All clients" },
          ...filterData.clients.map((client) => ({ value: client.id, label: client.name })),
        ]}
      />

      <ModernSelect
        name="project"
        defaultValue={filters.projectId ?? ""}
        placeholder={isFr ? "Tous les projets" : "All projects"}
        options={[
          { value: "", label: isFr ? "Tous les projets" : "All projects" },
          ...filterData.projects.map((project) => ({ value: project.id, label: project.name })),
        ]}
      />

      <ModernSelect
        name="contract"
        defaultValue={filters.contractId ?? ""}
        placeholder={isFr ? "Tous les contrats" : "All contracts"}
        options={[
          { value: "", label: isFr ? "Tous les contrats" : "All contracts" },
          ...filterData.contracts.map((contract) => ({ value: contract.id, label: contract.title })),
        ]}
      />

      <ModernSelect
        name="status"
        defaultValue={filters.status ?? ""}
        placeholder={isFr ? "Tous les statuts" : "All statuses"}
        options={[
          { value: "", label: isFr ? "Tous les statuts" : "All statuses" },
          { value: "expected", label: isFr ? "Attendu" : "Expected" },
          { value: "received", label: isFr ? "Reçu" : "Received" },
          { value: "late", label: isFr ? "En retard" : "Late" },
          { value: "cancelled", label: isFr ? "Annulé" : "Cancelled" },
          { value: "reconciled", label: isFr ? "Rapproché" : "Reconciled" },
        ]}
      />

      <ModernSelect
        name="method"
        defaultValue={filters.method ?? ""}
        placeholder={isFr ? "Toutes les méthodes" : "All methods"}
        options={[
          { value: "", label: isFr ? "Toutes les méthodes" : "All methods" },
          { value: "bank_transfer", label: isFr ? "Virement bancaire" : "Bank transfer" },
          { value: "card", label: isFr ? "Carte" : "Card" },
          { value: "cash", label: isFr ? "Espèces" : "Cash" },
          { value: "check", label: isFr ? "Chèque" : "Check" },
          { value: "mobile_money", label: "Mobile money" },
          { value: "other", label: isFr ? "Autre" : "Other" },
        ]}
      />

      <ModernSelect
        name="due"
        defaultValue={filters.dueWindow ?? "all"}
        options={[
          { value: "all", label: isFr ? "Toute échéance" : "Any due date" },
          { value: "overdue", label: isFr ? "En retard" : "Overdue" },
          { value: "next_7_days", label: isFr ? "7 prochains jours" : "Next 7 days" },
          { value: "next_30_days", label: isFr ? "30 prochains jours" : "Next 30 days" },
        ]}
      />

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">{isFr ? "Appliquer" : "Apply"}</Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href="/finance/payments">{isFr ? "Réinitialiser" : "Reset"}</Link>
        </Button>
      </div>
    </form>
  );
}
