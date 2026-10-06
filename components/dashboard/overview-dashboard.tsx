import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  FolderKanban,
  ListTodo,
  Plus,
  TriangleAlert,
} from "lucide-react";

import { ProjectHealthBadge } from "@/components/projects/project-health-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDictionary, getMessage } from "@/lib/i18n/server";
import { formatMessage } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { OverviewAttentionReason, OverviewDashboardData, OverviewUpcomingItem } from "@/lib/overview/service";
import type { AppRole } from "@/types/auth";

type Translate = (key: string, fallback: string, values?: Record<string, string | number>) => string;

function daysFromToday(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function relativeDayLabel(date: string, t: Translate) {
  const days = daysFromToday(date);
  if (days <= 0) return t("overview.dates.today", "Today");
  if (days === 1) return t("overview.dates.tomorrow", "Tomorrow");
  return t("overview.dates.inDays", "In {count} days", { count: days });
}

function formatCompactAmount(amount: number, locale: Locale) {
  try {
    return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
      style: "currency",
      currency: "USD",
      currencyDisplay: "narrowSymbol",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} USD`;
  }
}

function formatShortDate(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short" }).format(new Date(date));
}

type KpiItem = {
  key: string;
  label: string;
  value: string | null;
  caption: string;
  href: string;
  alert?: boolean;
};

function KpiCard({ item, notAvailable }: { item: KpiItem; notAvailable: string }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex flex-col rounded-xl border bg-card p-4 shadow-[var(--shadow-soft)] transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none",
        item.alert ? "border-danger/30" : "border-border",
      )}
    >
      <span className="flex items-start justify-between gap-2 text-sm font-medium text-muted-foreground">
        {item.label}
        <ArrowUpRight className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <span className={cn("mt-1 text-2xl font-semibold tabular-nums", item.alert && "text-danger")}>
        {item.value ?? <span className="text-base font-medium text-muted-foreground">{notAvailable}</span>}
      </span>
      {item.value !== null ? <span className="mt-1 text-xs text-muted-foreground">{item.caption}</span> : null}
    </Link>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="flex-1 p-2">{children}</div>
    </Card>
  );
}

function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
      {label}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

const reasonClasses: Record<OverviewAttentionReason, string> = {
  blocked: "bg-danger/10 text-danger",
  overdue: "bg-danger/10 text-danger",
  urgent: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  unassigned: "bg-muted text-muted-foreground",
};

const upcomingKindClasses: Record<OverviewUpcomingItem["kind"], string> = {
  project: "bg-accent text-accent-foreground",
  ticket: "bg-muted text-foreground",
  invoice: "bg-muted text-foreground",
  payment: "bg-muted text-foreground",
};

export function OverviewDashboard({
  data,
  role,
  locale,
}: {
  data: OverviewDashboardData;
  role: AppRole;
  locale: Locale;
}) {
  const dictionary = getDictionary(locale);
  const t: Translate = (key, fallback, values) => {
    const message = getMessage(dictionary, key, fallback);
    return values ? formatMessage(message, values) : message;
  };
  const isEmployee = role === "employee";
  const isShareholder = role === "shareholder";
  const canCreate = role === "admin" || role === "manager" || role === "supervisor";
  const canSeeTeamWorkload = canCreate;
  const { kpis } = data;

  const attentionTicketsHref = isEmployee ? "/my-work" : "/tickets?attention=1";
  const kpiItems: KpiItem[] = [
    {
      key: "projects",
      label: t("overview.kpis.activeProjects", "Active projects"),
      value: kpis.activeProjects === null ? null : formatNumber(kpis.activeProjects),
      caption: t("overview.kpis.thisMonth", "+{count} this month", { count: kpis.newProjectsThisMonth }),
      href: "/projects?status=active",
    },
    isShareholder
      ? {
          key: "at-risk",
          label: t("overview.kpis.atRiskProjects", "Projects at risk"),
          value: kpis.atRiskProjects === null ? null : formatNumber(kpis.atRiskProjects),
          caption: t("overview.kpis.atRiskCaption", "At risk or delayed"),
          href: "/projects?health=attention",
          alert: Boolean(kpis.atRiskProjects),
        }
      : {
          key: "open-tickets",
          label: t("overview.kpis.openTickets", "Open tickets"),
          value: kpis.openTickets === null ? null : formatNumber(kpis.openTickets),
          caption: t("overview.kpis.thisMonth", "+{count} this month", { count: kpis.newTicketsThisMonth }),
          href: "/tickets",
        },
    isShareholder
      ? {
          key: "completed",
          label: t("overview.kpis.completedThisMonth", "Completed this month"),
          value: kpis.completedThisMonth === null ? null : formatNumber(kpis.completedThisMonth),
          caption: t("overview.kpis.completedCaption", "Tickets moved to done"),
          href: "/tickets?status=done",
        }
      : {
          key: "attention",
          label: t("overview.kpis.needsAttention", "Tickets needing attention"),
          value: kpis.attentionTickets === null ? null : formatNumber(kpis.attentionTickets),
          caption: isEmployee
            ? t("overview.kpis.myAttentionCaption", "Your blocked, overdue or urgent tickets")
            : t("overview.kpis.needsAttentionCaption", "Blocked, overdue, urgent or unassigned"),
          href: attentionTicketsHref,
          alert: Boolean(kpis.attentionTickets),
        },
    kpis.pendingInvoices
      ? {
          key: "invoices",
          label: t("overview.kpis.pendingInvoices", "Pending invoices"),
          value: formatCompactAmount(kpis.pendingInvoices.amount, locale),
          caption: t("overview.kpis.pendingInvoicesCaption", "{count} awaiting payment", { count: kpis.pendingInvoices.count }),
          href: "/finance",
        }
      : {
          key: "completed",
          label: t("overview.kpis.completedThisMonth", "Completed this month"),
          value: kpis.completedThisMonth === null ? null : formatNumber(kpis.completedThisMonth),
          caption: t("overview.kpis.completedCaption", "Tickets moved to done"),
          href: "/tickets?status=done",
        },
  ];
  // A shareholder without finance access would otherwise see "completed" twice.
  const visibleKpis = kpiItems.filter((item, index) => kpiItems.findIndex((other) => other.key === item.key) === index);
  const isUnavailable = (source: OverviewDashboardData["unavailable"][number]) => data.unavailable.includes(source);
  const unavailableMessage = t("overview.kpis.notAvailable", "Not available");
  const attentionTicketCount = kpis.attentionTickets ?? 0;
  const atRiskProjectCount = kpis.atRiskProjects ?? 0;

  return (
    <div className="space-y-4">
      <section className="surface-hero px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("overview.title", "Overview")}</h1>
            <p className="mt-1 text-sm text-white/75">{t("overview.subtitle", "What needs attention today, and what is coming up.")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreate ? (
              <>
                <Button asChild variant="secondary">
                  <Link href="/projects?create=1">
                    <FolderKanban />
                    {t("overview.actions.newProject", "New project")}
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/tickets?create=1">
                    <Plus />
                    {t("overview.actions.newTicket", "New ticket")}
                  </Link>
                </Button>
              </>
            ) : !isShareholder ? (
              <Button asChild variant="secondary">
                <Link href="/my-work">
                  <ListTodo />
                  {t("overview.actions.myWork", "My work")}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {data.unavailable.length ? (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {t("overview.unavailable", "Some data could not be loaded ({sources}). The numbers below may be incomplete.", {
            sources: data.unavailable.map((source) => t(`overview.sources.${source}`, source)).join(", "),
          })}
        </div>
      ) : null}

      <section aria-label={t("overview.kpis.label", "Key numbers")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visibleKpis.map((item) => (
          <KpiCard key={item.key} item={item} notAvailable={t("overview.kpis.notAvailable", "Not available")} />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <AlertTriangle className={cn("size-4", attentionTicketCount + atRiskProjectCount > 0 ? "text-danger" : "text-muted-foreground")} />
          {t("overview.attention.title", "Needs attention")}
        </h2>
        <div className={cn("grid gap-3", !isShareholder && "xl:grid-cols-2")}>
          <SectionCard
            title={t("overview.attention.projects", "Projects at risk")}
            action={atRiskProjectCount > data.attentionProjects.length ? (
              <SectionLink href="/projects?health=attention" label={t("overview.attention.seeAll", "See all ({count})", { count: atRiskProjectCount })} />
            ) : null}
          >
            {data.attentionProjects.length ? (
              <ul>
                {data.attentionProjects.map((project) => (
                  <li key={project.id}>
                    <Link href={`/projects/${project.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-muted">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{project.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {project.owner ?? t("overview.attention.noOwner", "No owner")}
                          {project.endDate ? ` · ${t("overview.attention.due", "Due {date}", { date: formatShortDate(project.endDate, locale) })}` : ""}
                        </span>
                      </span>
                      <ProjectHealthBadge health={project.health} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyRow>{isUnavailable("projects") ? unavailableMessage : t("overview.attention.projectsEmpty", "No project is at risk or delayed.")}</EmptyRow>
            )}
          </SectionCard>

          {isShareholder ? null : (
            <SectionCard
              title={t("overview.attention.tickets", "Tickets")}
              action={attentionTicketCount > 0 ? (
                <SectionLink href={attentionTicketsHref} label={t("overview.attention.seeAll", "See all ({count})", { count: attentionTicketCount })} />
              ) : null}
            >
              {data.attentionTickets.length ? (
                <ul>
                  {data.attentionTickets.map((ticket) => (
                    <li key={ticket.id}>
                      <Link href={`/tickets/${ticket.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-muted">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{ticket.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {ticket.projectName ?? t("overview.attention.noProject", "No project")}
                          </span>
                        </span>
                        <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs font-medium", reasonClasses[ticket.reason])}>
                          {t(`overview.attention.reasons.${ticket.reason}`, ticket.reason)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyRow>{isUnavailable("tickets") ? unavailableMessage : t("overview.attention.ticketsEmpty", "Nothing is blocked, overdue, urgent or unassigned.")}</EmptyRow>
              )}
            </SectionCard>
          )}
        </div>
      </section>

      <section className={cn("grid gap-3", canSeeTeamWorkload && "xl:grid-cols-2")}>
        <SectionCard
          title={t("overview.upcoming.title", "Coming up")}
          subtitle={t("overview.upcoming.subtitle", "Deadlines in the next 14 days")}
          action={<SectionLink href="/calendar" label={t("overview.upcoming.openCalendar", "Open calendar")} />}
        >
          {data.upcoming.length ? (
            <ul>
              {data.upcoming.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted">
                    <span className={cn("flex items-center gap-1.5 text-xs font-medium", daysFromToday(item.date) <= 1 ? "text-foreground" : "text-muted-foreground")}>
                      <CalendarDays className="size-3.5 shrink-0" />
                      {relativeDayLabel(item.date, t)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      {item.context ? <span className="block truncate text-xs text-muted-foreground">{item.context}</span> : null}
                    </span>
                    <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", upcomingKindClasses[item.kind])}>
                      {t(`overview.upcoming.kinds.${item.kind}`, item.kind)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyRow>
              {isUnavailable("projects") && isUnavailable("tickets") ? unavailableMessage : t("overview.upcoming.empty", "No deadline in the next 14 days.")}
            </EmptyRow>
          )}
        </SectionCard>

        {canSeeTeamWorkload ? (
          <SectionCard
            title={t("overview.workload.title", "Team workload")}
            subtitle={t("overview.workload.subtitle", "Most loaded people right now")}
            action={<SectionLink href="/team" label={t("overview.workload.openTeam", "Open team")} />}
          >
            {data.workload.length ? (
              <ul>
                {data.workload.map((person) => {
                  const overloaded = person.risk === "high" || person.utilization > 100;
                  return (
                    <li key={person.id}>
                      <Link href={`/team/${person.id}`} className="block rounded-lg px-2 py-2.5 hover:bg-muted">
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium">{person.name}</span>
                          <span className={cn("text-sm font-semibold tabular-nums", overloaded && "text-danger")}>{person.utilization}%</span>
                        </span>
                        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                          <span
                            className={cn("block h-full rounded-full", overloaded ? "bg-danger" : "bg-primary")}
                            style={{ width: `${Math.min(100, Math.max(0, person.utilization))}%` }}
                          />
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {t("overview.workload.active", "{count} in progress", { count: person.activeItems })}
                          {person.overdueItems ? ` · ${t("overview.workload.overdue", "{count} overdue", { count: person.overdueItems })}` : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyRow>{isUnavailable("workload") ? unavailableMessage : t("overview.workload.empty", "No workload data yet. Assign tickets and set weekly capacity to see it here.")}</EmptyRow>
            )}
          </SectionCard>
        ) : null}
      </section>
    </div>
  );
}
