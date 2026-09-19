"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  FolderKanban,
  Layers3,
  Plus,
  ShieldAlert,
} from "lucide-react";

import {
  activityFeed,
  atRiskProjects,
  focusToday,
  nextSevenDays,
  overviewKpis,
  projectHealth,
  taskDistribution,
  upcomingDeadlines,
  weeklyProgress,
  workload,
} from "@/data/overview-dashboard";
import { useMounted } from "@/hooks/use-mounted";
import { useRole } from "@/hooks/use-role";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { ChartCard } from "@/components/dashboard/chart-card";
import { InsightCard } from "@/components/dashboard/insight-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { Timeline } from "@/components/dashboard/timeline";
import { useI18n } from "@/components/layout/i18n-provider";
import { cn } from "@/lib/utils";
import type { OverviewDashboardData } from "@/lib/overview/service";

const pieColors = ["#7dd3fc", "#38bdf8", "#818cf8", "#fbbf24"];

function DashboardTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ color?: string; name?: string; value?: number | string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="min-w-40 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/92">
      {label ? <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase dark:text-white/46">{label}</p> : null}
      <div className="mt-2 space-y-1.5">
        {payload.map((item) => (
          <div key={`${item.name}-${item.value}`} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-slate-600 dark:text-white/72">
              <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-medium text-slate-900 dark:text-white">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverviewDashboard({ dashboardData }: { dashboardData?: OverviewDashboardData }) {
  const workloadData = dashboardData?.workload ?? workload;
  const [activeWorkload, setActiveWorkload] = useState<string>(workloadData[2]?.name ?? workloadData[0].name);
  const chartsReady = useMounted();
  const role = useRole();
  const { t } = useI18n();
  const isEmployee = role === "employee";
  const isShareholder = role === "shareholder";
  const isSupervisor = role === "supervisor";
  const canSeeFinanceSignals = role === "admin" || role === "manager" || role === "shareholder";

  const localizedOverviewKpis = overviewKpis.map((item, index) => ({
    ...item,
    ...(dashboardData?.kpis[index] ?? {}),
    title: t(`overview.datasets.kpis.${index}.title`, item.title),
    caption: dashboardData?.kpis[index]?.caption ?? t(`overview.datasets.kpis.${index}.caption`, item.caption),
  }));
  const visibleKpis = canSeeFinanceSignals ? localizedOverviewKpis : localizedOverviewKpis.slice(0, 3);
  const localizedWorkload = workloadData.map((item, index) => ({
    ...item,
    name: dashboardData ? item.name : t(`overview.datasets.workload.${index}`, item.name),
  }));
  const taskDistributionData = dashboardData ? dashboardData.taskDistribution : taskDistribution;
  const localizedTaskDistribution = taskDistributionData.map((item, index) => ({
    ...item,
    name: dashboardData ? item.name : t(`overview.datasets.taskDistribution.${index}`, item.name),
  }));
  const weeklyProgressData = dashboardData?.weeklyProgress ?? weeklyProgress;
  const projectHealthData = dashboardData ? dashboardData.projectHealth : projectHealth;
  const localizedProjectHealth = projectHealthData.map((item, index) => ({
    ...item,
    name: dashboardData ? item.name : t(`overview.datasets.projectHealth.${index}.name`, item.name),
    status: dashboardData ? item.status : t(`overview.datasets.projectHealth.${index}.status`, item.status),
    owner: dashboardData ? item.owner : t(`overview.datasets.projectHealth.${index}.owner`, item.owner),
  }));
  const focusTodayData = dashboardData ? dashboardData.focusToday : focusToday;
  const localizedFocusToday = focusTodayData.map((item, index) => ({
    ...item,
    icon: focusToday[index]?.icon ?? focusToday[0].icon,
    label: dashboardData ? item.label : t(`overview.datasets.focusToday.${index}.label`, item.label),
    title: dashboardData ? item.title : t(`overview.datasets.focusToday.${index}.title`, item.title),
    description: dashboardData ? item.description : t(`overview.datasets.focusToday.${index}.description`, item.description),
  }));
  const focusIcons = canSeeFinanceSignals
    ? localizedFocusToday.map((item) => item.icon)
    : [localizedFocusToday[0]?.icon, localizedFocusToday[1]?.icon, ShieldAlert];
  const activityFeedData = dashboardData ? dashboardData.activityFeed : activityFeed;
  const localizedActivityFeed = activityFeedData.map((item, index) => ({
    ...item,
    title: dashboardData ? item.title : t(`overview.datasets.activityFeed.${index}.title`, item.title),
    description: dashboardData ? item.description : t(`overview.datasets.activityFeed.${index}.description`, item.description),
    actor: dashboardData ? item.actor : t(`overview.datasets.activityFeed.${index}.actor`, item.actor),
  }));
  const atRiskProjectsData = dashboardData ? dashboardData.atRiskProjects : atRiskProjects;
  const localizedAtRiskProjects = atRiskProjectsData.map((item, index) => ({
    ...item,
    icon: atRiskProjects[index]?.icon ?? atRiskProjects[0].icon,
    title: dashboardData ? item.title : t(`overview.datasets.atRiskProjects.${index}.title`, item.title),
    owner: dashboardData ? item.owner : t(`overview.datasets.atRiskProjects.${index}.owner`, item.owner),
    risk: dashboardData ? item.risk : t(`overview.datasets.atRiskProjects.${index}.risk`, item.risk),
    severity: dashboardData ? item.severity : t(`overview.datasets.atRiskProjects.${index}.severity`, item.severity),
  }));
  const upcomingDeadlinesData = dashboardData ? dashboardData.upcomingDeadlines : upcomingDeadlines;
  const localizedUpcomingDeadlines = upcomingDeadlinesData.map((item, index) => ({
    ...item,
    icon: upcomingDeadlines[index]?.icon ?? upcomingDeadlines[0].icon,
    title: dashboardData ? item.title : t(`overview.datasets.upcomingDeadlines.${index}.title`, item.title),
    date: dashboardData ? item.date : t(`overview.datasets.upcomingDeadlines.${index}.date`, item.date),
    detail: dashboardData ? item.detail : t(`overview.datasets.upcomingDeadlines.${index}.detail`, item.detail),
  }));
  const nextSevenDaysData = dashboardData ? dashboardData.nextSevenDays : nextSevenDays;
  const localizedNextSevenDays = nextSevenDaysData.map((item, index) => ({
    ...item,
    day: dashboardData ? item.day : t(`overview.datasets.nextSevenDays.${index}.day`, item.day),
    title: dashboardData ? item.title : t(`overview.datasets.nextSevenDays.${index}.title`, item.title),
    theme: dashboardData ? item.theme : t(`overview.datasets.nextSevenDays.${index}.theme`, item.theme),
  }));
  const portfolioHealth = localizedProjectHealth.length
    ? Math.round(localizedProjectHealth.reduce((total, project) => total + project.health, 0) / localizedProjectHealth.length)
    : 100;
  const activeRisks = localizedAtRiskProjects.filter((project) => project.severity.toLowerCase() !== "stable").length;
  const primaryFocus = localizedFocusToday.slice(0, 3);

  return (
    <div className="space-y-7">
      <section className="relative isolate overflow-hidden rounded-[28px] border border-[#274f98]/40 bg-[linear-gradient(118deg,#091b43_0%,#123b78_48%,#55219b_100%)] px-5 py-6 text-white shadow-[0_24px_60px_rgba(27,61,129,0.22)] sm:px-7 sm:py-7 dark:border-blue-400/20 dark:shadow-none">
        <div className="pointer-events-none absolute -top-32 right-[-5rem] size-80 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 left-[35%] size-72 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-cyan-100/90 uppercase">
                <span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_0_5px_rgba(110,231,183,0.13)]" />
                Centre de pilotage BUMEX
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.045em] sm:text-[2.4rem]">Vue générale</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-blue-50/84">
                Une lecture claire de l’activité, des priorités et de la capacité de l’équipe pour décider vite et agir au bon moment.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/projects" className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[12px] font-semibold text-[#133572] shadow-sm transition-transform hover:-translate-y-0.5">
                <FolderKanban className="size-4" /> Projets
              </Link>
              <Link href="/tickets" className="inline-flex items-center gap-2 rounded-xl border border-white/18 bg-white/10 px-3.5 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/18">
                <ClipboardList className="size-4" /> Tickets
              </Link>
              <Link href="/projects" className="inline-flex items-center gap-2 rounded-xl border border-cyan-200/20 bg-cyan-300/12 px-3.5 py-2.5 text-[12px] font-semibold text-cyan-50 transition-colors hover:bg-cyan-300/18">
                <Plus className="size-4" /> Nouveau projet
              </Link>
            </div>
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-bold tracking-[0.15em] text-blue-100/72 uppercase">Santé du portefeuille</p>
              <div className="mt-1.5 flex items-end justify-between gap-3"><span className="text-2xl font-bold tracking-tight">{portfolioHealth}%</span><CheckCircle2 className="mb-1 size-4 text-emerald-300" /></div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-bold tracking-[0.15em] text-blue-100/72 uppercase">Points à suivre</p>
              <div className="mt-1.5 flex items-end justify-between gap-3"><span className="text-2xl font-bold tracking-tight">{activeRisks}</span><CircleAlert className="mb-1 size-4 text-amber-200" /></div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-bold tracking-[0.15em] text-blue-100/72 uppercase">Rythme à 7 jours</p>
              <div className="mt-1.5 flex items-end justify-between gap-3"><span className="text-2xl font-bold tracking-tight">{localizedNextSevenDays.length}</span><CalendarDays className="mb-1 size-4 text-cyan-200" /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200/90 bg-gradient-to-br from-white via-white to-blue-50/65 p-4 shadow-[var(--shadow-soft)] dark:border-white/10 dark:from-[#171d2b] dark:via-[#171d2b] dark:to-[#182444] dark:shadow-none sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-[0.18em] text-blue-600 uppercase dark:text-sky-300">À piloter maintenant</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Les prochains gestes utiles</h2>
          </div>
          <Link href="/tickets" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-700 transition-colors hover:text-blue-900 dark:text-sky-300 dark:hover:text-sky-200">Voir le travail en cours <ArrowRight className="size-3.5" /></Link>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {primaryFocus.map((item, index) => {
            const Icon = focusIcons[index] ?? item.icon;
            const routes = ["/projects", "/tickets", "/planning"];
            const tones = ["border-blue-200 bg-blue-50/75 dark:border-blue-400/15 dark:bg-blue-500/10", "border-violet-200 bg-violet-50/75 dark:border-violet-400/15 dark:bg-violet-500/10", "border-amber-200 bg-amber-50/75 dark:border-amber-400/15 dark:bg-amber-500/10"];
            return (
              <Link key={item.title} href={routes[index] ?? "/tickets"} className={cn("group rounded-2xl border p-4 transition-transform hover:-translate-y-0.5", tones[index] ?? tones[0])}>
                <div className="flex items-start justify-between gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-white/85 text-blue-700 shadow-sm dark:bg-white/10 dark:text-sky-200"><Icon className="size-4" /></div><ArrowRight className="mt-1 size-4 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-white/45" /></div>
                <p className="mt-4 text-[10px] font-bold tracking-[0.15em] text-slate-500 uppercase dark:text-white/55">{item.label}</p>
                <h3 className="mt-1 text-[15px] font-semibold tracking-[-0.02em]">{item.title}</h3>
                <p className="mt-1.5 text-[12px] leading-5 text-slate-600 dark:text-slate-300">{item.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold tracking-[0.18em] text-blue-600 uppercase dark:text-sky-300">{t("overview.sections.kpis", "KPIs")}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">{t("overview.sections.performancePulse", "Operational performance pulse")}</h2>
          </div>
          <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-emerald-700 uppercase dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200 sm:inline-flex">Données en direct</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {visibleKpis.map((item, index) => (
            <StatCard key={item.title} {...item} index={index} />
          ))}
        </div>
      </section>

      <section>
        <ChartCard
          title={
            isEmployee
              ? t("overview.sections.assignedWorkload", "Assigned team workload")
              : isSupervisor
                ? t("overview.sections.entityWorkload", "Entity workload visualization")
                : t("overview.sections.teamWorkload", "Team workload visualization")
          }
          description={t("overview.sections.workloadDescription", "Current effort allocation across operational units, with hover-driven emphasis for fast comparisons.")}
          badge={t("overview.misc.risks", "Risks")}
          className="overflow-hidden border-cyan-200/80 bg-[linear-gradient(135deg,#ecfbff_0%,#f8fcff_48%,#eef2ff_100%)] dark:border-cyan-400/15 dark:bg-[linear-gradient(135deg,#102b3a_0%,#171d2b_52%,#202346_100%)]"
        >
          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="h-[13.5rem] min-w-0 rounded-[20px] border border-cyan-200/80 bg-[radial-gradient(circle_at_50%_100%,#dbeafe_0%,#effbff_50%,#ffffff_100%)] p-2.5 shadow-inner dark:border-cyan-400/15 dark:bg-[radial-gradient(circle_at_50%_100%,#17375b_0%,#142437_48%,#182034_100%)]">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <RadialBarChart
                    data={localizedWorkload}
                    innerRadius="30%"
                    outerRadius="100%"
                    startAngle={180}
                    endAngle={0}
                    barSize={11}
                    cx="50%"
                    cy="88%"
                  >
                    <Tooltip content={<DashboardTooltip />} />
                    <RadialBar background dataKey="capacity" fill="rgba(148,163,184,0.12)" cornerRadius={18} />
                    <RadialBar dataKey="workload" cornerRadius={18}>
                      {localizedWorkload.map((team) => (
                        <Cell
                          key={team.name}
                          fill={activeWorkload === team.name ? "#7dd3fc" : "rgba(125,211,252,0.52)"}
                          onMouseEnter={() => setActiveWorkload(team.name)}
                        />
                      ))}
                    </RadialBar>
                  </RadialBarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full rounded-[20px] bg-white/55 dark:bg-white/[0.05]" />
              )}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {localizedWorkload.map((team) => {
                const active = activeWorkload === team.name;

                return (
                  <button
                    key={team.name}
                    type="button"
                    onMouseEnter={() => setActiveWorkload(team.name)}
                    onFocus={() => setActiveWorkload(team.name)}
                    className={cn(
                      "rounded-[18px] border px-3 py-2.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5",
                      active
                        ? "border-blue-300 bg-[linear-gradient(135deg,#dbeafe_0%,#eef6ff_100%)] text-slate-900 dark:border-sky-400/30 dark:bg-[linear-gradient(135deg,#153a57_0%,#1c3151_100%)] dark:text-sky-100"
                        : "border-white bg-white/80 hover:border-blue-200 hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:hover:border-cyan-400/20 dark:hover:bg-white/[0.08]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-medium tracking-[-0.01em]">{team.name}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{t("overview.misc.capacity", "Capacity")} {team.capacity}%</p>
                      </div>
                      <span className="text-[15px] font-semibold tracking-[-0.03em]">{team.workload}%</span>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-secondary/70">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${team.workload}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </ChartCard>
      </section>

      {isShareholder ? null : (
      <section className="grid gap-3 2xl:grid-cols-[1.3fr_0.9fr]">
        <ChartCard
          title={t("overview.sections.weeklyProgress", "Weekly progress chart")}
          description={t("overview.sections.weeklyProgressDescription", "Completed work versus active load through the week.")}
          badge="Insights"
          contentClassName="h-[18rem]"
          className="border-blue-200/80 bg-[linear-gradient(135deg,#eef5ff_0%,#ffffff_60%,#edf2ff_100%)] dark:border-blue-400/15 dark:bg-[linear-gradient(135deg,#142847_0%,#171d2b_58%,#202342_100%)]"
        >
          <div className="h-full min-h-0 min-w-0">
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={weeklyProgressData}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis axisLine={false} tickLine={false} dataKey="day" stroke="#8fa0b8" />
                  <YAxis axisLine={false} tickLine={false} stroke="#8fa0b8" />
                  <Tooltip content={<DashboardTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="completed"
                    stroke="#7dd3fc"
                    strokeWidth={3}
                    dot={{ r: 0 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="active"
                    stroke="#c4b5fd"
                    strokeWidth={2.4}
                    dot={{ r: 0 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
                <div className="h-full rounded-[20px] bg-white/55 dark:bg-white/[0.05]" />
            )}
          </div>
        </ChartCard>

        <ChartCard
          title={t("overview.sections.projectHealth", "Project health indicators")}
          description={t("overview.sections.projectHealthDescription", "Fast read on strategic delivery confidence.")}
          badge="Health"
          className="border-emerald-200/80 bg-[linear-gradient(135deg,#edfff7_0%,#ffffff_62%,#ebfaf4_100%)] dark:border-emerald-400/15 dark:bg-[linear-gradient(135deg,#12342a_0%,#171d2b_60%,#142a27_100%)]"
        >
          <div className="space-y-3">
            {localizedProjectHealth.map((project) => (
              <div
                key={project.name}
                className="rounded-[18px] border border-emerald-100 bg-white/75 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white dark:border-emerald-400/12 dark:bg-white/[0.045] dark:hover:bg-white/[0.075]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium">{project.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{project.owner}</p>
                  </div>
                  <Badge
                    variant={project.health < 70 ? "outline" : "secondary"}
                    className="rounded-full px-3 py-1"
                  >
                    {project.status}
                  </Badge>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${project.health}%` }}
                  />
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{t("overview.misc.healthScore", "Health score")}</span>
                  <span>{project.health}%</span>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </section>
      )}

      <section className="space-y-3">
        <div>
            <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">{t("overview.sections.insights", "Insights")}</p>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
              {isShareholder ? t("overview.sections.strategicFocus", "Strategic focus") : t("overview.sections.focusToday", "Focus today")}
            </h2>
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
          {localizedFocusToday.map((item, index) => (
            <InsightCard key={item.title} {...item} icon={focusIcons[index] ?? item.icon} />
          ))}
        </div>
      </section>

      {isShareholder ? null : (
      <section className="grid gap-3 2xl:grid-cols-[0.95fr_1.15fr_0.9fr]">
        <ChartCard
          title={t("overview.sections.taskDistribution", "Task distribution")}
          description={t("overview.sections.taskDistributionDescription", "Share of work by delivery domain.")}
          badge={t("overview.misc.mix", "Mix")}
          contentClassName="flex min-h-[17.5rem] flex-col"
          className="border-violet-200/80 bg-[linear-gradient(135deg,#f6f1ff_0%,#ffffff_60%,#f0ecff_100%)] dark:border-violet-400/15 dark:bg-[linear-gradient(135deg,#292044_0%,#171d2b_60%,#23203d_100%)]"
        >
          <div className="h-[13rem] min-h-0 min-w-0">
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={localizedTaskDistribution}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={74}
                    paddingAngle={3}
                  >
                    {localizedTaskDistribution.map((entry, index) => (
                      <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<DashboardTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full rounded-[20px] bg-white/55 dark:bg-white/[0.05]" />
            )}
          </div>
          <div className="mt-2.5 grid gap-1.5">
            {localizedTaskDistribution.map((segment, index) => (
              <div key={segment.name} className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: pieColors[index % pieColors.length] }}
                  />
                  <span className="text-muted-foreground">{segment.name}</span>
                </div>
                <span className="font-medium">{segment.value}%</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title={t("overview.sections.activityTimeline", "Activity timeline")}
          description={t("overview.sections.activityTimelineDescription", "Recent movements across the operating system.")}
          badge={t("overview.misc.activity", "Activity")}
          className="border-sky-200/80 bg-[linear-gradient(135deg,#effaff_0%,#ffffff_60%,#edf7ff_100%)] dark:border-sky-400/15 dark:bg-[linear-gradient(135deg,#142d3d_0%,#171d2b_62%,#162b3b_100%)]"
        >
          <ActivityFeed items={localizedActivityFeed} />
        </ChartCard>

        <ChartCard
          title={t("overview.sections.upcomingDeadlines", "Upcoming deadlines")}
          description={t("overview.sections.upcomingDeadlinesDescription", "Events and commitments needing visibility.")}
          badge={t("overview.misc.planning", "Planning")}
          className="border-amber-200/80 bg-[linear-gradient(135deg,#fff9e9_0%,#ffffff_60%,#fff4df_100%)] dark:border-amber-400/15 dark:bg-[linear-gradient(135deg,#352719_0%,#171d2b_62%,#302316_100%)]"
        >
          <Timeline items={localizedUpcomingDeadlines} />
        </ChartCard>
      </section>
      )}

      <section className="grid gap-3 xl:grid-cols-[1fr_1fr]">
        <ChartCard
          title={t("overview.sections.atRiskProjects", "At risk projects")}
          description={t("overview.sections.atRiskProjectsDescription", "Areas requiring executive attention before impact compounds.")}
          badge={t("overview.misc.risks", "Risks")}
          className="border-rose-200/80 bg-[linear-gradient(135deg,#fff1f3_0%,#ffffff_60%,#fff2ed_100%)] dark:border-rose-400/15 dark:bg-[linear-gradient(135deg,#3a1d29_0%,#171d2b_62%,#362018_100%)]"
        >
          <div className="space-y-3">
            {localizedAtRiskProjects.map((project) => {
              const Icon = project.icon;

              return (
                <div
                  key={project.title}
                  className="rounded-[18px] border border-rose-200 bg-white/70 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white dark:border-rose-400/15 dark:bg-white/[0.045] dark:hover:bg-white/[0.075]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-8 items-center justify-center rounded-[14px] border border-red-200 bg-white dark:border-red-400/20 dark:bg-white/[0.05]">
                        <Icon className="size-4 text-red-600" />
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold">{project.title}</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">{project.owner}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="rounded-full px-3 py-1">
                      {project.severity}
                    </Badge>
                  </div>
                  <p className="mt-3 text-[12px] leading-5 text-muted-foreground">{project.risk}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-red-500"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{t("overview.misc.currentResilience", "Current resilience")}</span>
                    <span>{project.progress}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>

        <ChartCard
          title={t("overview.sections.next7Days", "Next 7 days planning")}
          description={t("overview.sections.next7DaysDescription", "A preview of the upcoming operational rhythm.")}
          badge={t("overview.misc.sevenDayView", "7-day view")}
          className="border-indigo-200/80 bg-[linear-gradient(135deg,#eef4ff_0%,#ffffff_60%,#f1efff_100%)] dark:border-indigo-400/15 dark:bg-[linear-gradient(135deg,#162743_0%,#171d2b_62%,#262140_100%)]"
        >
          <div className="grid gap-2.5">
            {localizedNextSevenDays.map((item) => (
              <div
                key={item.day}
                className="group grid gap-2.5 rounded-[18px] border border-indigo-100 bg-white/75 p-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white dark:border-indigo-400/12 dark:bg-white/[0.045] dark:hover:border-indigo-400/25 dark:hover:bg-white/[0.075] sm:grid-cols-[3.5rem_1fr_auto]"
              >
                <div className="flex h-12 items-center justify-center rounded-[14px] border border-slate-200 bg-white text-[12px] font-semibold dark:border-white/10 dark:bg-white/[0.05]">
                  {item.day}
                </div>
                <div>
                  <p className="text-[13px] font-medium">{item.title}</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{item.theme}</p>
                </div>
                <div className="flex items-center">
                  <CalendarRange className="size-3.5 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
          <Separator className="my-4" />
          <div className="flex items-center justify-between rounded-[18px] border border-indigo-100 bg-white/75 px-3 py-2.5 shadow-sm dark:border-indigo-400/12 dark:bg-white/[0.045]">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-[14px] border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.05]">
                <Layers3 className="size-3.5 text-primary" />
              </div>
              <div>
                <p className="text-[13px] font-medium">{t("overview.misc.planningReadiness", "Planning readiness")}</p>
                <p className="text-[11px] text-muted-foreground">{t("overview.misc.planningReadinessDetail", "Structured for future timeline modules")}</p>
              </div>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {t("overview.misc.stable", "Stable")}
            </Badge>
          </div>
        </ChartCard>
      </section>
    </div>
  );
}
