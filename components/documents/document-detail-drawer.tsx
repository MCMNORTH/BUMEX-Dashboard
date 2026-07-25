"use client";

import type { ReactNode } from "react";
import { Download, ExternalLink, History, Trash2 } from "lucide-react";

import { deleteDocumentAction, toggleDocumentArchiveAction } from "@/app/(app)/documents/actions";
import { ArchiveStatusBadge } from "@/components/documents/archive-status-badge";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { DocumentTypeBadge } from "@/components/documents/document-type-badge";
import { DocumentUploadForm } from "@/components/documents/document-upload-form";
import { DocumentVisibilityBadge } from "@/components/documents/document-visibility-badge";
import { ConfirmActionForm } from "@/components/shared/confirm-action-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatFileSize, getRelatedTypeLabel } from "@/lib/documents/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { DocumentFiltersData, DocumentRecord } from "@/types/document";

export function DocumentDetailDrawer({
  document,
  trigger,
  canManage,
  filterData,
  comments = [],
  role,
  currentUserId,
  mentionCandidates = [],
}: {
  document: DocumentRecord;
  trigger: ReactNode;
  canManage: boolean;
  filterData?: DocumentFiltersData;
  comments?: CommentRecord[];
  role: AppRole;
  currentUserId: string;
  mentionCandidates?: MentionCandidate[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="top-0 right-0 left-auto h-screen max-h-screen w-full max-w-2xl translate-x-0 translate-y-0 rounded-none border-l border-border/70 px-0 py-0">
        <div className="flex h-full flex-col overflow-hidden">
          <DialogHeader className="border-b border-border/65 px-6 py-5">
            <DialogTitle className="text-xl">{document.title}</DialogTitle>
            <DialogDescription>
              Controlled document record linked to {document.relatedLabel.toLowerCase()}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="flex flex-wrap gap-2">
              <DocumentTypeBadge type={document.document_type} />
              <DocumentVisibilityBadge visibility={document.visibility} />
              <ArchiveStatusBadge isArchived={document.is_archived} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">File</p>
                <p className="mt-2 text-sm font-medium">{document.file_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatFileSize(document.file_size)}</p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Linked to</p>
                <p className="mt-2 text-sm font-medium">{getRelatedTypeLabel(document.related_type)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{document.relatedLabel}</p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Uploaded by</p>
                <p className="mt-2 text-sm font-medium">{document.uploadedBy?.full_name ?? "Unknown"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(document.created_at)}</p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">MIME type</p>
                <p className="mt-2 text-sm font-medium">{document.mime_type ?? "Unknown"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Updated {formatDate(document.updated_at)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">Description</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {document.description ?? "No additional document description has been recorded."}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-2xl px-5">
                <a href={`/api/documents/${document.id}/download`} target="_blank" rel="noreferrer">
                  <Download className="size-4" />
                  Download
                </a>
              </Button>
              <Button asChild variant="secondary" className="rounded-2xl px-5">
                <a href={`/api/documents/${document.id}/download`} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Open file
                </a>
              </Button>
              {canManage && filterData ? (
                <DocumentUploadForm
                  mode="edit"
                  filterData={filterData}
                  defaults={{
                    document_id: document.id,
                    title: document.title,
                    description: document.description ?? "",
                    document_type: document.document_type,
                    related_type: document.related_type,
                    related_id: document.related_id ?? "",
                    visibility: document.visibility,
                  }}
                />
              ) : null}
            </div>

            {canManage ? (
              <div className="flex flex-wrap gap-3 rounded-2xl border border-border/65 bg-background/38 p-4">
                <form action={toggleDocumentArchiveAction}>
                  <input type="hidden" name="document_id" value={document.id} />
                  <input type="hidden" name="next_state" value={document.is_archived ? "active" : "archived"} />
                  <Button type="submit" variant="secondary" className="rounded-2xl px-5">
                    {document.is_archived ? "Restore document" : "Archive document"}
                  </Button>
                </form>
                <ConfirmActionForm
                  action={deleteDocumentAction}
                  fields={{ document_id: document.id }}
                  title="Delete document?"
                  description={`This will permanently delete "${document.title}" and remove its stored file. This action cannot be undone.`}
                  confirmLabel="Delete document"
                  trigger={(
                    <Button type="button" variant="ghost" className="rounded-2xl px-5 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100">
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  )}
                />
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <History className="size-4 text-primary" />
                <h3 className="text-base font-semibold">Activity history</h3>
              </div>
              {document.recentActivity.length ? (
                document.recentActivity.map((activity) => (
                  <div key={activity.id} className="rounded-2xl border border-border/65 bg-background/38 p-4">
                    <p className="text-sm font-medium">{activity.action}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {activity.metadata.summary
                        ?? (activity.metadata.field
                          ? `${activity.metadata.field} changed from ${activity.metadata.from ?? "empty"} to ${activity.metadata.to ?? "empty"}`
                          : "Document activity recorded.")}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {activity.user?.full_name ?? "System"} / {formatDate(activity.created_at)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  No document activity has been recorded yet.
                </div>
              )}
            </div>

            <CommentsPanel
              comments={comments}
              entityType="document"
              entityId={document.id}
              returnPath="/documents"
              role={role}
              currentUserId={currentUserId}
              mentionCandidates={mentionCandidates}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
