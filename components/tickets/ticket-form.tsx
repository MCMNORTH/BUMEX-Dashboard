"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { CircleCheck, ChevronDown, Plus, SquarePen } from "lucide-react";

import {
  createTicketAction,
  updateTicketAction,
  type TicketActionState,
} from "@/app/(app)/tickets/actions";
import { useI18n } from "@/components/layout/i18n-provider";
import { useLocalPreference } from "@/hooks/use-local-preference";
import { useUser } from "@/hooks/use-user";
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
import { SubtaskDraftList } from "@/components/tickets/subtask-draft-list";
import { Textarea } from "@/components/ui/textarea";
import { TicketStageField } from "@/components/tickets/ticket-stage-field";
import { buildPeopleOptions } from "@/lib/entities/people-options";
import { getCompletionRule } from "@/lib/tickets/workflow";
import type { AppRole } from "@/types/auth";
import type { TicketAssignee, TicketFiltersData, TicketFormValues } from "@/types/ticket";
import type { AssignmentHelperRecord, TeamWorkloadRecord } from "@/types/team";
import type { BoardWorkflow } from "@/types/workflow";

const initialState: TicketActionState = {};

/** Per user: the project their last ticket went to. */
const LAST_PROJECT_KEY = "bumex-ticket-form-project:";
/** "0" once someone turns "Create another" off; on until then. */
const CREATE_ANOTHER_KEY = "bumex-ticket-form-create-another";

type TicketFormProps = {
  mode: "create" | "edit";
  role: AppRole;
  filterData: TicketFiltersData;
  defaults?: Partial<TicketFormValues> & { ticket_id?: string };
  /** Workflow of each project's board, for the stage picker. Missing boards use the built-in stages. */
  workflows?: Record<string, BoardWorkflow>;
  triggerLabel?: string;
  triggerIcon?: "plus" | "edit";
  openOnLoad?: boolean;
  assigneeWorkloads?: TeamWorkloadRecord[];
  suggestedAssignees?: TeamWorkloadRecord[];
};

function SubmitButton({ mode, pending }: { mode: TicketFormProps["mode"]; pending: boolean }) {
  const { t } = useI18n();

  return (
    <Button type="submit" disabled={pending} title="Ctrl + Enter">
      {pending
        ? t("common.actions.saving", "Saving...")
        : mode === "create"
          ? t("common.actions.createTicket", "Create ticket")
          : t("common.actions.saveChanges", "Save changes")}
    </Button>
  );
}

function RequiredMark() {
  return <span aria-hidden="true" className="text-danger">*</span>;
}

