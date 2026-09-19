"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, FolderGit2, UsersRound } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { formatNumber } from "@/lib/formatters";
import { formatDate } from "@/lib/projects/helpers";
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
  return (
    <Link href={`/projects/${project.id}`} className="block">
      <Card className="group relative overflow-hidden border-blue-200/80 bg-gradient-to-br from-white via-blue-50/65 to-violet-50/70 shadow-[0_18px_38px_-28px_rgba(37,99,235,.6)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_24px_45px_-25px_rgba(79,70,229,.55)] dark:border-white/10 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/45 dark:shadow-none">
        <CardContent className="relative space-y-3 px-4 py-3.5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={project.status} />
                <ProjectHealthBadge health={project.health} />
                <Badge variant={project.project_kind.startsWith("internal_") ? "secondary" : "outline"} className="rounded-full px-2.5 py-1 text-[10px]">
                  {projectKindLabels[project.project_kind][isFr ? "fr" : "en"]}
                </Badge>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold tracking-[-0.015em] transition-colors group-hover:text-primary dark:group-hover:text-white">
                  {project.name}
                </h3>
                <div className="max-w-2xl rounded-xl border border-blue-100/80 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/[.04]">
                  <p className="text-[10px] font-semibold tracking-[0.14em] text-blue-700 uppercase dark:text-blue-300">{isFr ? "Objectif du projet" : "Project purpose"}</p>
                  <p className="mt-1 text-[12px] leading-5 text-slate-600 dark:text-slate-300">
                    {project.description || (isFr ? "Aucune description renseignée pour ce projet." : "No description provided for this project.")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[14px] border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.05]">
              <FolderGit2 className="size-4 text-primary" />
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-[16px] border border-cyan-200 bg-cyan-50/80 p-2.5 dark:border-cyan-500/20 dark:bg-cyan-500/[0.08]">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">{project.project_kind.startsWith("internal_") ? (isFr ? "Périmètre" : "Scope") : (isFr ? "Entité" : "Entity")}</p>
              <p className="mt-1.5 text-[12px] font-medium">{project.project_kind.startsWith("internal_") ? "BUMEX IT · interne" : (project.client?.name ?? (isFr ? "Non lié" : "Not linked"))}</p>
            </div>
            <div className="rounded-[16px] border border-amber-200 bg-amber-50/80 p-2.5 dark:border-amber-500/20 dark:bg-amber-500/[0.08]">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">{isFr ? "Échéance" : "Deadline"}</p>
              <p className="mt-1.5 text-[12px] font-medium">{formatDate(project.end_date)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{isFr ? ({
                "on-track": "Dans les temps",
                "due-soon": "Bientôt dû",
                overdue: "En retard",
                none: "Aucune échéance",
              } as const)[project.deadlineState] : deadlineLabels[project.deadlineState]}</p>
            </div>
            <div className="rounded-[16px] border border-violet-200 bg-violet-50/80 p-2.5 dark:border-violet-500/20 dark:bg-violet-500/[0.08]">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">{isFr ? "Progression" : "Progress"}</p>
              <p className="mt-1.5 text-[12px] font-medium">{project.progress}% {isFr ? "complété" : "complete"}</p>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-secondary/70">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
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
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.05]">
                <Avatar className="size-6">
                  <AvatarFallback>{getInitials(project.owner?.full_name)}</AvatarFallback>
                </Avatar>
                <span className="text-[12px] text-foreground/90">
                  {project.owner?.full_name ?? (isFr ? "Non assigné" : "Unassigned")}
                </span>
              </div>
              <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-[11px]">
                {isFr ? "Voir le détail" : "View detail"}
                <ArrowRight className="ml-1 size-3" />
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
