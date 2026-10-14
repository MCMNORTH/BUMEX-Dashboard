"use client";

import { X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { FilterSearchInput } from "@/components/shared/filter-search-input";
import { useFilterParams } from "@/hooks/use-filter-params";
import { cn } from "@/lib/utils";
import type { DocumentFilters, DocumentFiltersData } from "@/types/document";

const filterKeys = ["search", "documentType", "relatedType", "client", "project", "contract", "archive", "visibility", "uploadedBy", "date"] as const;

export function DocumentFilters({
  filters,
  filterData,
}: {
  filters: DocumentFilters;
  filterData: DocumentFiltersData;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { applyFilter, clearFilters, hasActiveFilters, isPending } = useFilterParams(filterKeys);

  return (
    <div
      className={cn(
        "grid gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-[var(--shadow-soft)] lg:grid-cols-[1.2fr_repeat(6,minmax(0,1fr))] transition-opacity",
        isPending && "opacity-70",
      )}
      aria-busy={isPending}
    >
      <FilterSearchInput
        className="lg:col-span-2"
        value={filters.search ?? ""}
        onSearch={(value) => applyFilter("search", value, { history: "replace" })}
        placeholder={isFr ? "Rechercher un titre, fichier ou une description" : "Search title, file, or description"}
        inputClassName="h-11 rounded-xl"
      />

      <ModernSelect
        name="documentType"
        value={filters.documentType ?? ""}
        onValueChange={(value) => applyFilter("documentType", value)}
        placeholder={isFr ? "Tous les types" : "All types"}
        options={[
          { value: "", label: isFr ? "Tous les types" : "All types" },
          { value: "contract", label: isFr ? "Contrat" : "Contract" },
          { value: "invoice", label: isFr ? "Facture" : "Invoice" },
          { value: "receipt", label: isFr ? "Reçu" : "Receipt" },
          { value: "bank_transfer", label: isFr ? "Virement bancaire" : "Bank transfer" },
          { value: "proposal", label: isFr ? "Proposition" : "Proposal" },
          { value: "report", label: isFr ? "Rapport" : "Report" },
          { value: "meeting_note", label: isFr ? "Note de réunion" : "Meeting note" },
          { value: "technical_document", label: isFr ? "Technique" : "Technical" },
          { value: "legal_document", label: isFr ? "Juridique" : "Legal" },
          { value: "other", label: isFr ? "Autre" : "Other" },
        ]}
      />

      <ModernSelect
        name="relatedType"
        value={filters.relatedType ?? ""}
        onValueChange={(value) => applyFilter("relatedType", value)}
        placeholder={isFr ? "Tous les liens" : "All links"}
        options={[
          { value: "", label: isFr ? "Tous les liens" : "All links" },
          { value: "archive", label: isFr ? "Archive" : "Archive" },
          { value: "client", label: "Client" },
          { value: "project", label: isFr ? "Projet" : "Project" },
          { value: "contract", label: isFr ? "Contrat" : "Contract" },
          { value: "invoice", label: isFr ? "Facture" : "Invoice" },
          { value: "task", label: "Ticket" },
          { value: "payment", label: isFr ? "Paiement" : "Payment" },
          { value: "transfer", label: isFr ? "Transfert" : "Transfer" },
        ]}
      />

      <ModernSelect
        name="client"
        searchable
        value={filters.clientId ?? ""}
        onValueChange={(value) => applyFilter("client", value)}
        placeholder={isFr ? "Tous les clients" : "All clients"}
        options={[
          { value: "", label: isFr ? "Tous les clients" : "All clients" },
          ...filterData.clients.map((client) => ({ value: client.id, label: client.name })),
        ]}
      />

      <ModernSelect
        name="project"
        searchable
        value={filters.projectId ?? ""}
        onValueChange={(value) => applyFilter("project", value)}
        placeholder={isFr ? "Tous les projets" : "All projects"}
        options={[
          { value: "", label: isFr ? "Tous les projets" : "All projects" },
          ...filterData.projects.map((project) => ({ value: project.id, label: project.name })),
        ]}
      />

      <ModernSelect
        name="contract"
        searchable
        value={filters.contractId ?? ""}
        onValueChange={(value) => applyFilter("contract", value)}
        placeholder={isFr ? "Tous les contrats" : "All contracts"}
        options={[
          { value: "", label: isFr ? "Tous les contrats" : "All contracts" },
          ...filterData.contracts.map((contract) => ({ value: contract.id, label: contract.title })),
        ]}
      />

      <ModernSelect
        name="archive"
        value={filters.archiveState ?? "active"}
        onValueChange={(value) => applyFilter("archive", value)}
        options={[
          { value: "active", label: isFr ? "Actifs" : "Active" },
          { value: "archived", label: isFr ? "Archivés" : "Archived" },
          { value: "all", label: isFr ? "Tous les états" : "All states" },
        ]}
      />

      <ModernSelect
        name="visibility"
        value={filters.visibility ?? ""}
        onValueChange={(value) => applyFilter("visibility", value)}
        placeholder={isFr ? "Toute visibilité" : "All visibility"}
        options={[
          { value: "", label: isFr ? "Toute visibilité" : "All visibility" },
          { value: "internal", label: isFr ? "Interne" : "Internal" },
          { value: "management", label: isFr ? "Management" : "Management" },
          { value: "shareholders", label: isFr ? "Actionnaires" : "Shareholders" },
          { value: "restricted", label: isFr ? "Restreint" : "Restricted" },
        ]}
      />

      <ModernSelect
        name="uploadedBy"
        searchable
        value={filters.uploadedBy ?? ""}
        onValueChange={(value) => applyFilter("uploadedBy", value)}
        placeholder={isFr ? "Tous les importeurs" : "All uploaders"}
        options={[
          { value: "", label: isFr ? "Tous les importeurs" : "All uploaders" },
          ...filterData.uploadedByOptions.map((uploader) => ({
            value: uploader.id,
            label: uploader.full_name,
          })),
        ]}
      />

      <ModernSelect
        name="date"
        value={filters.date ?? "all"}
        onValueChange={(value) => applyFilter("date", value)}
        options={[
          { value: "all", label: isFr ? "Toutes les dates" : "All dates" },
          { value: "recent_7d", label: isFr ? "7 derniers jours" : "Last 7 days" },
          { value: "recent_30d", label: isFr ? "30 derniers jours" : "Last 30 days" },
          { value: "older", label: isFr ? "Plus anciens" : "Older" },
        ]}
      />

      <Button
        type="button"
        variant="ghost"
        onClick={clearFilters}
        disabled={!hasActiveFilters || isPending}
        className="text-muted-foreground"
      >
        <X />
        {isFr ? "Effacer les filtres" : "Clear filters"}
      </Button>
    </div>
  );
}
