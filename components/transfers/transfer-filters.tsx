"use client";

import Link from "next/link";
import { Search } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
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
  const { locale } = useI18n();
  const isFr = locale === "fr";

  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.2fr_repeat(6,minmax(0,1fr))_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          placeholder={isFr ? "Rechercher un bénéficiaire, une référence, banque ou notes" : "Search beneficiary, reference, bank, notes"}
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
        name="status"
        defaultValue={filters.status ?? ""}
        placeholder={isFr ? "Tous les statuts" : "All statuses"}
        options={[
          { value: "", label: isFr ? "Tous les statuts" : "All statuses" },
          { value: "planned", label: isFr ? "Planifié" : "Planned" },
          { value: "pending", label: isFr ? "En attente" : "Pending" },
          { value: "sent", label: isFr ? "Envoyé" : "Sent" },
          { value: "confirmed", label: isFr ? "Confirmé" : "Confirmed" },
          { value: "failed", label: isFr ? "Échoué" : "Failed" },
          { value: "cancelled", label: isFr ? "Annulé" : "Cancelled" },
        ]}
      />

      <ModernSelect
        name="category"
        defaultValue={filters.category ?? ""}
        placeholder={isFr ? "Toutes les catégories" : "All categories"}
        options={[
          { value: "", label: isFr ? "Toutes les catégories" : "All categories" },
          { value: "supplier", label: isFr ? "Fournisseur" : "Supplier" },
          { value: "salary", label: isFr ? "Salaire" : "Salary" },
          { value: "subcontractor", label: isFr ? "Sous-traitant" : "Subcontractor" },
          { value: "software", label: isFr ? "Logiciel" : "Software" },
          { value: "hosting", label: isFr ? "Hébergement" : "Hosting" },
          { value: "taxes", label: "Taxes" },
          { value: "rent", label: isFr ? "Loyer" : "Rent" },
          { value: "other", label: isFr ? "Autre" : "Other" },
        ]}
      />

      <ModernSelect
        name="entity"
        defaultValue={filters.entity ?? ""}
        placeholder={isFr ? "Toutes les entités" : "All entities"}
        options={[
          { value: "", label: isFr ? "Toutes les entités" : "All entities" },
          { value: "bumex_it", label: "BUMEX IT" },
          { value: "insec", label: "INSEC" },
          { value: "cnam_intec", label: "CNAM INTEC" },
          { value: "ltm_yh", label: "LTM-YH" },
          { value: "unassigned", label: isFr ? "Non assignée" : "Unassigned" },
        ]}
      />

      <ModernSelect
        name="date"
        defaultValue={filters.dateWindow ?? "all"}
        options={[
          { value: "all", label: isFr ? "Toute date" : "Any date" },
          { value: "this_month", label: isFr ? "Ce mois-ci" : "This month" },
          { value: "next_30_days", label: isFr ? "30 prochains jours" : "Next 30 days" },
          { value: "past_30_days", label: isFr ? "30 derniers jours" : "Past 30 days" },
        ]}
      />

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">{isFr ? "Appliquer" : "Apply"}</Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href="/finance/transfers">{isFr ? "Réinitialiser" : "Reset"}</Link>
        </Button>
      </div>
    </form>
  );
}
