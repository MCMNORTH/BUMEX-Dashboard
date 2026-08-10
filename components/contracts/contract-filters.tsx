"use client";

import Link from "next/link";
import { Search } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
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
  const { locale } = useI18n();
  const isFr = locale === "fr";

  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          placeholder={isFr ? "Rechercher des contrats ou numéros" : "Search contracts or numbers"}
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
          ...filterData.clients.map((client) => ({
            value: client.id,
            label: client.name,
          })),
        ]}
      />

      <ModernSelect
        name="status"
        defaultValue={filters.status ?? ""}
        placeholder={isFr ? "Tous les statuts" : "All statuses"}
        options={[
          { value: "", label: isFr ? "Tous les statuts" : "All statuses" },
          { value: "draft", label: isFr ? "Brouillon" : "Draft" },
          { value: "under_review", label: isFr ? "En revue" : "Under review" },
          { value: "signed", label: isFr ? "Signé" : "Signed" },
          { value: "active", label: isFr ? "Actif" : "Active" },
          { value: "expired", label: isFr ? "Expiré" : "Expired" },
          { value: "cancelled", label: isFr ? "Annulé" : "Cancelled" },
          { value: "archived", label: isFr ? "Archivé" : "Archived" },
        ]}
      />

      <ModernSelect
        name="date"
        defaultValue={filters.date ?? "all"}
        options={[
          { value: "all", label: isFr ? "Toute date" : "Any date" },
          { value: "renewing_soon", label: isFr ? "Renouvellement proche" : "Renewing soon" },
          { value: "expired", label: isFr ? "Expiré" : "Expired" },
          { value: "active_window", label: isFr ? "Période active" : "Active window" },
          { value: "none", label: isFr ? "Aucune date" : "No dates" },
        ]}
      />

      <ModernSelect
        name="value"
        defaultValue={filters.value ?? "all"}
        options={[
          { value: "all", label: isFr ? "Toute valeur" : "Any value" },
          { value: "under_10k", label: isFr ? "Moins de 10k" : "Under 10k" },
          { value: "10k_50k", label: isFr ? "10k à 50k" : "10k to 50k" },
          { value: "50k_plus", label: "50k+" },
          { value: "unset", label: isFr ? "Non défini" : "Unset" },
        ]}
      />

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">{isFr ? "Appliquer" : "Apply"}</Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href="/contracts">{isFr ? "Réinitialiser" : "Reset"}</Link>
        </Button>
      </div>
    </form>
  );
}
