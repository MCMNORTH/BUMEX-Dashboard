"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Pin, StickyNote } from "lucide-react";

import { createNoteAction, updateNoteAction } from "@/app/(app)/notes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { useI18n } from "@/components/layout/i18n-provider";
import { canCreateNoteByRole, getAllowedNoteVisibilities, type InternalNoteActionState, type InternalNoteEntityType, type InternalNoteRecord } from "@/types/note";
import type { AppRole } from "@/types/auth";

const initialState: InternalNoteActionState = {};

function SubmitButton({ mode, isFr }: { mode: "create" | "edit"; isFr: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="rounded-2xl px-5" disabled={pending}>
      {pending ? (isFr ? "Enregistrement..." : "Saving...") : mode === "create" ? (isFr ? "Ajouter une note" : "Add note") : (isFr ? "Enregistrer la note" : "Save note")}
    </Button>
  );
}

const visibilityDescriptions = {
  private: "Visible only to the author and admins.",
  team: "Visible to operational users in the allowed work scope.",
  management: "Visible to management and administrators only.",
  shareholders: "Visible to management, administrators, and shareholders.",
} as const;

export function NoteForm({
  mode,
  entityType,
  entityId,
  returnPath,
  role,
  note,
  onCancel,
  onSuccess,
}: {
  mode: "create" | "edit";
  entityType: InternalNoteEntityType;
  entityId: string;
  returnPath: string;
  role: AppRole;
  note?: InternalNoteRecord;
  onCancel?: () => void;
  onSuccess?: () => void;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [state, formAction] = useActionState(mode === "create" ? createNoteAction : updateNoteAction, initialState);
  const allowedVisibilities = getAllowedNoteVisibilities(role);
  const defaultVisibility = note?.visibility ?? allowedVisibilities[0] ?? "team";

  useEffect(() => {
    if (!state.success) {
      return;
    }

    if (mode === "create") {
      formRef.current?.reset();
    }

    onSuccess?.();
    router.refresh();
  }, [mode, onSuccess, router, state.success]);

  if (!canCreateNoteByRole(role, entityType) && mode === "create") {
    return null;
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4 rounded-[24px] border border-border/65 bg-background/35 p-4">
      <input type="hidden" name="entity_type" value={entityType} />
      <input type="hidden" name="entity_id" value={entityId} />
      <input type="hidden" name="return_path" value={returnPath} />
      {note ? <input type="hidden" name="note_id" value={note.id} /> : null}

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1 rounded-full border border-border/65 bg-background/45 px-3 py-1">
          <StickyNote className="size-3.5" />
          {isFr ? "Note structurée" : "Structured note"}
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border/65 bg-background/45 px-3 py-1">
          <Pin className="size-3.5" />
          {isFr ? "Épingler un contexte important" : "Pin important context"}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-2">
          <label className="text-sm font-medium">{isFr ? "Titre" : "Title"}</label>
          <Input
            name="title"
            defaultValue={note?.title}
            placeholder={isFr ? "Courte synthèse métier" : "Short business summary"}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{isFr ? "Visibilité" : "Visibility"}</label>
          <ModernSelect
            name="visibility"
            defaultValue={defaultVisibility}
            options={allowedVisibilities.map((option) => ({
              value: option,
              label: isFr ? ({ private: "Privée", team: "Équipe", management: "Direction", shareholders: "Actionnaires" } as const)[option] : option.replaceAll("_", " "),
            }))}
          />
          <p className="text-xs text-muted-foreground">{isFr ? ({ private: "Visible uniquement par l’auteur et les administrateurs.", team: "Visible par les utilisateurs opérationnels du périmètre autorisé.", management: "Visible uniquement par la direction et les administrateurs.", shareholders: "Visible par la direction, les administrateurs et les actionnaires." } as const)[defaultVisibility] : visibilityDescriptions[defaultVisibility]}</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{isFr ? "Contenu" : "Body"}</label>
        <textarea
          name="body"
          defaultValue={note?.body}
          rows={mode === "create" ? 5 : 4}
          placeholder={isFr ? "Saisissez le contexte opérationnel, les décisions de suivi, les risques ou une note exécutive." : "Capture operational context, follow-up decisions, risks, or an executive note."}
          className="min-h-[140px] w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm outline-none focus-visible:ring-4 focus-visible:ring-ring/55"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            name="pinned"
            defaultChecked={note?.pinned ?? false}
            className="rounded border-input"
          />
          {isFr ? "Épingler cette note" : "Pin this note"}
        </label>

        <div className="flex gap-2">
          {mode === "edit" && onCancel ? (
            <Button type="button" variant="ghost" className="rounded-2xl px-5" onClick={onCancel}>
              {isFr ? "Annuler" : "Cancel"}
            </Button>
          ) : null}
          <SubmitButton mode={mode} isFr={isFr} />
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
