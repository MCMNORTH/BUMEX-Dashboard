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
      <Card className="group relative overflow-hidden transition-colors duration-200 hover:border-primary/40">
        <CardContent className="relative space-y-4 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={project.status} />
                <ProjectHealthBadge health={project.health} />
                <Badge variant={project.project_kind.startsWith("internal_") ? "secondary" : "outline"} className="rounded-full border-border bg-card px-2.5 py-1 text-xs text-foreground shadow-none">
                  {projectKindLabels[project.project_kind][isFr ? "fr" : "en"]}
                </Badge>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                  {project.name}
                </h3>
                <div className="max-w-2xl">
                  <p className="sr-only">{isFr ? "Objectif du projet" : "Project purpose"}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {project.description || (isFr ? "Aucune description renseignée pour ce projet." : "No description provided for this project.")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FolderGit2 className="size-[18px]" />
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">{project.project_kind.startsWith("internal_") ? (isFr ? "Périmètre" : "Scope") : (isFr ? "Entité" : "Entity")}</p>
              <p className="mt-1.5 text-xs font-medium text-foreground">{project.project_kind.startsWith("internal_") ? `${internalEntityName} · ${isFr ? "interne" : "internal"}` : (project.client?.name ?? (isFr ? "Non lié" : "Not linked"))}</p>
            </div>
            <div className={`rounded-lg border px-3 py-2.5 ${project.deadlineState === "overdue" && project.status !== "completed" ? "border-danger/25 bg-danger/10" : project.deadlineState === "due-soon" ? "border-warning/30 bg-warning/10" : "border-border bg-muted/40"}`}>
              <p className="text-xs font-medium text-muted-foreground">{isFr ? "Échéance" : "Deadline"}</p>
              <p className="mt-1.5 text-xs font-medium text-foreground">{formatDate(project.end_date)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{isFr ? ({
                "on-track": "Dans les temps",
                "due-soon": "Bientôt dû",
                overdue: "En retard",
                none: "Aucune échéance",
              } as const)[project.deadlineState] : deadlineLabels[project.deadlineState]}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">{isFr ? "Progression" : "Progress"}</p>
              <p className="mt-1.5 text-xs font-medium text-foreground">{project.progress}% {isFr ? "complété" : "complete"}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted-foreground/15">
                <div
                  className={`h-full rounded-full ${project.progress >= 100 ? "bg-success" : "bg-primary"}`}
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
              <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1">
                <Avatar className="size-6">
                  <AvatarFallback>{getInitials(project.owner?.full_name)}</AvatarFallback>
                </Avatar>
                <span className="text-xs text-foreground">
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
