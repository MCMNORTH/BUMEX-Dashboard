import Link from "next/link";

import { AccountingPage } from "@/components/erp/accounting/accounting-page";
import { QuerySelect } from "@/components/erp/accounting/query-select";
import { getAccountingContext } from "@/lib/erp/accounting/context";
import { listAccounts } from "@/lib/erp/accounting/entries";
import { accountingHref, formatAmount, formatDate, r2 } from "@/lib/erp/accounting/model";
import { generalLedger, trialBalance } from "@/lib/erp/accounting/reports";
import { withErpSession } from "@/lib/erp/db";

export const unstable_dynamicStaleTime = 30;

export default async function LedgerPage({ searchParams }: { searchParams?: Promise<{ entity?: string; fy?: string; account?: string }> }) {
  const params = (await searchParams) ?? {};
  const ctx = await getAccountingContext(params, ["accounting", "reports"]);
  const locale = ctx.locale;
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);

  const data =
    ctx.entity && ctx.hasChart && ctx.fiscalYear
      ? await withErpSession(ctx.auth.profile.id, async (tx) => {
          const accounts = await listAccounts(tx, ctx.entity!.id);
          // without a choice, the first account that moved this year
          const fallback = params.account ? null : (await trialBalance(tx, ctx.entity!.id, ctx.fiscalYear!.id, false))[0]?.accountId;
          const account = accounts.find((a) => a.code === params.account) ?? accounts.find((a) => a.id === fallback) ?? null;
          const rows = account ? await generalLedger(tx, ctx.entity!.id, account.id, ctx.fiscalYear!.id) : [];
          return { accounts, account, rows };
        })
      : { accounts: [], account: null, rows: [] };

  const base = { entity: ctx.entity?.code, fy: ctx.fiscalYear?.label };
  const debit = r2(data.rows.reduce((a, r) => a + r.debit, 0));
  const credit = r2(data.rows.reduce((a, r) => a + r.credit, 0));

  return (
    <AccountingPage ctx={ctx} tab="ledger">
      <div className="flex flex-wrap items-end gap-3">
        <QuerySelect
          label={tr("Compte", "Account")}
          name="account"
          value={data.account?.code ?? ""}
          className="w-96"
          searchable
          path="/erp/accounting/ledger"
          params={base}
          options={data.accounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}${a.isAuxiliary ? tr(" (auxiliaire)", " (auxiliary)") : ""}`, keywords: [a.code, a.name] }))}
        />
        {data.account ? (
          <p className="pb-2 text-sm text-muted-foreground">
            {tr(`Exercice ${ctx.fiscalYear?.label} · solde`, `Fiscal year ${ctx.fiscalYear?.label} · balance`)}{" "}
            <span className="font-mono font-semibold text-foreground">{formatAmount(r2(debit - credit), locale)}</span>
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{tr("Date", "Date")}</th>
                <th className="px-4 py-3 font-medium">{tr("Journal · n°", "Journal · no.")}</th>
                <th className="px-4 py-3 font-medium">{tr("Libellé", "Description")}</th>
                <th className="px-4 py-3 text-right font-medium">{tr("Débit", "Debit")}</th>
                <th className="px-4 py-3 text-right font-medium">{tr("Crédit", "Credit")}</th>
                <th className="px-4 py-3 text-right font-medium">{tr("Solde", "Balance")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length ? (
                data.rows.map((r, i) => (
                  <tr key={`${r.entryId}-${i}`} className="border-b border-border/60 last:border-b-0">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(r.date, locale)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <Link className="hover:underline" href={accountingHref(`/erp/accounting/entries/${r.entryId}`, base)}>
                        {r.journalCode} {r.entryNo ? String(r.entryNo).padStart(6, "0") : ""}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{r.description}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.debit ? formatAmount(r.debit, locale) : ""}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.credit ? formatAmount(r.credit, locale) : ""}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatAmount(r.running, locale)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {data.account ? tr("Aucun mouvement sur cet exercice.", "No movement this fiscal year.") : tr("Choisissez un compte.", "Choose an account.")}
                  </td>
                </tr>
              )}
            </tbody>
            {data.rows.length ? (
              <tfoot className="border-t border-border bg-muted/30 font-medium">
                <tr>
                  <td colSpan={3} className="px-4 py-2.5">{tr("Total", "Total")}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatAmount(debit, locale)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatAmount(credit, locale)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatAmount(r2(debit - credit), locale)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </AccountingPage>
  );
}
