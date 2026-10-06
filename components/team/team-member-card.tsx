"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert, FolderKanban, ListTodo } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
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
    tone: "border-success/25 bg-success/10 text-success dark:bg-success/12",
    note: "Available for new work",
  },
  steady: {
    label: "In flow",
    tone: "border-primary/25 bg-primary/10 text-primary dark:bg-primary/12",
    note: "Progress is stable",
  },
  loaded: {
    label: "Loaded",
    tone: "border-warning/25 bg-warning/10 text-warning dark:bg-warning/12",
    note: "Capacity is elevated",
  },
  attention: {
    label: "Attention",
    tone: "border-danger/25 bg-danger/10 text-danger dark:bg-danger/12",
    note: "Needs intervention",
  },
};

export function TeamMemberCard({ member }: { member: TeamMemberRecord }) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const state = assignmentCopy[member.assignment_state];
  const pressureCount = member.overdue_tasks_count + member.blocked_tasks_count;
  const currentFocus = member.current_focus[0];

  return (
    <Link
      href={`/team/${member.id}`}
      className="group block overflow-hidden rounded-xl border border-border/70 bg-card p-4 shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/90 dark:border-white/10 dark:shadow-none dark:hover:border-primary/20"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-11 border border-white/70 bg-white/80 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-slate-900/90 dark:shadow-none">
              <AvatarFallback className="bg-transparent text-xs font-semibold tracking-wider text-slate-700 dark:text-slate-100">
                {getInitials(member.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <p className="truncate text-[1.1rem] font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                {member.full_name}
              </p>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">{member.job_title ?? (isFr ? "Membre de l'équipe" : "Team member")}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={state.tone}>
              {isFr
                ? {
                    available: "Prêt",
                    steady: "En rythme",
                    loaded: "Chargé",
                    attention: "Attention",
                  }[member.assignment_state]
                : state.label}
            </Badge>
            {pressureCount ? (
              <Badge variant="outline" className="rounded-full border-danger/25 bg-danger/10 px-2.5 py-0.5 text-xs text-danger dark:bg-danger/12">
                {isFr ? `${pressureCount} incident${pressureCount > 1 ? "s" : ""}` : `${pressureCount} issue${pressureCount > 1 ? "s" : ""}`}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_auto] xl:items-center">
          <div className="rounded-xl border border-white/70 bg-white/88 px-4 py-3 shadow-[var(--shadow-soft)] dark:border-white/8 dark:bg-white/4 dark:shadow-none">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                  {isFr ? "Focus actuel" : "Current focus"}
                </p>
                <p className="mt-2 truncate text-sm font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">
                  {currentFocus?.title ?? (isFr ? "Aucune tâche active" : "No active task")}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                  {currentFocus?.project_name ?? (isFr ? "Aucun projet assigné" : "No project assigned")}
                </p>
              </div>
              <div className="rounded-full border border-primary/20 bg-primary/80 px-2 py-0.5 text-xs font-semibold tracking-wider text-primary uppercase dark:border-primary/15 dark:bg-primary/10">
                Focus
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={FolderKanban} label={isFr ? "Projets" : "Projects"} value={formatNumber(member.active_projects_count)} accent="sky" />
            <Metric icon={ListTodo} label={isFr ? "Tâches" : "Tasks"} value={formatNumber(member.active_tasks_count)} accent="indigo" />
            <Metric icon={CircleAlert} label={isFr ? "Risque" : "Risk"} value={formatNumber(pressureCount)} accent={pressureCount ? "rose" : "slate"} />
          </div>

          <div className="inline-flex items-center justify-end gap-2 text-sm font-medium text-slate-700 transition-colors group-hover:text-primary dark:text-slate-200">
            {isFr ? "Voir le profil" : "View profile"}
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
      ? "border-primary/80 bg-primary/80 text-primary dark:border-primary/15 dark:bg-primary/10"
      : accent === "indigo"
        ? "border-primary/80 bg-primary/80 text-primary dark:border-primary/15 dark:bg-primary/10"
        : accent === "rose"
          ? "border-danger/80 bg-danger/80 text-danger dark:border-danger/15 dark:bg-danger/10"
          : "border-slate-200/80 bg-slate-100/80 text-slate-700 dark:border-slate-700/70 dark:bg-slate-800/60 dark:text-slate-200";

  return (
    <div className="rounded-xl border border-white/70 bg-white/82 px-3 py-3 shadow-[var(--shadow-soft)] dark:border-white/8 dark:bg-white/4 dark:shadow-none">
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wider uppercase ${accentTone}`}>
        <Icon className="size-3" />
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold tracking-[-0.05em] text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
