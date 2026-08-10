import { Suspense } from "react";
import { CheckCircle2, Clock3, FolderKanban, ShieldAlert } from "lucide-react";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { formatNumber } from "@/lib/formatters";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getTicketDueState } from "@/lib/tickets/helpers";
import { getTeamWorkloadPreview, getMyTickets, getTickets, getTicketStats } from "@/lib/tickets/service";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MyWorkViewPanel } from "@/components/tickets/my-work-view-panel";
import { TicketWorkloadPreview } from "@/components/tickets/ticket-workload-preview";
import { Skeleton } from "@/components/ui/skeleton";
import type { TicketRecord, TicketWorkspaceView } from "@/types/ticket";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sortRecentlyUpdated(tickets: TicketRecord[]) {
  return [...tickets].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export default async function MyWorkPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isFr ? "Mon travail" : "My work"}
        title={
          isFr
            ? "Une vue d'exécution personnelle structurée pour vos livrables assignés."
            : "A structured personal execution view for assigned delivery."
        }
        subtitle={
          isFr
            ? "Suivez vos tickets, isolez la pression des échéances et faites avancer le travail d'un état à l'autre sans quitter l'espace de travail."
            : "Track your own tickets, isolate deadline pressure, and move work across execution states without leaving the workspace."
        }
      />
      <Suspense fallback={<MyWorkPageFallback />}>
        <MyWorkContent searchParams={searchParams} locale={locale} />
      </Suspense>
    </div>
  );
}

