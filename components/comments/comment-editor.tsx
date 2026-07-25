"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Bold, List, MessageSquarePlus } from "lucide-react";

import { createCommentAction, updateCommentAction } from "@/app/(app)/comments/actions";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@/types/auth";
import type { CommentActionState, CommentEntityType, CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";

const initialState: CommentActionState = {};

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="rounded-2xl px-5" disabled={pending}>
      {pending ? "Saving..." : mode === "create" ? "Add comment" : "Save changes"}
    </Button>
  );
}

function getMentionQuery(value: string, cursorPosition: number) {
  const beforeCursor = value.slice(0, cursorPosition);
  const match = beforeCursor.match(/(?:^|\s)@([^\n@]*)$/);

  if (!match) {
    return null;
  }

  return {
    query: match[1] ?? "",
    start: beforeCursor.length - match[0].length + match[0].lastIndexOf("@"),
    end: cursorPosition,
  };
}

export function CommentEditor({
  mode,
  entityType,
  entityId,
  returnPath,
  role,
  mentionCandidates = [],
  comment,
  onCancel,
  onSuccess,
}: {
  mode: "create" | "edit";
  entityType: CommentEntityType;
  entityId: string;
  returnPath: string;
  role: AppRole;
  mentionCandidates?: MentionCandidate[];
  comment?: CommentRecord;
  onCancel?: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [state, formAction] = useActionState(mode === "create" ? createCommentAction : updateCommentAction, initialState);
  const [body, setBody] = useState(comment?.deleted_at ? "" : comment?.body ?? "");
  const [cursorPosition, setCursorPosition] = useState(body.length);
  const canMarkInternal = role !== "shareholder";
  const mentionState = useMemo(() => getMentionQuery(body, cursorPosition), [body, cursorPosition]);
  const filteredCandidates = useMemo(() => {
    if (!mentionState) {
      return [];
    }

    const query = mentionState.query.trim().toLowerCase();
    return mentionCandidates
      .filter((candidate) => candidate.full_name.toLowerCase().includes(query))
      .slice(0, 6);
  }, [mentionCandidates, mentionState]);

  useEffect(() => {
    if (!state.success) {
      return;
    }

    if (mode === "create") {
      formRef.current?.reset();
      requestAnimationFrame(() => {
        setBody("");
        setCursorPosition(0);
      });
    }

    onSuccess?.();
    router.refresh();
  }, [mode, onSuccess, router, state.success]);

  function insertMention(candidate: MentionCandidate) {
    if (!mentionState || !textareaRef.current) {
      return;
    }

    const nextValue = `${body.slice(0, mentionState.start)}@${candidate.full_name} ${body.slice(mentionState.end)}`;
    const nextCursor = mentionState.start + candidate.full_name.length + 2;

    setBody(nextValue);
    setCursorPosition(nextCursor);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4 rounded-[24px] border border-border/65 bg-background/35 p-4">
      <input type="hidden" name="entity_type" value={entityType} />
      <input type="hidden" name="entity_id" value={entityId} />
      <input type="hidden" name="return_path" value={returnPath} />
      {comment ? <input type="hidden" name="comment_id" value={comment.id} /> : null}

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1 rounded-full border border-border/65 bg-background/45 px-3 py-1">
          <Bold className="size-3.5" />
          Formatting placeholder
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border/65 bg-background/45 px-3 py-1">
          <List className="size-3.5" />
          Bullet lists soon
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border/65 bg-background/45 px-3 py-1">
          <MessageSquarePlus className="size-3.5" />
          Mentions enabled
        </div>
      </div>

      <textarea
        ref={textareaRef}
        name="body"
        value={body}
        rows={mode === "create" ? 4 : 3}
        placeholder="Write a clear internal note, blocker, handoff, or context update"
        className="min-h-[120px] w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm outline-none focus-visible:ring-4 focus-visible:ring-ring/55"
        onChange={(event) => {
          setBody(event.target.value);
          setCursorPosition(event.target.selectionStart ?? event.target.value.length);
        }}
        onClick={(event) => setCursorPosition(event.currentTarget.selectionStart ?? body.length)}
        onKeyUp={(event) => setCursorPosition(event.currentTarget.selectionStart ?? body.length)}
      />

      {mentionState && filteredCandidates.length ? (
        <div className="rounded-2xl border border-border/65 bg-background/55 p-2">
          <p className="px-2 py-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Mention people
          </p>
          <div className="mt-1 grid gap-1">
            {filteredCandidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
                onClick={() => insertMention(candidate)}
              >
                <span className="font-medium">{candidate.full_name}</span>
                <span className="text-xs text-muted-foreground">{candidate.role}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {canMarkInternal && mode === "create" ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="is_internal" defaultChecked className="rounded border-input" />
            Internal comment
          </label>
        ) : (
          <input type="hidden" name="is_internal" value={comment?.is_internal ? "on" : ""} />
        )}

        <div className="flex gap-2">
          {mode === "edit" && onCancel ? (
            <Button type="button" variant="ghost" className="rounded-2xl px-5" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <SubmitButton mode={mode} />
        </div>
      </div>

      {state.error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
          {state.error}
        </div>
      ) : null}
    </form>
  );
}
