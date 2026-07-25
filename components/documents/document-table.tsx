import { DocumentDetailDrawer } from "@/components/documents/document-detail-drawer";
import { ArchiveStatusBadge } from "@/components/documents/archive-status-badge";
import { DocumentTypeBadge } from "@/components/documents/document-type-badge";
import { DocumentVisibilityBadge } from "@/components/documents/document-visibility-badge";
import { formatFileSize } from "@/lib/documents/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { DocumentFiltersData, DocumentRecord } from "@/types/document";

export function DocumentTable({
  documents,
  canManage,
  filterData,
  commentsByDocumentId,
  role,
  currentUserId,
  mentionCandidates,
}: {
  documents: DocumentRecord[];
  canManage: boolean;
  filterData?: DocumentFiltersData;
  commentsByDocumentId: Record<string, CommentRecord[]>;
  role: AppRole;
  currentUserId: string;
  mentionCandidates: MentionCandidate[];
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/65 bg-background/35 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-medium">Document</th>
              <th className="px-5 py-4 font-medium">Type</th>
              <th className="px-5 py-4 font-medium">Visibility</th>
              <th className="px-5 py-4 font-medium">Related</th>
              <th className="px-5 py-4 font-medium">Size</th>
              <th className="px-5 py-4 font-medium">Updated</th>
              <th className="px-5 py-4 font-medium">Archive</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr key={document.id} className="border-b border-border/50 last:border-b-0">
                <td className="px-5 py-4">
                  <DocumentDetailDrawer
                    document={document}
                    canManage={canManage}
                    filterData={filterData}
                    comments={commentsByDocumentId[document.id] ?? []}
                    role={role}
                    currentUserId={currentUserId}
                    mentionCandidates={mentionCandidates}
                    trigger={(
                      <button type="button" className="block text-left">
                        <p className="font-medium">{document.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{document.file_name}</p>
                      </button>
                    )}
                  />
                </td>
                <td className="px-5 py-4"><DocumentTypeBadge type={document.document_type} /></td>
                <td className="px-5 py-4"><DocumentVisibilityBadge visibility={document.visibility} /></td>
                <td className="px-5 py-4">{document.relatedLabel}</td>
                <td className="px-5 py-4">{formatFileSize(document.file_size)}</td>
                <td className="px-5 py-4">{formatDate(document.updated_at)}</td>
                <td className="px-5 py-4"><ArchiveStatusBadge isArchived={document.is_archived} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
