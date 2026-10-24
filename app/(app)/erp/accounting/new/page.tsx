import { AccountingPage } from "@/components/erp/accounting/accounting-page";
import { EntryForm } from "@/components/erp/accounting/entry-form";
import { getAccountingContext } from "@/lib/erp/accounting/context";
import { listAccounts, listJournals } from "@/lib/erp/accounting/entries";
import { withErpSession } from "@/lib/erp/db";

export default async function NewEntryPage({ searchParams }: { searchParams?: Promise<{ entity?: string; fy?: string }> }) {
  const params = (await searchParams) ?? {};
  const ctx = await getAccountingContext(params);
  const data =
    ctx.entity && ctx.hasChart
      ? await withErpSession(ctx.auth.profile.id, async (tx) => ({ accounts: await listAccounts(tx, ctx.entity!.id), journals: await listJournals(tx, ctx.entity!.id) }))
      : { accounts: [], journals: [] };
  // a date in the chosen fiscal year: today if it falls in it, else the year's last day
  const date = ctx.fiscalYear && (ctx.today < ctx.fiscalYear.start || ctx.today > ctx.fiscalYear.end) ? ctx.fiscalYear.end : ctx.today;

  return (
    <AccountingPage ctx={ctx} tab="new">
      {ctx.entity ? (
        <EntryForm
          locale={ctx.locale}
          entity={{ code: ctx.entity.code, currency: ctx.entity.currency, codeLength: ctx.entity.codeLength }}
          fiscalYear={ctx.fiscalYear?.label ?? null}
          accounts={data.accounts}
          journals={data.journals}
          today={date}
          canPost={ctx.can.post}
        />
      ) : null}
    </AccountingPage>
  );
}
