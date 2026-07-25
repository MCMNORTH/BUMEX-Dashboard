import { Search } from "lucide-react";

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
  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl lg:grid-cols-[1.2fr_repeat(6,minmax(0,1fr))]">
      <div className="relative lg:col-span-2">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          defaultValue={filters.search ?? ""}
          placeholder="Search title, file, or description"
          className="h-11 rounded-2xl pl-10"
        />
      </div>

      <ModernSelect
        name="documentType"
        defaultValue={filters.documentType ?? ""}
        placeholder="All types"
        options={[
          { value: "", label: "All types" },
          { value: "contract", label: "Contract" },
          { value: "invoice", label: "Invoice" },
          { value: "receipt", label: "Receipt" },
          { value: "bank_transfer", label: "Bank transfer" },
          { value: "proposal", label: "Proposal" },
          { value: "report", label: "Report" },
          { value: "meeting_note", label: "Meeting note" },
          { value: "technical_document", label: "Technical" },
          { value: "legal_document", label: "Legal" },
          { value: "other", label: "Other" },
        ]}
      />

      <ModernSelect
        name="relatedType"
        defaultValue={filters.relatedType ?? ""}
        placeholder="All links"
        options={[
          { value: "", label: "All links" },
          { value: "archive", label: "Archive" },
          { value: "client", label: "Client" },
          { value: "project", label: "Project" },
          { value: "contract", label: "Contract" },
          { value: "invoice", label: "Invoice" },
          { value: "task", label: "Ticket" },
          { value: "payment", label: "Payment" },
          { value: "transfer", label: "Transfer" },
        ]}
      />

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
        name="archive"
        defaultValue={filters.archiveState ?? "active"}
        options={[
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
          { value: "all", label: "All states" },
        ]}
      />

      <ModernSelect
        name="visibility"
        defaultValue={filters.visibility ?? ""}
        placeholder="All visibility"
        options={[
          { value: "", label: "All visibility" },
          { value: "internal", label: "Internal" },
          { value: "management", label: "Management" },
          { value: "shareholders", label: "Shareholders" },
          { value: "restricted", label: "Restricted" },
        ]}
      />

      <ModernSelect
        name="uploadedBy"
        defaultValue={filters.uploadedBy ?? ""}
        placeholder="All uploaders"
        options={[
          { value: "", label: "All uploaders" },
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
          { value: "all", label: "All dates" },
          { value: "recent_7d", label: "Last 7 days" },
          { value: "recent_30d", label: "Last 30 days" },
          { value: "older", label: "Older" },
        ]}
      />

      <div className="flex gap-2 lg:col-span-2 lg:justify-end">
        <Button type="submit" variant="secondary" className="rounded-2xl px-5">
          Apply filters
        </Button>
        <Button asChild variant="ghost" className="rounded-2xl px-4">
          <a href="/documents">Reset</a>
        </Button>
      </div>
    </form>
  );
}
