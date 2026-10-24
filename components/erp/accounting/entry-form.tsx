"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { saveEntryAction } from "@/app/(app)/erp/accounting/actions";
import { ActionNotice, useAccountingAction } from "@/components/erp/accounting/action-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import {
  CURRENCIES,
  accountingHref,
  dimensionLabels,
  findAccount,
  formatAmount,
  parseAmount,
  r2,
  type AccountOption,
  type JournalOption,
} from "@/lib/erp/accounting/model";
import type { Locale } from "@/lib/i18n/config";

type LineDraft = { code: string; description: string; debit: string; credit: string };
const emptyLine = (): LineDraft => ({ code: "", description: "", debit: "", credit: "" });

export type EntryFormExisting = {
  entryId: string;
  journalId: string;
  date: string;
  description: string;
  currency: string;
  fxRate: number;
  lines: LineDraft[];
};

export function EntryForm({
  locale,
  entity,
  fiscalYear,
  accounts,
  journals,
  today,
  canPost,
  existing,
}: {
  locale: Locale;
  entity: { code: string; currency: string; codeLength: number };
  fiscalYear: string | null;
  accounts: AccountOption[];
  journals: JournalOption[];
  today: string;
  canPost: boolean;
  existing?: EntryFormExisting;
}) {
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const router = useRouter();
  const { pending, notice, dismiss, run } = useAccountingAction();
  const defaultJournal = journals.find((j) => j.kind === "misc") ?? journals[0];
  const [date, setDate] = useState(existing?.date ?? today);
  const [journalId, setJournalId] = useState(existing?.journalId ?? defaultJournal?.id ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [currency, setCurrency] = useState(existing?.currency ?? entity.currency);
  const [rate, setRate] = useState(String(existing?.fxRate ?? 1));
  const [lines, setLines] = useState<LineDraft[]>(existing?.lines.length ? existing.lines : [emptyLine(), emptyLine()]);
  const focused = useRef(0);

  const postable = useMemo(() => accounts.filter((a) => a.isPostable && a.active), [accounts]);
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const resolved = lines.map((l) => {
    const account = l.code.trim() ? findAccount(accounts, l.code, entity.codeLength) : undefined;
    return { ...l, account, debitValue: parseAmount(l.debit), creditValue: parseAmount(l.credit) };
  });
  const totalDebit = r2(resolved.reduce((a, l) => a + (l.debitValue ?? 0), 0));
  const totalCredit = r2(resolved.reduce((a, l) => a + (l.creditValue ?? 0), 0));
  const totals = { debit: totalDebit, credit: totalCredit, diff: r2(totalDebit - totalCredit) };

  // What the page can see before the server checks again (period, roles and the rest come back from it).
  const issues: string[] = [];
  resolved.forEach((l, i) => {
    const at = tr(`Ligne ${i + 1}`, `Line ${i + 1}`);
    if (l.code.trim() && !l.account) issues.push(`${at} : ${tr("compte inconnu", "unknown account")} « ${l.code.trim()} »`);
    if (l.account && (!l.account.isPostable || !l.account.active)) issues.push(`${at} : ${l.account.code} ${tr("n'est pas imputable", "is not postable")}`);
    if (l.account?.dimension === "customer" || l.account?.dimension === "supplier") issues.push(`${at} : ${l.account.code} ${tr(`exige un ${dimensionLabels[l.account.dimension].fr} (saisie depuis son module, étape 4)`, `needs a ${dimensionLabels[l.account.dimension].en} (entered from its module, step 4)`)}`);
    if (l.debitValue === null || l.creditValue === null) issues.push(`${at} : ${tr("montant illisible", "unreadable amount")}`);
    if ((l.debitValue ?? 0) > 0 && (l.creditValue ?? 0) > 0) issues.push(`${at} : ${tr("débit ou crédit, pas les deux", "debit or credit, not both")}`);
  });
  const amountLines = resolved.filter((l) => l.account && ((l.debitValue ?? 0) > 0 || (l.creditValue ?? 0) > 0));
  if (!amountLines.length) issues.push(tr("Aucune ligne avec un compte et un montant", "No line with an account and an amount"));
  if (totals.diff !== 0) issues.push(tr(`Déséquilibrée de ${formatAmount(totals.diff, locale)}`, `Unbalanced by ${formatAmount(totals.diff, locale)}`));
  const rateValue = currency === entity.currency ? 1 : Number(rate.replace(",", "."));
  if (!(rateValue > 0)) issues.push(tr("Taux de change invalide", "Invalid exchange rate"));

  const submit = (post: boolean) => {
    if (pending) return;
    run(
      () =>
        saveEntryAction(
          {
            entityCode: entity.code,
            entryId: existing?.entryId,
            journalId,
            date,
            description,
            currency,
            fxRate: rateValue,
            lines: resolved.filter((l) => l.account).map((l) => ({ accountId: l.account!.id, description: l.description, debit: l.debitValue ?? 0, credit: l.creditValue ?? 0 })),
          },
          post,
        ),
      (result) => {
        if (existing) {
          router.push(accountingHref(`/erp/accounting/entries/${existing.entryId}`, { entity: entity.code, fy: fiscalYear }));
          return;
        }
        if (!post && result.data && typeof result.data === "object" && "entryId" in result.data) {
          router.push(accountingHref(`/erp/accounting/entries/${String(result.data.entryId)}`, { entity: entity.code, fy: fiscalYear }));
          return;
        }
        setDescription("");
        setLines([emptyLine(), emptyLine()]);
      },
    );
  };

  const balanceLine = (i: number) => {
    const l = resolved[i];
    const rest = r2(totals.diff - (l.debitValue ?? 0) + (l.creditValue ?? 0));
    if (rest > 0) setLine(i, { credit: String(rest), debit: "" });
    else if (rest < 0) setLine(i, { debit: String(-rest), credit: "" });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key === "Enter") {
      event.preventDefault();
      if (canPost && !issues.length) submit(true);
    } else if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      submit(false);
    } else if (event.key === "F2") {
      event.preventDefault();
      balanceLine(focused.current);
    } else if (mod && event.key.toLowerCase() === "d") {
      event.preventDefault();
      setLines((ls) => [...ls.slice(0, focused.current + 1), { ...ls[focused.current] }, ...ls.slice(focused.current + 1)]);
    }
  };

  return (
    <form onSubmit={(e) => e.preventDefault()} onKeyDown={onKeyDown} className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="grid gap-3 md:grid-cols-[10rem_minmax(0,14rem)_minmax(0,1fr)_14rem]">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{tr("Date", "Date")}</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{tr("Journal", "Journal")}</span>
          <ModernSelect name="journal" value={journalId} onValueChange={setJournalId} options={journals.map((j) => ({ value: j.id, label: `${j.code} · ${j.name}` }))} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{tr("Libellé", "Description")}</span>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={tr("Pièce, référence…", "Document, reference…")} />
        </label>
        <div className="grid gap-1.5 text-sm">
          <span className="font-medium">{tr("Devise · taux", "Currency · rate")}</span>
          <div className="flex gap-2">
            <ModernSelect name="currency" className="w-24" value={currency} onValueChange={(c) => { setCurrency(c); if (c === entity.currency) setRate("1"); }} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <Input aria-label={tr("Taux de change", "Exchange rate")} className="text-right" value={currency === entity.currency ? "1" : rate} onChange={(e) => setRate(e.target.value)} disabled={currency === entity.currency} />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-2 py-2 text-left font-medium">#</th>
              <th className="w-44 px-2 py-2 text-left font-medium">{tr("Compte", "Account")}</th>
              <th className="px-2 py-2 text-left font-medium">{tr("Intitulé du compte", "Account name")}</th>
              <th className="px-2 py-2 text-left font-medium">{tr("Libellé de ligne", "Line description")}</th>
              <th className="w-36 px-2 py-2 text-right font-medium">{tr("Débit", "Debit")}</th>
              <th className="w-36 px-2 py-2 text-right font-medium">{tr("Crédit", "Credit")}</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {resolved.map((l, i) => (
              <tr key={i} className="border-t border-border/60" onFocus={() => (focused.current = i)}>
                <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <Input className="h-8 font-mono" list="erp-accounts" value={l.code} onChange={(e) => setLine(i, { code: e.target.value })} aria-label={tr(`Compte ligne ${i + 1}`, `Account line ${i + 1}`)} placeholder={tr("n° ou nom", "no. or name")} />
                </td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">
                  {l.account ? `${l.account.code} · ${l.account.name}` : l.code.trim() ? tr("compte inconnu", "unknown account") : ""}
                </td>
                <td className="px-2 py-1.5">
                  <Input className="h-8" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} aria-label={tr(`Libellé ligne ${i + 1}`, `Description line ${i + 1}`)} />
                </td>
                <td className="px-2 py-1.5">
                  <Input className="h-8 text-right font-mono" inputMode="decimal" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value })} aria-label={tr(`Débit ligne ${i + 1}`, `Debit line ${i + 1}`)} />
                </td>
                <td className="px-2 py-1.5">
                  <Input className="h-8 text-right font-mono" inputMode="decimal" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value })} aria-label={tr(`Crédit ligne ${i + 1}`, `Credit line ${i + 1}`)} />
                </td>
                <td className="px-2 py-1.5">
                  <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={tr("Supprimer la ligne", "Remove the line")} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, k) => k !== i) : ls))}>
                    <X className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-muted/30">
            <tr>
              <td colSpan={4} className="px-2 py-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                    <Plus className="size-3.5" />
                    {tr("Ligne", "Line")}
                  </Button>
                  <span className={totals.diff === 0 && totals.debit > 0 ? "text-success" : "text-warning"}>
                    {totals.diff === 0 && totals.debit > 0 ? tr("Équilibrée", "Balanced") : tr(`Écart ${formatAmount(totals.diff, locale)}`, `Difference ${formatAmount(totals.diff, locale)}`)}
                  </span>
                </div>
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">{formatAmount(totals.debit, locale)}</td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">{formatAmount(totals.credit, locale)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        <datalist id="erp-accounts">
          {postable.map((a) => (
            <option key={a.id} value={a.code}>{`${a.code} ${a.name}`}</option>
          ))}
        </datalist>
      </div>

      {issues.length && totals.debit + totals.credit > 0 ? (
        <ul className="space-y-1 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted-foreground">
          <kbd className="rounded border border-border px-1">F2</kbd> {tr("équilibrer la ligne", "balance the line")} ·{" "}
          <kbd className="rounded border border-border px-1">Ctrl+D</kbd> {tr("dupliquer", "duplicate")} ·{" "}
          <kbd className="rounded border border-border px-1">Ctrl+S</kbd> {tr("brouillon", "draft")} ·{" "}
          <kbd className="rounded border border-border px-1">Ctrl+Entrée</kbd> {tr("comptabiliser", "post")}
        </p>
        <div className="ml-auto flex gap-2">
          {existing ? (
            <Button type="button" variant="ghost" onClick={() => router.push(accountingHref(`/erp/accounting/entries/${existing.entryId}`, { entity: entity.code, fy: fiscalYear }))}>
              {tr("Annuler", "Cancel")}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" disabled={pending} onClick={() => submit(false)}>
            {tr("Garder en brouillon", "Keep as draft")}
          </Button>
          {canPost ? (
            <Button type="button" disabled={pending || issues.length > 0} onClick={() => submit(true)}>
              {pending ? tr("Enregistrement…", "Saving…") : tr("Comptabiliser", "Post")}
            </Button>
          ) : null}
        </div>
      </div>
      <ActionNotice notice={notice} onDismiss={dismiss} />
    </form>
  );
}
