"use client";

import { useEffect, useRef, useState } from "react";
import { ListChecks, Plus, X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TITLE_MAX_LENGTH = 200;
const MAX_DRAFTS = 50;

type Draft = { key: number; title: string };

/** Sub-tasks typed while creating a ticket, posted as repeated `subtasks` fields. */
export function SubtaskDraftList() {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const nextKey = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);
  // Row to focus once React has rendered it (set by add and Backspace-remove).
  const focusKeyRef = useRef<number | null>(null);

  useEffect(() => {
    if (focusKeyRef.current === null) {
      return;
    }

    listRef.current?.querySelector<HTMLInputElement>(`input[data-key="${focusKeyRef.current}"]`)?.focus();
    focusKeyRef.current = null;
  }, [drafts]);

  function insertAt(index: number) {
    if (drafts.length >= MAX_DRAFTS) {
      return;
    }

    const draft = { key: nextKey.current++, title: "" };
    focusKeyRef.current = draft.key;
    setDrafts((current) => [...current.slice(0, index), draft, ...current.slice(index)]);
  }

  function removeAt(index: number) {
    setDrafts((current) => current.filter((_, position) => position !== index));
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <ListChecks className="size-4 text-primary" />
          {isFr ? "Sous-tâches" : "Sub-tasks"}
        </p>
        <span className="text-xs text-muted-foreground">{isFr ? "Facultatif" : "Optional"}</span>
      </div>

      {drafts.length ? (
        <ul ref={listRef} className="space-y-1.5">
          {drafts.map((draft, index) => (
            <li key={draft.key} className="flex items-center gap-2">
              <Input
                name="subtasks"
                data-key={draft.key}
                value={draft.title}
                maxLength={TITLE_MAX_LENGTH}
                placeholder={isFr ? `Sous-tâche ${index + 1}` : `Sub-task ${index + 1}`}
                aria-label={isFr ? `Sous-tâche ${index + 1}` : `Sub-task ${index + 1}`}
                onChange={(event) => {
                  const title = event.target.value;
                  setDrafts((current) => current.map((item) => item.key === draft.key ? { ...item, title } : item));
                }}
                onKeyDown={(event) => {
                  // Enter adds the next step instead of submitting the ticket.
                  if (event.key === "Enter") {
                    event.preventDefault();

                    if (draft.title.trim()) {
                      insertAt(index + 1);
                    }
                  }

                  if (event.key === "Backspace" && !draft.title) {
                    event.preventDefault();
                    focusKeyRef.current = drafts[index - 1]?.key ?? drafts[index + 1]?.key ?? null;
                    removeAt(index);
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground hover:text-danger"
                aria-label={isFr ? `Retirer la sous-tâche ${index + 1}` : `Remove sub-task ${index + 1}`}
                onClick={() => removeAt(index)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" variant="secondary" size="sm" disabled={drafts.length >= MAX_DRAFTS} onClick={() => insertAt(drafts.length)}>
          <Plus />
          {isFr ? "Ajouter une sous-tâche" : "Add a sub-task"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {isFr ? "Responsables et échéances se règlent ensuite sur la page du ticket." : "Set owners and due dates on the ticket page afterwards."}
        </p>
      </div>
    </div>
  );
}
