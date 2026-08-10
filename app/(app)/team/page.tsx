import { CircleAlert, FolderKanban, Sparkles, UsersRound } from "lucide-react";

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
  return (
    <div className="space-y-6">
      <TeamToast />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          eyebrow={isFr ? "Équipe" : "Team"}
          title={
            isShareholder
              ? (isFr
                  ? "Une vue exécutive légère de l'activité de l'équipe et de la pression opérationnelle."
                  : "A light executive view of team activity and operational pressure.")
              : (isFr
                  ? "Voyez instantanément qui travaille sur quoi, qui est chargé et qui peut prendre la prochaine mission."
                  : "See instantly who is working on what, how loaded they are, and who can take the next mission.")
          }
          subtitle={
            isShareholder
              ? (isFr
                  ? "L'accès reste limité à des signaux synthétiques sur les effectifs et l'exécution."
                  : "Access stays limited to summary-level staffing and execution signals.")
              : (isFr
                  ? "Cet espace se concentre sur les affectations actives, le focus actuel et les progrès visibles pour simplifier l'allocation des missions."
                  : "This workspace is centered on active assignments, current focus, and visible progress so mission allocation stays simple.")
          }
        />
        <Badge
          variant="secondary"
          className="w-fit rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/12 dark:text-sky-200"
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
            <SignalCard icon={UsersRound} label={isFr ? "Personnes visibles" : "Visible people"} value={formatNumber(assignmentSummary.visiblePeople)} detail={isFr ? "Personnes que vous pouvez revoir maintenant" : "People you can review now"} />
            <SignalCard icon={Sparkles} label={isFr ? "Prêtes maintenant" : "Ready now"} value={formatNumber(assignmentSummary.readyNow)} detail={isFr ? "Meilleurs candidats pour un nouveau travail" : "Best candidates for new work"} />
            <SignalCard icon={FolderKanban} label={isFr ? "En livraison" : "In delivery"} value={formatNumber(assignmentSummary.inDelivery)} detail={isFr ? "Personnes déjà actives sur des missions" : "People already active on missions"} />
            <SignalCard icon={CircleAlert} label={isFr ? "À surveiller" : "Needs attention"} value={formatNumber(assignmentSummary.attention)} detail={isFr ? "Blocages ou retards à traiter" : "Blocked or overdue pressure"} />
          </div>

          <TeamFilters filters={filters} filterData={filterData} />

          {members.length ? (
            <div className="grid gap-3">
              {members.map((member) => (
                <TeamMemberCard key={member.id} member={member} />
              ))}
            </div>
          ) : (
            <Card className="rounded-[28px] border border-border/70 bg-white/88 shadow-[0_22px_60px_-42px_rgba(37,99,235,0.28)] dark:border-white/10 dark:bg-slate-950/45 dark:shadow-none">
              <CardContent className="px-6 py-10 text-sm text-slate-500 dark:text-slate-400">
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
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="rounded-[28px] border border-border/70 bg-white/94 shadow-[0_24px_60px_-42px_rgba(37,99,235,0.24)] dark:border-white/10 dark:bg-[#161b26] dark:shadow-none">
      <CardContent className="px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-900 dark:text-slate-50">{value}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{detail}</p>
          </div>
          <div className="flex size-11 items-center justify-center rounded-2xl border border-white/80 bg-white/90 text-[#2b5baa] shadow-sm dark:border-white/10 dark:bg-slate-900/80 dark:text-sky-300 dark:shadow-none">
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
