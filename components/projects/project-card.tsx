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
    <Link href={`/projects/${project.id}`} className="block rounded-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <Card className="group relative overflow-hidden border-0 bg-[linear-gradient(128deg,#102957_0%,#174880_48%,#4934a3_100%)] text-white shadow-[0_22px_45px_-24px_rgba(30,64,175,.78)] transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-[0_30px_55px_-24px_rgba(67,56,202,.78)] dark:bg-[linear-gradient(128deg,#07142d_0%,#102654_48%,#2e1d69_100%)] dark:shadow-[0_22px_45px_-25px_rgba(0,0,0,.7)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_92%_4%,rgba(125,211,252,.3),transparent_27%),radial-gradient(circle_at_4%_95%,rgba(167,139,250,.22),transparent_34%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute top-0 right-[16%] h-px w-1/2 bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
        <CardContent className="relative space-y-4 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={project.status} />
                <ProjectHealthBadge health={project.health} />
                <Badge variant={project.project_kind.startsWith("internal_") ? "secondary" : "outline"} className="rounded-full border-white/20 bg-white/10 px-2.5 py-1 text-[10px] text-white shadow-none">
                  {projectKindLabels[project.project_kind][isFr ? "fr" : "en"]}
                </Badge>
              </div>
              <div className="space-y-1">
                <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-white transition-colors group-hover:text-cyan-100">
                  {project.name}
                </h3>
                <div className="max-w-2xl rounded-2xl border border-white/14 bg-slate-950/20 px-3.5 py-2.5 backdrop-blur-sm">
                  <p className="text-[10px] font-semibold tracking-[0.15em] text-cyan-200 uppercase">{isFr ? "Objectif du projet" : "Project purpose"}</p>
                  <p className="mt-1 text-[12px] leading-5 text-white/85">
                    {project.description || (isFr ? "Aucune description renseignée pour ce projet." : "No description provided for this project.")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[15px] border border-white/20 bg-white/10 shadow-inner shadow-white/10 backdrop-blur-sm">
              <FolderGit2 className="size-[18px] text-cyan-200" />
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-[17px] border border-cyan-200/20 bg-cyan-300/10 p-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-cyan-100/75 uppercase">{project.project_kind.startsWith("internal_") ? (isFr ? "Périmètre" : "Scope") : (isFr ? "Entité" : "Entity")}</p>
              <p className="mt-1.5 text-[12px] font-medium text-white">{project.project_kind.startsWith("internal_") ? `${internalEntityName} · ${isFr ? "interne" : "internal"}` : (project.client?.name ?? (isFr ? "Non lié" : "Not linked"))}</p>
            </div>
            <div className="rounded-[17px] border border-amber-100/20 bg-amber-300/10 p-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-amber-100/80 uppercase">{isFr ? "Échéance" : "Deadline"}</p>
              <p className="mt-1.5 text-[12px] font-medium text-white">{formatDate(project.end_date)}</p>
              <p className="mt-0.5 text-[11px] text-white/70">{isFr ? ({
                "on-track": "Dans les temps",
                "due-soon": "Bientôt dû",
                overdue: "En retard",
                none: "Aucune échéance",
              } as const)[project.deadlineState] : deadlineLabels[project.deadlineState]}</p>
            </div>
            <div className="rounded-[17px] border border-violet-100/20 bg-violet-300/10 p-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-violet-100/80 uppercase">{isFr ? "Progression" : "Progress"}</p>
              <p className="mt-1.5 text-[12px] font-medium text-white">{project.progress}% {isFr ? "complété" : "complete"}</p>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-950/30 ring-1 ring-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 shadow-[0_0_14px_rgba(125,211,252,.65)]"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[12px] text-white/75">
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
              <div className="flex items-center gap-2 rounded-full border border-white/16 bg-white/10 px-2.5 py-1 backdrop-blur-sm">
                <Avatar className="size-6">
                  <AvatarFallback>{getInitials(project.owner?.full_name)}</AvatarFallback>
                </Avatar>
                <span className="text-[12px] text-white/90">
                  {project.owner?.full_name ?? (isFr ? "Non assigné" : "Unassigned")}
                </span>
              </div>
              <Badge variant="secondary" className="rounded-full border-0 bg-white px-3 py-1 text-[11px] text-slate-950 shadow-sm transition-colors group-hover:bg-cyan-100">
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
