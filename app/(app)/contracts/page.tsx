import { CalendarClock, FileText, Landmark, WalletCards } from "lucide-react";

import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getContracts, getContractsDueForRenewal, getContractsFilterData } from "@/lib/contracts/service";
import { formatNumber } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page-header";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ContractCard } from "@/components/contracts/contract-card";
import { ContractFilters } from "@/components/contracts/contract-filters";
import { ContractForm } from "@/components/contracts/contract-form";
import { ContractTable } from "@/components/contracts/contract-table";
import { ContractToast } from "@/components/contracts/contract-toast";
import { RenewalAlertCard } from "@/components/contracts/renewal-alert-card";
import type { ContractFilters as ContractFiltersType } from "@/types/contract";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireRouteAccess("contracts");
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";
  const params = (await searchParams) ?? {};
  const filters: ContractFiltersType = {
    search: getString(params.search) ?? "",
    clientId: getString(params.client) ?? "",
    status: (getString(params.status) as ContractFiltersType["status"]) ?? "",
    date: (getString(params.date) as ContractFiltersType["date"]) ?? "all",
    value: (getString(params.value) as ContractFiltersType["value"]) ?? "all",
  };

  const [contracts, filterData, renewalContracts] = await Promise.all([
    getContracts(auth.role, filters),
    getContractsFilterData(),
    getContractsDueForRenewal(auth.role),
  ]);

  const canCreate = auth.role !== "shareholder";
  const totalValue = contracts.reduce((sum, contract) => sum + (contract.amount ?? 0), 0);
  const activeCount = contracts.filter((contract) => contract.status === "active").length;
  const renewingSoon = renewalContracts.length;
  const signedCount = contracts.filter((contract) => contract.status === "signed").length;
  const exportRows = contracts.map((contract) => ({
    title: contract.title,
    client: contract.client?.name ?? "",
    project: contract.project?.name ?? "",
    status: contract.status,
    contract_type: contract.contract_type,
    amount: contract.amount ?? "",
    currency: contract.currency,
    renewal_date: contract.renewal_date ?? "",
    end_date: contract.end_date ?? "",
  }));

  return (
    <div className="space-y-6">
      <ContractToast />
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          eyebrow={isFr ? "Module contrats" : "Contracts module"}
          title={
            auth.role === "shareholder"
              ? (isFr ? "Visibilité de haut niveau sur le portefeuille de contrats de l’activité." : "High-level contract portfolio visibility across the services business.")
              : auth.role === "employee"
                ? (isFr ? "Contrats liés à votre périmètre visible de clients et de projets." : "Contracts linked to your visible client and project scope.")
                : (isFr ? "Un espace contrat premium pour le pilotage commercial et la visibilité des renouvellements." : "A premium contract workspace for commercial control and renewal visibility.")
          }
          subtitle={
            auth.role === "shareholder"
              ? (isFr ? "Visibilité synthétique sur la valeur, les accords actifs et les renouvellements à venir." : "Summarized portfolio visibility for value, active agreements, and upcoming renewals.")
              : auth.role === "employee"
                ? (isFr ? "Visibilité en lecture seule sur les accords commerciaux autorisés liés à votre périmètre de delivery." : "Read-only visibility into allowed commercial agreements linked to your delivery scope.")
                : (isFr ? "Recherchez, filtrez, créez et gérez les accords commerciaux avec un suivi de renouvellement propre et un contexte client/projet lié." : "Search, filter, create, and manage commercial agreements with clean renewal tracking and linked client/project context.")
          }
        />
        {canCreate ? <ContractForm mode="create" filterData={filterData} /> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {[
          { icon: WalletCards, label: isFr ? "Valeur totale" : "Total value", value: new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(totalValue), detail: isFr ? "Valeur visible du portefeuille de contrats" : "Visible contract portfolio value" },
          { icon: FileText, label: isFr ? "Contrats actifs" : "Active contracts", value: formatNumber(activeCount), detail: isFr ? "Accords actuellement actifs" : "Currently active agreements" },
          { icon: Landmark, label: isFr ? "Signés" : "Signed", value: formatNumber(signedCount), detail: isFr ? "Contrats en attente d’activation ou d’exécution" : "Contracts awaiting activation or execution" },
          { icon: CalendarClock, label: isFr ? "Renouvellement proche" : "Renewing soon", value: formatNumber(renewingSoon), detail: isFr ? "Renouvellements dans les 30 jours" : "Renewals inside 30 days" },
        ].map(({ icon: Icon, label, value, detail }) => (
          <Card key={label} className="surface-highlight relative overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45">
                  <Icon className="size-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ContractFilters filters={filters} filterData={filterData} />

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-5 py-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Alertes de renouvellement" : "Renewal alerts"}</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">{isFr ? "Renouvellements à venir" : "Upcoming renewals"}</h3>
            </div>
            {renewalContracts.length ? (
              renewalContracts.map((contract) => (
                <RenewalAlertCard key={contract.id} contract={contract} />
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                {isFr ? "Aucun renouvellement de contrat n’est attendu dans l’horizon visible actuel." : "No contract renewals are due in the current visible horizon."}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{isFr ? "Portefeuille" : "Portfolio"}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{isFr ? "Liste des contrats" : "Contract list"}</h2>
            </div>
            <div className="flex items-center gap-2">
              <ExportCsvButton filename="contracts-export" rows={exportRows} />
              <Badge variant="secondary" className="rounded-full px-3 py-1">{formatNumber(contracts.length)} {isFr ? "résultats" : "results"}</Badge>
            </div>
          </div>
          {auth.role === "shareholder" ? <ContractTable contracts={contracts} /> : null}
          <div className="grid gap-4">
            {contracts.length ? (
              contracts.map((contract) => <ContractCard key={contract.id} contract={contract} />)
            ) : (
              <div className="rounded-[28px] border border-dashed border-border/70 bg-background/35 p-8 text-center text-sm text-muted-foreground">
                {isFr ? "Aucun contrat ne correspond aux filtres actuels." : "No contracts match the current filters."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
