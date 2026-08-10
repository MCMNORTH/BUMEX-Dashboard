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
      <Card className="group relative overflow-hidden border-slate-200 bg-white shadow-[var(--shadow-soft)] transition-[border-color,box-shadow] duration-200 hover:border-primary/25 dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
        <CardContent className="relative space-y-3 px-4 py-3.5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={project.status} />
                <ProjectHealthBadge health={project.health} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold tracking-[-0.015em] transition-colors group-hover:text-primary dark:group-hover:text-white">
                  {project.name}
                </h3>
                <p className="max-w-xl text-[12px] leading-5 text-muted-foreground">
                  {project.description || (isFr ? "Programme delivery structuré avec surfaces de reporting enterprise." : "Structured delivery program with enterprise reporting surfaces.")}
                </p>
              </div>
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[14px] border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.05]">
              <FolderGit2 className="size-4 text-primary" />
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-[16px] border border-slate-200 bg-slate-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">Client</p>
              <p className="mt-1.5 text-[12px] font-medium">{project.client?.name ?? (isFr ? "Non lié" : "Not linked")}</p>
            </div>
            <div className="rounded-[16px] border border-slate-200 bg-slate-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">{isFr ? "Échéance" : "Deadline"}</p>
              <p className="mt-1.5 text-[12px] font-medium">{formatDate(project.end_date)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{isFr ? ({
                "on-track": "Dans les temps",
                "due-soon": "Bientôt dû",
                overdue: "En retard",
                none: "Aucune échéance",
              } as const)[project.deadlineState] : deadlineLabels[project.deadlineState]}</p>
            </div>
            <div className="rounded-[16px] border border-slate-200 bg-slate-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
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
