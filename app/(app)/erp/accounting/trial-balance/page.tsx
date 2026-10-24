import Link from "next/link";

import { AccountingPage } from "@/components/erp/accounting/accounting-page";
import { CsvButton } from "@/components/erp/accounting/csv-button";
import { Badge } from "@/components/ui/badge";
import { getAccountingContext } from "@/lib/erp/accounting/context";
import { accountingHref, formatAmount, r2 } from "@/lib/erp/accounting/model";
import { trialBalance } from "@/lib/erp/accounting/reports";
import { withErpSession } from "@/lib/erp/db";

export const unstable_dynamicStaleTime = 30;

export default async function TrialBalancePage({ searchParams }: { searchParams?: Promise<{ entity?: string; fy?: string; aux?: string }> }) {
  const params = (await searchParams) ?? {};
  const ctx = await getAccountingContext(params, ["accounting", "reports"]);
  const locale = ctx.locale;
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const auxiliaries = params.aux === "1";
  const rows = ctx.entity && ctx.hasChart && ctx.fiscalYear ? await withErpSession(ctx.auth.profile.id, (tx) => trialBalance(tx, ctx.entity!.id, ctx.fiscalYear!.id, auxiliaries)) : [];
  const debit = r2(rows.reduce((a, r) => a + r.debit, 0));
  const credit = r2(rows.reduce((a, r) => a + r.credit, 0));
  const base = { entity: ctx.entity?.code, fy: ctx.fiscalYear?.label };

  return (
    <AccountingPage ctx={ctx} tab="trial-balance">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{tr(`Balance · exercice ${ctx.fiscalYear?.label}`, `Trial balance · fiscal year ${ctx.fiscalYear?.label}`)}</h2>
        <Badge variant={debit === credit ? "default" : "secondary"}>{debit === credit ? tr("équilibrée", "balanced") : tr("déséquilibrée", "unbalanced")}</Badge>
        <Link className="text-sm font-medium text-primary hover:underline" href={accountingHref("/erp/accounting/trial-balance", { ...base, aux: auxiliaries ? null : "1" })}>
          {auxiliaries ? tr("Replier les comptes auxiliaires", "Fold the auxiliary accounts") : tr("Détailler les comptes auxiliaires (balance tiers)", "Detail the auxiliary accounts (third parties)")}
        </Link>
        <div className="ml-auto">
          <CsvButton
            label={tr("Exporter (CSV pour Excel)", "Export (CSV for Excel)")}
            fileName={`balance-${ctx.entity?.code}-${ctx.fiscalYear?.label}.csv`}
            rows={[[tr("Compte", "Account"), tr("Intitulé", "Name"), tr("Débit", "Debit"), tr("Crédit", "Credit"), tr("Solde", "Balance")], ...rows.map((r) => [r.code, r.name, r.debit, r.credit, r.balance])]}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{tr("Compte", "Account")}</th>
                <th className="px-4 py-3 font-medium">{tr("Intitulé", "Name")}</th>
                <th className="px-4 py-3 text-right font-medium">{tr("Débit", "Debit")}</th>
                <th className="px-4 py-3 text-right font-medium">{tr("Crédit", "Credit")}</th>
                <th className="px-4 py-3 text-right font-medium">{tr("Solde", "Balance")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.accountId} className="border-b border-border/60 last:border-b-0">
                    <td className="px-4 py-2.5 font-mono">
                      <Link className="hover:underline" href={accountingHref("/erp/accounting/ledger", { ...base, account: r.code })}>
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{r.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatAmount(r.debit, locale)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatAmount(r.credit, locale)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatAmount(r.balance, locale)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {tr("Aucune écriture comptabilisée sur cet exercice.", "No posted entry this fiscal year.")}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t border-border bg-muted/30 font-medium">
              <tr>
                <td colSpan={2} className="px-4 py-2.5">{tr("Total", "Total")}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatAmount(debit, locale)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatAmount(credit, locale)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatAmount(r2(debit - credit), locale)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </AccountingPage>
  );
}
