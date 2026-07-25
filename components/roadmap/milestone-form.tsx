"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, SquarePen } from "lucide-react";

import {
  createMilestoneAction,
  updateMilestoneAction,
  type MilestoneActionState,
} from "@/app/(app)/roadmap/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { Textarea } from "@/components/ui/textarea";
import type { RoadmapFilterData, MilestoneFormValues } from "@/types/milestone";

const initialState: MilestoneActionState = {};

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="rounded-2xl px-5" disabled={pending}>
      {pending ? "Saving..." : mode === "create" ? "Create milestone" : "Save changes"}
    </Button>
  );
}

export function MilestoneForm({
  mode,
  filterData,
  defaults,
  returnTo,
  triggerLabel,
}: {
  mode: "create" | "edit";
  filterData: RoadmapFilterData;
  defaults?: Partial<MilestoneFormValues> & { milestone_id?: string };
  returnTo: string;
  triggerLabel?: string;
}) {
  const [state, formAction] = useActionState(
    mode === "create" ? createMilestoneAction : updateMilestoneAction,
    initialState,
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="rounded-full px-5">
            <Plus className="size-4" />
            {triggerLabel ?? "Create milestone"}
          </Button>
        ) : (
          <Button variant="secondary" className="rounded-full px-4">
            <SquarePen className="size-4" />
            {triggerLabel ?? "Edit"}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create milestone" : "Edit milestone"}</DialogTitle>
          <DialogDescription>
            Define a delivery checkpoint with clear timing, ownership, and roadmap visibility.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {defaults?.milestone_id ? <input type="hidden" name="milestone_id" value={defaults.milestone_id} /> : null}
          <input type="hidden" name="redirect_to" value={returnTo} />

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-project`}>
              Project
            </label>
            <ModernSelect
              id={`${mode}-project`}
              name="project_id"
              defaultValue={defaults?.project_id ?? ""}
              placeholder="Select project"
              options={[
                { value: "", label: "Select project" },
                ...filterData.projects.map((project) => ({
                  value: project.id,
                  label: project.name,
                })),
              ]}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-title`}>
              Title
            </label>
            <Input id={`${mode}-title`} name="title" defaultValue={defaults?.title ?? ""} required />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-description`}>
              Description
            </label>
            <Textarea
              id={`${mode}-description`}
              name="description"
              defaultValue={defaults?.description ?? ""}
              placeholder="What must be delivered or approved at this milestone?"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-status`}>
              Status
            </label>
            <ModernSelect
              id={`${mode}-status`}
              name="status"
              defaultValue={defaults?.status ?? "planned"}
              options={[
                { value: "planned", label: "Planned" },
                { value: "in_progress", label: "In progress" },
                { value: "completed", label: "Completed" },
                { value: "delayed", label: "Delayed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-due`}>
              Due date
            </label>
            <Input id={`${mode}-due`} name="due_date" type="date" defaultValue={defaults?.due_date ?? ""} required />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-owner`}>
              Owner
            </label>
            <ModernSelect
              id={`${mode}-owner`}
              name="owner_id"
              defaultValue={defaults?.owner_id ?? ""}
              placeholder="No owner"
              options={[
                { value: "", label: "No owner" },
                ...filterData.owners.map((owner) => ({
                  value: owner.id,
                  label: owner.full_name,
                })),
              ]}
            />
          </div>

          {state.error ? (
            <div className="sm:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
              {state.error}
            </div>
          ) : null}

          <div className="sm:col-span-2 flex justify-end">
            <SubmitButton mode={mode} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
