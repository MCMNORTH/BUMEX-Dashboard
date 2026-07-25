import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CircleAlert,
  TrendingUp,
} from "lucide-react";

import { CashFlowChart } from "@/components/finance/cash-flow-chart";
import { FinanceRiskPanel } from "@/components/finance/finance-risk-panel";
import { ShareholderFinanceSummary } from "@/components/finance/shareholder-finance-summary";
import { RelationshipHealthBadge } from "@/components/clients/relationship-health-badge";
import { ProjectHealthBadge } from "@/components/projects/project-health-badge";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatNumber } from "@/lib/formatters";
import type { ClientRecord } from "@/types/client";
import type {
  FinanceOverview,
  FinanceRiskItem,
  MonthlyFinancePoint,
  ShareholderFinanceSummary as ShareholderFinanceSummaryData,
} from "@/types/finance";
import type { ProjectHealth, ProjectStatus } from "@/types/project";

export type ShareholderProjectSummary = {
  id: string;
  name: string;
  status: ProjectStatus;
  health: ProjectHealth;
  progress: number;
  end_date: string | null;
  created_at: string;
  clientName: string | null;
};

export type ShareholderRoadmapSummary = {
  projectId: string;
  projectName: string;
  projectHealth: ProjectHealth;
  milestoneId: string;
  milestoneTitle: string;
  milestoneDate: string;
};

export type ShareholderClientSignal = {
  id: string;
  name: string;
  status: ClientRecord["status"];
  activeProjectsCount: number;
  lastActivityAt: string | null;
};

export type ShareholderExecutiveActivity = {
  id: string;
  title: string;
  description: string;
  date: string;
  href: string;
  label: string;
};

export type ShareholderRenewalSummary = {
  id: string;
  title: string;
  clientName: string | null;
  renewal_date: string | null;
  end_date: string | null;
  daysUntilRenewal: number | null;
};

