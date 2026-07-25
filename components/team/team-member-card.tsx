import Link from "next/link";
import { ArrowRight, CircleAlert, FolderKanban, ListTodo } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/formatters";
import type { AssignmentState, TeamMemberRecord } from "@/types/team";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const assignmentCopy: Record<AssignmentState, { label: string; tone: string; note: string }> = {
  available: {
    label: "Ready",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/12 dark:text-emerald-200",
    note: "Available for new work",
  },
  steady: {
    label: "In flow",
    tone: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/12 dark:text-sky-200",
    note: "Progress is stable",
  },
  loaded: {
    label: "Loaded",
    tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/12 dark:text-amber-200",
    note: "Capacity is elevated",
  },
  attention: {
    label: "Attention",
    tone: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/12 dark:text-rose-200",
    note: "Needs intervention",
  },
};

export function TeamMemberCard({ member }: { member: TeamMemberRecord }) {
  const state = assignmentCopy[member.assignment_state];
  const pressureCount = member.overdue_tasks_count + member.blocked_tasks_count;
  const currentFocus = member.current_focus[0];

  return (
    <Link
      href={`/team/${member.id}`}
      className="group block overflow-hidden rounded-[24px] border border-border/70 bg-white/96 p-4 shadow-[0_18px_44px_-42px_rgba(37,99,235,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-200/90 hover:shadow-[0_22px_52px_-42px_rgba(37,99,235,0.28)] dark:border-white/10 dark:bg-[#161b26] dark:shadow-none dark:hover:border-sky-400/20"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-11 border border-white/70 bg-white/80 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-slate-900/90 dark:shadow-none">
              <AvatarFallback className="bg-transparent text-xs font-semibold tracking-[0.14em] text-slate-700 dark:text-slate-100">
                {getInitials(member.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <p className="truncate text-[1.1rem] font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                {member.full_name}
              </p>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">{member.job_title ?? "Team member"}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`rounded-full px-2.5 py-0.5 text-[10px] tracking-[0.14em] uppercase ${state.tone}`}>
              {state.label}
            </Badge>
            {pressureCount ? (
              <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/12 dark:text-rose-200">
                {pressureCount} issue{pressureCount > 1 ? "s" : ""}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_auto] xl:items-center">
          <div className="rounded-[20px] border border-white/70 bg-white/88 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:border-white/8 dark:bg-white/4 dark:shadow-none">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">
                  Current focus
                </p>
                <p className="mt-2 truncate text-sm font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">
                  {currentFocus?.title ?? "No active task"}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                  {currentFocus?.project_name ?? "No project assigned"}
                </p>
              </div>
              <div className="rounded-full border border-sky-100 bg-sky-50/80 px-2 py-0.5 text-[9px] font-semibold tracking-[0.14em] text-sky-700 uppercase dark:border-sky-400/15 dark:bg-sky-400/10 dark:text-sky-200">
                Focus
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={FolderKanban} label="Projects" value={formatNumber(member.active_projects_count)} accent="sky" />
            <Metric icon={ListTodo} label="Tasks" value={formatNumber(member.active_tasks_count)} accent="indigo" />
            <Metric icon={CircleAlert} label="Risk" value={formatNumber(pressureCount)} accent={pressureCount ? "rose" : "slate"} />
          </div>

          <div className="inline-flex items-center justify-end gap-2 text-sm font-medium text-slate-700 transition-colors group-hover:text-[#244b86] dark:text-slate-200 dark:group-hover:text-sky-300">
            View profile
            <span className="flex size-8 items-center justify-center rounded-full border border-border/70 bg-white/75 dark:border-white/10 dark:bg-white/5">
              <ArrowRight className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: string;
  accent: "sky" | "indigo" | "rose" | "slate";
}) {
  const accentTone =
    accent === "sky"
      ? "border-sky-100/80 bg-sky-50/80 text-sky-700 dark:border-sky-400/15 dark:bg-sky-400/10 dark:text-sky-200"
      : accent === "indigo"
        ? "border-indigo-100/80 bg-indigo-50/80 text-indigo-700 dark:border-indigo-400/15 dark:bg-indigo-400/10 dark:text-indigo-200"
        : accent === "rose"
          ? "border-rose-100/80 bg-rose-50/80 text-rose-700 dark:border-rose-400/15 dark:bg-rose-400/10 dark:text-rose-200"
          : "border-slate-200/80 bg-slate-100/80 text-slate-700 dark:border-slate-700/70 dark:bg-slate-800/60 dark:text-slate-200";

  return (
    <div className="rounded-[20px] border border-white/70 bg-white/82 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-white/8 dark:bg-white/4 dark:shadow-none">
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-semibold tracking-[0.14em] uppercase ${accentTone}`}>
        <Icon className="size-3" />
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold tracking-[-0.05em] text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
