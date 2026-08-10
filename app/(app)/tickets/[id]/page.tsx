import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock3, GitBranch, Paperclip } from "lucide-react";

import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { getCommentsForEntity } from "@/lib/comments/service";
import { getMentionCandidates } from "@/lib/notifications/service";
import { getAvailableTeamMembers, getTeamWorkload } from "@/lib/team/service";
import { formatTicketDate } from "@/lib/tickets/helpers";
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

          <CommentsPanel
            comments={comments}
            entityType="ticket"
            entityId={ticket.id}
            returnPath={`/tickets/${ticket.id}`}
            role={auth.role}
            currentUserId={auth.profile.id}
            mentionCandidates={mentionCandidates}
          />

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Paperclip className="size-4 text-primary" />
                <CardTitle>{tr("Pièces jointes", "Attachments")}</CardTitle>
              </div>
              <CardDescription>{tr("Espace réservé aux fichiers, captures et éléments de réalisation.", "Reserved space for files, screenshots, and implementation artifacts.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                {tr("La gestion des pièces jointes sera ajoutée dans la phase Documents.", "Attachment handling will be introduced in the documents phase.")}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock3 className="size-4 text-primary" />
            <CardTitle>{tr("Aperçu du projet lié", "Linked project snapshot")}</CardTitle>
          </div>
          <CardDescription>{tr("Contexte rapide du projet pour garder les décisions liées à la santé de livraison.", "Quick project context so ticket decisions stay connected to delivery health.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Project status</p>
            <p className="mt-2 text-sm font-medium">{ticket.project?.status ?? "Unknown"}</p>
          </div>
          <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Client</p>
            <p className="mt-2 text-sm font-medium">{ticket.project?.client?.name ?? "No client"}</p>
          </div>
          <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Project deadline</p>
            <p className="mt-2 text-sm font-medium">{formatTicketDate(ticket.project?.end_date ?? null)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
