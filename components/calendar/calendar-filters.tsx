import type { CalendarFilterData, CalendarFilters, CalendarView } from "@/types/calendar";
import { ModernSelect } from "@/components/ui/modern-select";

export function CalendarFilters({
  filters,
  filterData,
  view,
  period,
}: {
  filters: CalendarFilters;
  filterData: CalendarFilterData;
  view: CalendarView;
  period: string;
}) {
  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-6">
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="period" value={period} />

      <ModernSelect
        name="type"
        defaultValue={filters.type ?? ""}
        placeholder="All event types"
        options={[
          { value: "", label: "All event types" },
          { value: "ticket_due", label: "Ticket due" },
          { value: "project_deadline", label: "Project deadline" },
          { value: "milestone", label: "Milestone" },
          { value: "payment_due", label: "Payment due" },
          { value: "contract_renewal", label: "Contract renewal" },
          { value: "internal_event", label: "Internal event" },
        ]}
      />

      <ModernSelect
        name="project"
        defaultValue={filters.projectId ?? ""}
        placeholder="All projects"
        options={[
          { value: "", label: "All projects" },
          ...filterData.projects.map((project) => ({
            value: project.id,
            label: project.name,
          })),
        ]}
      />

      <ModernSelect
        name="client"
        defaultValue={filters.clientId ?? ""}
        placeholder="All clients"
        options={[
          { value: "", label: "All clients" },
          ...filterData.clients.map((client) => ({
            value: client.id,
            label: client.name,
          })),
        ]}
      />

      <ModernSelect
        name="assignee"
        defaultValue={filters.assigneeId ?? ""}
        placeholder="All assignees"
        options={[
          { value: "", label: "All assignees" },
          ...filterData.assignees.map((assignee) => ({
            value: assignee.id,
            label: assignee.full_name,
          })),
        ]}
      />

      <ModernSelect
        name="priority"
        defaultValue={filters.priority ?? ""}
        placeholder="All priorities"
        options={[
          { value: "", label: "All priorities" },
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
          { value: "urgent", label: "Urgent" },
          { value: "critical", label: "Critical" },
        ]}
      />

      <div className="flex gap-3">
        <ModernSelect
          name="status"
          defaultValue={filters.status ?? ""}
          className="min-w-0 flex-1"
          placeholder="All statuses"
          options={[
            { value: "", label: "All statuses" },
            { value: "backlog", label: "Backlog" },
            { value: "todo", label: "To do" },
            { value: "in_progress", label: "In progress" },
            { value: "review", label: "Review" },
            { value: "blocked", label: "Blocked" },
            { value: "done", label: "Done" },
            { value: "planned", label: "Planned" },
            { value: "completed", label: "Completed" },
            { value: "delayed", label: "Delayed" },
            { value: "upcoming", label: "Upcoming" },
            { value: "scheduled", label: "Scheduled" },
          ]}
        />
        <button
          type="submit"
          className="h-11 rounded-2xl border border-primary/30 bg-primary/12 px-4 text-sm font-medium text-primary transition-all hover:border-primary/40 hover:bg-primary/18"
        >
          Apply
        </button>
      </div>
    </form>
  );
}
