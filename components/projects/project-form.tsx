"use client";

import { useActionState } from "react";
import { Plus, SquarePen } from "lucide-react";

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
import type { ProjectFiltersData, ProjectFormValues } from "@/types/project";

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
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-client`}>
              Client
            </label>
            <ModernSelect
              id={`${mode}-client`}
              name="client_id"
              defaultValue={defaults?.client_id ?? ""}
              placeholder="Select client"
              options={[
                { value: "", label: "Select client" },
                ...filterData.clients.map((client) => ({
                  value: client.id,
                  label: client.name,
                })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-owner`}>
              Owner
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
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-status`}>
              Status
            </label>
            <ModernSelect
              id={`${mode}-status`}
              name="status"
              defaultValue={defaults?.status ?? "draft"}
              options={[
                { value: "draft", label: "Draft" },
                { value: "active", label: "Active" },
                { value: "on_hold", label: "On hold" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
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
              End date
            </label>
            <Input id={`${mode}-end`} name="end_date" type="date" defaultValue={defaults?.end_date ?? ""} />
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
