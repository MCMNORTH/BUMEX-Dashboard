"use client";

import Link from "next/link";
import { Search } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
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
  const { locale } = useI18n();
  const isFr = locale === "fr";

  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.3fr_repeat(3,minmax(0,1fr))_auto]">
      <div className="relative xl:col-span-1">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          placeholder={isFr ? "Rechercher des clients, secteurs ou entités juridiques" : "Search clients, industries, or legal entities"}
          defaultValue={filters.search ?? ""}
          className="pl-11"
        />
      </div>

      <ModernSelect
        name="status"
        defaultValue={filters.status ?? ""}
        placeholder={isFr ? "Tous les statuts" : "All statuses"}
        options={[
          { value: "", label: isFr ? "Tous les statuts" : "All statuses" },
          { value: "prospect", label: isFr ? "Prospect" : "Prospect" },
          { value: "active", label: isFr ? "Actif" : "Active" },
          { value: "inactive", label: isFr ? "Inactif" : "Inactive" },
          { value: "suspended", label: isFr ? "Suspendu" : "Suspended" },
          { value: "archived", label: isFr ? "Archivé" : "Archived" },
        ]}
      />

      <ModernSelect
        name="type"
        defaultValue={filters.type ?? ""}
        placeholder={isFr ? "Tous les types de client" : "All client types"}
        options={[
          { value: "", label: isFr ? "Tous les types de client" : "All client types" },
          { value: "company", label: isFr ? "Entreprise" : "Company" },
          { value: "public_institution", label: isFr ? "Institution publique" : "Public institution" },
          { value: "ngo", label: "NGO" },
          { value: "individual", label: isFr ? "Individuel" : "Individual" },
          { value: "other", label: isFr ? "Autre" : "Other" },
        ]}
      />

      <ModernSelect
        name="stage"
        defaultValue={filters.prospectStage ?? ""}
        placeholder={isFr ? "Toutes les phases" : "All stages"}
        options={[
          { value: "", label: isFr ? "Toutes les phases" : "All stages" },
          { value: "initial_contact", label: isFr ? "Premier contact" : "Initial contact" },
          { value: "qualification", label: isFr ? "Qualification" : "Qualification" },
          { value: "negotiation", label: isFr ? "Négociation" : "Negotiation" },
          { value: "proposal_sent", label: isFr ? "Proposition envoyée" : "Proposal sent" },
          { value: "pending_signature", label: isFr ? "En attente de signature" : "Pending signature" },
        ]}
      />

      <ModernSelect
        name="manager"
        defaultValue={filters.accountManagerId ?? ""}
        placeholder={isFr ? "Tous les responsables de compte" : "All account managers"}
        options={[
          { value: "", label: isFr ? "Tous les responsables de compte" : "All account managers" },
          ...filterData.accountManagers.map((manager) => ({
            value: manager.id,
            label: manager.full_name,
          })),
        ]}
      />

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">
          {isFr ? "Appliquer" : "Apply"}
        </Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href="/clients">{isFr ? "Réinitialiser" : "Reset"}</Link>
        </Button>
      </div>
    </form>
  );
}
