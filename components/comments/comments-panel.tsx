"use client";

import { useState } from "react";
import { MessageSquareText, PencilLine, Trash2 } from "lucide-react";

import { deleteCommentAction } from "@/app/(app)/comments/actions";
import { CommentEditor } from "@/components/comments/comment-editor";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmActionForm } from "@/components/shared/confirm-action-form";
import type { AppRole } from "@/types/auth";
import { canViewComment, type CommentEntityType, type CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";

function getInitials(name: string | undefined) {
  if (!name) {
    return "NA";
  }

  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatRelativeDate(value: string) {
  const diffMs = new Date(value).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}

function canCreateComment(role: AppRole, entityType: CommentEntityType) {
  if (role === "admin" || role === "manager" || role === "supervisor") {
    return true;
  }

  if (role === "employee") {
    return entityType === "project" || entityType === "ticket";
  }

  return false;
}

export function CommentsPanel({
  comments,
  entityType,
  entityId,
  returnPath,
  role,
  currentUserId,
  mentionCandidates = [],
}: {
  comments: CommentRecord[];
  entityType: CommentEntityType;
  entityId: string;
  returnPath: string;
  role: AppRole;
  currentUserId: string;
  mentionCandidates?: MentionCandidate[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const visibleComments = comments.filter((comment) => canViewComment(comment, role));
  const canCreate = canCreateComment(role, entityType);

  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquareText className="size-4 text-primary" />
          <CardTitle>Comments</CardTitle>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Internal collaboration notes and delivery context that travel with the entity.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {canCreate ? (
          <CommentEditor
            mode="create"
            entityType={entityType}
            entityId={entityId}
            returnPath={returnPath}
            role={role}
            mentionCandidates={mentionCandidates}
          />
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            {role === "shareholder"
              ? "Shareholder access is limited to visible non-internal comments."
              : "Commenting is not enabled for this entity in your current role scope."}
          </div>
        )}

        {visibleComments.length ? (
          visibleComments.map((comment) => {
            const canManage = role === "admin" || comment.author_id === currentUserId;

            return (
              <div key={comment.id} className="rounded-[24px] border border-border/65 bg-background/35 p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="size-10">
                    <AvatarFallback>{getInitials(comment.author?.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{comment.author?.full_name ?? "Unknown author"}</p>
                        {comment.is_internal ? (
                          <Badge variant="secondary" className="rounded-full px-3 py-1">
                            Internal
                          </Badge>
                        ) : null}
                        {comment.deleted_at ? (
                          <Badge variant="outline" className="rounded-full px-3 py-1">
                            Deleted
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeDate(comment.updated_at)}
                      </p>
                    </div>

                    {editingId === comment.id && !comment.deleted_at ? (
                      <CommentEditor
                        mode="edit"
                        entityType={entityType}
                        entityId={entityId}
                        returnPath={returnPath}
                        role={role}
                        comment={comment}
                        mentionCandidates={mentionCandidates}
                        onCancel={() => setEditingId(null)}
                        onSuccess={() => setEditingId(null)}
                      />
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm leading-7 text-foreground/90">
                          {comment.deleted_at ? "Comment removed." : comment.body}
                        </p>

                        {comment.attachments.length ? (
                          <div className="flex flex-wrap gap-2">
                            {comment.attachments.map((attachment) => (
                              <Badge key={attachment.id} variant="outline" className="rounded-full px-3 py-1">
                                {attachment.file_name ?? "Attachment"}
                              </Badge>
                            ))}
                          </div>
                        ) : null}

                        {canManage && !comment.deleted_at ? (
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="ghost" className="rounded-full px-4" onClick={() => setEditingId(comment.id)}>
                              <PencilLine className="size-4" />
                              Edit
                            </Button>
                            <ConfirmActionForm
                              action={deleteCommentAction}
                              fields={{ comment_id: comment.id, return_path: returnPath }}
                              title="Delete comment?"
                              description="This will remove the comment from the current record. This action cannot be undone."
                              confirmLabel="Delete comment"
                              trigger={(
                                <Button type="button" variant="ghost" className="rounded-full px-4 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100">
                                  <Trash2 className="size-4" />
                                  Delete
                                </Button>
                              )}
                            />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            No comments have been added yet for this entity.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
