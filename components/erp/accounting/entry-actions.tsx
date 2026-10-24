"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { deleteDraftAction, postDraftAction, reverseEntryAction } from "@/app/(app)/erp/accounting/actions";
import { ActionNotice, useAccountingAction } from "@/components/erp/accounting/action-notice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { accountingHref } from "@/lib/erp/accounting/model";
import type { Locale } from "@/lib/i18n/config";

export function DraftActions({ locale, entityCode, fiscalYear, entryId, canPost }: { locale: Locale; entityCode: string; fiscalYear: string | null; entryId: string; canPost: boolean }) {
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const router = useRouter();
  const { pending, notice, dismiss, run } = useAccountingAction();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canPost ? (
        <Button type="button" disabled={pending} onClick={() => run(() => postDraftAction(entityCode, entryId))}>
          {tr("Comptabiliser ce brouillon", "Post this draft")}
        </Button>
      ) : null}
      {confirming ? (
        <Button
          type="button"
          variant="secondary"
          className="border-danger/40 text-danger"
          disabled={pending}
          onClick={() => run(() => deleteDraftAction(entityCode, entryId), () => router.push(accountingHref("/erp/accounting", { entity: entityCode, fy: fiscalYear })))}
        >
          {tr("Confirmer la suppression", "Confirm deletion")}
        </Button>
      ) : (
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>
          {tr("Supprimer le brouillon", "Delete the draft")}
        </Button>
      )}
      <ActionNotice notice={notice} onDismiss={dismiss} />
    </div>
  );
}

export function ReverseButton({ locale, entityCode, entryId, today }: { locale: Locale; entityCode: string; entryId: string; today: string }) {
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const { pending, notice, dismiss, run } = useAccountingAction();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="secondary">
            {tr("Extourner", "Reverse")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Extourner l'écriture", "Reverse the entry")}</DialogTitle>
            <DialogDescription>
              {tr(
                "Une écriture inverse est comptabilisée à la date choisie et l'originale est marquée extournée. C'est la seule correction d'une écriture comptabilisée.",
                "A mirror entry is posted on the chosen date and the original is marked reversed. It is the only correction of a posted entry.",
              )}
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{tr("Date de l'extourne", "Reversal date")}</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{tr("Motif", "Reason")}</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("Erreur de saisie…", "Keying error…")} />
          </label>
          <DialogFooter>
            <Button type="button" disabled={pending || reason.trim().length < 3} onClick={() => run(() => reverseEntryAction(entityCode, entryId, date, reason), () => setOpen(false))}>
              {pending ? tr("Extourne…", "Reversing…") : tr("Extourner", "Reverse")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ActionNotice notice={notice} onDismiss={dismiss} />
    </>
  );
}
