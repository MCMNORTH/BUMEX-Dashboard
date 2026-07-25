"use client";

import { useState } from "react";
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
import { CalendarRange, Layers3, ShieldAlert } from "lucide-react";

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

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <div>
            <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">{t("overview.sections.kpis", "KPIs")}</p>
            <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.01em]">{t("overview.sections.performancePulse", "Operational performance pulse")}</h2>
          </div>
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
          className="overflow-hidden"
        >
          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="h-[13.5rem] min-w-0 rounded-[16px] border border-slate-200 bg-slate-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
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
                      "rounded-[16px] border px-3 py-2.5 text-left transition-colors duration-200",
                      active
                        ? "border-blue-200 bg-blue-50 text-slate-900 dark:border-sky-400/20 dark:bg-sky-500/12 dark:text-sky-100"
                        : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/16 dark:hover:bg-white/[0.06]",
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
        >
          <div className="space-y-3">
            {localizedProjectHealth.map((project) => (
              <div
                key={project.name}
                className="rounded-[16px] border border-slate-200 bg-slate-50/70 p-2.5 transition-colors duration-200 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
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
        >
          <ActivityFeed items={localizedActivityFeed} />
        </ChartCard>

        <ChartCard
          title={t("overview.sections.upcomingDeadlines", "Upcoming deadlines")}
          description={t("overview.sections.upcomingDeadlinesDescription", "Events and commitments needing visibility.")}
          badge={t("overview.misc.planning", "Planning")}
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
        >
          <div className="space-y-3">
            {localizedAtRiskProjects.map((project) => {
              const Icon = project.icon;

              return (
                <div
                  key={project.title}
                  className="rounded-[16px] border border-red-200 bg-red-50/50 p-3 transition-colors duration-200 hover:bg-red-50"
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
        >
          <div className="grid gap-2.5">
            {localizedNextSevenDays.map((item) => (
              <div
                key={item.day}
                className="group grid gap-2.5 rounded-[16px] border border-slate-200 bg-slate-50/70 p-2.5 transition-colors duration-200 hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/16 dark:hover:bg-white/[0.06] sm:grid-cols-[3.5rem_1fr_auto]"
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
          <div className="flex items-center justify-between rounded-[16px] border border-slate-200 bg-slate-50/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
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
