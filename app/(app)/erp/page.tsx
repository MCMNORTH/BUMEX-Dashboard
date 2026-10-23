import { Badge } from "@/components/ui/badge";
import { getBumexEntity } from "@/lib/entities/config";
import { erpModules, erpRoleLabels } from "@/lib/erp/config";
import { getErpEntities } from "@/lib/erp/entities";
import { requireErpAccess } from "@/lib/erp/server";
import { getCurrentLocale } from "@/lib/i18n/server";

// ERP access changes only from Settings → Users, which refreshes the layout.
export const unstable_dynamicStaleTime = 600;

export default async function ErpHomePage() {
  const { auth, access } = await requireErpAccess();
  const locale = await getCurrentLocale();
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const entities = await getErpEntities(auth.profile.id);
  const chartLabel = (template: string) =>
    template === "PCM" ? tr("Plan comptable mauritanien", "Mauritanian chart") : template === "CGNC" ? tr("Plan comptable marocain", "Moroccan chart") : "SYSCOHADA";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">BUMEX ERP</h1>
        <p className="text-sm text-muted-foreground">
          {tr(
            "Les modules arrivent étape par étape : la comptabilité d’abord, puis les ventes, les fournisseurs et la trésorerie.",
            "Modules arrive step by step: accounting first, then sales, suppliers and treasury.",
          )}
        </p>
      </div>

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">{tr("Votre rôle ERP", "Your ERP role")}</p>
          <p className="font-semibold">{erpRoleLabels[access.role][locale]}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{tr("Entités", "Entities")}</p>
          <p className="font-semibold">
            {access.entityCodes === null
              ? tr("Toutes les entités", "Every entity")
              : access.entityCodes.map((code) => getBumexEntity(code)?.name ?? code).join(", ")}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{tr("Modules", "Modules")}</p>
          <p className="font-semibold">
            {access.modules.length
              ? tr(`${access.modules.length} module(s)`, `${access.modules.length} module(s)`)
              : tr("Aucun module pour l’instant", "No module yet")}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{tr("Vos modules", "Your modules")}</h2>
        {access.modules.length ? (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {access.modules.map((key) => (
              <li key={key} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{erpModules[key].label[locale]}</span>
                  <Badge variant="secondary">{tr(`Étape ${erpModules[key].step}`, `Step ${erpModules[key].step}`)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{erpModules[key].description[locale]}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {tr("Votre rôle ne donne accès à aucun module ERP. Un administrateur peut en ajouter.", "Your role opens no ERP module. An administrator can add some.")}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{tr("Entités dans l’ERP", "Entities in the ERP")}</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{tr("Entité", "Entity")}</th>
                  <th className="px-4 py-3 font-medium">{tr("Pays", "Country")}</th>
                  <th className="px-4 py-3 font-medium">{tr("Devise", "Currency")}</th>
                  <th className="px-4 py-3 font-medium">{tr("Référentiel", "Chart standard")}</th>
                  <th className="px-4 py-3 font-medium">{tr("Mise en place", "Setup")}</th>
                </tr>
              </thead>
              <tbody>
                {entities.map((entity) => (
                  <tr key={entity.code} className="border-b border-border/60 last:border-b-0">
                    <td className="px-4 py-3 font-medium">{getBumexEntity(entity.code)?.name ?? entity.name}</td>
                    <td className="px-4 py-3">{entity.country}</td>
                    <td className="px-4 py-3">{entity.currency}</td>
                    <td className="px-4 py-3">{chartLabel(entity.chartTemplate)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {entity.accounts
                        ? tr(`${entity.accounts} comptes · ${entity.fiscalYears} exercice(s)`, `${entity.accounts} accounts · ${entity.fiscalYears} fiscal year(s)`)
                        : tr("Plan comptable à charger (étape 2)", "Chart to load (step 2)")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
