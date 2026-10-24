import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AccountingPage } from "@/components/erp/accounting/accounting-page";
import { DraftActions, ReverseButton } from "@/components/erp/accounting/entry-actions";
import { EntryForm } from "@/components/erp/accounting/entry-form";
import { Badge } from "@/components/ui/badge";
import { getAccountingContext } from "@/lib/erp/accounting/context";
import { getEntry, listAccounts, listJournals } from "@/lib/erp/accounting/entries";
import { accountingHref, entryStatusLabels, formatAmount, formatDate } from "@/lib/erp/accounting/model";
import { withErpSession } from "@/lib/erp/db";
import { createClient } from "@/lib/firebase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function personName(uid: string | null) {
  if (!uid) return null;
  const db = await createClient();
  const { data } = db ? await db.from("profiles").select("full_name").eq("id", uid).maybeSingle<{ full_name: string }>() : { data: null };
  return data?.full_name ?? uid;
}

export default async function EntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ entity?: string; fy?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const query = (await searchParams) ?? {};
  const ctx = await getAccountingContext(query);
  if (!ctx.entity) notFound();

  const data = await withErpSession(ctx.auth.profile.id, async (tx) => {
    const entry = await getEntry(tx, id);
    if (!entry || entry.entityId !== ctx.entity!.id) return { entry, accounts: [], journals: [] };
    return entry.status === "draft" ? { entry, accounts: await listAccounts(tx, entry.entityId), journals: await listJournals(tx, entry.entityId) } : { entry, accounts: [], journals: [] };
  });
  if (!data.entry) notFound();
  if (data.entry.entityId !== ctx.entity.id) {
    // the link named another entity: show the entry under its own, if the person may see it
    const owner = ctx.entities.find((e) => e.id === data.entry!.entityId);
    if (!owner) notFound();
    redirect(accountingHref(`/erp/accounting/entries/${id}`, { entity: owner.code, fy: data.entry.fiscalYearLabel }));
  }

  const entry = data.entry;
  const locale = ctx.locale;
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const base = { entity: ctx.entity.code, fy: entry.fiscalYearLabel };
  const postedBy = await personName(entry.postedBy);
  const foreign = entry.currency !== ctx.entity.currency;

  return (
    <AccountingPage ctx={ctx} tab={null}>
      <div className="flex flex-wrap items-center gap-3">
        <Link className="text-sm text-muted-foreground hover:text-foreground" href={accountingHref("/erp/accounting", base)}>
          ← {tr("Écritures", "Entries")}
        </Link>
        <h2 className="text-lg font-semibold">
          {entry.journalCode} {entry.entryNo ? String(entry.entryNo).padStart(6, "0") : tr("brouillon", "draft")} · {entry.description}
        </h2>
        <Badge variant={entry.status === "posted" ? "default" : "secondary"}>{entryStatusLabels[entry.status][locale]}</Badge>
      </div>

      {entry.status === "draft" ? (
        <>
          <DraftActions locale={locale} entityCode={ctx.entity.code} fiscalYear={entry.fiscalYearLabel} entryId={entry.id} canPost={ctx.can.post} />
          <EntryForm
            locale={locale}
            entity={{ code: ctx.entity.code, currency: ctx.entity.currency, codeLength: ctx.entity.codeLength }}
            fiscalYear={entry.fiscalYearLabel}
            accounts={data.accounts}
            journals={data.journals}
            today={entry.date}
            canPost={ctx.can.post}
            existing={{
              entryId: entry.id,
              journalId: entry.journalId,
              date: entry.date,
              description: entry.description,
              currency: entry.currency,
              fxRate: entry.fxRate,
              lines: entry.lines.map((l) => ({ code: l.code, description: l.description, debit: l.debitTxn ? String(l.debitTxn) : "", credit: l.creditTxn ? String(l.creditTxn) : "" })),
            }}
          />
        </>
      ) : (
        <>
          <dl className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-[var(--shadow-soft)] sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{tr("Date", "Date")}</dt>
              <dd className="font-medium">{formatDate(entry.date, locale)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tr("Exercice · période", "Fiscal year · period")}</dt>
              <dd className="font-medium">
                {entry.fiscalYearLabel} · {entry.periodNo}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tr("Comptabilisée", "Posted")}</dt>
              <dd className="font-medium">
                {entry.postedAt} UTC · {postedBy}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{tr("Sceau (SHA-256)", "Seal (SHA-256)")}</dt>
              <dd className="font-mono text-xs break-all">{entry.hash ? `${entry.hash.slice(0, 24)}…` : "—"}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {entry.status === "posted" && ctx.can.post ? <ReverseButton locale={locale} entityCode={ctx.entity.code} entryId={entry.id} today={ctx.today} /> : null}
            {entry.reversedById ? (
              <Link className="font-medium text-primary hover:underline" href={accountingHref(`/erp/accounting/entries/${entry.reversedById}`, base)}>
                {tr("Voir l'écriture d'extourne", "See the reversal entry")}
              </Link>
            ) : null}
            {entry.reversalOfId ? (
              <Link className="font-medium text-primary hover:underline" href={accountingHref(`/erp/accounting/entries/${entry.reversalOfId}`, base)}>
                {tr("Voir l'écriture extournée", "See the reversed entry")}
              </Link>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">{tr("Compte", "Account")}</th>
                    <th className="px-4 py-3 font-medium">{tr("Libellé", "Description")}</th>
                    <th className="px-4 py-3 text-right font-medium">{tr("Débit", "Debit")}</th>
                    <th className="px-4 py-3 text-right font-medium">{tr("Crédit", "Credit")}</th>
                    {foreign ? <th className="px-4 py-3 text-right font-medium">{tr("Devise", "Currency")}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((l) => (
                    <tr key={l.lineNo} className="border-b border-border/60 last:border-b-0">
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{l.lineNo}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono">{l.code}</span> <span className="text-muted-foreground">{l.name}</span>
                      </td>
                      <td className="px-4 py-2.5">{l.description}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{l.debit ? formatAmount(l.debit, locale) : ""}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{l.credit ? formatAmount(l.credit, locale) : ""}</td>
                      {foreign ? (
                        <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                          {formatAmount(l.debitTxn || l.creditTxn, locale)} {l.currency} @ {l.fxRate}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AccountingPage>
  );
}
