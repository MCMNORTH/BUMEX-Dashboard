import { AccountingPage } from "@/components/erp/accounting/accounting-page";
import { ClosingBoard } from "@/components/erp/accounting/closing-board";
import { listYears } from "@/lib/erp/accounting/closing";
import { getAccountingContext } from "@/lib/erp/accounting/context";
import { withErpSession } from "@/lib/erp/db";

export default async function ClosingPage({ searchParams }: { searchParams?: Promise<{ entity?: string; fy?: string }> }) {
  const params = (await searchParams) ?? {};
  const ctx = await getAccountingContext(params);
  const years = ctx.entity && ctx.hasChart ? await withErpSession(ctx.auth.profile.id, (tx) => listYears(tx, ctx.entity!.id)) : [];

  return (
    <AccountingPage ctx={ctx} tab="closing" needsYear={false}>
      {ctx.entity ? <ClosingBoard locale={ctx.locale} entityCode={ctx.entity.code} years={years} can={ctx.can} /> : null}
    </AccountingPage>
  );
}