async function MyWorkContent({
  searchParams,
  locale,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  locale: "en" | "fr";
}) {
  const isFr = locale === "fr";
  const auth = await requireRouteAccess("my-work");
  const params = (await searchParams) ?? {};
  const requestedView = (getString(params.view) as TicketWorkspaceView) ?? "table";
  const initialView: TicketWorkspaceView = requestedView === "kanban" ? "kanban" : "table";

  const [myTickets, allVisibleTickets] = await Promise.all([
    getMyTickets(auth.profile.id, auth.role),
    auth.role === "admin" || isManagerLikeRole(auth.role) ? getTickets(auth.role) : Promise.resolve([]),
  ]);

  const overdueTickets = myTickets.filter((ticket) => getTicketDueState(ticket.due_date) === "overdue" && ticket.status !== "done" && ticket.status !== "archived");
  const dueThisWeek = myTickets.filter((ticket) => getTicketDueState(ticket.due_date) === "soon" && ticket.status !== "done" && ticket.status !== "archived");
  const completedWork = myTickets.filter((ticket) => ticket.status === "done");
  const recentlyUpdated = sortRecentlyUpdated(myTickets).slice(0, 6);
  const stats = getTicketStats(myTickets, auth.profile.id);
  const workload = getTeamWorkloadPreview(allVisibleTickets);

  return (
    <>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <p className="max-w-3xl text-sm text-muted-foreground">
          {isFr
            ? "File personnelle connectée à vos affectations actuelles et à la pression de livraison."
            : "Personal queue connected to your current assignments and delivery pressure."}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {[
          {
            icon: FolderKanban,
            label: isFr ? "Tickets assignés" : "Assigned tickets",
            value: formatNumber(stats.mine),
            detail: isFr ? "Charge personnelle actuelle" : "Current personal workload",
          },
          {
            icon: ShieldAlert,
            label: isFr ? "En retard" : "Overdue",
            value: formatNumber(overdueTickets.length),
            detail: isFr ? "Nécessite une attention immédiate" : "Needs immediate attention",
          },
          {
            icon: Clock3,
            label: isFr ? "À traiter cette semaine" : "Due this week",
            value: formatNumber(dueThisWeek.length),
            detail: isFr ? "Pression sur les 7 prochains jours" : "Next 7 days pressure",
          },
          {
            icon: CheckCircle2,
            label: isFr ? "Terminés" : "Completed",
            value: formatNumber(completedWork.length),
            detail: isFr ? "Exécution finalisée" : "Finished execution",
          },
        ].map(({ icon: Icon, label, value, detail }) => (
          <Card key={label} className="surface-highlight relative overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45">
                  <Icon className="size-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
          <CardContent className="space-y-4 px-5 py-5">
            <MyWorkViewPanel initialView={initialView} locale={locale} tickets={myTickets} />
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            <CardContent className="space-y-4 px-5 py-5">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Tickets en retard" : "Overdue tickets"}</p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">{isFr ? "Action immédiate" : "Immediate action"}</h3>
              </div>
              {overdueTickets.length ? (
                overdueTickets.slice(0, 5).map((ticket) => (
                  <div key={ticket.id} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
                    <p className="text-sm font-medium">{ticket.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{ticket.project?.name ?? (isFr ? "Aucun projet lié" : "No project linked")}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-50 px-3 py-1 text-rose-700 dark:border-rose-300/10 dark:bg-rose-500/12 dark:text-rose-100">
                        {isFr ? "En retard" : "Overdue"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{ticket.due_date ?? (isFr ? "Aucune date" : "No date")}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  {isFr ? "Aucun ticket en retard ne vous est assigné." : "No overdue tickets are assigned to you."}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            <CardContent className="space-y-4 px-5 py-5">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "À traiter cette semaine" : "Due this week"}</p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">{isFr ? "Focus à court terme" : "Near-term focus"}</h3>
              </div>
              {dueThisWeek.length ? (
                dueThisWeek.slice(0, 5).map((ticket) => (
                  <div key={ticket.id} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
                    <p className="text-sm font-medium">{ticket.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{ticket.project?.name ?? (isFr ? "Aucun projet lié" : "No project linked")}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 px-3 py-1 text-amber-700 dark:border-amber-300/10 dark:bg-amber-500/12 dark:text-amber-100">
                        {isFr ? "Bientôt dû" : "Due soon"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{ticket.due_date ?? (isFr ? "Aucune date" : "No date")}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  {isFr
                    ? "Rien n'est à échéance cette semaine dans votre file actuelle."
                    : "Nothing is due this week in your current queue."}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            <CardContent className="space-y-4 px-5 py-5">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Récemment mis à jour" : "Recently updated"}</p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">{isFr ? "Derniers mouvements" : "Latest movement"}</h3>
              </div>
              {recentlyUpdated.length ? (
                recentlyUpdated.map((ticket) => (
                  <div key={ticket.id} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
                    <p className="text-sm font-medium">{ticket.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{ticket.project?.name ?? (isFr ? "Aucun projet lié" : "No project linked")}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="rounded-full px-3 py-1">
                        {ticket.status.replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{ticket.updated_at.slice(0, 10)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  {isFr ? "Aucune mise à jour récente n'est encore visible." : "No recent updates are visible yet."}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            <CardContent className="space-y-4 px-5 py-5">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Travail terminé" : "Completed work"}</p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">{isFr ? "Récemment clôturés" : "Recently closed"}</h3>
              </div>
              {completedWork.slice(0, 5).length ? (
                completedWork.slice(0, 5).map((ticket) => (
                  <div key={ticket.id} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
                    <p className="text-sm font-medium">{ticket.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{ticket.project?.name ?? (isFr ? "Aucun projet lié" : "No project linked")}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  {isFr
                    ? "Le travail terminé apparaîtra ici une fois que les tickets passeront à l'état terminé."
                    : "Completed work will appear here once tickets move to done."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {(auth.role === "admin" || isManagerLikeRole(auth.role)) && workload.length ? (
        <TicketWorkloadPreview
          workload={workload}
          title={isFr ? "Aperçu de la charge équipe" : "Team workload preview"}
          subtitle={
            isFr
              ? "Lecture rapide de la capacité sur les personnes visibles, de la charge en retard et de la pression d'exécution active."
              : "Quick capacity scan across visible assignees, overdue load, and active execution pressure."
          }
        />
      ) : null}
    </>
  );
}

function MyWorkPageFallback() {
  return (
    <div className="space-y-6" aria-label="Loading my work">
      <div className="flex justify-end">
        <Skeleton className="h-12 w-64 rounded-full" />
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-3">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-9 w-16" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="size-11 rounded-2xl" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
        <CardContent className="space-y-5 px-5 py-5">
          <div className="flex items-center justify-between">
            <div className="space-y-3">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-7 w-52" />
            </div>
            <Skeleton className="h-9 w-24 rounded-full" />
          </div>
          <div className="grid gap-4">
            <Skeleton className="h-28 rounded-[22px]" />
            <Skeleton className="h-28 rounded-[22px]" />
            <Skeleton className="h-28 rounded-[22px]" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
