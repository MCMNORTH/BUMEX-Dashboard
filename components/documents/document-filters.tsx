"use client";

import { Search } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import type { DocumentFilters, DocumentFiltersData } from "@/types/document";

export function DocumentFilters({
  filters,
  filterData,
}: {
  filters: DocumentFilters;
  filterData: DocumentFiltersData;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";

  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl lg:grid-cols-[1.2fr_repeat(6,minmax(0,1fr))]">
      <div className="relative lg:col-span-2">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          defaultValue={filters.search ?? ""}
          placeholder={isFr ? "Rechercher un titre, fichier ou une description" : "Search title, file, or description"}
          className="h-11 rounded-2xl pl-10"
        />
      </div>

      <ModernSelect
        name="documentType"
        defaultValue={filters.documentType ?? ""}
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
        defaultValue={filters.relatedType ?? ""}
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
        name="archive"
        defaultValue={filters.archiveState ?? "active"}
        options={[
          { value: "active", label: isFr ? "Actifs" : "Active" },
          { value: "archived", label: isFr ? "Archivés" : "Archived" },
          { value: "all", label: isFr ? "Tous les états" : "All states" },
        ]}
      />

      <ModernSelect
        name="visibility"
        defaultValue={filters.visibility ?? ""}
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
        defaultValue={filters.uploadedBy ?? ""}
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
        defaultValue={filters.date ?? "all"}
        options={[
          { value: "all", label: isFr ? "Toutes les dates" : "All dates" },
          { value: "recent_7d", label: isFr ? "7 derniers jours" : "Last 7 days" },
          { value: "recent_30d", label: isFr ? "30 derniers jours" : "Last 30 days" },
          { value: "older", label: isFr ? "Plus anciens" : "Older" },
        ]}
      />

      <div className="flex gap-2 lg:col-span-2 lg:justify-end">
        <Button type="submit" variant="secondary" className="rounded-2xl px-5">
          {isFr ? "Appliquer les filtres" : "Apply filters"}
        </Button>
        <Button asChild variant="ghost" className="rounded-2xl px-4">
          <a href="/documents">{isFr ? "Réinitialiser" : "Reset"}</a>
        </Button>
      </div>
    </form>
  );
}
