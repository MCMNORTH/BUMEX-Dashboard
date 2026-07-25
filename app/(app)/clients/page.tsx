import { Building2, FolderKanban, ShieldAlert, UserRound } from "lucide-react";

import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getClients, getClientsFilterData } from "@/lib/clients/service";
import { PageHeader } from "@/components/layout/page-header";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClientCard } from "@/components/clients/client-card";
import { ClientEmptyState } from "@/components/clients/client-empty-state";
import { ClientFilters } from "@/components/clients/client-filters";
import { ClientForm } from "@/components/clients/client-form";
import { ClientTable } from "@/components/clients/client-table";
import { ClientToast } from "@/components/clients/client-toast";
import { formatNumber } from "@/lib/formatters";
import type { ClientFilters as ClientFiltersType } from "@/types/client";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireRouteAccess("clients");
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";
  const params = (await searchParams) ?? {};
  const filters: ClientFiltersType = {
    search: getString(params.search) ?? "",
    status: (getString(params.status) as ClientFiltersType["status"]) ?? "",
    type: (getString(params.type) as ClientFiltersType["type"]) ?? "",
    accountManagerId: getString(params.manager) ?? "",
  };

  const [clients, filterData] = await Promise.all([
    getClients(auth.role, filters),
    getClientsFilterData(),
  ]);

  const canCreate = auth.role !== "shareholder";
  const activeClients = clients.filter((client) => client.status === "active").length;
  const prospects = clients.filter((client) => client.status === "prospect").length;
  const suspended = clients.filter((client) => client.status === "suspended").length;
  const totalActiveProjects = clients.reduce((sum, client) => sum + client.activeProjectsCount, 0);
  const exportRows = clients.map((client) => ({
    name: client.name,
    status: client.status,
    type: client.type,
    industry: client.industry ?? "",
    account_manager: client.accountManager?.full_name ?? "",
    active_projects: client.activeProjectsCount,
    last_activity: client.lastActivityAt ?? "",
  }));

  return (
    <div className="space-y-6">
      <ClientToast />
      <div className="flex flex-col gap-4">
        <PageHeader
          eyebrow={isFr ? "Module clients" : "Clients module"}
          title={
            auth.role === "shareholder"
              ? (isFr ? "Visibilité de haut niveau sur le portefeuille clients de l’activité IT." : "High-level client portfolio visibility across the IT services business.")
              : auth.role === "employee"
                ? (isFr ? "Clients liés à votre périmètre de delivery." : "Clients linked to your delivery scope.")
                : (isFr ? "Un espace client premium pour le pilotage de la relation et des comptes." : "A premium client workspace for relationship and account management.")
          }
          subtitle={
            auth.role === "shareholder"
              ? (isFr ? "Visibilité en lecture seule sur le statut des clients, les comptes stratégiques et l’exposition delivery active." : "Read-only portfolio visibility for client status, strategic accounts, and active delivery exposure.")
              : auth.role === "employee"
                ? (isFr ? "Consultez uniquement les fiches clients liées à vos projets assignés et à vos responsabilités de delivery." : "See only the client records connected to your assigned project work and delivery responsibilities.")
                : (isFr ? "Recherchez, filtrez, créez et gérez les comptes clients avec ownership, contexte opérationnel et visibilité projet liée." : "Search, filter, create, and manage client accounts with ownership, operational context, and linked project visibility.")
          }
        />
        {canCreate ? (
          <div className="flex justify-end">
            <ClientForm mode="create" filterData={filterData} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {[
          { icon: Building2, label: isFr ? "Clients actifs" : "Active clients", value: formatNumber(activeClients), detail: isFr ? "Comptes actuellement en service" : "Accounts currently in service" },
          { icon: ShieldAlert, label: isFr ? "Prospects" : "Prospects", value: formatNumber(prospects), detail: isFr ? "Fiches de pipeline en phase initiale" : "Early-stage pipeline records" },
          { icon: FolderKanban, label: isFr ? "Projets actifs" : "Active projects", value: formatNumber(totalActiveProjects), detail: isFr ? "Flux delivery liés aux clients" : "Delivery streams linked to clients" },
          { icon: UserRound, label: isFr ? "Suspendus" : "Suspended", value: formatNumber(suspended), detail: isFr ? "Comptes nécessitant une revue" : "Accounts requiring review" },
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

      <ClientFilters filters={filters} filterData={filterData} />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{isFr ? "Portefeuille clients" : "Client portfolio"}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">{isFr ? "Liste des clients" : "Client list"}</h2>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton filename="clients-export" rows={exportRows} />
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {formatNumber(clients.length)} {isFr ? "résultats" : "results"}
          </Badge>
        </div>
      </div>

      {auth.role === "shareholder" ? <ClientTable clients={clients} /> : null}

      <div className="grid gap-4">
        {clients.length ? clients.map((client) => <ClientCard key={client.id} client={client} />) : <ClientEmptyState />}
      </div>
    </div>
  );
}
