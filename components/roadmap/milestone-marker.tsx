import { CalendarClock, CheckCircle2, Flag, Trash2, UserRound } from "lucide-react";

import {
  completeMilestoneAction,
  deleteMilestoneAction,
} from "@/app/(app)/roadmap/actions";
import { MilestoneForm } from "@/components/roadmap/milestone-form";
import { MilestoneStatusBadge } from "@/components/roadmap/milestone-status-badge";
import { ConfirmActionForm } from "@/components/shared/confirm-action-form";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRoadmapDate } from "@/lib/roadmap/helpers";
import type { MilestoneRecord, RoadmapFilterData } from "@/types/milestone";

export function MilestoneMarker({
  milestone,
  filterData,
  canManage,
  returnTo,
  compact = false,
  summaryMode = false,
}: {
  milestone: MilestoneRecord;
  filterData: RoadmapFilterData;
  canManage: boolean;
  returnTo: string;
  compact?: boolean;
  summaryMode?: boolean;
}) {
  if (compact) {
    return (
      <TooltipProvider delayDuration={80}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`absolute top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-[0.08em] uppercase transition-all ${milestone.status === "completed" ? "border-emerald-400/30 bg-emerald-400/12 text-emerald-100" : milestone.status === "delayed" ? "border-amber-400/30 bg-amber-400/12 text-amber-100" : "border-primary/30 bg-primary/14 text-primary-foreground"}`}
            >
              <Flag className="size-3" />
              <span className="hidden md:inline">{milestone.title}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs rounded-2xl border-border/70 bg-popover/95 backdrop-blur-xl">
            <p className="font-medium">{milestone.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatRoadmapDate(milestone.due_date)}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="rounded-[24px] border border-border/65 bg-background/40 p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <MilestoneStatusBadge status={milestone.status} />
          </div>
          <div>
            <h4 className="text-sm font-semibold tracking-[-0.02em]">{milestone.title}</h4>
            {!summaryMode && milestone.description ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{milestone.description}</p>
            ) : null}
          </div>
        </div>

        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            {milestone.status !== "completed" ? (
              <form action={completeMilestoneAction}>
                <input type="hidden" name="milestone_id" value={milestone.id} />
                <input type="hidden" name="project_id" value={milestone.project_id} />
                <input type="hidden" name="redirect_to" value={returnTo} />
                <Button type="submit" variant="secondary" className="rounded-full px-3">
                  <CheckCircle2 className="size-4" />
                  Complete
                </Button>
              </form>
            ) : null}
            <MilestoneForm
              mode="edit"
              filterData={filterData}
              returnTo={returnTo}
              defaults={{
                milestone_id: milestone.id,
                project_id: milestone.project_id,
                title: milestone.title,
                description: milestone.description ?? "",
                status: milestone.status,
                due_date: milestone.due_date,
                owner_id: milestone.owner_id ?? "",
              }}
            />
            <ConfirmActionForm
              action={deleteMilestoneAction}
              fields={{ milestone_id: milestone.id, project_id: milestone.project_id, redirect_to: returnTo }}
              title="Delete milestone?"
              description={`This will permanently delete "${milestone.title}". This action cannot be undone.`}
              confirmLabel="Delete milestone"
              trigger={(
                <Button type="button" variant="ghost" className="rounded-full px-3 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100">
                  <Trash2 className="size-4" />
                </Button>
              )}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarClock className="size-3.5" />
          {formatRoadmapDate(milestone.due_date)}
        </span>
        {!summaryMode ? (
          <span className="flex items-center gap-1.5">
            <UserRound className="size-3.5" />
            {milestone.owner?.full_name ?? "No owner"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