export function TicketForm({
  mode,
  role,
  filterData,
  defaults,
  workflows = {},
  triggerLabel,
  triggerIcon,
  openOnLoad = false,
  assigneeWorkloads = [],
  suggestedAssignees = [],
}: TicketFormProps) {
  const { t, locale } = useI18n();
  const isFr = locale === "fr";
  const { profile } = useUser();
  const [open, setOpen] = useState(openOnLoad);
  const [, startTransition] = useTransition();
  // Only the save itself: the transition also waits for the list behind the dialog to
  // refresh, and the next ticket should not have to wait for that.
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tickets made since the dialog opened, while "Create another" kept it open; latest first.
  const [created, setCreated] = useState<Array<{ id: string; title: string }>>([]);
  // Bumped after each of those, to clear the fields that describe a single ticket.
  const [round, setRound] = useState(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState(defaults?.assignee_id ?? "");
  // On for every new ticket: leaving one ticket silent does not silence the next.
  const [emailAssignee, setEmailAssignee] = useState(true);
  const [lastProjectId, rememberProject] = useLocalPreference(
    mode === "create" && profile ? `${LAST_PROJECT_KEY}${profile.id}` : null,
  );
  const [createAnotherPreference, setCreateAnotherPreference] = useLocalPreference(
    mode === "create" ? CREATE_ANOTHER_KEY : null,
  );
  const createAnother = mode === "create" && createAnotherPreference !== "0";
  const [projectChoice, setProjectChoice] = useState<string | null>(null);
  const lastProject = filterData.projects.some((project) => project.id === lastProjectId) ? lastProjectId : null;
  // A pick in this form wins, then the page's project (a filtered board), then the last one used.
  const selectedProjectId = projectChoice ?? (defaults?.project_id || (mode === "create" && lastProject) || "");
  // Whoever creates a ticket is its reporter unless they pick someone else.
  const defaultReporterId = defaults?.reporter_id ?? (mode === "create" ? profile?.id ?? "" : "");
  // Judged on the saved reporter: picking another one in this form changes nothing until saved.
  const completionRule = getCompletionRule(
    { reporter_id: defaults?.reporter_id || null, assignee_id: defaults?.assignee_id || null },
    profile?.id ?? "",
  );

  const triggerIconName = triggerIcon ?? (mode === "create" ? "plus" : "edit");
  const employeeRestricted = role === "employee" && mode === "edit";
  // On a project with members from other entities, the pickers add them and list its own entity first.
  const projectTeam = filterData.projectTeams?.[selectedProjectId];
  const peoplePicker = useMemo(() => {
    const withTeam = (people: TicketAssignee[]) => [...people, ...(projectTeam?.outsideMembers ?? [])];
    const toOptions = (people: TicketAssignee[]) => projectTeam
      ? buildPeopleOptions(withTeam(people), projectTeam.entityCode, locale)
      : people.map((person) => ({ value: person.id, label: person.full_name }));

    return {
      assignees: withTeam(filterData.assignees),
      reporters: withTeam(filterData.reporters),
      assigneeOptions: toOptions(filterData.assignees),
      reporterOptions: toOptions(filterData.reporters),
    };
  }, [filterData.assignees, filterData.reporters, locale, projectTeam]);
  const assignmentHelper = useMemo<AssignmentHelperRecord>(() => {
    const currentAssignee = assigneeWorkloads.find((member) => member.id === selectedAssigneeId) ?? null;
    return {
      currentAssignee,
      suggestedMembers: suggestedAssignees.filter((member) => member.id !== selectedAssigneeId).slice(0, 3),
    };
  }, [assigneeWorkloads, selectedAssigneeId, suggestedAssignees]);

  const TriggerIcon = triggerIconName === "edit" ? SquarePen : Plus;

  useEffect(() => {
    if (round) {
      titleRef.current?.focus();
    }
  }, [round]);

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (!next) {
      setCreated([]);
      setError(null);
      setEmailAssignee(true);
    }
  }

  // Submitted by hand rather than as a form action, so React does not reset the
  // fields: a refused save keeps what was typed, and "Create another" keeps the
  // project, assignee and other settings for the next ticket.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const projectId = formData.get("project_id");

    if (mode === "create" && typeof projectId === "string" && projectId) {
      rememberProject(projectId);
    }

    setSaving(true);
    startTransition(async () => {
      const action = mode === "create" ? createTicketAction : updateTicketAction;
      // Without "Create another" (and when editing) a successful save navigates away.
      const result = await action(initialState, formData);

      if (result?.error) {
        setError(result.error);
        setSaving(false);
        return;
      }

      if (result?.created) {
        setError(null);
        setCreated((current) => [result.created!, ...current]);
        setRound((current) => current + 1);
        setEmailAssignee(true);
        setSaving(false);
      }

      // Anything else navigates away; the form stays busy until it does.
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  const showEmailAssignee = mode === "create" && Boolean(selectedAssigneeId) && selectedAssigneeId !== profile?.id;
  const latest = created[0];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <TriggerIcon className="size-4" />
            {triggerLabel ?? t("common.actions.createTicket", "Create ticket")}
          </Button>
        ) : (
          <Button variant="secondary">
            <TriggerIcon className="size-4" />
            {triggerLabel ?? t("common.actions.editTicket", "Edit ticket")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
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

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="grid gap-4 sm:grid-cols-2">
          {defaults?.ticket_id ? <input type="hidden" name="ticket_id" value={defaults.ticket_id} /> : null}
          {mode === "create" ? (
            <>
              <input type="hidden" name="create_another" value={createAnother ? "1" : "0"} />
              <input type="hidden" name="notify_assignee_email" value={emailAssignee ? "1" : "0"} />
            </>
          ) : null}

          {latest ? (
            <div role="status" className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-sm text-success sm:col-span-2">
              <CircleCheck className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {isFr ? `« ${latest.title} » créé` : `Created “${latest.title}”`}
                {created.length > 1 ? (
                  <span className="text-success/80">{isFr ? ` · ${created.length} tickets créés` : ` · ${created.length} tickets so far`}</span>
                ) : null}
              </span>
              <Link href={`/tickets/${latest.id}`} className="shrink-0 font-medium underline-offset-2 hover:underline">
                {isFr ? "Ouvrir" : "Open"}
              </Link>
            </div>
          ) : null}

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-title`}>
              {t("tickets.form.fields.title", "Title")} <RequiredMark />
            </label>
            <Input
              key={`title-${round}`}
              ref={titleRef}
              id={`${mode}-title`}
              name="title"
              defaultValue={round ? "" : defaults?.title ?? ""}
              required
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-description`}>
              {t("tickets.form.fields.description", "Description")}
            </label>
            <Textarea
              key={`description-${round}`}
              id={`${mode}-description`}
              name="description"
              defaultValue={round ? "" : defaults?.description ?? ""}
              rows={3}
              className="min-h-20"
              placeholder={t("tickets.form.placeholders.description", "What needs to be done, and why?")}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-project`}>
              {t("tickets.form.fields.project", "Project")} <RequiredMark />
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
                searchable
                value={selectedProjectId}
                onValueChange={setProjectChoice}
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
                  value={peoplePicker.assignees.find((assignee) => assignee.id === defaults?.assignee_id)?.full_name ?? t("tickets.form.select.locked", "Locked")}
                  readOnly
                />
              </>
            ) : (
              <ModernSelect
                id={`${mode}-assignee`}
                name="assignee_id"
                searchable
                defaultValue={selectedAssigneeId}
                placeholder={t("tickets.form.select.unassigned", "Unassigned")}
                onValueChange={setSelectedAssigneeId}
                options={[
                  { value: "", label: t("tickets.form.select.unassigned", "Unassigned") },
                  ...peoplePicker.assigneeOptions,
                ]}
              />
            )}
            {showEmailAssignee ? (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={emailAssignee}
                  onChange={(event) => setEmailAssignee(event.target.checked)}
                />
                {isFr ? "Prévenir l’assigné par e-mail" : "Email the assignee"}
              </label>
            ) : null}
          </div>

          {!employeeRestricted ? <AssignmentHelper helper={assignmentHelper} /> : null}

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
            <label className="text-sm font-medium" htmlFor={`${mode}-due`}>
              {t("tickets.form.fields.dueDate", "Due date")}
            </label>
            <Input key={`due-${round}`} id={`${mode}-due`} name="due_date" type="date" defaultValue={round ? "" : defaults?.due_date ?? ""} />
          </div>

          <details className="group sm:col-span-2" open={mode === "edit"}>
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              {t("tickets.form.moreDetails", "More details")}
              <span className="font-normal text-muted-foreground">
                {t("tickets.form.moreDetailsHint", "Type, status, reporter, time, GitHub link")}
              </span>
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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

              <TicketStageField
                mode={mode}
                id={`${mode}-stage`}
                projectId={selectedProjectId}
                workflows={workflows}
                originalProjectId={defaults?.project_id}
                originalStageId={defaults?.stage_id}
                archived={defaults?.status === "archived"}
                wasCompleted={defaults?.status === "done"}
                completionRule={completionRule}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor={`${mode}-reporter`}>
                  {t("tickets.form.fields.reporter", "Reporter")}
                </label>
                {employeeRestricted ? (
                  <>
                    <input type="hidden" name="reporter_id" value={defaults?.reporter_id ?? ""} />
                    <Input
                      id={`${mode}-reporter`}
                      value={peoplePicker.reporters.find((reporter) => reporter.id === defaults?.reporter_id)?.full_name ?? t("tickets.form.select.locked", "Locked")}
                      readOnly
                    />
                  </>
                ) : (
                  <ModernSelect
                    id={`${mode}-reporter`}
                    name="reporter_id"
                    searchable
                    defaultValue={defaultReporterId}
                    placeholder={t("tickets.form.select.noReporter", "No reporter")}
                    options={[
                      { value: "", label: t("tickets.form.select.noReporter", "No reporter") },
                      ...peoplePicker.reporterOptions,
                    ]}
                  />
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor={`${mode}-estimated`}>
                  {t("tickets.form.fields.estimatedHours", "Estimated hours")}
                </label>
                <Input
                  key={`estimated-${round}`}
                  id={`${mode}-estimated`}
                  name="estimated_hours"
                  type="number"
                  min="0"
                  step="0.25"
                  defaultValue={round ? "" : defaults?.estimated_hours ?? ""}
                  placeholder={t("tickets.form.placeholders.optional", "Optional")}
                />
              </div>

              {mode === "edit" ? (
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
              ) : null}

              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium" htmlFor={`${mode}-github`}>
                  {t("tickets.form.fields.githubIssueUrl", "GitHub issue URL")}
                </label>
                <Input
                  key={`github-${round}`}
                  id={`${mode}-github`}
                  name="github_issue_url"
                  type="url"
                  defaultValue={round ? "" : defaults?.github_issue_url ?? ""}
                  placeholder={t("tickets.form.placeholders.github", "https://github.com/...")}
                />
              </div>
            </div>
          </details>

          {mode === "create" ? <SubtaskDraftList key={`subtasks-${round}`} /> : null}

          {error ? (
            <div role="alert" className="sm:col-span-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            {mode === "create" ? (
              <label className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={createAnother}
                  onChange={(event) => setCreateAnotherPreference(event.target.checked ? "1" : "0")}
                />
                {isFr ? "Créer un autre ticket ensuite" : "Create another"}
              </label>
            ) : null}
            {mode === "create" ? (
              <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)}>
                {created.length ? (isFr ? "Terminé" : "Done") : t("common.actions.cancel", "Cancel")}
              </Button>
            ) : null}
            <SubmitButton mode={mode} pending={saving} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
