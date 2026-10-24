import Link from "next/link";

import { AccountingPage } from "@/components/erp/accounting/accounting-page";
import { QuerySelect } from "@/components/erp/accounting/query-select";
import { Badge } from "@/components/ui/badge";
import { getAccountingContext } from "@/lib/erp/accounting/context";
import { listEntries, listJournals } from "@/lib/erp/accounting/entries";
import { accountingHref, entryStatusLabels, formatAmount, formatDate, type EntryStatus } from "@/lib/erp/accounting/model";
import { withErpSession } from "@/lib/erp/db";

export const unstable_dynamicStaleTime = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: EntryStatus[] = ["draft", "posted", "reversed"];

type Params = { entity?: string; fy?: string; journal?: string; status?: string };

export default async function AccountingEntriesPage({ searchParams }: { searchParams?: Promise<Params> }) {
  const params = (await searchParams) ?? {};
  const ctx = await getAccountingContext(params);
  const locale = ctx.locale;
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const journalFilter = params.journal && UUID.test(params.journal) ? params.journal : undefined;
  const statusFilter = STATUSES.find((s) => s === params.status);

  const data =
    ctx.entity && ctx.hasChart && ctx.fiscalYear
      ? await withErpSession(ctx.auth.profile.id, async (tx) => ({
          journals: await listJournals(tx, ctx.entity!.id),
          entries: await listEntries(tx, ctx.entity!.id, { fiscalYearId: ctx.fiscalYear!.id, journalId: journalFilter, status: statusFilter }),
        }))
      : { journals: [], entries: [] };
  const base = { entity: ctx.entity?.code, fy: ctx.fiscalYear?.label };
  const drafts = data.entries.filter((e) => e.status === "draft").length;

  return (
    <AccountingPage ctx={ctx} tab="entries">
      <div className="flex flex-wrap items-end gap-3">
        <QuerySelect
          label={tr("Journal", "Journal")}
          name="journal"
          value={journalFilter ?? ""}
          className="w-64"
          path="/erp/accounting"
          params={{ ...base, status: statusFilter }}
          options={[{ value: "", label: tr("Tous les journaux", "All journals") }, ...data.journals.map((j) => ({ value: j.id, label: `${j.code} · ${j.name}` }))]}
        />
        <QuerySelect
          label={tr("Statut", "Status")}
          name="status"
          value={statusFilter ?? ""}
          className="w-48"
          path="/erp/accounting"
          params={{ ...base, journal: journalFilter }}
          options={[{ value: "", label: tr("Tous les statuts", "All statuses") }, ...STATUSES.map((s) => ({ value: s, label: entryStatusLabels[s][locale] }))]}
        />
        <p className="pb-2 text-sm text-muted-foreground">
          {tr(`Exercice ${ctx.fiscalYear?.label} · ${data.entries.length} écriture(s) · ${drafts} brouillon(s)`, `Fiscal year ${ctx.fiscalYear?.label} · ${data.entries.length} entr(ies) · ${drafts} draft(s)`)}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{tr("Journal · n°", "Journal · no.")}</th>
                <th className="px-4 py-3 font-medium">{tr("Date", "Date")}</th>
                <th className="px-4 py-3 font-medium">{tr("Libellé", "Description")}</th>
                <th className="px-4 py-3 font-medium">{tr("Origine", "Source")}</th>
                <th className="px-4 py-3 text-right font-medium">{tr("Montant", "Amount")}</th>
                <th className="px-4 py-3 font-medium">{tr("Statut", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.length ? (
                data.entries.map((e) => (
                  <tr key={e.id} className="border-b border-border/60 last:border-b-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <Link className="hover:underline" href={accountingHref(`/erp/accounting/entries/${e.id}`, base)}>
                        {e.journalCode} {e.entryNo ? String(e.entryNo).padStart(6, "0") : "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(e.date, locale)}</td>
                    <td className="px-4 py-2.5">
                      <Link className="hover:underline" href={accountingHref(`/erp/accounting/entries/${e.id}`, base)}>
                        {e.description}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{e.sourceType === "manual" ? tr("saisie", "manual") : e.sourceType === "reversal" ? tr("extourne", "reversal") : e.sourceType}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatAmount(e.total, locale)}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={e.status === "posted" ? "default" : "secondary"}>{entryStatusLabels[e.status][locale]}</Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {tr("Aucune écriture. ", "No entry yet. ")}
                    <Link className="font-medium text-primary hover:underline" href={accountingHref("/erp/accounting/new", base)}>
                      {tr("Saisir une écriture", "Enter one")}
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AccountingPage>
  );
}
