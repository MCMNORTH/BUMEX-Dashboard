import { ArrowRight, Building2, FolderKanban, Handshake, ShieldAlert, UserRound } from "lucide-react";
import Link from "next/link";

import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getClients, getClientsFilterData } from "@/lib/clients/service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClientCard } from "@/components/clients/client-card";
import { ClientEmptyState } from "@/components/clients/client-empty-state";
import { ClientFilters } from "@/components/clients/client-filters";
import { ClientForm } from "@/components/clients/client-form";
import { ClientTable } from "@/components/clients/client-table";
import { ClientToast } from "@/components/clients/client-toast";
import { formatNumber } from "@/lib/formatters";
import type { ClientFilters as ClientFiltersType, ClientRecord } from "@/types/client";

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
  const activeView = getString(params.view) === "opportunities" ? "opportunities" : "relationships";
  const filters: ClientFiltersType = {
    search: getString(params.search) ?? "",
    status: (getString(params.status) as ClientFiltersType["status"]) ?? "",
    prospectStage: (getString(params.stage) as ClientFiltersType["prospectStage"]) ?? "",
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
  const contractedClients = clients.filter((client) => client.status === "active");
  const pipelineClients = clients.filter((client) => client.status === "prospect");
  const otherClients = clients.filter((client) => client.status !== "active" && client.status !== "prospect");
  const visibleClients = activeView === "opportunities"
    ? pipelineClients
    : clients.filter((client) => client.status !== "prospect");
  const isFiltered = Boolean(filters.search || filters.status || filters.prospectStage || filters.type || filters.accountManagerId);

  return (
    <div className="space-y-6">
      <ClientToast />
      <section className="relative overflow-hidden rounded-[32px] border border-orange-300/25 bg-[linear-gradient(122deg,#1d2857_0%,#155e75_48%,#c2410c_110%)] px-6 py-7 text-white shadow-[0_28px_80px_-45px_rgba(14,116,144,.72)] sm:px-8">
        <div className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-amber-300/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 size-52 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[.18em] text-amber-100 uppercase"><Handshake className="size-4" />{isFr ? "Portefeuille externe" : "External portfolio"}</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-.05em] sm:text-4xl">{isFr ? "Clients et partenaires, au même endroit." : "Clients and partners, in one place."}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/78">{isFr ? "Suivez vos relations externes, leurs demandes, leurs projets et les prochaines actions. Les produits créés par BUMEX se pilotent dans Projets, jamais ici." : "Track external relationships, their requests, projects, and next actions. BUMEX-built products are managed in Projects, never here."}</p>
          </div>
          {canCreate ? <ClientForm mode="create" filterData={filterData} /> : <Button variant="secondary" className="rounded-full px-5">{isFr ? "Vue en lecture seule" : "Read-only view"}</Button>}
        </div>
        <div className="relative mt-6 grid gap-2 sm:grid-cols-3">
          {[
            { title: isFr ? "1 · Ajouter une relation" : "1 · Add a relationship", detail: isFr ? "Client ou partenaire" : "Client or partner" },
            { title: isFr ? "2 · Lier les projets" : "2 · Link projects", detail: isFr ? "Demandes et livrables" : "Requests and delivery" },
            { title: isFr ? "3 · Suivre la prochaine action" : "3 · Track next action", detail: isFr ? "Ne rien laisser de côté" : "Leave nothing behind" },
          ].map(({ title, detail }, index) => <div key={title} className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/[.1] px-4 py-3 backdrop-blur"><div><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-[11px] text-white/65">{detail}</p></div>{index < 2 ? <ArrowRight className="size-4 text-amber-100" /> : <Handshake className="size-4 text-amber-100" />}</div>)}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-4">
        {[
          { icon: Building2, label: isFr ? "Relations actives" : "Active relationships", value: formatNumber(activeClients), detail: isFr ? "Clients et partenaires en cours" : "Clients and partners in progress", tone: "emerald" },
          { icon: ShieldAlert, label: isFr ? "À développer" : "To develop", value: formatNumber(prospects), detail: isFr ? "Relations à faire avancer" : "Relationships to progress", tone: "sky" },
          { icon: FolderKanban, label: isFr ? "Projets externes" : "External projects", value: formatNumber(totalActiveProjects), detail: isFr ? "Flux de delivery liés" : "Linked delivery streams", tone: "violet" },
          { icon: UserRound, label: isFr ? "À revoir" : "To review", value: formatNumber(suspended), detail: isFr ? "Relations en attente de décision" : "Relationships awaiting a decision", tone: "amber" },
        ].map(({ icon: Icon, label, value, detail, tone }) => (
          <Card key={label} className={`surface-highlight relative overflow-hidden border backdrop-blur-xl ${tone === "emerald" ? "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50" : tone === "sky" ? "border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50" : tone === "violet" ? "border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50" : "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50"}`}>
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
                </div>
                <div className={`flex size-11 items-center justify-center rounded-2xl border ${tone === "emerald" ? "border-emerald-200 bg-emerald-100 text-emerald-700" : tone === "sky" ? "border-sky-200 bg-sky-100 text-sky-700" : tone === "violet" ? "border-violet-200 bg-violet-100 text-violet-700" : "border-amber-200 bg-amber-100 text-amber-700"}`}>
                  <Icon className="size-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <nav aria-label={isFr ? "Vues des relations externes" : "External relationship views"} className="flex flex-wrap items-center gap-2">
        <Link
          href="/clients"
          className={`inline-flex h-12 items-center gap-2.5 rounded-full border px-5 text-sm font-semibold transition-all ${activeView === "relationships" ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/15 dark:border-white dark:bg-white dark:text-slate-950" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white hover:shadow-sm dark:border-white/15 dark:bg-white/[.04] dark:text-slate-200 dark:hover:bg-white/[.08]"}`}
        >
          <Handshake className="size-4" />
          <span>{isFr ? "Clients & partenaires" : "Clients & partners"}</span>
        </Link>
        <Link
          href="/clients?view=opportunities"
          className={`inline-flex h-12 items-center gap-2.5 rounded-full border px-5 text-sm font-semibold transition-all ${activeView === "opportunities" ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/15 dark:border-white dark:bg-white dark:text-slate-950" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white hover:shadow-sm dark:border-white/15 dark:bg-white/[.04] dark:text-slate-200 dark:hover:bg-white/[.08]"}`}
        >
          <Building2 className="size-4" />
          <span>{isFr ? "Opportunités commerciales" : "Sales opportunities"}</span>
        </Link>
      </nav>

      <ClientFilters filters={filters} filterData={filterData} activeView={activeView} />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{isFr ? "Portefeuille externe" : "External portfolio"}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">{activeView === "relationships" ? (isFr ? "Clients et partenaires" : "Clients and partners") : (isFr ? "Opportunités commerciales" : "Sales opportunities")}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {formatNumber(visibleClients.length)} {isFr ? "résultats" : "results"}
          </Badge>
        </div>
      </div>

      {auth.role === "shareholder" ? <ClientTable clients={visibleClients} /> : null}

      {visibleClients.length ? (
        isFiltered ? <div className="grid gap-4">{visibleClients.map((client) => <ClientCard key={client.id} client={client} />)}</div> : activeView === "relationships" ? (
          <div className="space-y-8">
            <ClientGroup title={isFr ? "Clients et partenaires actifs" : "Active clients and partners"} description={isFr ? "Relations externes passées au cycle de prestation avec un contrat ou un engagement actif." : "External relationships in the delivery cycle with an active contract or engagement."} clients={contractedClients} />
            {otherClients.length ? <ClientGroup title={isFr ? "Relations à revoir" : "Relationships to review"} description={isFr ? "Relations inactives, suspendues ou archivées." : "Inactive, suspended, or archived relationships."} clients={otherClients} /> : null}
          </div>
        ) : <ClientGroup title={isFr ? "Discussions en cours" : "Ongoing conversations"} description={isFr ? "Contacts et organisations à suivre jusqu’à la signature." : "Contacts and organizations to follow through signature."} clients={pipelineClients} />
      ) : <ClientEmptyState />}
    </div>
  );
}

function ClientGroup({ title, description, clients }: { title: string; description: string; clients: ClientRecord[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {clients.length ? <div className="grid gap-4">{clients.map((client) => <ClientCard key={client.id} client={client} />)}</div> : (
        <div className="rounded-[24px] border border-dashed border-border/70 bg-card/45 px-5 py-6 text-sm text-muted-foreground">Aucun élément dans cette section.</div>
      )}
    </section>
  );
}
