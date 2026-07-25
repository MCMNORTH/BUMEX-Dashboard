import { notFound, redirect } from "next/navigation";
import { BarChart3, BriefcaseBusiness, CalendarCheck2, CheckCircle2, Clock3, TimerReset } from "lucide-react";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { CompletedWorkTimeline } from "@/components/team/completed-work-timeline";
import { ContributionByProject } from "@/components/team/contribution-by-project";
import { PageHeader } from "@/components/layout/page-header";
import { PerformanceCard } from "@/components/team/performance-card";
import { TeamMemberDetailHeader } from "@/components/team/team-member-detail-header";
import { TeamMemberForm } from "@/components/team/team-member-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { formatNumber } from "@/lib/formatters";
import { formatDate } from "@/lib/projects/helpers";
import { getTeamMemberById, getUserPerformance } from "@/lib/team/service";

export default async function TeamMemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireRouteAccess("team");

  if (auth.role === "shareholder") {
    redirect("/team");
  }

  const { id } = await params;
  const detail = await getTeamMemberById(id, auth.role);

  if (!detail) {
    notFound();
  }

  const analyticsAllowed = auth.role === "admin" || isManagerLikeRole(auth.role) || auth.profile.id === detail.member.id;
  const performance = analyticsAllowed ? await getUserPerformance(detail.member.id, auth.role) : null;
  const canEdit = auth.role === "admin" || isManagerLikeRole(auth.role) || auth.profile.id === detail.member.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          eyebrow="Team profile"
          title="A connected view of workload, assignments, activity, and near-term execution."
          subtitle="Use this profile to understand project exposure, assigned tickets, capacity signals, and recent operational movement."
        />
        {canEdit ? (
          <TeamMemberForm member={detail.member} viewerRole={auth.role} currentUserId={auth.profile.id} />
        ) : (
          <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">Directory view</Badge>
        )}
      </div>

      <TeamMemberDetailHeader member={detail.member} />

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard label="Assigned projects" value={formatNumber(detail.member.active_projects_count)} icon={BriefcaseBusiness} />
        <MetricCard label="Active tickets" value={formatNumber(detail.member.active_tasks_count)} icon={Clock3} />
        <MetricCard label="Completed work" value={formatNumber(detail.performancePreview.completedTickets)} icon={CheckCircle2} />
        <MetricCard label="Utilization" value={`${detail.performancePreview.utilizationRate}%`} icon={BarChart3} />
      </div>

      {performance ? (
        <>
          <div className="grid gap-4 xl:grid-cols-4">
            <PerformanceCard icon={CalendarCheck2} label="Completed this week" value={formatNumber(performance.completedThisWeek)} detail="Delivered work in the current week" />
            <PerformanceCard icon={CheckCircle2} label="Completed this month" value={formatNumber(performance.completedThisMonth)} detail="Visible monthly delivery output" />
            <PerformanceCard icon={Clock3} label="On-time rate" value={`${performance.onTimeCompletionRate}%`} detail="Completion against planned dates" />
            <PerformanceCard icon={TimerReset} label="Average cycle" value={`${performance.averageCompletionDays}d`} detail="Average days from creation to completion" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <ContributionByProject items={performance.contributionByProject} />
            <CompletedWorkTimeline items={performance.recentDeliveredWork} />
          </div>
        </>
      ) : (
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="rounded-[24px] border border-dashed border-border/70 bg-background/35 px-6 py-6 text-sm text-muted-foreground">
            Performance analytics are only visible to administrators, supervisors, managers, or the profile owner.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-6 py-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Assigned projects</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">Current delivery context</h2>
            </div>
            {detail.assignedProjects.length ? (
              <div className="space-y-3">
                {detail.assignedProjects.map((project) => (
                  <div key={project.id} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{project.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{project.client_name ?? "No client"} / {project.role}</p>
                      </div>
                      <Badge variant="secondary" className="rounded-full px-3 py-1">{project.status}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">Deadline: {project.end_date ? formatDate(project.end_date) : "Not set"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel text="No assigned projects are visible for this profile." />
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-6 py-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Upcoming deadlines</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">Next seven days</h2>
            </div>
            {(performance?.upcomingDeadlines ?? detail.weeklyPlanning).length ? (
              <div className="space-y-3">
                {(performance?.upcomingDeadlines ?? detail.weeklyPlanning).map((ticket) => (
                  <div key={ticket.id} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{ticket.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{ticket.project_name ?? "No project"} / {ticket.status}</p>
                      </div>
                      <Badge variant="secondary" className="rounded-full px-3 py-1">{ticket.priority}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">Due: {ticket.due_date ? formatDate(ticket.due_date) : "Not scheduled"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel text="No tickets are scheduled in the next seven days." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-6 py-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Current focus</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">Visible active priorities</h2>
            </div>
            {(performance?.currentFocus ?? detail.assignedTickets).length ? (
              <div className="space-y-3">
                {(performance?.currentFocus ?? detail.assignedTickets).slice(0, 8).map((ticket) => (
                  <div key={ticket.id} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{ticket.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{ticket.project_name ?? "No project"} / {ticket.status}</p>
                      </div>
                      <Badge variant="secondary" className="rounded-full px-3 py-1">{ticket.priority}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">Updated {formatDate(ticket.updated_at)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel text="No assigned tickets are visible for this profile." />
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="px-6 py-6">
            <ActivityFeed
              embedded
              activities={detail.recentActivity}
              title="Recent activity"
              description="Profile updates and recent operational events connected to this team member."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof BriefcaseBusiness }) {
  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardContent className="px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
          </div>
          <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45">
            <Icon className="size-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">{text}</div>;
}