function formatDate(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getDaysUntil(value: string | null) {
  if (!value) {
    return null;
  }

  const today = new Date();
  const date = new Date(value);
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function getPortfolioMetrics(projects: ShareholderProjectSummary[]) {
  return {
    active: projects.filter((project) => project.status === "active").length,
    completed: projects.filter((project) => project.status === "completed").length,
    delayed: projects.filter((project) => project.health === "delayed").length,
    atRisk: projects.filter((project) => project.health === "at_risk").length,
  };
}

function buildProjectRiskItems(projects: ShareholderProjectSummary[]) {
  return projects
    .filter((project) => project.health === "at_risk" || project.health === "delayed")
    .sort((left, right) => {
      const rank = { delayed: 0, at_risk: 1, warning: 2, healthy: 3 };
      return rank[left.health] - rank[right.health];
    })
    .slice(0, 4);
}

export function ShareholderDashboard({
  projects,
  financeOverview,
  financeSummary,
  monthlyFinance,
  roadmapMilestones,
  clients,
  financeRisks,
  renewalContracts,
  executiveActivity,
}: {
  projects: ShareholderProjectSummary[];
  financeOverview: FinanceOverview;
  financeSummary: ShareholderFinanceSummaryData;
  monthlyFinance: MonthlyFinancePoint[];
  roadmapMilestones: ShareholderRoadmapSummary[];
  clients: ShareholderClientSignal[];
  financeRisks: FinanceRiskItem[];
  renewalContracts: ShareholderRenewalSummary[];
  executiveActivity: ShareholderExecutiveActivity[];
}) {
  const portfolio = getPortfolioMetrics(projects);
  const projectSpotlights = projects
    .slice()
    .sort((left, right) => {
      const rank = { delayed: 0, at_risk: 1, warning: 2, healthy: 3 };
      return rank[left.health] - rank[right.health];
    })
    .slice(0, 4);
  const majorDeadlines = projects
    .filter((project) => project.end_date && project.status !== "completed" && project.status !== "cancelled")
    .sort((left, right) => new Date(left.end_date ?? "").getTime() - new Date(right.end_date ?? "").getTime())
    .slice(0, 4);
  const strategicClients = clients.filter((client) => client.status === "active" && client.activeProjectsCount >= 2);
  const recentClientSignals = clients
    .filter((client) => client.lastActivityAt)
    .sort((left, right) => new Date(right.lastActivityAt ?? "").getTime() - new Date(left.lastActivityAt ?? "").getTime())
    .slice(0, 4);
  const projectRiskItems = buildProjectRiskItems(projects);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="surface-highlight relative overflow-hidden border-border/70 bg-card/78 backdrop-blur-xl">
          <CardHeader className="space-y-4">
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
              Portfolio summary
            </Badge>
            <div className="space-y-2">
              <CardTitle className="max-w-2xl text-3xl leading-tight tracking-[-0.05em]">
                Board-ready visibility across delivery posture, capital exposure, and client concentration.
              </CardTitle>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                This surface stays intentionally high-level: company posture, major timing pressure, and management-approved signals only.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryMetric icon={BriefcaseBusiness} label="Active projects" value={formatNumber(portfolio.active)} tone="sky" />
              <SummaryMetric icon={TrendingUp} label="Completed projects" value={formatNumber(portfolio.completed)} tone="emerald" />
              <SummaryMetric icon={CalendarClock} label="Delayed projects" value={formatNumber(portfolio.delayed)} tone="rose" />
              <SummaryMetric icon={CircleAlert} label="Projects at risk" value={formatNumber(portfolio.atRisk)} tone="amber" />
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              {projectSpotlights.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="rounded-[22px] border border-border/65 bg-background/35 p-4 transition-transform hover:-translate-y-0.5"
                >
                  {/* Only executive-safe project posture is rendered here. Internal ticket/task detail stays out. */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">{project.name}</p>
                      <div className="flex flex-wrap gap-2">
                        <ProjectHealthBadge health={project.health} />
                        <ProjectStatusBadge status={project.status} />
                      </div>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Progress</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{project.progress}%</p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{project.clientName ?? "Internal"}</p>
                      <p>{formatDate(project.end_date)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <ShareholderFinanceSummary summary={financeSummary} />

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader className="space-y-3">
              <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
                Financial summary
              </Badge>
              <CardTitle className="text-xl">Near-term finance timing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <CompactFigure label="Expected revenue" value={formatFinanceCurrency(financeSummary.expectedCollections, "USD")} />
                <CompactFigure label="Received" value={formatFinanceCurrency(financeSummary.revenue, "USD")} />
                <CompactFigure label="Overdue amount" value={formatFinanceCurrency(financeSummary.overdueExposure, "USD")} />
                <CompactFigure label="Outgoing total" value={formatFinanceCurrency(financeSummary.expenses, "USD")} />
              </div>

              <div className="space-y-3">
                {financeOverview.upcomingFinancialDeadlines.slice(0, 4).map((deadline) => (
                  <div key={`${deadline.kind}-${deadline.label}-${deadline.dueDate}`} className="rounded-[20px] border border-border/65 bg-background/35 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{deadline.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {deadline.clientName ? `${deadline.clientName} / ` : ""}
                          {deadline.status.replaceAll("_", " ")}
                        </p>
                      </div>
                      <p className="text-sm font-semibold">{formatFinanceCurrency(deadline.amount, deadline.currency)}</p>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{formatDate(deadline.dueDate)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <CashFlowChart data={monthlyFinance} variant="flow" />

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
              Roadmap summary
            </Badge>
            <CardTitle className="text-xl">Milestones, deadlines, and health posture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <CompactFigure label="Upcoming milestones" value={formatNumber(roadmapMilestones.length)} />
              <CompactFigure label="Major deadlines" value={formatNumber(majorDeadlines.length)} />
              <CompactFigure
                label="Healthy projects"
                value={formatNumber(projects.filter((project) => project.health === "healthy").length)}
              />
            </div>

            <div className="space-y-3">
              {roadmapMilestones.map((milestone) => (
                <Link
                  key={milestone.milestoneId}
                  href="/roadmap"
                  className="flex items-start justify-between gap-3 rounded-[20px] border border-border/65 bg-background/35 p-4 transition-transform hover:-translate-y-0.5"
                >
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{milestone.milestoneTitle}</p>
                    <p className="text-xs text-muted-foreground">{milestone.projectName}</p>
                    <ProjectHealthBadge health={milestone.projectHealth} />
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{formatDate(milestone.milestoneDate)}</p>
                    <p className="mt-2">
                      {getDaysUntil(milestone.milestoneDate) !== null
                        ? `${getDaysUntil(milestone.milestoneDate)} day${getDaysUntil(milestone.milestoneDate) === 1 ? "" : "s"}`
                        : "Not scheduled"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {majorDeadlines.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="rounded-[20px] border border-border/65 bg-background/35 p-4 transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">{project.name}</p>
                      <p className="text-xs text-muted-foreground">{project.clientName ?? "Internal"}</p>
                    </div>
                    <ProjectHealthBadge health={project.health} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{formatDate(project.end_date)}</p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
              Client summary
            </Badge>
            <CardTitle className="text-xl">Relationship concentration and current momentum</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <CompactFigure label="Active clients" value={formatNumber(clients.filter((client) => client.status === "active").length)} />
              <CompactFigure label="Strategic clients" value={formatNumber(strategicClients.length)} />
              <CompactFigure label="Recent signals" value={formatNumber(recentClientSignals.length)} />
            </div>

            <div className="space-y-3">
              {recentClientSignals.map((client) => (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="flex items-start justify-between gap-3 rounded-[20px] border border-border/65 bg-background/35 p-4 transition-transform hover:-translate-y-0.5"
                >
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{client.name}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-full border-sky-400/20 bg-sky-400/8 text-[11px] uppercase">
                        {client.status}
                      </Badge>
                      {client.activeProjectsCount >= 2 ? (
                        <RelationshipHealthBadge health="healthy" />
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{client.activeProjectsCount} active project{client.activeProjectsCount === 1 ? "" : "s"}</p>
                    <p className="mt-2">{formatDate(client.lastActivityAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
              Executive activity
            </Badge>
            <CardTitle className="text-xl">Recent board-level movement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {executiveActivity.length ? (
              executiveActivity.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-start justify-between gap-3 rounded-[20px] border border-border/65 bg-background/35 p-4 transition-transform hover:-translate-y-0.5"
                >
                  <div className="space-y-2">
                    <Badge variant="outline" className="rounded-full border-border/70 bg-background/45 text-[11px] uppercase">
                      {item.label}
                    </Badge>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {formatDate(item.date)}
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                No recent executive activity is visible in the current scope.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
              Project risks
            </Badge>
            <CardTitle className="text-xl">Delivery posture needing attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {projectRiskItems.length ? (
              projectRiskItems.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="block rounded-[20px] border border-border/65 bg-background/35 p-4 transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">{project.name}</p>
                      <ProjectHealthBadge health={project.health} />
                    </div>
                    <p className="text-sm font-semibold">{project.progress}%</p>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {project.clientName ?? "Internal"} / deadline {formatDate(project.end_date)}
                  </p>
                </Link>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                No material project risk is visible in the current portfolio.
              </div>
            )}
          </CardContent>
        </Card>

        <FinanceRiskPanel items={financeRisks.slice(0, 4)} />

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
              Contract renewal risks
            </Badge>
            <CardTitle className="text-xl">Renewal timing to watch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
              {renewalContracts.length ? (
                renewalContracts.slice(0, 4).map((contract) => (
                  <Link
                    key={contract.id}
                    href={`/contracts/${contract.id}`}
                    className="block rounded-[20px] border border-border/65 bg-background/35 p-4 transition-transform hover:-translate-y-0.5"
                  >
                    {/* Contract summaries deliberately exclude payment terms, references, bank details, and private notes. */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                      <p className="text-sm font-medium">{contract.title}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{contract.clientName ?? "Unlinked client"}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{formatDate(contract.renewal_date ?? contract.end_date)}</p>
                      <p className="mt-2">
                        {contract.daysUntilRenewal !== null
                          ? `${contract.daysUntilRenewal} day${contract.daysUntilRenewal === 1 ? "" : "s"}`
                          : "No date"}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                No contract renewals are currently nearing the executive window.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof BriefcaseBusiness;
  label: string;
  value: string;
  tone: "sky" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100",
    rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100",
  } as const;

  return (
    <div className="flex min-h-36 flex-col justify-between rounded-[22px] border border-border/70 bg-white/70 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.04)] dark:bg-background/35 dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[11px] font-semibold leading-5 tracking-[0.12em] text-slate-600 uppercase dark:text-muted-foreground">{label}</p>
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-2xl border ${tones[tone]}`}>
          <Icon className="size-4.5" />
        </div>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
    </div>
  );
}

function CompactFigure({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/65 bg-background/35 p-4">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-3 whitespace-nowrap text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}
