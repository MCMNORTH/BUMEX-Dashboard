"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, SquarePen } from "lucide-react";

import {
  createTicketAction,
  updateTicketAction,
  type TicketActionState,
} from "@/app/(app)/tickets/actions";
import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AssignmentHelper } from "@/components/team/assignment-helper";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { Textarea } from "@/components/ui/textarea";
import type { AppRole } from "@/types/auth";
import type { TicketFiltersData, TicketFormValues } from "@/types/ticket";
import type { AssignmentHelperRecord, TeamWorkloadRecord } from "@/types/team";

const initialState: TicketActionState = {};

type TicketFormProps = {
  mode: "create" | "edit";
  role: AppRole;
  filterData: TicketFiltersData;
  defaults?: Partial<TicketFormValues> & { ticket_id?: string };
  triggerLabel?: string;
  triggerIcon?: "plus" | "edit";
  assigneeWorkloads?: TeamWorkloadRecord[];
  suggestedAssignees?: TeamWorkloadRecord[];
};

function SubmitButton({ mode }: { mode: TicketFormProps["mode"] }) {
  const { pending } = useFormStatus();
  const { t } = useI18n();

  return (
    <Button type="submit" className="rounded-2xl px-5" disabled={pending}>
      {pending
        ? t("common.actions.saving", "Saving...")
        : mode === "create"
          ? t("common.actions.createTicket", "Create ticket")
          : t("common.actions.saveChanges", "Save changes")}
    </Button>
  );
}

