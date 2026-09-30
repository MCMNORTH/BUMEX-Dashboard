import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, FolderKanban, ShieldAlert, Sparkles } from "lucide-react";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { formatNumber } from "@/lib/formatters";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getTicketDueState } from "@/lib/tickets/helpers";
import { getTeamWorkloadPreview, getMyTickets, getTickets, getTicketStats } from "@/lib/tickets/service";
import { getTimesheet } from "@/lib/timesheet/service";
import { formatDuration, weekBounds } from "@/lib/timesheet/validation";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

  const today = new Date().toISOString().slice(0, 10);
  const currentWeek = weekBounds(today)!;
  const [myTickets, allVisibleTickets, timesheet] = await Promise.all([
    getMyTickets(auth.profile.id, auth.role),
    auth.role === "admin" || isManagerLikeRole(auth.role) ? getTickets(auth.role) : Promise.resolve([]),
    auth.role !== "shareholder" ? getTimesheet(currentWeek.start).catch(() => null) : Promise.resolve(null),
  ]);

  const overdueTickets = myTickets.filter((ticket) => getTicketDueState(ticket.due_date) === "overdue" && ticket.status !== "done" && ticket.status !== "archived");
  const dueThisWeek = myTickets.filter((ticket) => getTicketDueState(ticket.due_date) === "soon" && ticket.status !== "done" && ticket.status !== "archived");
  const completedWork = myTickets.filter((ticket) => ticket.status === "done");
  const recentlyUpdated = sortRecentlyUpdated(myTickets).slice(0, 6);
  const stats = getTicketStats(myTickets, auth.profile.id);
  const workload = getTeamWorkloadPreview(allVisibleTickets);
  const loggedMinutes = timesheet?.entries.reduce((sum, entry) => sum + entry.duration_minutes, 0) ?? 0;
  const capacityMinutes = Math.max(auth.profile.weekly_capacity_hours, 1) * 60;
  const timesheetCompletion = Math.min(100, Math.round(loggedMinutes / capacityMinutes * 100));
  const timesheetStatus = timesheet?.weekStatus?.status;
  const actionableTickets = myTickets.filter((ticket) => !["done", "archived"].includes(ticket.status));
  const nextTicket = actionableTickets.find((ticket) => ticket.status === "blocked")
    ?? actionableTickets.find((ticket) => getTicketDueState(ticket.due_date) === "overdue")
    ?? actionableTickets.find((ticket) => ticket.priority === "urgent")
    ?? actionableTickets.find((ticket) => getTicketDueState(ticket.due_date) === "soon")
    ?? actionableTickets.find((ticket) => ticket.status === "in_progress")
    ?? actionableTickets[0];
  const nextTicketSignal = nextTicket?.status === "blocked"
    ? { label: isFr ? "Lever le blocage" : "Remove the blocker", description: isFr ? "Ce travail est bloqué et empêche la progression." : "This work is blocked and preventing progress.", tone: "rose" }
    : nextTicket && getTicketDueState(nextTicket.due_date) === "overdue"
      ? { label: isFr ? "Traiter le retard" : "Address the delay", description: isFr ? "L’échéance est dépassée : vérifiez le périmètre et la nouvelle date." : "The deadline has passed: review scope and the new date.", tone: "rose" }
      : nextTicket?.priority === "urgent"
        ? { label: isFr ? "Priorité urgente" : "Urgent priority", description: isFr ? "Ce ticket porte le niveau de priorité le plus élevé." : "This ticket carries the highest priority level.", tone: "amber" }
        : nextTicket && getTicketDueState(nextTicket.due_date) === "soon"
          ? { label: isFr ? "Préparer l’échéance" : "Prepare the deadline", description: isFr ? "Ce travail arrive prochainement à échéance." : "This work is approaching its deadline.", tone: "blue" }
          : { label: isFr ? "Poursuivre le travail" : "Continue the work", description: isFr ? "C’est le prochain élément actif de votre file personnelle." : "This is the next active item in your personal queue.", tone: "emerald" };

  return (
    <>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <p className="max-w-3xl text-sm text-muted-foreground">
          {isFr
            ? "File personnelle connectée à vos affectations actuelles et à la pression de livraison."
            : "Personal queue connected to your current assignments and delivery pressure."}
        </p>
      </div>

      {auth.role !== "shareholder" ? <Card className="relative overflow-hidden border-cyan-300/25 bg-[linear-gradient(120deg,#071a37_0%,#134a7c_55%,#5b218c_100%)] text-white shadow-[0_28px_80px_-46px_rgba(37,99,235,.85)]">
        <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-fuchsia-400/25 blur-3xl" />
        <CardContent className="relative flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4"><div className="relative grid size-20 shrink-0 place-items-center rounded-full bg-[conic-gradient(#67e8f9_var(--progress),rgba(255,255,255,.14)_0)] p-[6px]" style={{ "--progress": `${timesheetCompletion}%` } as React.CSSProperties}><div className="grid size-full place-items-center rounded-full bg-[#12305b] text-center"><span><strong className="block text-lg">{timesheetCompletion}%</strong><small className="text-[9px] uppercase tracking-wider text-cyan-100/70">{isFr ? "rempli" : "complete"}</small></span></div></div><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-cyan-200"><CalendarDays className="size-4" />{isFr ? "Ma semaine" : "My week"}</p><h2 className="mt-2 text-2xl font-semibold">{formatDuration(loggedMinutes)} <span className="text-sm font-normal text-blue-100/65">/ {auth.profile.weekly_capacity_hours} h</span></h2><p className="mt-1 text-sm text-blue-100/75">{timesheetStatus === "approved" ? (isFr ? "Feuille validée" : "Timesheet approved") : timesheetStatus === "submitted" ? (isFr ? "Feuille envoyée pour validation" : "Timesheet submitted for review") : timesheetStatus === "returned" ? (isFr ? "Corrections demandées" : "Changes requested") : loggedMinutes ? (isFr ? "Saisie en cours" : "Entry in progress") : (isFr ? "Aucun temps déclaré cette semaine" : "No time logged this week")}</p></div></div>
          <div className="flex flex-wrap items-center gap-3"><div className="rounded-2xl border border-white/15 bg-white/[.08] px-4 py-3 text-sm backdrop-blur"><span className="block text-xs text-blue-100/65">{isFr ? "Reste à déclarer" : "Remaining"}</span><strong className="mt-1 block">{formatDuration(Math.max(0, capacityMinutes - loggedMinutes))}</strong></div><Button asChild className="bg-white text-blue-800 hover:bg-cyan-50"><Link href="/timesheet?mode=mine">{isFr ? "Ouvrir ma feuille" : "Open my timesheet"}<ArrowRight className="size-4" /></Link></Button></div>
        </CardContent>
      </Card> : null}

      {nextTicket ? <Card className={`overflow-hidden ${nextTicketSignal.tone === "rose" ? "border-rose-200 bg-gradient-to-r from-rose-50 to-orange-50 dark:border-rose-500/20 dark:from-rose-950/20 dark:to-orange-950/10" : nextTicketSignal.tone === "amber" ? "border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 dark:border-amber-500/20 dark:from-amber-950/20 dark:to-yellow-950/10" : nextTicketSignal.tone === "blue" ? "border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 dark:border-blue-500/20 dark:from-blue-950/20 dark:to-cyan-950/10" : "border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 dark:border-emerald-500/20 dark:from-emerald-950/20 dark:to-cyan-950/10"}`}>
        <CardContent className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-background/80 shadow-sm">{nextTicketSignal.tone === "rose" ? <AlertTriangle className="size-5 text-rose-600" /> : <Sparkles className="size-5 text-violet-600" />}</span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{isFr ? "Prochaine action recommandée" : "Recommended next action"}</p><h2 className="mt-1 truncate text-lg font-semibold">{nextTicketSignal.label} · {nextTicket.title}</h2><p className="mt-1 text-sm text-muted-foreground">{nextTicketSignal.description}{nextTicket.project?.name ? ` · ${nextTicket.project.name}` : ""}</p></div></div><Button asChild><Link href={`/tickets/${nextTicket.id}`}>{isFr ? "Ouvrir le ticket" : "Open ticket"}<ArrowRight className="size-4" /></Link></Button></CardContent>
      </Card> : null}

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
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="group block rounded-[22px] border border-border/65 bg-background/38 p-4 transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-50/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-rose-500/30 dark:hover:bg-rose-500/5">
                    <p className="flex items-center justify-between gap-3 text-sm font-medium"><span>{ticket.title}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></p>
                    <p className="mt-1 text-xs text-muted-foreground">{ticket.project?.name ?? (isFr ? "Aucun projet lié" : "No project linked")}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-50 px-3 py-1 text-rose-700 dark:border-rose-300/10 dark:bg-rose-500/12 dark:text-rose-100">
                        {isFr ? "En retard" : "Overdue"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{ticket.due_date ?? (isFr ? "Aucune date" : "No date")}</span>
                    </div>
                  </Link>
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
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="group block rounded-[22px] border border-border/65 bg-background/38 p-4 transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-amber-500/30 dark:hover:bg-amber-500/5">
                    <p className="flex items-center justify-between gap-3 text-sm font-medium"><span>{ticket.title}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></p>
                    <p className="mt-1 text-xs text-muted-foreground">{ticket.project?.name ?? (isFr ? "Aucun projet lié" : "No project linked")}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 px-3 py-1 text-amber-700 dark:border-amber-300/10 dark:bg-amber-500/12 dark:text-amber-100">
                        {isFr ? "Bientôt dû" : "Due soon"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{ticket.due_date ?? (isFr ? "Aucune date" : "No date")}</span>
                    </div>
                  </Link>
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
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="group block rounded-[22px] border border-border/65 bg-background/38 p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-blue-500/30 dark:hover:bg-blue-500/5">
                    <p className="flex items-center justify-between gap-3 text-sm font-medium"><span>{ticket.title}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></p>
                    <p className="mt-1 text-xs text-muted-foreground">{ticket.project?.name ?? (isFr ? "Aucun projet lié" : "No project linked")}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="rounded-full px-3 py-1">
                        {ticket.status.replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{ticket.updated_at.slice(0, 10)}</span>
                    </div>
                  </Link>
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
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="group block rounded-[22px] border border-border/65 bg-background/38 p-4 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/5">
                    <p className="flex items-center justify-between gap-3 text-sm font-medium"><span>{ticket.title}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></p>
                    <p className="mt-1 text-xs text-muted-foreground">{ticket.project?.name ?? (isFr ? "Aucun projet lié" : "No project linked")}</p>
                  </Link>
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
