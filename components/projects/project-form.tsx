"use client";

import { useActionState, useState } from "react";
import { Building2, Plus, SquarePen } from "lucide-react";

import {
  createProjectAction,
  updateProjectAction,
  type ProjectActionState,
} from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/layout/i18n-provider";
import type { ProjectFiltersData, ProjectFormValues, ProjectKind } from "@/types/project";

const initialState: ProjectActionState = {};

type ProjectFormProps = {
  mode: "create" | "edit";
  filterData: ProjectFiltersData;
  defaults?: Partial<ProjectFormValues> & { project_id?: string };
  triggerLabel?: string;
};

export function ProjectForm({
  mode,
  filterData,
  defaults,
  triggerLabel,
}: ProjectFormProps) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [projectKind, setProjectKind] = useState(defaults?.project_kind ?? "client_mission");
  const [clientId, setClientId] = useState(defaults?.client_id ?? "");
  const isInternalProject = projectKind === "internal_product" || projectKind === "internal_tool";
  const [state, formAction] = useActionState(
    mode === "create" ? createProjectAction : updateProjectAction,
    initialState,
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="rounded-full px-5">
            <Plus className="size-4" />
            {triggerLabel ?? (isFr ? "Créer un projet" : "Create project")}
          </Button>
        ) : (
          <Button variant="secondary" className="rounded-full px-5">
            <SquarePen className="size-4" />
            {triggerLabel ?? (isFr ? "Modifier le projet" : "Edit project")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? (isFr ? "Créer un projet" : "Create project") : (isFr ? "Modifier le projet" : "Edit project")}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? (isFr ? "Créez une nouvelle initiative avec les bons responsables, périmètre et échéances." : "Create a new delivery initiative with the right ownership, scope, and timing.")
              : (isFr ? "Mettez à jour la définition, les responsables et les informations du projet." : "Update the project definition, ownership, and delivery metadata.")}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {defaults?.project_id ? <input type="hidden" name="project_id" value={defaults.project_id} /> : null}

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-name`}>
              Project name
            </label>
            <Input id={`${mode}-name`} name="name" defaultValue={defaults?.name ?? ""} required />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-description`}>
              Description
            </label>
            <Textarea
              id={`${mode}-description`}
              name="description"
              defaultValue={defaults?.description ?? ""}
              placeholder="Executive summary, delivery scope, or operational context"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-kind`}>
              {isFr ? "Nature du projet" : "Project type"}
            </label>
            <ModernSelect
              id={`${mode}-kind`}
              name="project_kind"
              value={projectKind}
              onValueChange={(value) => setProjectKind(value as ProjectKind)}
              options={[
                { value: "client_mission", label: isFr ? "Mission client" : "Client mission" },
                { value: "institutional_partnership", label: isFr ? "Partenariat institutionnel" : "Institutional partnership" },
                { value: "internal_product", label: isFr ? "Produit interne BUMEX" : "Internal BUMEX product" },
                { value: "internal_tool", label: isFr ? "Outil interne BUMEX" : "Internal BUMEX tool" },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {isFr ? "Choisissez le périmètre avant le rattachement : externe ou interne à BUMEX IT." : "Choose the scope first: external relationship or internal BUMEX IT work."}
            </p>
          </div>

          {isInternalProject ? (
            <div className="rounded-[18px] border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-400/20 dark:bg-blue-500/10">
              <input type="hidden" name="client_id" value="" />
              <div className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <Building2 className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-blue-950 dark:text-blue-100">
                    {isFr ? `Projet interne ${filterData.activeEntity.name}` : `Internal ${filterData.activeEntity.name} project`}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-blue-800/80 dark:text-blue-200/80">
                    {isFr ? `Ce projet est rattaché à ${filterData.activeEntity.name}, sans client ni partenaire externe.` : `This project belongs to ${filterData.activeEntity.name}, with no external client or partner.`}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={`${mode}-client`}>
                {isFr ? "Client ou partenaire externe" : "External client or partner"}
              </label>
              <ModernSelect
                id={`${mode}-client`}
                name="client_id"
                value={clientId}
                onValueChange={setClientId}
                placeholder={isFr ? "Sélectionner une entité" : "Select entity"}
                options={[
                  { value: "", label: isFr ? "Sélectionner une entité" : "Select entity" },
                  ...filterData.clients.map((client) => ({
                    value: client.id,
                    label: client.name,
                  })),
                ]}
              />
              <p className="text-xs text-muted-foreground">
                {isFr ? "Obligatoire uniquement pour une mission ou un partenariat externe." : "Required only for an external mission or partnership."}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-owner`}>
              {isFr ? "Responsable du projet (pilotage)" : "Project owner (governance)"}
            </label>
            <ModernSelect
              id={`${mode}-owner`}
              name="owner_id"
              defaultValue={defaults?.owner_id ?? ""}
              placeholder="Select owner"
              options={[
                { value: "", label: "Select owner" },
                ...filterData.owners.map((owner) => ({
                  value: owner.id,
                  label: owner.full_name,
                })),
              ]}
            />
            <p className="text-xs text-muted-foreground">{isFr ? "L’équipe et les taux d’affectation se gèrent dans Staffing." : "Manage team members and allocation rates in Staffing."}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-status`}>
              {isFr ? "Situation du projet" : "Project status"}
            </label>
            <ModernSelect
              id={`${mode}-status`}
              name="status"
              defaultValue={defaults?.status ?? "draft"}
              options={[
                { value: "draft", label: isFr ? "À lancer" : "Draft" },
                { value: "active", label: isFr ? "En réalisation" : "Active" },
                { value: "on_hold", label: isFr ? "En pause" : "On hold" },
                { value: "completed", label: isFr ? "Déjà livré / maintenance" : "Already delivered / maintenance" },
                { value: "cancelled", label: isFr ? "Annulé" : "Cancelled" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-priority`}>
              Priority
            </label>
            <ModernSelect
              id={`${mode}-priority`}
              name="priority"
              defaultValue={defaults?.priority ?? "medium"}
              placeholder="Not set"
              options={[
                { value: "", label: "Not set" },
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
                { value: "critical", label: "Critical" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-start`}>
              Start date
            </label>
            <Input id={`${mode}-start`} name="start_date" type="date" defaultValue={defaults?.start_date ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-end`}>
              {isFr ? "Date de fin (facultative)" : "End date (optional)"}
            </label>
            <Input id={`${mode}-end`} name="end_date" type="date" defaultValue={defaults?.end_date ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-manual-progress`}>
              {isFr ? "Progression du projet (%)" : "Project progress (%)"}
            </label>
            <Input
              id={`${mode}-manual-progress`}
              name="manual_progress"
              type="number"
              min="0"
              max="100"
              step="1"
              defaultValue={defaults?.manual_progress ?? ""}
              placeholder={isFr ? "Calcul automatique si vide" : "Automatic calculation when empty"}
            />
            <p className="text-xs text-muted-foreground">
              {isFr ? "Renseignez cette valeur pour piloter vous-même l’avancement. Laissez vide pour calculer à partir des tickets." : "Set this value to manage progress yourself. Leave it blank to calculate it from tickets."}
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-budget`}>
              Budget amount
            </label>
            <FormattedNumberInput
              id={`${mode}-budget`}
              name="budget_amount"
              defaultValue={defaults?.budget_amount ?? ""}
              placeholder="Optional"
            />
          </div>

          {state.error ? (
            <div className="sm:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
              {state.error}
            </div>
          ) : null}

          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="submit" className="rounded-2xl px-5">
              {mode === "create" ? (isFr ? "Créer le projet" : "Create project") : (isFr ? "Enregistrer" : "Save changes")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
