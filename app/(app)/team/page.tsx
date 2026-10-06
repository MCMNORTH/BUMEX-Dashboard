import Link from "next/link";
import { ArrowRight, CircleAlert, FolderKanban, Sparkles, UsersRound } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { TeamFilters } from "@/components/team/team-filters";
import { TeamMemberCard } from "@/components/team/team-member-card";
import { TeamToast } from "@/components/team/team-toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth/server";
import { formatNumber } from "@/lib/formatters";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getTeamCapacitySummary, getTeamFiltersData, getTeamMembers } from "@/lib/team/service";
import type { TeamFilters as TeamFiltersType, TeamMemberRecord } from "@/types/team";

const TEAM_PAGE_TIMEOUT_MS = 4_000;

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = TEAM_PAGE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Team page request timed out.")), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function buildAssignmentSummary(members: TeamMemberRecord[]) {
  return {
    visiblePeople: members.length,
    readyNow: members.filter((member) => member.assignment_state === "available").length,
    inDelivery: members.filter((member) => member.active_projects_count > 0 || member.active_tasks_count > 0).length,
    activeTasks: members.reduce((sum, member) => sum + member.active_tasks_count, 0),
    attention: members.filter((member) => member.assignment_state === "attention").length,
  };
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireRouteAccess("team");
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";
  const params = (await searchParams) ?? {};

  const filters: TeamFiltersType = {
    search: getString(params.search) ?? "",
    role: (getString(params.role) as TeamFiltersType["role"]) ?? "",
    teamId: getString(params.team) ?? "",
    availability: (getString(params.availability) as TeamFiltersType["availability"]) ?? "",
    workload: (getString(params.workload) as TeamFiltersType["workload"]) ?? "",
    assignment: (getString(params.assignment) as TeamFiltersType["assignment"]) ?? "",
  };

  const isShareholder = auth.role === "shareholder";
  const [filterDataResult, membersResult, summaryResult] = await Promise.allSettled([
    withTimeout(getTeamFiltersData()),
    isShareholder ? Promise.resolve([]) : withTimeout(getTeamMembers(auth.role, filters)),
    isShareholder ? withTimeout(getTeamCapacitySummary(auth.role)) : Promise.resolve(null),
  ]);

  const filterData = filterDataResult.status === "fulfilled" ? filterDataResult.value : { teams: [] };
  const members = membersResult.status === "fulfilled" ? membersResult.value : [];
  const summary = summaryResult.status === "fulfilled" ? summaryResult.value : null;

  const assignmentSummary = buildAssignmentSummary(members);
  const attentionMembers = members
    .filter((member) => member.assignment_state === "attention" || member.workload_level === "high" || member.workload_level === "critical" || member.overdue_tasks_count > 0 || member.blocked_tasks_count > 0)
    .sort((left, right) => (right.blocked_tasks_count + right.overdue_tasks_count) - (left.blocked_tasks_count + left.overdue_tasks_count) || right.workload_score - left.workload_score)
    .slice(0, 4);
  return (
    <div className="space-y-6">
      <TeamToast />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          eyebrow={isFr ? "Équipe" : "Team"}
          title={
            isShareholder
              ? (isFr
                  ? "Une vue exécutive légère de l'activité l'équipe et la pression opérationnelle."
                  : "A light executive view of team activity and operational pressure.")
              : (isFr
                  ? "Voyez instantanément qui travaille sur quoi, est chargé et peut prendre la prochaine mission."
                  : "See instantly who is working on what, how loaded they are, and can take the next mission.")
          }
          subtitle={
            isShareholder
              ? (isFr
                  ? "L'accès reste limité à des signaux synthétiques sur les effectifs et l'exécution."
                  : "Access stays limited to summary-level staffing and execution signals.")
              : (isFr
                  ? "Cet espace se concentre sur les affectations actives, le focus actuel et progrès visibles pour simplifier l'allocation des missions."
                  : "This workspace is centered on active assignments, current focus, and visible progress so mission allocation stays simple.")
          }
        />
        <Badge
          variant="secondary"
          className="w-fit rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-primary dark:border-primary/25 dark:bg-primary/12"
        >
          {isShareholder ? (isFr ? "Mode synthèse" : "Summary mode") : (isFr ? "Vue orientée affectations" : "Assignment-first view")}
        </Badge>
      </div>

      {isShareholder ? (
        <div className="grid gap-4 xl:grid-cols-4">
          <SignalCard icon={UsersRound} label={isFr ? "Personnes visibles" : "Visible people"} value={formatNumber(summary?.headcount ?? 0)} detail={isFr ? "Profils visibles dans le périmètre exécutif" : "Profiles in executive scope"} />
          <SignalCard icon={FolderKanban} label={isFr ? "Projets actifs" : "Active projects"} value={formatNumber(summary?.activeProjects ?? 0)} detail={isFr ? "Personnes actuellement engagées" : "People currently engaged"} />
          <SignalCard icon={Sparkles} label={isFr ? "Tâches ouvertes" : "Open tasks"} value={formatNumber(summary?.activeTasks ?? 0)} detail={isFr ? "Charge d'exécution visible" : "Visible execution load"} />
          <SignalCard icon={CircleAlert} label={isFr ? "À surveiller" : "Needs attention"} value={formatNumber(summary?.overloaded ?? 0)} detail={isFr ? "Points de pression à revoir" : "Pressure points to review"} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-4">
            <SignalCard href="/team" icon={UsersRound} label={isFr ? "Personnes visibles" : "Visible people"} value={formatNumber(assignmentSummary.visiblePeople)} detail={isFr ? "Personnes que vous pouvez revoir maintenant" : "People you can review now"} />
            <SignalCard href="/team?assignment=available" icon={Sparkles} label={isFr ? "Prêtes maintenant" : "Ready now"} value={formatNumber(assignmentSummary.readyNow)} detail={isFr ? "Meilleurs candidats pour un nouveau travail" : "Best candidates for new work"} />
            <SignalCard href="/team?assignment=engaged" icon={FolderKanban} label={isFr ? "En livraison" : "In delivery"} value={formatNumber(assignmentSummary.inDelivery)} detail={isFr ? "Personnes déjà actives sur des missions" : "People already active on missions"} />
            <SignalCard href="/team?assignment=attention" icon={CircleAlert} label={isFr ? "À surveiller" : "Needs attention"} value={formatNumber(assignmentSummary.attention)} detail={isFr ? "Blocages ou retards à traiter" : "Blocked or overdue pressure"} />
          </div>

          <TeamFilters filters={filters} filterData={filterData} />

          {attentionMembers.length ? <section className="bg-danger/10 overflow-hidden rounded-xl border border-danger/25 shadow-[var(--shadow-soft)] dark:border-danger/20" aria-labelledby="team-pressure-title"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-danger/70 px-5 py-4 dark:border-danger/15"><div><p className="text-xs font-semibold uppercase tracking-wider text-danger">{isFr ? "Capacité sous pression" : "Capacity pressure"}</p><h2 id="team-pressure-title" className="mt-1 text-lg font-semibold">{isFr ? "Profils à examiner" : "People to review"}</h2><p className="mt-1 text-xs text-muted-foreground">{isFr ? "Blocages et retards d’abord, puis niveaux de charge élevés." : "Blockers and overdue work first, followed by high workload."}</p></div><Badge variant="secondary" className="rounded-full px-3 py-1">{attentionMembers.length} {isFr ? "profil(s)" : "people"}</Badge></div><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">{attentionMembers.map((member) => { const incidents = member.blocked_tasks_count + member.overdue_tasks_count; return <Link key={member.id} href={`/team/${member.id}`} className="group rounded-xl border border-danger/80 bg-card p-4 transition hover:-translate-y-0.5 hover:border-danger/35 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-danger/20"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">{incidents ? `${incidents} ${isFr ? "incident(s)" : "issue(s)"}` : `${member.workload_score}%`}</span><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div><p className="mt-3 truncate text-sm font-semibold">{member.full_name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{member.job_title ?? (isFr ? "Membre de l’équipe" : "Team member")}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-danger/15 dark:bg-danger/50"><div className="bg-warning h-full rounded-full" style={{ width: `${Math.min(100, member.workload_score)}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">{isFr ? "Charge calculée" : "Calculated workload"} · {member.workload_score}%</p></Link>; })}</div></section> : null}

          {members.length ? (
            <div className="grid gap-3">
              {members.map((member) => (
                <TeamMemberCard key={member.id} member={member} />
              ))}
            </div>
          ) : (
            <Card className="rounded-xl border border-border/70 bg-card shadow-[var(--shadow-soft)]">
              <CardContent className="px-6 py-10 text-sm text-muted-foreground">
                {isFr ? "Aucun membre de l'équipe ne correspond aux filtres actuels." : "No team members match the current filters."}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SignalCard({
  icon: Icon,
  label,
  value,
  detail,
  href,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
  detail: string;
  href?: string;
}) {
  const card = <Card className="h-full rounded-xl border border-border/70 bg-card shadow-[var(--shadow-soft)] transition group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-lg dark:border-white/10 dark:shadow-none dark:group-hover:border-primary/30">
      <CardContent className="px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-foreground">{value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
          </div>
          <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-sm">
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>;
  return href ? <Link href={href} aria-label={`${label}: ${value}`} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{card}</Link> : card;
}
