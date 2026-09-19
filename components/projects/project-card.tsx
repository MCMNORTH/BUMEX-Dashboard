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
    <Link href={`/projects/${project.id}`} className="block rounded-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <Card className="group relative overflow-hidden border border-[#d9e3f2] bg-[linear-gradient(118deg,#edf5ff_0%,#f5f5ff_56%,#f8f1ff_100%)] shadow-[0_14px_30px_-25px_rgba(31,68,132,.52)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-[#b9c9e3] hover:shadow-[0_22px_36px_-24px_rgba(56,72,169,.48)] dark:border-slate-700/90 dark:bg-[linear-gradient(118deg,#16213a_0%,#1d223b_56%,#29213d_100%)] dark:shadow-[0_18px_34px_-28px_rgba(0,0,0,.75)]">
        <div aria-hidden="true" className="pointer-events-none absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 opacity-90" />
        <div aria-hidden="true" className="pointer-events-none absolute top-0 right-0 h-32 w-64 bg-[radial-gradient(ellipse_at_top_right,rgba(190,219,255,.52),transparent_68%)] dark:bg-[radial-gradient(ellipse_at_top_right,rgba(129,140,248,.15),transparent_68%)]" />
        <CardContent className="relative space-y-4 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={project.status} />
                <ProjectHealthBadge health={project.health} />
                <Badge variant={project.project_kind.startsWith("internal_") ? "secondary" : "outline"} className="rounded-full border-slate-200 bg-white/55 px-2.5 py-1 text-[10px] text-slate-700 shadow-none dark:border-slate-600 dark:bg-slate-900/30 dark:text-slate-200">
                  {projectKindLabels[project.project_kind][isFr ? "fr" : "en"]}
                </Badge>
              </div>
              <div className="space-y-1">
                <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-slate-950 transition-colors group-hover:text-primary dark:text-white dark:group-hover:text-blue-200">
                  {project.name}
                </h3>
                <div className="max-w-2xl rounded-2xl border border-blue-100/90 bg-white/45 px-3.5 py-2.5 backdrop-blur-sm dark:border-slate-600/80 dark:bg-slate-950/20">
                  <p className="text-[10px] font-semibold tracking-[0.15em] text-blue-700 uppercase dark:text-blue-300">{isFr ? "Objectif du projet" : "Project purpose"}</p>
                  <p className="mt-1 text-[12px] leading-5 text-slate-600 dark:text-slate-300">
                    {project.description || (isFr ? "Aucune description renseignée pour ce projet." : "No description provided for this project.")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[15px] border border-blue-200/80 bg-white/60 shadow-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-950/30">
              <FolderGit2 className="size-[18px] text-primary" />
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-[17px] border border-sky-200/80 bg-sky-100/72 p-3 dark:border-sky-400/20 dark:bg-sky-400/10">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-sky-700 uppercase dark:text-sky-200">{project.project_kind.startsWith("internal_") ? (isFr ? "Périmètre" : "Scope") : (isFr ? "Entité" : "Entity")}</p>
              <p className="mt-1.5 text-[12px] font-medium text-slate-800 dark:text-slate-100">{project.project_kind.startsWith("internal_") ? `${internalEntityName} · ${isFr ? "interne" : "internal"}` : (project.client?.name ?? (isFr ? "Non lié" : "Not linked"))}</p>
            </div>
            <div className="rounded-[17px] border border-amber-200/90 bg-amber-50/82 p-3 dark:border-amber-400/20 dark:bg-amber-400/10">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-amber-700 uppercase dark:text-amber-200">{isFr ? "Échéance" : "Deadline"}</p>
              <p className="mt-1.5 text-[12px] font-medium text-slate-800 dark:text-slate-100">{formatDate(project.end_date)}</p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-300">{isFr ? ({
                "on-track": "Dans les temps",
                "due-soon": "Bientôt dû",
                overdue: "En retard",
                none: "Aucune échéance",
              } as const)[project.deadlineState] : deadlineLabels[project.deadlineState]}</p>
            </div>
            <div className="rounded-[17px] border border-violet-200/90 bg-violet-100/72 p-3 dark:border-violet-400/20 dark:bg-violet-400/10">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-violet-700 uppercase dark:text-violet-200">{isFr ? "Progression" : "Progress"}</p>
              <p className="mt-1.5 text-[12px] font-medium text-slate-800 dark:text-slate-100">{project.progress}% {isFr ? "complété" : "complete"}</p>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-violet-200/70 ring-1 ring-violet-300/50 dark:bg-slate-950/40 dark:ring-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 shadow-[0_0_10px_rgba(99,102,241,.32)]"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[12px] text-slate-500 dark:text-slate-300">
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
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/55 px-2.5 py-1 backdrop-blur-sm dark:border-slate-600 dark:bg-slate-950/20">
                <Avatar className="size-6">
                  <AvatarFallback>{getInitials(project.owner?.full_name)}</AvatarFallback>
                </Avatar>
                <span className="text-[12px] text-slate-700 dark:text-slate-100">
                  {project.owner?.full_name ?? (isFr ? "Non assigné" : "Unassigned")}
                </span>
              </div>
              <span className="inline-flex items-center rounded-full bg-[#173b78] px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-white uppercase shadow-sm transition-colors group-hover:bg-[#0f2f65] dark:bg-[#78a9ff] dark:text-[#081b3a] dark:group-hover:bg-[#a5c5ff]">
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
