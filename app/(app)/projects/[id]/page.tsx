import { notFound } from "next/navigation";
import { AlertTriangle, Clock3, Gauge, Ticket } from "lucide-react";

import { PlanningRiskPanel } from "@/components/alerts/planning-risk-panel";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { NotesPanel } from "@/components/notes/notes-panel";
import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getProjectRisks } from "@/lib/alerts/service";
import { getCommentsForEntity } from "@/lib/comments/service";
import { getNotesForEntity } from "@/lib/notes/service";
import { getMentionCandidates } from "@/lib/notifications/service";
import { formatCurrency, formatDate } from "@/lib/projects/helpers";
import { getProjectById, getProjectsFilterData } from "@/lib/projects/service";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectDetailHeader } from "@/components/projects/project-detail-header";
import { ProjectHealthBadge } from "@/components/projects/project-health-badge";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { ProjectToast } from "@/components/projects/project-toast";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireRouteAccess("projects");
  const { id } = await params;
  const [project, filterData, comments, notes, mentionCandidates] = await Promise.all([
    getProjectById(id),
    getProjectsFilterData(),
    getCommentsForEntity("project", id),
    getNotesForEntity("project", id),
    getMentionCandidates(),
  ]);

  if (!project) {
    notFound();
  }

  const projectAlerts = await getProjectRisks(project.id);

  const canManage =
    auth.role === "admin" || (isManagerLikeRole(auth.role) && project.owner_id === auth.profile.id);

  return (
    <div className="space-y-6">
      <ProjectToast />
      <ProjectDetailHeader
        project={project}
        role={auth.role}
        canManage={canManage}
        filterData={filterData}
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Project overview</CardTitle>
            <CardDescription>
              Delivery intelligence based on ticket progress, operational pressure, and milestone timing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Progress</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{project.progress}%</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {project.completedTasks} of {project.totalTasks} active tickets completed
                </p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Deadline</p>
                <p className="mt-2 text-sm font-medium">{formatDate(project.end_date)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{project.deadlineState}</p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Budget</p>
                <p className="mt-2 text-sm font-medium">{formatCurrency(project.budget_amount)}</p>
                <p className="mt-2 text-xs text-muted-foreground">Financial summary placeholder ready</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ProjectStatusBadge status={project.status} />
              <ProjectHealthBadge health={project.health} />
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                {project.members.length} active members
              </Badge>
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">Members</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {project.members.length ? (
                  project.members.map((member) => (
                    <div key={member.id} className="rounded-2xl border border-border/65 bg-background/45 p-4">
                      <p className="text-sm font-medium">{member.user?.full_name ?? "Unknown member"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{member.user?.email ?? "No email"}</p>
                      <Badge variant="outline" className="mt-3 rounded-full px-3 py-1">
                        {member.role}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="sm:col-span-2 rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                    No members are linked yet.
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Backlog", value: project.statusBreakdown.backlog },
                { label: "To do", value: project.statusBreakdown.todo },
                { label: "In progress", value: project.statusBreakdown.in_progress },
                { label: "Review", value: project.statusBreakdown.review },
                { label: "Blocked", value: project.statusBreakdown.blocked },
                { label: "Done", value: project.statusBreakdown.done },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-border/65 bg-background/38 p-4">
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{item.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Gauge className="size-4 text-primary" />
                <CardTitle>Project health</CardTitle>
              </div>
              <CardDescription>Ticket-driven health based on progress, blockers, urgency, and deadlines.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Current delivery signal</p>
                  <ProjectHealthBadge health={project.health} />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {project.health === "delayed"
                    ? "The deadline has passed while active delivery work is still open."
                    : project.health === "at_risk"
                      ? "Urgent, blocked, or overdue tickets are raising execution risk."
                      : project.health === "warning"
                        ? "The deadline is approaching and current progress needs acceleration."
                        : "The project is moving with a stable delivery profile."}
                </p>
              </div>
            </CardContent>
          </Card>

          <PlanningRiskPanel
            alerts={projectAlerts}
            title="Project alerts"
            subtitle="Focused risk indicators for the current delivery stream."
            compact
          />

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Client information</CardTitle>
              <CardDescription>Commercial relationship snapshot linked to this delivery stream.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-sm font-medium">{project.client?.name ?? "No client linked"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{project.client?.contact_email ?? "No contact email"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-primary" />
                <CardTitle>Overdue tickets</CardTitle>
              </div>
              <CardDescription>Open project work that already passed its due date.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {project.overdueTasks.length ? (
                project.overdueTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="rounded-2xl border border-border/65 bg-background/38 p-4">
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(task.due_date)}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  No overdue tickets in this project.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock3 className="size-4 text-primary" />
                <CardTitle>Upcoming deadlines</CardTitle>
              </div>
              <CardDescription>Next ticket deadlines requiring near-term execution focus.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {project.upcomingDeadlines.length ? (
                project.upcomingDeadlines.map((task) => (
                  <div key={task.id} className="rounded-2xl border border-border/65 bg-background/38 p-4">
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(task.due_date)}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  No upcoming ticket deadlines are visible yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Financial summary</CardTitle>
              <CardDescription>Reserved for payments, billing status, and transfer insights.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                Financial tracking is ready for integration in the next phase.
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Reserved surface for files, approvals, and storage links.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                Documents placeholder ready for project-linked file management.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-primary" />
            <CardTitle>Linked tickets preview</CardTitle>
          </div>
          <CardDescription>Connected ticket view used to calculate delivery progress and pressure.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {project.tasks.length ? (
            project.tasks.slice(0, 6).map((task) => (
              <div key={task.id} className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{task.title}</p>
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {task.status}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Priority {task.priority}</span>
                  <span>Due {formatDate(task.due_date)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
              No linked tickets yet. Ticket preview will populate once operational tasks are connected.
            </div>
          )}
        </CardContent>
      </Card>

      <ActivityFeed
        activities={project.recentActivity}
        title="Recent activity"
        description="Latest project and ticket changes recorded for this delivery stream."
      />

      <NotesPanel
        notes={notes}
        entityType="project"
        entityId={project.id}
        returnPath={`/projects/${project.id}`}
        role={auth.role}
        currentUserId={auth.profile.id}
        title="Project notes"
        description="Structured delivery notes, executive context, and operational follow-up for this project."
      />

      <CommentsPanel
        comments={comments}
        entityType="project"
        entityId={project.id}
        returnPath={`/projects/${project.id}`}
        role={auth.role}
        currentUserId={auth.profile.id}
        mentionCandidates={mentionCandidates}
      />
    </div>
  );
}
