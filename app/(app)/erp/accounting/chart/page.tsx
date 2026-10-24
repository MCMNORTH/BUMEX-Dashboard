import { AccountingPage } from "@/components/erp/accounting/accounting-page";
import { ChartManager } from "@/components/erp/accounting/chart-manager";
import { chartRows, type ChartView } from "@/lib/erp/accounting/chart";
import { getAccountingContext } from "@/lib/erp/accounting/context";
import { withErpSession } from "@/lib/erp/db";

const VIEWS: ChartView[] = ["moving", "unused", "auxiliary", "all"];

export default async function ChartPage({ searchParams }: { searchParams?: Promise<{ entity?: string; fy?: string; view?: string }> }) {
  const params = (await searchParams) ?? {};
  const ctx = await getAccountingContext(params);
  const view = VIEWS.find((v) => v === params.view) ?? "moving";
  const data =
    ctx.entity && ctx.hasChart
      ? await withErpSession(ctx.auth.profile.id, async (tx) => {
          const rows = await chartRows(tx, ctx.entity!.id, view);
          const [summary] = await tx.query<{ accounts: number; postable: number }>(
            "select count(*)::int as accounts, (count(*) filter (where is_postable and active))::int as postable from erp.account where entity_id = $1 and not is_auxiliary",
            [ctx.entity!.id],
          );
          return { rows, summary };
        })
      : { rows: [], summary: { accounts: 0, postable: 0 } };

  return (
    <AccountingPage ctx={ctx} tab="chart" needsYear={false}>
      {ctx.entity ? (
        <ChartManager
          locale={ctx.locale}
          entity={{ code: ctx.entity.code, name: ctx.entity.name, template: ctx.entity.chartTemplate, codeLength: ctx.entity.codeLength }}
          view={view}
          rows={data.rows}
          summary={data.summary}
          can={{ settings: ctx.can.settings, setUp: ctx.can.setUp }}
        />
      ) : null}
    </AccountingPage>
  );
}
