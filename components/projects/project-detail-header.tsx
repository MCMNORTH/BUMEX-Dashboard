"use client";

import { Trash2 } from "lucide-react";

import { deleteProjectAction } from "@/app/(app)/projects/actions";
import { formatCurrency, formatDate, normalizePriority } from "@/lib/projects/helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/components/projects/project-form";
import { ProjectHealthBadge } from "@/components/projects/project-health-badge";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { ConfirmActionForm } from "@/components/shared/confirm-action-form";
import { useI18n } from "@/components/layout/i18n-provider";
import type { ProjectFiltersData, ProjectRecord } from "@/types/project";
import type { AppRole } from "@/types/auth";

type ProjectDetailHeaderProps = {
  project: ProjectRecord;
  role: AppRole;
  canManage: boolean;
  filterData: ProjectFiltersData;
};

export function ProjectDetailHeader({
  project,
  role,
  canManage,
  filterData,
}: ProjectDetailHeaderProps) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  return (
    <div className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ProjectStatusBadge status={project.status} />
          <ProjectHealthBadge health={project.health} />
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {normalizePriority(project.priority)}
          </Badge>
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">{project.name}</h1>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            {project.description || (isFr ? "Aucune synthèse exécutive n’a encore été ajoutée à ce projet." : "No executive summary has been added to this project yet.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {canManage ? (
            <ProjectForm
              mode="edit"
              filterData={filterData}
              defaults={{
                project_id: project.id,
                name: project.name,
                client_id: project.client_id,
                description: project.description ?? "",
                owner_id: project.owner_id,
                status: project.status,
                start_date: project.start_date ?? "",
                end_date: project.end_date ?? "",
                budget_amount: project.budget_amount?.toString() ?? "",
                priority: project.priority ?? "medium",
              }}
            />
          ) : null}
          {canManage ? (
            <ConfirmActionForm
              action={deleteProjectAction}
              fields={{ project_id: project.id }}
              title="Delete project?"
              description={`This will permanently delete "${project.name}". This action cannot be undone.`}
              confirmLabel="Delete project"
              trigger={(
                <Button type="button" variant="ghost" className="rounded-full px-5 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100">
                <Trash2 className="size-4" />
                {isFr ? "Supprimer" : "Delete"}
                </Button>
              )}
            />
          ) : null}
          {role === "shareholder" ? (
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {isFr ? "Vue stratégique en lecture seule" : "Read-only strategic view"}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Client</p>
          <p className="mt-2 text-sm font-medium">{project.client?.name ?? "Not linked"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{project.client?.contact_email ?? "No contact email"}</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Responsable" : "Owner"}</p>
          <p className="mt-2 text-sm font-medium">{project.owner?.full_name ?? (isFr ? "Non assigné" : "Unassigned")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{project.owner?.email ?? (isFr ? "Aucun e-mail" : "No email")}</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Calendrier" : "Timeline"}</p>
          <p className="mt-2 text-sm font-medium">{formatDate(project.start_date)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{isFr ? "au" : "to"} {formatDate(project.end_date)}</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Budget</p>
          <p className="mt-2 text-sm font-medium">{formatCurrency(project.budget_amount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{isFr ? "La synthèse financière sera disponible ici." : "Financial summary placeholder ready"}</p>
        </div>
      </div>
    </div>
  );
}
