"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, FolderGit2, UsersRound } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { formatNumber } from "@/lib/formatters";
import { formatDate } from "@/lib/projects/helpers";
import { getBumexEntity } from "@/lib/entities/config";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectHealthBadge } from "@/components/projects/project-health-badge";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import type { ProjectRecord } from "@/types/project";

const projectKindLabels = {
  client_mission: { fr: "Mission client", en: "Client mission" },
  institutional_partnership: { fr: "Partenariat institutionnel", en: "Institutional partnership" },
  internal_product: { fr: "Produit interne BUMEX", en: "Internal BUMEX product" },
  internal_tool: { fr: "Outil interne BUMEX", en: "Internal BUMEX tool" },
} as const;

function getInitials(name: string | undefined) {
  if (!name) {
    return "NA";
  }

  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const deadlineLabels: Record<ProjectRecord["deadlineState"], string> = {
  "on-track": "On track",
  "due-soon": "Due soon",
  overdue: "Overdue",
  none: "No deadline",
};

export function ProjectCard({ project }: { project: ProjectRecord }) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const internalEntityName = getBumexEntity(project.entity_code)?.name ?? (isFr ? "Entité BUMEX" : "BUMEX entity");
  return (
    <Link href={`/projects/${project.id}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <Card className="bg-card group relative overflow-hidden border border-border shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] duration-300 hover:border-primary/40">
        <div aria-hidden="true" className="bg-primary pointer-events-none absolute top-0 left-0 h-1 w-full opacity-90" />
        <div aria-hidden="true" className="bg-muted/40 pointer-events-none absolute top-0 right-0 h-32 w-64" />
        <CardContent className="relative space-y-4 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={project.status} />
                <ProjectHealthBadge health={project.health} />
                <Badge variant={project.project_kind.startsWith("internal_") ? "secondary" : "outline"} className="rounded-full border-slate-200 bg-white/55 px-2.5 py-1 text-xs text-slate-700 shadow-none dark:border-slate-600 dark:bg-slate-900/30 dark:text-slate-200">
                  {projectKindLabels[project.project_kind][isFr ? "fr" : "en"]}
                </Badge>
              </div>
              <div className="space-y-1">
                <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-slate-950 transition-colors group-hover:text-primary dark:text-white">
                  {project.name}
                </h3>
                <div className="max-w-2xl rounded-xl border border-primary/90 bg-white/45 px-3.5 py-2.5 dark:border-slate-600/80 dark:bg-slate-950/20">
                  <p className="text-xs font-semibold tracking-wider text-primary uppercase">{isFr ? "Objectif du projet" : "Project purpose"}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    {project.description || (isFr ? "Aucune description renseignée pour ce projet." : "No description provided for this project.")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/80 bg-white/60 shadow-sm dark:border-slate-600 dark:bg-slate-950/30">
              <FolderGit2 className="size-[18px] text-primary" />
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-xl border border-primary/80 bg-primary/72 p-3 dark:border-primary/20 dark:bg-primary/10">
              <p className="text-xs font-semibold tracking-wider text-primary uppercase">{project.project_kind.startsWith("internal_") ? (isFr ? "Périmètre" : "Scope") : (isFr ? "Entité" : "Entity")}</p>
              <p className="mt-1.5 text-xs font-medium text-slate-800 dark:text-slate-100">{project.project_kind.startsWith("internal_") ? `${internalEntityName} · ${isFr ? "interne" : "internal"}` : (project.client?.name ?? (isFr ? "Non lié" : "Not linked"))}</p>
            </div>
            <div className="rounded-xl border border-warning/90 bg-warning/82 p-3 dark:border-warning/20 dark:bg-warning/10">
              <p className="text-xs font-semibold tracking-wider text-warning uppercase">{isFr ? "Échéance" : "Deadline"}</p>
              <p className="mt-1.5 text-xs font-medium text-slate-800 dark:text-slate-100">{formatDate(project.end_date)}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">{isFr ? ({
                "on-track": "Dans les temps",
                "due-soon": "Bientôt dû",
                overdue: "En retard",
                none: "Aucune échéance",
              } as const)[project.deadlineState] : deadlineLabels[project.deadlineState]}</p>
            </div>
            <div className="rounded-xl border border-primary/90 bg-primary/72 p-3 dark:border-primary/20 dark:bg-primary/10">
              <p className="text-xs font-semibold tracking-wider text-primary uppercase">{isFr ? "Progression" : "Progress"}</p>
              <p className="mt-1.5 text-xs font-medium text-slate-800 dark:text-slate-100">{project.progress}% {isFr ? "complété" : "complete"}</p>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-primary/70 ring-1 ring-primary/50 dark:bg-slate-950/40 dark:ring-white/10">
                <div
                  className="bg-primary h-full rounded-full shadow-[var(--shadow-soft)]"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-300">
              <span className="flex items-center gap-2">
                <UsersRound className="size-3.5" />
                {formatNumber(project.members.length)} {isFr ? "membres" : "members"}
              </span>
              <span className="flex items-center gap-2">
                <CalendarClock className="size-3.5" />
                {formatNumber(project.totalTasks)} {isFr ? "tickets actifs" : "active tickets"}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/55 px-2.5 py-1 dark:border-slate-600 dark:bg-slate-950/20">
                <Avatar className="size-6">
                  <AvatarFallback>{getInitials(project.owner?.full_name)}</AvatarFallback>
                </Avatar>
                <span className="text-xs text-slate-700 dark:text-slate-100">
                  {project.owner?.full_name ?? (isFr ? "Non assigné" : "Unassigned")}
                </span>
              </div>
              <span className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors group-hover:bg-primary/90">
                {isFr ? "Voir le détail" : "View detail"}
                <ArrowRight className="ml-1 size-3" />
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
