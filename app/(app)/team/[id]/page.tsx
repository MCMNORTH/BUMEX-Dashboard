import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, BarChart3, BriefcaseBusiness, CalendarCheck2, CheckCircle2, Clock3, TimerReset, UserRoundPlus } from "lucide-react";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { CompletedWorkTimeline } from "@/components/team/completed-work-timeline";
import { ContributionByProject } from "@/components/team/contribution-by-project";
import { PageHeader } from "@/components/layout/page-header";
import { PerformanceCard } from "@/components/team/performance-card";
import { TeamMemberDetailHeader } from "@/components/team/team-member-detail-header";
import { TeamMemberForm } from "@/components/team/team-member-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { formatNumber } from "@/lib/formatters";
import { formatDate } from "@/lib/projects/helpers";
import { getTeamMemberById, getUserPerformance } from "@/lib/team/service";
import { getCurrentLocale } from "@/lib/i18n/server";

export default async function TeamMemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireRouteAccess("team");
  const isFr = (await getCurrentLocale()) === "fr";
  const tr = (fr: string, en: string) => isFr ? fr : en;

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
  const canStaff = auth.role === "admin" || isManagerLikeRole(auth.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          eyebrow={tr("Profil collaborateur", "Team profile")}
          title={tr("Une vue complète de la charge, des affectations et des priorités à court terme.", "A connected view of workload, assignments, activity, and near-term execution.")}
          subtitle={tr("Consultez les projets, les tickets, les signaux de capacité et les mouvements opérationnels récents de cette personne.", "Use this profile to understand project exposure, assigned tickets, capacity signals, and recent operational movement.")}
        />
        <div className="flex flex-wrap gap-2">{canStaff ? <Button asChild><Link href={`/staffing?person=${detail.member.id}`}><UserRoundPlus className="size-4" />{tr("Affecter dans Staffing", "Assign in Staffing")}</Link></Button> : null}{canEdit ? <TeamMemberForm member={detail.member} viewerRole={auth.role} currentUserId={auth.profile.id} /> : <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">{tr("Vue annuaire", "Directory view")}</Badge>}</div>
      </div>

      <TeamMemberDetailHeader member={detail.member} isFr={isFr} />

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard label={tr("Projets affectés", "Assigned projects")} value={formatNumber(detail.member.active_projects_count)} icon={BriefcaseBusiness} />
        <MetricCard label={tr("Tickets actifs", "Active tickets")} value={formatNumber(detail.member.active_tasks_count)} icon={Clock3} />
        <MetricCard label={tr("Travail terminé", "Completed work")} value={formatNumber(detail.performancePreview.completedTickets)} icon={CheckCircle2} />
        <MetricCard label={tr("Utilisation", "Utilization")} value={`${detail.performancePreview.utilizationRate}%`} icon={BarChart3} />
      </div>

      {performance ? (
        <>
          <div className="grid gap-4 xl:grid-cols-4">
            <PerformanceCard icon={CalendarCheck2} label={tr("Terminés cette semaine", "Completed this week")} value={formatNumber(performance.completedThisWeek)} detail={tr("Travail livré pendant la semaine", "Delivered work in the current week")} />
            <PerformanceCard icon={CheckCircle2} label={tr("Terminés ce mois", "Completed this month")} value={formatNumber(performance.completedThisMonth)} detail={tr("Production mensuelle visible", "Visible monthly delivery output")} />
            <PerformanceCard icon={Clock3} label={tr("Respect des délais", "On-time rate")} value={`${performance.onTimeCompletionRate}%`} detail={tr("Livraisons réalisées aux dates prévues", "Completion against planned dates")} />
            <PerformanceCard icon={TimerReset} label={tr("Cycle moyen", "Average cycle")} value={`${performance.averageCompletionDays}j`} detail={tr("Durée moyenne entre création et clôture", "Average days from creation to completion")} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <ContributionByProject items={performance.contributionByProject} isFr={isFr} />
            <CompletedWorkTimeline items={performance.recentDeliveredWork} isFr={isFr} />
          </div>
        </>
      ) : (
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="rounded-[24px] border border-dashed border-border/70 bg-background/35 px-6 py-6 text-sm text-muted-foreground">
            {tr("Les indicateurs de performance sont visibles uniquement par les administrateurs, superviseurs, managers et le propriétaire du profil.", "Performance analytics are only visible to administrators, supervisors, managers, or the profile owner.")}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-6 py-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{tr("Projets affectés", "Assigned projects")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{tr("Contexte de livraison actuel", "Current delivery context")}</h2>
            </div>
            {detail.assignedProjects.length ? (
              <div className="space-y-3">
                {detail.assignedProjects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`} className="group block rounded-[22px] border border-border/65 bg-background/38 p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-blue-500/30 dark:hover:bg-blue-500/5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-medium">{project.name}<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></p>
                        <p className="mt-1 text-xs text-muted-foreground">{project.client_name ?? tr("Aucun client", "No client")} / {project.role}</p>
                      </div>
                      <Badge variant="secondary" className="rounded-full px-3 py-1">{project.status}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{tr("Échéance", "Deadline")}: {project.end_date ? formatDate(project.end_date) : tr("Non définie", "Not set")}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyPanel text={tr("Aucun projet affecté n’est visible pour ce profil.", "No assigned projects are visible for this profile.")} />
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-6 py-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{tr("Échéances à venir", "Upcoming deadlines")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{tr("Sept prochains jours", "Next seven days")}</h2>
            </div>
            {(performance?.upcomingDeadlines ?? detail.weeklyPlanning).length ? (
              <div className="space-y-3">
                {(performance?.upcomingDeadlines ?? detail.weeklyPlanning).map((ticket) => (
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="group block rounded-[22px] border border-border/65 bg-background/38 p-4 transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-amber-500/30 dark:hover:bg-amber-500/5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-medium">{ticket.title}<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></p>
                        <p className="mt-1 text-xs text-muted-foreground">{ticket.project_name ?? tr("Aucun projet", "No project")} / {ticket.status}</p>
                      </div>
                      <Badge variant="secondary" className="rounded-full px-3 py-1">{ticket.priority}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{tr("Échéance", "Due")}: {ticket.due_date ? formatDate(ticket.due_date) : tr("Non planifiée", "Not scheduled")}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyPanel text={tr("Aucun ticket n’est planifié dans les sept prochains jours.", "No tickets are scheduled in the next seven days.")} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-6 py-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{tr("Focus actuel", "Current focus")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{tr("Priorités actives visibles", "Visible active priorities")}</h2>
            </div>
            {(performance?.currentFocus ?? detail.assignedTickets).length ? (
              <div className="space-y-3">
                {(performance?.currentFocus ?? detail.assignedTickets).slice(0, 8).map((ticket) => (
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="group block rounded-[22px] border border-border/65 bg-background/38 p-4 transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-violet-500/30 dark:hover:bg-violet-500/5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-medium">{ticket.title}<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></p>
                        <p className="mt-1 text-xs text-muted-foreground">{ticket.project_name ?? tr("Aucun projet", "No project")} / {ticket.status}</p>
                      </div>
                      <Badge variant="secondary" className="rounded-full px-3 py-1">{ticket.priority}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{tr("Mis à jour le", "Updated")} {formatDate(ticket.updated_at)}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyPanel text={tr("Aucun ticket affecté n’est visible pour ce profil.", "No assigned tickets are visible for this profile.")} />
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="px-6 py-6">
            <ActivityFeed
              embedded
              activities={detail.recentActivity}
              title={tr("Activité récente", "Recent activity")}
              description={tr("Mises à jour du profil et événements opérationnels récents liés à ce collaborateur.", "Profile updates and recent operational events connected to this team member.")}
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
