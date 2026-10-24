import { AccountingPage } from "@/components/erp/accounting/accounting-page";
import { Badge } from "@/components/ui/badge";
import { getAccountingContext } from "@/lib/erp/accounting/context";
import { integrity } from "@/lib/erp/accounting/reports";
import { withErpSession } from "@/lib/erp/db";

export default async function IntegrityPage({ searchParams }: { searchParams?: Promise<{ entity?: string; fy?: string }> }) {
  const params = (await searchParams) ?? {};
  const ctx = await getAccountingContext(params, ["accounting", "reports"]);
  const tr = (fr: string, en: string) => (ctx.locale === "fr" ? fr : en);
  const rows = ctx.entity && ctx.hasChart ? await withErpSession(ctx.auth.profile.id, (tx) => integrity(tx, ctx.entity!.id)) : [];
  const broken = rows.filter((r) => r.verified !== r.sealed);

  return (
    <AccountingPage ctx={ctx} tab="integrity" needsYear={false}>
      <p className="text-sm text-muted-foreground">
        {tr(
          "Chaque écriture comptabilisée est scellée (SHA-256) avec le sceau de la précédente du même journal. Une modification faite directement dans la base casse la chaîne et apparaît ici.",
          "Every posted entry is sealed (SHA-256) with the seal of the previous one in its journal. A change made directly in the database breaks the chain and shows here.",
        )}
      </p>
      {broken.length ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {tr(`Chaîne rompue dans ${broken.length} journal(aux) : prévenir l'administrateur.`, `Chain broken in ${broken.length} journal(s): tell the administrator.`)}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{tr("Journal", "Journal")}</th>
              <th className="px-4 py-3 text-right font-medium">{tr("Écritures scellées", "Sealed entries")}</th>
              <th className="px-4 py-3 text-right font-medium">{tr("Vérifiées", "Verified")}</th>
              <th className="px-4 py-3 font-medium">{tr("État", "State")}</th>
              <th className="px-4 py-3 font-medium">{tr("Dernier sceau", "Last seal")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.journalId} className="border-b border-border/60 last:border-b-0">
                <td className="px-4 py-2.5">
                  <span className="font-mono">{r.code}</span> · {r.name}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.sealed}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.verified}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={r.verified === r.sealed ? "default" : "secondary"} className={r.verified === r.sealed ? undefined : "text-danger"}>
                    {r.verified === r.sealed ? tr("Intacte", "Intact") : tr("Rompue", "Broken")}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{r.lastHash ? `${r.lastHash.slice(0, 20)}…` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AccountingPage>
  );
}
