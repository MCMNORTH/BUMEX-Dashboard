import { Archive, FileClock, FolderArchive, LibraryBig } from "lucide-react";

import { DocumentCard } from "@/components/documents/document-card";
import { DocumentFilters } from "@/components/documents/document-filters";
import { DocumentTable } from "@/components/documents/document-table";
import { DocumentToast } from "@/components/documents/document-toast";
import { DocumentUploadForm } from "@/components/documents/document-upload-form";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth/server";
import { getCommentsForEntities } from "@/lib/comments/service";
import { getDocuments, getDocumentsFilterData } from "@/lib/documents/service";
import { formatNumber } from "@/lib/formatters";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getMentionCandidates } from "@/lib/notifications/service";
import type { CommentRecord } from "@/types/comment";
import type { DocumentFilters as DocumentFiltersType, DocumentRecord } from "@/types/document";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function groupByType(documents: DocumentRecord[]) {
  const groups = new Map<string, number>();

  for (const document of documents) {
    groups.set(document.document_type, (groups.get(document.document_type) ?? 0) + 1);
  }

  return [...groups.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireRouteAccess("documents");
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";
  const params = (await searchParams) ?? {};
  const filters: DocumentFiltersType = {
    search: getString(params.search) ?? "",
    documentType: (getString(params.documentType) as DocumentFiltersType["documentType"]) ?? "",
    relatedType: (getString(params.relatedType) as DocumentFiltersType["relatedType"]) ?? "",
    clientId: getString(params.client) ?? "",
    projectId: getString(params.project) ?? "",
    contractId: getString(params.contract) ?? "",
    uploadedBy: getString(params.uploadedBy) ?? "",
    archiveState: (getString(params.archive) as DocumentFiltersType["archiveState"]) ?? "active",
    visibility: (getString(params.visibility) as DocumentFiltersType["visibility"]) ?? "",
    date: (getString(params.date) as DocumentFiltersType["date"]) ?? "all",
  };

  const [documents, filterData, mentionCandidates] = await Promise.all([
    getDocuments(auth.role, filters),
    getDocumentsFilterData(),
    getMentionCandidates(),
  ]);
  const commentsByDocumentId = (await getCommentsForEntities("document", documents.map((document) => document.id))) as Record<string, CommentRecord[]>;

  const canManage = auth.role !== "shareholder";
  const activeDocuments = documents.filter((document) => !document.is_archived);
  const archivedDocuments = documents.filter((document) => document.is_archived);
  const recentDocuments = [...documents].sort((left, right) => right.updated_at.localeCompare(left.updated_at)).slice(0, 4);
  const categoryGroups = groupByType(activeDocuments);

  return (
    <div className="space-y-6">
      <DocumentToast />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          eyebrow={isFr ? "Module documents" : "Documents module"}
          title={
            auth.role === "shareholder"
              ? (isFr ? "Documents contrôlés du portefeuille avec une visibilité compatible actionnaires." : "Controlled portfolio documents with shareholder-safe visibility.")
              : auth.role === "employee"
                ? (isFr ? "Documents liés aux projets et enregistrements contrôlés dans votre périmètre visible." : "Project-linked documents and controlled records across your visible scope.")
                : (isFr ? "Une bibliothèque documentaire entreprise sécurisée pour les enregistrements contrôlés et les archives de la société." : "A secure enterprise document library for controlled records and company archives.")
          }
          subtitle={
            auth.role === "shareholder"
              ? (isFr ? "Accès en lecture seule aux documents compatibles board, aux enregistrements de haut niveau et aux archives approuvées." : "Read-only access to board-safe documents, high-level records, and approved archive material.")
              : auth.role === "employee"
                ? (isFr ? "Recherchez les documents liés à vos clients, projets, contrats et tickets autorisés." : "Search documents linked to your allowed clients, projects, contracts, and tickets.")
                : (isFr ? "Importez, classez, archivez et révisez les enregistrements internes avec des règles de visibilité, un périmètre métier lié et un stockage protégé." : "Upload, classify, archive, and review internal records with visibility rules, linked business scope, and protected storage.")
          }
        />
        {canManage ? <DocumentUploadForm mode="create" filterData={filterData} /> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {[
          { icon: LibraryBig, label: isFr ? "Documents actifs" : "Active documents", value: formatNumber(activeDocuments.length), detail: isFr ? "Surface actuelle de la bibliothèque" : "Current library surface" },
          { icon: Archive, label: isFr ? "Archivés" : "Archived", value: formatNumber(archivedDocuments.length), detail: isFr ? "Enregistrements à l’état archive" : "Records in archive state" },
          { icon: FileClock, label: isFr ? "Fichiers récents" : "Recent files", value: formatNumber(recentDocuments.length), detail: isFr ? "Mis à jour le plus récemment" : "Updated most recently" },
          { icon: FolderArchive, label: isFr ? "Liés aux archives" : "Archive-linked", value: formatNumber(documents.filter((document) => document.related_type === "archive").length), detail: isFr ? "Enregistrements des archives générales de la société" : "General company archive records" },
        ].map(({ icon: Icon, label, value, detail }) => (
          <Card key={label} className="surface-highlight relative overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45">
                  <Icon className="size-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DocumentFilters filters={filters} filterData={filterData} />

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-5 py-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Catégories" : "Categories"}</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">{isFr ? "Vue type dossiers" : "Folder-like overview"}</h3>
            </div>

            <div className="grid gap-3">
              {categoryGroups.length ? (
                categoryGroups.map(([key, count]) => (
                  <div key={key} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium capitalize">{key.replaceAll("_", " ")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{isFr ? "Enregistrements contrôlés dans cette catégorie." : "Controlled records in this category."}</p>
                      </div>
                      <Badge variant="secondary" className="rounded-full px-3 py-1">
                        {count}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  {isFr ? "Aucun document actif ne correspond aux filtres actuels." : "No active documents match the current filters."}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-5 py-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Documents récents" : "Recent documents"}</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">{isFr ? "Derniers enregistrements et mises à jour" : "Latest records and updates"}</h3>
            </div>
            <div className="grid gap-3">
              {recentDocuments.length ? (
                recentDocuments.map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    canManage={canManage}
                    filterData={filterData}
                    comments={commentsByDocumentId[document.id] ?? []}
                    role={auth.role}
                    currentUserId={auth.profile.id}
                    mentionCandidates={mentionCandidates}
                  />
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  {isFr ? "Aucun document récent n’est disponible dans le périmètre actuel." : "No recent documents are available in the current scope."}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Library</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">Controlled document records</h2>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {documents.length} results
          </Badge>
        </div>

        <div className="hidden xl:block">
          <DocumentTable
            documents={documents}
            canManage={canManage}
            filterData={filterData}
            commentsByDocumentId={commentsByDocumentId}
            role={auth.role}
            currentUserId={auth.profile.id}
            mentionCandidates={mentionCandidates}
          />
        </div>

        <div className="grid gap-4 xl:hidden">
          {activeDocuments.length ? (
            activeDocuments.map((document) => (
              <DocumentCard
                key={document.id}
                document={document}
                canManage={canManage}
                filterData={filterData}
                comments={commentsByDocumentId[document.id] ?? []}
                role={auth.role}
                currentUserId={auth.profile.id}
                mentionCandidates={mentionCandidates}
              />
            ))
          ) : (
            <div className="rounded-[28px] border border-dashed border-border/70 bg-background/35 p-8 text-center text-sm text-muted-foreground">
              No documents match the current filters.
            </div>
          )}
        </div>
      </div>

      <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
        <CardContent className="space-y-4 px-5 py-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Archived documents</p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight">Archive and long-term records</h3>
          </div>
          {archivedDocuments.length ? (
            <div className="grid gap-4">
              {archivedDocuments.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  canManage={canManage}
                  filterData={filterData}
                  comments={commentsByDocumentId[document.id] ?? []}
                  role={auth.role}
                  currentUserId={auth.profile.id}
                  mentionCandidates={mentionCandidates}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
              No archived documents are visible in the current scope.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
