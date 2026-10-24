"use client";

import { useState } from "react";

import { deleteJournalAction, saveJournalAction } from "@/app/(app)/erp/accounting/actions";
import { ActionNotice, useAccountingAction } from "@/components/erp/accounting/action-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { journalKindLabels, type JournalKind } from "@/lib/erp/accounting/model";
import type { Locale } from "@/lib/i18n/config";

type Journal = { id: string; code: string; name: string; kind: JournalKind; posted: number; drafts: number; banks: number; loans: number };
type Draft = { journalId?: string; code: string; name: string; kind: JournalKind };

export function JournalsManager({ locale, entityCode, journals, canEdit }: { locale: Locale; entityCode: string; journals: Journal[]; canEdit: boolean }) {
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const { pending, notice, dismiss, run } = useAccountingAction();
  const [draft, setDraft] = useState<Draft>({ code: "", name: "", kind: "misc" });
  const editing = journals.find((j) => j.id === draft.journalId);
  const reset = () => setDraft({ code: "", name: "", kind: "misc" });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{tr("Code", "Code")}</th>
                <th className="px-4 py-3 font-medium">{tr("Intitulé", "Name")}</th>
                <th className="px-4 py-3 font-medium">{tr("Type", "Kind")}</th>
                <th className="px-4 py-3 text-right font-medium">{tr("Écritures", "Entries")}</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {journals.map((j) => {
                const free = j.posted === 0 && j.drafts === 0 && j.banks === 0 && j.loans === 0;
                return (
                  <tr key={j.id} className="border-b border-border/60 last:border-b-0">
                    <td className="px-4 py-2.5 font-mono">{j.code}</td>
                    <td className="px-4 py-2.5">{j.name}</td>
                    <td className="px-4 py-2.5">{journalKindLabels[j.kind]?.[locale] ?? j.kind}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {j.posted}
                      {j.drafts ? <span className="text-muted-foreground"> (+{j.drafts} {tr("brouillon", "draft")})</span> : null}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-right">
                      {canEdit ? (
                        <>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ journalId: j.id, code: j.code, name: j.name, kind: j.kind })}>
                            {tr("Modifier", "Edit")}
                          </Button>
                          {free ? (
                            <Button type="button" size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => run(() => deleteJournalAction(entityCode, j.id), reset)}>
                              {tr("Supprimer", "Delete")}
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit ? (
        <form
          className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveJournalAction(entityCode, draft), reset);
          }}
        >
          <h2 className="font-semibold">{editing ? tr(`Journal ${editing.code}`, `Journal ${editing.code}`) : tr("Nouveau journal", "New journal")}</h2>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{tr("Code (1 à 6 lettres ou chiffres)", "Code (1 to 6 letters or digits)")}</span>
            <Input className="font-mono uppercase" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="BQ2" required />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{tr("Intitulé", "Name")}</span>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={tr("Banque Attijari", "Attijari bank")} required />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{tr("Type", "Kind")}</span>
            <ModernSelect
              name="kind"
              value={draft.kind}
              disabled={Boolean(editing && editing.posted > 0)}
              onValueChange={(k) => setDraft({ ...draft, kind: k as JournalKind })}
              options={(Object.keys(journalKindLabels) as JournalKind[]).map((k) => ({ value: k, label: journalKindLabels[k][locale] }))}
            />
          </label>
          {editing && editing.posted > 0 ? (
            <p className="text-xs text-muted-foreground">{tr("Ce journal porte des écritures comptabilisées : code et intitulé restent modifiables, le type est figé.", "This journal carries posted entries: code and name stay editable, the kind is locked.")}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            {editing ? (
              <Button type="button" variant="ghost" onClick={reset}>
                {tr("Annuler", "Cancel")}
              </Button>
            ) : null}
            <Button type="submit" disabled={pending || !draft.code.trim() || !draft.name.trim()}>
              {editing ? tr("Enregistrer", "Save") : tr("Créer", "Create")}
            </Button>
          </div>
        </form>
      ) : null}
      <ActionNotice notice={notice} onDismiss={dismiss} />
    </div>
  );
}
