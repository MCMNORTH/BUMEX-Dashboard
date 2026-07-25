import { Suspense } from "react";
import { ClipboardList, FolderKanban, ShieldCheck, TrendingUp } from "lucide-react";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getProjects, getProjectsFilterData } from "@/lib/projects/service";
import { PageHeader } from "@/components/layout/page-header";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";
  return (
    <div className="space-y-5">
      <ProjectToast />
      <PageHeader
        eyebrow={isFr ? "Module projets" : "Projects module"}
        title={isFr ? "Un espace premium de delivery pour piloter lâ€™exÃ©cution des projets." : "A premium delivery workspace for project execution."}
        subtitle={isFr ? "Recherchez, filtrez, crÃ©ez et gÃ©rez les programmes actifs avec une visibilitÃ© de niveau entreprise et des contrÃ´les opÃ©rationnels propres." : "Search, filter, create, and manage active programs with enterprise-grade visibility and clean operational controls."}
      />
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
    deadline: (getString(params.deadline) as ProjectFiltersType["deadline"]) ?? "all",
  };

  const [projects, filterData] = await Promise.all([
    getProjects(filters),
    getProjectsFilterData(),
  ]);

  const canCreate = auth.role === "admin" || isManagerLikeRole(auth.role);
  const activeProjects = projects.filter((project) => project.status === "active").length;
  const avgProgress = projects.length
    ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length)
    : 0;
  const atRisk = projects.filter((project) => project.health === "at_risk" || project.health === "delayed").length;
  const dueSoon = projects.filter((project) => project.deadlineState === "due-soon").length;
  const exportRows = projects.map((project) => ({
    name: project.name,
    status: project.status,
    health: project.health,
    progress: `${project.progress}%`,
    client: project.client?.name ?? "",
    owner: project.owner?.full_name ?? "",
    deadline: project.end_date ?? "",
  }));

  return (
    <>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[13px] text-muted-foreground">
            {auth.role === "shareholder"
              ? (isFr ? "VisibilitÃ© stratÃ©gique en lecture seule sur les programmes actifs, les tendances de santÃ© et les initiatives liÃ©es aux clients." : "Read-only strategic visibility for active programs, health trends, and client-linked initiatives.")
              : auth.role === "employee"
                ? (isFr ? "Projets liÃ©s Ã  vos tickets actuels, Ã  vos Ã©chÃ©ances et Ã  vos responsabilitÃ©s dâ€™exÃ©cution." : "Projects tied to your current tickets, deadlines, and execution responsibilities.")
                : (isFr ? "Vue opérationnelle en direct des projets actifs et de leur exécution." : "Live operational visibility across active projects and delivery execution.")}
          </p>
        </div>
        {canCreate ? <ProjectForm mode="create" filterData={filterData} /> : null}
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        {[
          {
            icon: FolderKanban,
            label: isFr ? "Projets actifs" : "Active projects",
            value: formatNumber(activeProjects),
            detail: isFr ? "Initiatives de delivery en cours" : "Live delivery initiatives",
          },
          {
            icon: TrendingUp,
            label: isFr ? "Progression moyenne" : "Average progress",
            value: `${avgProgress}%`,
            detail: isFr ? "Signal de complÃ©tion du portefeuille" : "Portfolio completion signal",
          },
          {
            icon: ShieldCheck,
            label: isFr ? "Ã€ risque" : "At risk",
            value: formatNumber(atRisk),
            detail: isFr ? "Programmes nÃ©cessitant de lâ€™attention" : "Programs needing attention",
          },
          {
            icon: ClipboardList,
            label: isFr ? "Ã‰chÃ©ance proche" : "Due soon",
            value: formatNumber(dueSoon),
            detail: isFr ? "Ã‰chÃ©ances dans les 7 jours" : "Deadlines inside 7 days",
          },
        ].map(({ icon: Icon, label, value, detail }) => {
          const critical = label === "At risk" || label === "Ã€ risque";

          return (
          <Card
            key={label}
            className={`relative overflow-hidden border-slate-200 bg-white shadow-[var(--shadow-soft)] border-t-2 dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none ${
              critical ? "border-t-red-500" : "border-t-blue-500"
            }`}
          >
            <CardContent className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase dark:text-slate-300/80">{label}</p>
                  <p className="mt-1.5 text-[1.45rem] font-bold tracking-[-0.025em] dark:text-white">{value}</p>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">{detail}</p>
                </div>
                <div className={`flex size-8 items-center justify-center rounded-[14px] border ${critical ? "border-red-200 bg-red-50 dark:border-red-400/20 dark:bg-red-500/12" : "border-blue-200 bg-blue-50 dark:border-sky-400/20 dark:bg-sky-500/12"}`}>
                  <Icon className={`size-4 ${critical ? "text-red-600" : "text-primary"}`} />
                </div>
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>

      <ProjectFilters filters={filters} filterData={filterData} />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Portefeuille" : "Portfolio"}</p>
          <h2 className="mt-1.5 text-lg font-semibold tracking-tight">{isFr ? "Liste des projets" : "Project list"}</h2>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton filename="projects-export" rows={exportRows} />
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {formatNumber(projects.length)} {isFr ? "rÃ©sultats" : "results"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4">
        {projects.length ? projects.map((project) => <ProjectCard key={project.id} project={project} />) : <ProjectEmptyState />}
      </div>
    </>
  );
}

function ProjectsPageFallback() {
  return (
    <div className="space-y-6" aria-label="Loading projects">
      <div className="flex justify-end">
        <Skeleton className="h-12 w-40 rounded-full" />
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950/48">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-3">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-9 w-16" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="size-11 rounded-2xl" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-slate-200 bg-white shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
        <CardContent className="flex flex-wrap gap-3 px-5 py-5">
          <Skeleton className="h-12 min-w-64 flex-1 rounded-full" />
          <Skeleton className="h-12 w-44 rounded-full" />
          <Skeleton className="h-12 w-44 rounded-full" />
          <Skeleton className="h-12 w-44 rounded-full" />
          <Skeleton className="h-12 w-32 rounded-full" />
        </CardContent>
      </Card>
      <div className="grid gap-4">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="border-slate-200 bg-white shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
            <CardContent className="space-y-5 px-5 py-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <Skeleton className="h-7 w-52" />
                  <Skeleton className="h-4 w-96 max-w-full" />
                </div>
                <Skeleton className="size-12 rounded-2xl" />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Skeleton className="h-28 rounded-[22px]" />
                <Skeleton className="h-28 rounded-[22px]" />
                <Skeleton className="h-28 rounded-[22px]" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}


