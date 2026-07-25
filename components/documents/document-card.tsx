import { FileStack, FolderInput, UserRound } from "lucide-react";

import { ArchiveStatusBadge } from "@/components/documents/archive-status-badge";
import { DocumentDetailDrawer } from "@/components/documents/document-detail-drawer";
import { DocumentTypeBadge } from "@/components/documents/document-type-badge";
import { DocumentVisibilityBadge } from "@/components/documents/document-visibility-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatFileSize } from "@/lib/documents/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { DocumentFiltersData, DocumentRecord } from "@/types/document";

export function DocumentCard({
  document,
  canManage,
  filterData,
  comments = [],
  role,
  currentUserId,
  mentionCandidates = [],
}: {
  document: DocumentRecord;
  canManage: boolean;
  filterData?: DocumentFiltersData;
  comments?: CommentRecord[];
  role: AppRole;
  currentUserId: string;
  mentionCandidates?: MentionCandidate[];
}) {
  return (
    <DocumentDetailDrawer
      document={document}
      canManage={canManage}
      filterData={filterData}
      comments={comments}
      role={role}
      currentUserId={currentUserId}
      mentionCandidates={mentionCandidates}
      trigger={(
        <button type="button" className="w-full text-left">
          <Card className="surface-highlight group overflow-hidden border-border/70 bg-white/96 shadow-[0_24px_64px_-46px_rgba(37,99,235,0.24)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_72px_-48px_rgba(37,99,235,0.3)] dark:bg-[#161b26] dark:shadow-none">
            <CardContent className="space-y-5 px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <DocumentTypeBadge type={document.document_type} />
                    <DocumentVisibilityBadge visibility={document.visibility} />
                    <ArchiveStatusBadge isArchived={document.is_archived} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold tracking-[-0.04em] transition-colors group-hover:text-white">
                      {document.title}
                    </h3>
                    <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                      {document.description ?? "Controlled document record with secure access and archive visibility."}
                    </p>
                  </div>
                </div>
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/46">
                  <FileStack className="size-5 text-primary" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Related</p>
                  <p className="mt-2 text-sm font-medium">{document.relatedLabel}</p>
                </div>
                <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">File size</p>
                  <p className="mt-2 text-sm font-medium">{formatFileSize(document.file_size)}</p>
                </div>
                <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Updated</p>
                  <p className="mt-2 text-sm font-medium">{formatDate(document.updated_at)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <FolderInput className="size-4" />
                  {document.file_name}
                </span>
                <span className="flex items-center gap-2">
                  <UserRound className="size-4" />
                  {document.uploadedBy?.full_name ?? "Unknown uploader"}
                </span>
              </div>
            </CardContent>
          </Card>
        </button>
      )}
    />
  );
}
