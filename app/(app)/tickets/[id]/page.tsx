import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, GitBranch, Sparkles, TimerReset } from "lucide-react";

import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { getCommentsForEntity } from "@/lib/comments/service";
import { getMentionCandidates } from "@/lib/notifications/service";
import { getAvailableTeamMembers, getTeamWorkload } from "@/lib/team/service";
import { formatTicketDate, getTicketDueState } from "@/lib/tickets/helpers";
import { getTicketById, getTicketsFilterData } from "@/lib/tickets/service";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketDetailHeader } from "@/components/tickets/ticket-detail-header";
import { TicketToast } from "@/components/tickets/ticket-toast";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireRouteAccess("tickets");
  const isFr = (await getCurrentLocale()) === "fr";
  const tr = (fr: string, en: string) => isFr ? fr : en;
  const { id } = await params;
  const [ticket, filterData, assigneeWorkloads, suggestedAssignees, comments, mentionCandidates] = await Promise.all([
    getTicketById(id, auth.role),
    getTicketsFilterData(),
    getTeamWorkload(auth.role, auth.profile.id),
    getAvailableTeamMembers(auth.role),
    getCommentsForEntity("ticket", id),
    getMentionCandidates(),
  ]);

  if (!ticket) {
    notFound();
  }

  const canManage = auth.role === "admin" || isManagerLikeRole(auth.role);
  const canUpdate =
    auth.role === "admin"
    || isManagerLikeRole(auth.role)
    || (auth.role === "employee" && ticket.assignee_id === auth.profile.id);
  const estimatedHours = Number(ticket.estimated_hours ?? 0);
  const actualHours = Number(ticket.actual_hours ?? 0);
  const timeUsage = estimatedHours > 0 ? Math.round(actualHours / estimatedHours * 100) : 0;
  const dueState = getTicketDueState(ticket.due_date);
  const nextAction = !ticket.assignee_id
    ? { tone: "violet", title: tr("Désigner un responsable", "Assign an owner"), description: tr("Ce ticket ne peut pas être piloté clairement tant qu’aucun responsable n’est désigné.", "This ticket cannot be managed clearly until an owner is assigned.") }
    : ticket.status === "blocked"
      ? { tone: "rose", title: tr("Documenter et lever le blocage", "Document and remove the blocker"), description: tr("Ajoutez le contexte manquant dans les commentaires, puis mettez à jour le statut.", "Add the missing context in comments, then update the status.") }
      : dueState === "overdue"
        ? { tone: "amber", title: tr("Replanifier l’échéance", "Replan the deadline"), description: tr("L’échéance est dépassée. Confirmez une nouvelle date réaliste avec le responsable.", "The deadline has passed. Confirm a realistic new date with the owner.") }
        : timeUsage > 100
          ? { tone: "amber", title: tr("Revoir l’estimation", "Review the estimate"), description: tr(`Le temps réel atteint ${timeUsage} % de l’estimation. Documentez l’écart avant de poursuivre.`, `Actual time has reached ${timeUsage}% of the estimate. Document the variance before continuing.`) }
          : { tone: "emerald", title: tr("Poursuivre l’exécution", "Continue execution"), description: tr("Le ticket possède un responsable et aucun signal critique immédiat n’est détecté.", "The ticket has an owner and no immediate critical signal is detected.") };
  const workflow = [
    { key: "backlog", label: tr("En attente", "Backlog") },
    { key: "todo", label: tr("À faire", "To do") },
    { key: "in_progress", label: tr("En cours", "In progress") },
    { key: "review", label: tr("En révision", "Review") },
    { key: "done", label: tr("Terminé", "Done") },
  ];
  const workflowStatus = ticket.status === "blocked" ? "in_progress" : ticket.status === "archived" ? "done" : ticket.status;
  const workflowIndex = workflow.findIndex((step) => step.key === workflowStatus);
  const timesheetHref = ticket.project_id && auth.role !== "shareholder"
    ? `/timesheet?${new URLSearchParams({ mode: "mine", project: ticket.project_id, mission: ticket.title }).toString()}`
    : null;

  return (
    <div className="space-y-6">
      <TicketToast />
      <TicketDetailHeader
        ticket={ticket}
        role={auth.role}
        canManage={canManage}
        canUpdate={canUpdate}
        filterData={filterData}
        assigneeWorkloads={assigneeWorkloads}
        suggestedAssignees={suggestedAssignees}
      />

      <Card className={nextAction.tone === "rose" ? "border-rose-200 bg-gradient-to-r from-rose-50 to-orange-50 dark:border-rose-500/20 dark:from-rose-950/20 dark:to-orange-950/15" : nextAction.tone === "amber" ? "border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 dark:border-amber-500/20 dark:from-amber-950/20 dark:to-yellow-950/15" : nextAction.tone === "violet" ? "border-violet-200 bg-gradient-to-r from-violet-50 to-blue-50 dark:border-violet-500/20 dark:from-violet-950/20 dark:to-blue-950/15" : "border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 dark:border-emerald-500/20 dark:from-emerald-950/20 dark:to-cyan-950/15"}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"><div className="flex items-start gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/80 shadow-sm dark:bg-background/60">{nextAction.tone === "emerald" ? <CheckCircle2 className="size-5 text-emerald-600" /> : nextAction.tone === "rose" ? <AlertTriangle className="size-5 text-rose-600" /> : <Sparkles className="size-5 text-violet-600" />}</div><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">{tr("Prochaine action recommandée", "Recommended next action")}</p><h2 className="mt-1 text-lg font-semibold">{nextAction.title}</h2><p className="mt-1 text-sm text-muted-foreground">{nextAction.description}</p></div></div><div className="flex flex-wrap gap-2"><Button asChild variant="secondary"><a href="#ticket-collaboration">{tr("Ajouter une mise à jour", "Add an update")}</a></Button>{timesheetHref ? <Button asChild variant="secondary"><Link href={timesheetHref}><Clock3 className="size-4" />{tr("Déclarer du temps", "Log time")}</Link></Button> : null}{ticket.project ? <Button asChild><Link href={`/projects/${ticket.project.id}`}>{tr("Voir le projet", "View project")}<ArrowRight className="size-4" /></Link></Button> : null}</div></CardContent>
      </Card>

      <Card className="border-border/70 bg-card/72 backdrop-blur-xl"><CardContent className="p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-700 dark:text-blue-300">{tr("Parcours du ticket", "Ticket journey")}</p><h2 className="mt-1 font-semibold">{ticket.status === "blocked" ? tr("Progression interrompue par un blocage", "Progress interrupted by a blocker") : tr("Progression de la demande", "Request progress")}</h2></div>{ticket.status === "blocked" ? <span className="rounded-full bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300">{tr("Action requise", "Action required")}</span> : null}</div><div className="mt-5 grid grid-cols-5 gap-1 sm:gap-2">{workflow.map((step, index) => { const complete = index < workflowIndex || workflowStatus === "done"; const active = index === workflowIndex && workflowStatus !== "done"; return <div key={step.key} className="relative text-center"><div className={`mx-auto grid size-8 place-items-center rounded-full border-2 text-xs font-bold ${complete ? "border-emerald-500 bg-emerald-500 text-white" : active ? ticket.status === "blocked" ? "border-rose-500 bg-rose-500 text-white ring-4 ring-rose-500/10" : "border-blue-600 bg-blue-600 text-white ring-4 ring-blue-500/10" : "border-border bg-background text-muted-foreground"}`}>{complete ? <CheckCircle2 className="size-4" /> : index + 1}</div><p className={`mt-2 text-[10px] font-semibold sm:text-xs ${active ? ticket.status === "blocked" ? "text-rose-700 dark:text-rose-300" : "text-blue-700 dark:text-blue-300" : complete ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{step.label}</p>{index < workflow.length - 1 ? <div className={`absolute left-[calc(50%+1rem)] top-[15px] -z-10 h-0.5 w-[calc(100%-2rem)] ${index < workflowIndex ? "bg-emerald-500" : "bg-border"}`} /> : null}</div>; })}</div></CardContent></Card>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>{tr("Vue d’ensemble du ticket", "Ticket overview")}</CardTitle>
            <CardDescription>
              {tr("Périmètre opérationnel, échéances et contexte projet de ce ticket.", "Operational scope, execution timing, and project context for this ticket.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{tr("Projet", "Project")}</p>
                <p className="mt-2 text-sm font-medium">{ticket.project?.name ?? tr("Non lié", "Not linked")}</p>
                <p className="mt-2 text-xs text-muted-foreground">{ticket.project?.client?.name ?? tr("Aucun client lié", "No client linked")}</p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{tr("Assigné", "Assignee")}</p>
                <p className="mt-2 text-sm font-medium">{ticket.assignee?.full_name ?? tr("Non assigné", "Unassigned")}</p>
                <p className="mt-2 text-xs text-muted-foreground">{ticket.assignee?.role ?? tr("Aucun rôle", "No role")}</p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{tr("Reporteur", "Reporter")}</p>
                <p className="mt-2 text-sm font-medium">{ticket.reporter?.full_name ?? tr("Inconnu", "Unknown")}</p>
                <p className="mt-2 text-xs text-muted-foreground">{formatTicketDate(ticket.created_at)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">{tr("Description", "Description")}</p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {ticket.description || tr("Aucune description n’est disponible pour ce ticket.", "No description is available for this ticket.")}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{tr("Estimation", "Estimate")}</p>
                <p className="mt-2 text-sm font-medium">
                  {ticket.estimated_hours !== null ? `${ticket.estimated_hours.toFixed(1)}h` : tr("Non défini", "Not set")}
                </p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{tr("Réel", "Actual")}</p>
                <p className="mt-2 text-sm font-medium">
                  {ticket.actual_hours !== null ? `${ticket.actual_hours.toFixed(1)}h` : tr("Non défini", "Not set")}
                </p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">GitHub</p>
                {ticket.github_issue_url ? (
                  <Button asChild variant="secondary" className="mt-2 rounded-full px-4">
                    <Link href={ticket.github_issue_url} target="_blank" rel="noreferrer">
                      <GitBranch className="size-4" />
                      {tr("Ouvrir l’incident", "Open issue")}
                    </Link>
                  </Button>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {auth.role === "shareholder" ? tr("Masqué en mode synthèse", "Hidden in summary mode") : tr("Aucun incident GitHub lié", "No GitHub issue linked")}
                  </p>
                )}
              </div>
            </div>

            <div className={`rounded-3xl border p-5 ${estimatedHours === 0 ? "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[.03]" : timeUsage > 100 ? "border-rose-200 bg-gradient-to-r from-rose-50 to-orange-50 dark:border-rose-500/20 dark:from-rose-950/20 dark:to-orange-950/15" : timeUsage >= 80 ? "border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 dark:border-amber-500/20 dark:from-amber-950/20 dark:to-yellow-950/15" : "border-blue-200 bg-gradient-to-r from-cyan-50 to-blue-50 dark:border-blue-500/20 dark:from-cyan-950/20 dark:to-blue-950/15"}`}>
              <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground"><TimerReset className="size-4" />{tr("Budget temps", "Time budget")}</p><p className="mt-2 text-2xl font-semibold">{estimatedHours > 0 ? `${timeUsage}%` : "—"}</p></div><div className="text-right"><p className="text-sm font-semibold">{estimatedHours === 0 ? tr("Estimation requise", "Estimate required") : actualHours > estimatedHours ? tr(`${(actualHours - estimatedHours).toFixed(1)} h de dépassement`, `${(actualHours - estimatedHours).toFixed(1)}h over`) : tr(`${(estimatedHours - actualHours).toFixed(1)} h restantes`, `${(estimatedHours - actualHours).toFixed(1)}h remaining`)}</p><p className="mt-1 text-xs text-muted-foreground">{actualHours.toFixed(1)} h / {estimatedHours.toFixed(1)} h</p></div></div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/80 shadow-inner dark:bg-background/60"><div className={`h-full rounded-full transition-all ${timeUsage > 100 ? "bg-gradient-to-r from-orange-500 to-rose-600" : timeUsage >= 80 ? "bg-gradient-to-r from-yellow-400 to-amber-600" : "bg-gradient-to-r from-cyan-500 to-blue-600"}`} style={{ width: `${Math.min(100, timeUsage)}%` }} /></div>
              <p className="mt-3 text-xs text-muted-foreground">{estimatedHours === 0 ? tr("Ajoutez une estimation pour mesurer l’effort et détecter les dépassements.", "Add an estimate to measure effort and detect overruns.") : timeUsage > 100 ? tr("Le temps réel dépasse l’estimation initiale. Une mise à jour du périmètre ou de l’estimation est recommandée.", "Actual time exceeds the initial estimate. Review the scope or estimate.") : tr("Cette jauge compare le temps réellement déclaré au temps prévu.", "This gauge compares logged time with planned time.")}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>{tr("Historique d’activité", "Activity history")}</CardTitle>
              <CardDescription>
                {auth.role === "shareholder"
                  ? tr("L’accès actionnaire est limité aux synthèses de haut niveau.", "Shareholder access is limited to high-level ticket summaries.")
                  : tr("Dernières mises à jour de ce ticket et de son projet parent.", "Latest updates recorded for this ticket and its parent project.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auth.role === "shareholder" ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  {tr("L’historique détaillé est masqué en mode synthèse.", "Detailed activity history is intentionally hidden in summary mode.")}
                </div>
              ) : (
                <ActivityFeed
                  activities={ticket.activity}
                  title={tr("Historique du ticket", "Ticket history")}
                  description={tr("Changements de statut, d’assignation, de priorité et d’échéance.", "Status, assignment, priority, and due date changes for this ticket.")}
                  embedded
                />
              )}
            </CardContent>
          </Card>

          <div id="ticket-collaboration" className="scroll-mt-24"><CommentsPanel
            comments={comments}
            entityType="ticket"
            entityId={ticket.id}
            returnPath={`/tickets/${ticket.id}`}
            role={auth.role}
            currentUserId={auth.profile.id}
            mentionCandidates={mentionCandidates}
          /></div>

        </div>
      </div>

      <Card className="overflow-hidden border-blue-200/80 bg-gradient-to-r from-blue-50 via-cyan-50/70 to-violet-50/60 dark:border-blue-500/20 dark:from-blue-950/25 dark:via-cyan-950/15 dark:to-violet-950/20">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Clock3 className="size-4 text-primary" /><CardTitle>{tr("Aperçu du projet lié", "Linked project snapshot")}</CardTitle></div>{ticket.project ? <Button asChild size="sm"><Link href={`/projects/${ticket.project.id}`}>{tr("Ouvrir le projet", "Open project")}<ArrowRight className="size-4" /></Link></Button> : null}</div>
          <CardDescription>{tr("Contexte rapide du projet pour garder les décisions liées à la santé de livraison.", "Quick project context so ticket decisions stay connected to delivery health.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{tr("Statut du projet", "Project status")}</p>
            <p className="mt-2 text-sm font-medium">{ticket.project?.status ?? tr("Inconnu", "Unknown")}</p>
          </div>
          <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Client</p>
            <p className="mt-2 text-sm font-medium">{ticket.project?.client?.name ?? tr("Aucun client", "No client")}</p>
          </div>
          <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{tr("Échéance du projet", "Project deadline")}</p>
            <p className="mt-2 text-sm font-medium">{formatTicketDate(ticket.project?.end_date ?? null)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
