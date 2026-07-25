import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { getCurrentLocale } from "@/lib/i18n/server";
import type { PlanningFilters } from "@/types/planning";
import type { TicketFiltersData } from "@/types/ticket";

type PlanningFiltersProps = {
  filters: PlanningFilters;
  filterData: TicketFiltersData;
  week: string;
  canFilterAssignee?: boolean;
};

export async function PlanningFilters({
  filters,
  filterData,
  week,
  canFilterAssignee = true,
}: PlanningFiltersProps) {
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";

  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
      {canFilterAssignee ? (
        <ModernSelect
          name="assignee"
          defaultValue={filters.assigneeId ?? ""}
          placeholder={isFr ? "Tous les assignés" : "All assignees"}
          options={[
            { value: "", label: isFr ? "Tous les assignés" : "All assignees" },
            ...filterData.assignees.map((assignee) => ({
              value: assignee.id,
              label: assignee.full_name,
            })),
          ]}
        />
      ) : (
        <input type="hidden" name="assignee" value="" />
      )}

        <ModernSelect
        name="project"
        defaultValue={filters.projectId ?? ""}
        placeholder={isFr ? "Tous les projets" : "All projects"}
        options={[
          { value: "", label: isFr ? "Tous les projets" : "All projects" },
          ...filterData.projects.map((project) => ({
            value: project.id,
            label: project.name,
          })),
        ]}
      />

      <ModernSelect
        name="priority"
        defaultValue={filters.priority ?? ""}
        placeholder={isFr ? "Toutes les priorités" : "All priorities"}
        options={[
          { value: "", label: isFr ? "Toutes les priorités" : "All priorities" },
          { value: "low", label: isFr ? "Basse" : "Low" },
          { value: "medium", label: isFr ? "Moyenne" : "Medium" },
          { value: "high", label: isFr ? "Haute" : "High" },
          { value: "urgent", label: isFr ? "Urgente" : "Urgent" },
        ]}
      />

      <ModernSelect
        name="status"
        defaultValue={filters.status ?? ""}
        placeholder={isFr ? "Tous les statuts" : "All statuses"}
        options={[
          { value: "", label: isFr ? "Tous les statuts" : "All statuses" },
          { value: "backlog", label: isFr ? "Backlog" : "Backlog" },
          { value: "todo", label: isFr ? "À faire" : "To do" },
          { value: "in_progress", label: isFr ? "En cours" : "In progress" },
          { value: "review", label: isFr ? "Revue" : "Review" },
          { value: "blocked", label: isFr ? "Bloqué" : "Blocked" },
          { value: "done", label: isFr ? "Terminé" : "Done" },
        ]}
      />

      <ModernSelect
        name="type"
        defaultValue={filters.type ?? ""}
        placeholder={isFr ? "Tous les types" : "All types"}
        options={[
          { value: "", label: isFr ? "Tous les types" : "All types" },
          { value: "task", label: isFr ? "Tâche" : "Task" },
          { value: "bug", label: isFr ? "Bug" : "Bug" },
          { value: "feature", label: isFr ? "Fonctionnalité" : "Feature" },
          { value: "support", label: isFr ? "Support" : "Support" },
          { value: "client_request", label: isFr ? "Demande client" : "Client request" },
          { value: "internal", label: isFr ? "Interne" : "Internal" },
        ]}
      />

      <input type="hidden" name="week" value={week} />

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">
          {isFr ? "Appliquer" : "Apply"}
        </Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href={`/planning?week=${week}`}>{isFr ? "Réinitialiser" : "Reset"}</Link>
        </Button>
      </div>
    </form>
  );
}
