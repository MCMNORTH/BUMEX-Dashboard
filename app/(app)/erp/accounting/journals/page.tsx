import { AccountingPage } from "@/components/erp/accounting/accounting-page";
import { JournalsManager } from "@/components/erp/accounting/journals-manager";
import { getAccountingContext } from "@/lib/erp/accounting/context";
import { listJournalUsage } from "@/lib/erp/accounting/journals";
import { withErpSession } from "@/lib/erp/db";

export default async function JournalsPage({ searchParams }: { searchParams?: Promise<{ entity?: string; fy?: string }> }) {
  const params = (await searchParams) ?? {};
  const ctx = await getAccountingContext(params);
  const journals = ctx.entity && ctx.hasChart ? await withErpSession(ctx.auth.profile.id, (tx) => listJournalUsage(tx, ctx.entity!.id)) : [];

  return (
    <AccountingPage ctx={ctx} tab="journals" needsYear={false}>
      {ctx.entity ? <JournalsManager locale={ctx.locale} entityCode={ctx.entity.code} journals={journals} canEdit={ctx.can.settings} /> : null}
    </AccountingPage>
  );
}
