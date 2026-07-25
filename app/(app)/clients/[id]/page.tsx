import { notFound } from "next/navigation";
import { CircleDollarSign, FileStack, ReceiptText } from "lucide-react";

import { ClientDetailHeader } from "@/components/clients/client-detail-header";
import { ClientHistoryFilters } from "@/components/clients/client-history-filters";
import { ClientSummaryCards } from "@/components/clients/client-summary-cards";
import { ClientTimeline } from "@/components/clients/client-timeline";
import { ClientToast } from "@/components/clients/client-toast";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { NotesPanel } from "@/components/notes/notes-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth/server";
import { getCommentsForEntity } from "@/lib/comments/service";
import { getNotesForEntity } from "@/lib/notes/service";
import { getMentionCandidates } from "@/lib/notifications/service";
import {
  getClientById,
  getClientLinkedContracts,
  getClientLinkedDocuments,
  getClientLinkedTickets,
  getClientRelationshipSummary,
  getClientTimeline,
  getClientsFilterData,
} from "@/lib/clients/service";
import { formatDate } from "@/lib/projects/helpers";
import type { ClientTimelineFilter } from "@/types/client";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireRouteAccess("clients");
  const { id } = await params;
  const urlParams = (await searchParams) ?? {};
  const historyFilter = (getString(urlParams.history) as ClientTimelineFilter | undefined) ?? "all";

  const [client, filterData, summary, linkedContracts, linkedDocuments, linkedTickets, timeline, comments, notes, mentionCandidates] = await Promise.all([
    getClientById(id, auth.role),
    getClientsFilterData(),
    getClientRelationshipSummary(id, auth.role),
    getClientLinkedContracts(id, auth.role),
    getClientLinkedDocuments(id, auth.role),
    getClientLinkedTickets(id, auth.role),
    getClientTimeline(id, auth.role, historyFilter),
    getCommentsForEntity("client", id),
    getNotesForEntity("client", id),
    getMentionCandidates(),
  ]);

  if (!client) {
    notFound();
  }

  const canManage =
    auth.role === "admin" || (auth.role === "manager" && client.account_manager_id === auth.profile.id);

  return (
    <div className="space-y-6">
      <ClientToast />
      <ClientDetailHeader client={client} role={auth.role} canManage={canManage} filterData={filterData} />
      <ClientSummaryCards summary={summary} />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Client overview</CardTitle>
            <CardDescription>
              Relationship context, contact details, delivery pressure, and portfolio status for this account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Status</p>
                <p className="mt-2 text-sm font-medium">{client.status}</p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Type</p>
                <p className="mt-2 text-sm font-medium">{client.type.replaceAll("_", " ")}</p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Last activity</p>
                <p className="mt-2 text-sm font-medium">{formatDate(summary.lastActivityDate)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">Contact information</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                  <p className="text-sm font-medium">Email</p>
                  <p className="mt-1 text-xs text-muted-foreground">{client.contact_email ?? "Not set"}</p>
                </div>
                <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                  <p className="text-sm font-medium">Phone</p>
                  <p className="mt-1 text-xs text-muted-foreground">{client.contact_phone ?? "Not set"}</p>
                </div>
                <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                  <p className="text-sm font-medium">Address</p>
                  <p className="mt-1 text-xs text-muted-foreground">{client.address ?? "Not set"}</p>
                </div>
                <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                  <p className="text-sm font-medium">Tax ID</p>
                  <p className="mt-1 text-xs text-muted-foreground">{client.tax_id ?? "Not set"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Linked projects</p>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {client.linkedProjects.length}
                </Badge>
              </div>
              <div className="mt-4 grid gap-3">
                {client.linkedProjects.length ? (
                  client.linkedProjects.map((project) => (
                    <a key={project.id} href={`/projects/${project.id}`} className="rounded-2xl border border-border/65 bg-background/45 p-4 transition-colors hover:bg-accent/40">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{project.name}</p>
                        <Badge variant="outline" className="rounded-full px-3 py-1">
                          {project.health}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{project.progress}% progress</span>
                        <span>Due {formatDate(project.end_date)}</span>
                      </div>
                    </a>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                    No linked projects are visible yet for this client.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Account manager</CardTitle>
              <CardDescription>Primary ownership and relationship coordination.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-sm font-medium">{client.accountManager?.full_name ?? "Unassigned"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{client.accountManager?.email ?? "No email"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ReceiptText className="size-4 text-primary" />
                <CardTitle>Linked contracts</CardTitle>
              </div>
              <CardDescription>Commercial agreements and renewal exposure for this account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {linkedContracts.length ? (
                linkedContracts.slice(0, 5).map((contract) => (
                  <a key={contract.id} href={`/contracts/${contract.id}`} className="block rounded-2xl border border-border/65 bg-background/38 p-4 transition-colors hover:bg-accent/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{contract.title}</p>
                      <Badge variant="outline" className="rounded-full px-3 py-1">
                        {contract.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {contract.contract_type.replaceAll("_", " ")} / Renewal {formatDate(contract.renewal_date ?? contract.end_date)}
                    </p>
                  </a>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  No linked contracts are visible for this client.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileStack className="size-4 text-primary" />
                <CardTitle>Linked documents</CardTitle>
              </div>
              <CardDescription>Archived and active records connected to this relationship.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {linkedDocuments.length ? (
                linkedDocuments.slice(0, 5).map((document) => (
                  <a key={document.id} href={`/documents?document=${document.id}`} className="block rounded-2xl border border-border/65 bg-background/38 p-4 transition-colors hover:bg-accent/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{document.title}</p>
                      <Badge variant="outline" className="rounded-full px-3 py-1">
                        {document.is_archived ? "archived" : document.visibility}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {document.document_type.replaceAll("_", " ")} / Updated {formatDate(document.updated_at)}
                    </p>
                  </a>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  No linked documents are visible for this client.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CircleDollarSign className="size-4 text-primary" />
                <CardTitle>Linked tickets</CardTitle>
              </div>
              <CardDescription>Operational work already handled for this client.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {linkedTickets.length ? (
                linkedTickets.slice(0, 5).map((ticket) => (
                  <a key={ticket.id} href={`/tickets/${ticket.id}`} className="block rounded-2xl border border-border/65 bg-background/38 p-4 transition-colors hover:bg-accent/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{ticket.title}</p>
                      <Badge variant="outline" className="rounded-full px-3 py-1">
                        {ticket.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {ticket.project?.name ?? "No project"} / Due {formatDate(ticket.due_date)}
                    </p>
                  </a>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  No linked tickets are visible for this client.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <ClientHistoryFilters selected={historyFilter} total={timeline.length} />
        <ClientTimeline
          items={timeline}
          description={
            auth.role === "shareholder"
              ? "Summarized relationship history across approved project, contract, and client-level changes."
              : auth.role === "employee"
                ? "Project and ticket activity visible inside your allowed delivery scope."
                : "Full relationship history across projects, tickets, contracts, documents, and client-level changes."
          }
        />
      </div>

      <NotesPanel
        notes={notes}
        entityType="client"
        entityId={client.id}
        returnPath={`/clients/${client.id}`}
        role={auth.role}
        currentUserId={auth.profile.id}
        title="Client notes"
        description="Relationship notes, account context, and management follow-up for this client."
      />

      <CommentsPanel
        comments={comments}
        entityType="client"
        entityId={client.id}
        returnPath={`/clients/${client.id}`}
        role={auth.role}
        currentUserId={auth.profile.id}
        mentionCandidates={mentionCandidates}
      />
    </div>
  );
}