export function TicketForm({
  mode,
  role,
  filterData,
  defaults,
  triggerLabel,
  triggerIcon,
  assigneeWorkloads = [],
  suggestedAssignees = [],
}: TicketFormProps) {
  const [state, formAction] = useActionState(
    mode === "create" ? createTicketAction : updateTicketAction,
    initialState,
  );
  const { t } = useI18n();
  const [selectedAssigneeId, setSelectedAssigneeId] = useState(defaults?.assignee_id ?? "");

  const triggerIconName = triggerIcon ?? (mode === "create" ? "plus" : "edit");
  const employeeRestricted = role === "employee" && mode === "edit";
  const assignmentHelper = useMemo<AssignmentHelperRecord>(() => {
    const currentAssignee = assigneeWorkloads.find((member) => member.id === selectedAssigneeId) ?? null;
    return {
      currentAssignee,
      suggestedMembers: suggestedAssignees.filter((member) => member.id !== selectedAssigneeId).slice(0, 3),
    };
  }, [assigneeWorkloads, selectedAssigneeId, suggestedAssignees]);

  const TriggerIcon = triggerIconName === "edit" ? SquarePen : Plus;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="rounded-full px-5">
            <TriggerIcon className="size-4" />
            {triggerLabel ?? t("common.actions.createTicket", "Create ticket")}
          </Button>
        ) : (
          <Button variant="secondary" className="rounded-full px-5">
            <TriggerIcon className="size-4" />
            {triggerLabel ?? t("common.actions.editTicket", "Edit ticket")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("tickets.form.createTitle", "Create ticket") : t("tickets.form.editTitle", "Edit ticket")}</DialogTitle>
          <DialogDescription>
            {employeeRestricted
              ? t("tickets.form.employeeEditDescription", "Update your assigned work while keeping project ownership and assignment intact.")
              : mode === "create"
                ? t("tickets.form.createDescription", "Create a new ticket linked to a project, assignee, and operational context.")
                : t("tickets.form.editDescription", "Update ticket details, workload tracking, and execution metadata.")}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {defaults?.ticket_id ? <input type="hidden" name="ticket_id" value={defaults.ticket_id} /> : null}

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-title`}>
              {t("tickets.form.fields.title", "Title")}
            </label>
            <Input id={`${mode}-title`} name="title" defaultValue={defaults?.title ?? ""} required />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-description`}>
              {t("tickets.form.fields.description", "Description")}
            </label>
            <Textarea
              id={`${mode}-description`}
              name="description"
              defaultValue={defaults?.description ?? ""}
              placeholder={t("tickets.form.placeholders.description", "Operational context, bug details, or expected delivery outcome")}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-project`}>
              {t("tickets.form.fields.project", "Project")}
            </label>
            {employeeRestricted ? (
              <>
                <input type="hidden" name="project_id" value={defaults?.project_id ?? ""} />
                <Input
                  id={`${mode}-project`}
                  value={filterData.projects.find((project) => project.id === defaults?.project_id)?.name ?? t("tickets.form.select.locked", "Locked")}
                  readOnly
                />
              </>
            ) : (
              <ModernSelect
                id={`${mode}-project`}
                name="project_id"
                defaultValue={defaults?.project_id ?? ""}
                placeholder={t("tickets.form.select.selectProject", "Select project")}
                options={[
                  { value: "", label: t("tickets.form.select.selectProject", "Select project") },
                  ...filterData.projects.map((project) => ({ value: project.id, label: project.name })),
                ]}
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-assignee`}>
              {t("tickets.form.fields.assignee", "Assignee")}
            </label>
            {employeeRestricted ? (
              <>
                <input type="hidden" name="assignee_id" value={defaults?.assignee_id ?? ""} />
                <Input
                  id={`${mode}-assignee`}
                  value={filterData.assignees.find((assignee) => assignee.id === defaults?.assignee_id)?.full_name ?? t("tickets.form.select.locked", "Locked")}
                  readOnly
                />
              </>
            ) : (
              <ModernSelect
                id={`${mode}-assignee`}
                name="assignee_id"
                defaultValue={selectedAssigneeId}
                placeholder={t("tickets.form.select.unassigned", "Unassigned")}
                onValueChange={setSelectedAssigneeId}
                options={[
                  { value: "", label: t("tickets.form.select.unassigned", "Unassigned") },
                  ...filterData.assignees.map((assignee) => ({ value: assignee.id, label: assignee.full_name })),
                ]}
              />
            )}
          </div>

          {!employeeRestricted ? <AssignmentHelper helper={assignmentHelper} /> : null}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-reporter`}>
              {t("tickets.form.fields.reporter", "Reporter")}
            </label>
            {employeeRestricted ? (
              <>
                <input type="hidden" name="reporter_id" value={defaults?.reporter_id ?? ""} />
                <Input
                  id={`${mode}-reporter`}
                  value={filterData.reporters.find((reporter) => reporter.id === defaults?.reporter_id)?.full_name ?? t("tickets.form.select.locked", "Locked")}
                  readOnly
                />
              </>
            ) : (
              <ModernSelect
                id={`${mode}-reporter`}
                name="reporter_id"
                defaultValue={defaults?.reporter_id ?? ""}
                placeholder={t("tickets.form.select.noReporter", "No reporter")}
                options={[
                  { value: "", label: t("tickets.form.select.noReporter", "No reporter") },
                  ...filterData.reporters.map((reporter) => ({ value: reporter.id, label: reporter.full_name })),
                ]}
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-status`}>
              {t("tickets.form.fields.status", "Status")}
            </label>
            <ModernSelect
              id={`${mode}-status`}
              name="status"
              defaultValue={defaults?.status ?? "todo"}
              options={[
                { value: "backlog", label: t("tickets.form.select.statuses.backlog", "Backlog") },
                { value: "todo", label: t("tickets.form.select.statuses.todo", "To do") },
                { value: "in_progress", label: t("tickets.form.select.statuses.in_progress", "In progress") },
                { value: "review", label: t("tickets.form.select.statuses.review", "Review") },
                { value: "blocked", label: t("tickets.form.select.statuses.blocked", "Blocked") },
                { value: "done", label: t("tickets.form.select.statuses.done", "Done") },
                { value: "archived", label: t("tickets.form.select.statuses.archived", "Archived") },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-priority`}>
              {t("tickets.form.fields.priority", "Priority")}
            </label>
            <ModernSelect
              id={`${mode}-priority`}
              name="priority"
              defaultValue={defaults?.priority ?? "medium"}
              options={[
                { value: "low", label: t("tickets.form.select.priorities.low", "Low") },
                { value: "medium", label: t("tickets.form.select.priorities.medium", "Medium") },
                { value: "high", label: t("tickets.form.select.priorities.high", "High") },
                { value: "urgent", label: t("tickets.form.select.priorities.urgent", "Urgent") },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-type`}>
              {t("tickets.form.fields.type", "Type")}
            </label>
            <ModernSelect
              id={`${mode}-type`}
              name="type"
              defaultValue={defaults?.type ?? "task"}
              options={[
                { value: "task", label: t("tickets.form.select.types.task", "Task") },
                { value: "bug", label: t("tickets.form.select.types.bug", "Bug") },
                { value: "feature", label: t("tickets.form.select.types.feature", "Feature") },
                { value: "support", label: t("tickets.form.select.types.support", "Support") },
                { value: "client_request", label: t("tickets.form.select.types.client_request", "Client request") },
                { value: "internal", label: t("tickets.form.select.types.internal", "Internal") },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-due`}>
              {t("tickets.form.fields.dueDate", "Due date")}
            </label>
            <Input id={`${mode}-due`} name="due_date" type="date" defaultValue={defaults?.due_date ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-estimated`}>
              {t("tickets.form.fields.estimatedHours", "Estimated hours")}
            </label>
            <Input
              id={`${mode}-estimated`}
              name="estimated_hours"
              type="number"
              min="0"
              step="0.25"
              defaultValue={defaults?.estimated_hours ?? ""}
              placeholder={t("tickets.form.placeholders.optional", "Optional")}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-actual`}>
              {t("tickets.form.fields.actualHours", "Actual hours")}
            </label>
            <Input
              id={`${mode}-actual`}
              name="actual_hours"
              type="number"
              min="0"
              step="0.25"
              defaultValue={defaults?.actual_hours ?? ""}
              placeholder={t("tickets.form.placeholders.optional", "Optional")}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-github`}>
              {t("tickets.form.fields.githubIssueUrl", "GitHub issue URL")}
            </label>
            <Input
              id={`${mode}-github`}
              name="github_issue_url"
              type="url"
              defaultValue={defaults?.github_issue_url ?? ""}
              placeholder={t("tickets.form.placeholders.github", "https://github.com/...")}
            />
          </div>

          {state.error ? (
            <div className="sm:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
              {state.error}
            </div>
          ) : null}

          <div className="sm:col-span-2 flex justify-end gap-2">
            <SubmitButton mode={mode} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
