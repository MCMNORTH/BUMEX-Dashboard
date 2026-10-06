import { Suspense } from "react";
import Link from "next/link";
import { UserRoundPlus } from "lucide-react";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getProjectQuickCounts, getProjects, getProjectsFilterData } from "@/lib/projects/service";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QuickFilters } from "@/components/shared/quick-filters";
import { ProjectCard } from "@/components/projects/project-card";
import { ProjectEmptyState } from "@/components/projects/project-empty-state";
import { ProjectFilters } from "@/components/projects/project-filters";
import { ProjectForm } from "@/components/projects/project-form";
import { ProjectToast } from "@/components/projects/project-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/formatters";
import type { ProjectFilters as ProjectFiltersType } from "@/types/project";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Keys owned by the quick filters: picking a quick filter replaces all of them,
// while search, client, and kind are kept.
const quickFilterKeys = ["status", "owner", "health", "deadline"] as const;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getCurrentLocale();
  return (
    <div className="space-y-4">
      <ProjectToast />
      <Suspense fallback={<ProjectsPageFallback />}>
        <ProjectsContent searchParams={searchParams} locale={locale} />
      </Suspense>
    </div>
  );
}

async function ProjectsContent({
  searchParams,
  locale,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  locale: "fr" | "en";
}) {
  const auth = await requireRouteAccess("projects");
  const isFr = locale === "fr";
  const params = (await searchParams) ?? {};

  const filters: ProjectFiltersType = {
    search: getString(params.search) ?? "",
    status: (getString(params.status) as ProjectFiltersType["status"]) ?? "",
    clientId: getString(params.client) ?? "",
    ownerId: getString(params.owner) ?? "",
    health: (getString(params.health) as ProjectFiltersType["health"]) ?? "",
    kind: (getString(params.kind) as ProjectFiltersType["kind"]) ?? "",
    deadline: (getString(params.deadline) as ProjectFiltersType["deadline"]) ?? "all",
  };
  // The quick-filter counts are computed within the same search/client/kind scope as the list.
  const baseFilters: ProjectFiltersType = {
    search: filters.search,
    clientId: filters.clientId,
    kind: filters.kind,
  };

  const [projects, scopeProjects, filterData] = await Promise.all([
    getProjects(filters),
    getProjects(baseFilters),
    getProjectsFilterData(),
  ]);

  const canCreate = auth.role === "admin" || isManagerLikeRole(auth.role);
  const openCreateForm = canCreate && getString(params.create) === "1";
  const counts = getProjectQuickCounts(scopeProjects, auth.profile.id);
  const hasActiveFilters = Boolean(
    filters.search || filters.status || filters.clientId || filters.ownerId || filters.health || filters.kind
      || (filters.deadline && filters.deadline !== "all"),
  );
  const quickFilterHref = (updates: Partial<Record<(typeof quickFilterKeys)[number], string>>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const normalized = getString(value);
      if (normalized && !["toast", "create", ...quickFilterKeys].includes(key)) {
        next.set(key, normalized);
      }
    }
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
    });
    return `/projects${next.size ? `?${next.toString()}` : ""}`;
  };
  const isQuickFilterActive = (expected: Partial<Record<(typeof quickFilterKeys)[number], string>>) =>
    quickFilterKeys.every((key) => {
      const current = getString(params[key]) ?? "";
      return (current === "all" ? "" : current) === (expected[key] ?? "");
    });

  return (
    <>
      <section className="surface-hero px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight">
              {isFr ? "Créez, équipez et pilotez chaque projet." : "Create, staff and steer every project."}
            </h1>
            <p className="mt-1.5 text-sm text-white/75">
              {isFr
                ? "Les priorités, responsables, équipes et échéances de chaque projet, du lancement à la livraison."
                : "Priorities, owners, teams, and deadlines for every project, from kickoff to delivery."}
            </p>
          </div>
          {canCreate ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href="/staffing">
                  <UserRoundPlus className="size-4" />
                  {isFr ? "Ouvrir le Staffing" : "Open Staffing"}
                </Link>
              </Button>
              <ProjectForm mode="create" filterData={filterData} openOnLoad={openCreateForm} />
            </div>
          ) : null}
        </div>
      </section>

      <QuickFilters
        label={isFr ? "Filtres rapides des projets" : "Project quick filters"}
        items={[
          { key: "all", label: isFr ? "Tous" : "All", count: counts.all, href: quickFilterHref({}), active: isQuickFilterActive({}) },
          { key: "active", label: isFr ? "Actifs" : "Active", count: counts.active, href: quickFilterHref({ status: "active" }), active: isQuickFilterActive({ status: "active" }) },
          ...(canCreate
            ? [{ key: "mine", label: isFr ? "Mes projets" : "Mine", count: counts.mine, href: quickFilterHref({ owner: auth.profile.id }), active: isQuickFilterActive({ owner: auth.profile.id }) }]
            : []),
          { key: "attention", label: isFr ? "À risque" : "At risk", count: counts.attention, href: quickFilterHref({ health: "attention" }), active: isQuickFilterActive({ health: "attention" }), tone: "danger" as const },
          { key: "overdue", label: isFr ? "En retard" : "Overdue", count: counts.overdue, href: quickFilterHref({ deadline: "overdue" }), active: isQuickFilterActive({ deadline: "overdue" }), tone: "danger" as const },
          { key: "week", label: isFr ? "Échéance cette semaine" : "Due this week", count: counts.dueThisWeek, href: quickFilterHref({ deadline: "this_week" }), active: isQuickFilterActive({ deadline: "this_week" }) },
          { key: "on-hold", label: isFr ? "En pause" : "On hold", count: counts.onHold, href: quickFilterHref({ status: "on_hold" }), active: isQuickFilterActive({ status: "on_hold" }) },
        ]}
      />

      <ProjectFilters filters={filters} filterData={filterData} />

      <section aria-labelledby="project-list-heading" className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h2 id="project-list-heading" className="text-lg font-semibold tracking-tight">
            {isFr ? "Liste des projets" : "Project list"}
          </h2>
          <span className="text-sm text-muted-foreground">
            {formatNumber(projects.length)} {isFr ? "résultats" : "results"}
          </span>
        </div>

        <div className="grid gap-3">
          {projects.length
            ? projects.map((project) => <ProjectCard key={project.id} project={project} />)
            : <ProjectEmptyState isFr={isFr} hasFilters={hasActiveFilters} />}
        </div>
      </section>
    </>
  );
}

function ProjectsPageFallback() {
  return (
    <div className="space-y-4" aria-label="Loading projects">
      <Skeleton className="h-24 w-full" />
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-15 w-full" />
      <div className="grid gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3 pt-4">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-4 w-96 max-w-full" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
