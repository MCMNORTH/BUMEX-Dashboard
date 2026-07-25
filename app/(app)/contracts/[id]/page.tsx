import { notFound } from "next/navigation";
import { CircleDollarSign, FileStack, ReceiptText } from "lucide-react";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { NotesPanel } from "@/components/notes/notes-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth/server";
import { getClientById } from "@/lib/clients/service";
import { getCommentsForEntity } from "@/lib/comments/service";
import { getNotesForEntity } from "@/lib/notes/service";
import { getMentionCandidates } from "@/lib/notifications/service";
import { getContractById, getContractsFilterData } from "@/lib/contracts/service";
import { getProjectById } from "@/lib/projects/service";
import { formatCurrency, formatDate } from "@/lib/projects/helpers";
import { ContractDetailHeader } from "@/components/contracts/contract-detail-header";
import { ContractToast } from "@/components/contracts/contract-toast";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireRouteAccess("contracts");
  const { id } = await params;
  const [contract, filterData, comments, notes, mentionCandidates] = await Promise.all([
    getContractById(id, auth.role),
    getContractsFilterData(),
    getCommentsForEntity("contract", id),
    getNotesForEntity("contract", id),
    getMentionCandidates(),
  ]);

  if (!contract) {
    notFound();
  }

  const [linkedClient, linkedProject] = await Promise.all([
    getClientById(contract.client_id, auth.role),
    contract.project_id ? getProjectById(contract.project_id) : Promise.resolve(null),
  ]);

  const canManage =
    auth.role === "admin"
    || (
      auth.role === "manager"
      && (
        linkedClient?.account_manager_id === auth.profile.id
        || linkedProject?.owner_id === auth.profile.id
        || contract.responsible_user_id === auth.profile.id
      )
    );

  return (
    <div className="space-y-6">
      <ContractToast />
      <ContractDetailHeader contract={contract} role={auth.role} canManage={canManage} filterData={filterData} />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Contract overview</CardTitle>
            <CardDescription>Commercial context, ownership, timing, and agreement details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Value</p>
                <p className="mt-2 text-sm font-medium">{formatCurrency(contract.amount)}</p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Contract number</p>
                <p className="mt-2 text-sm font-medium">{contract.contract_number ?? "Not set"}</p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Renewal state</p>
                <p className="mt-2 text-sm font-medium">{contract.renewalState.replaceAll("_", " ")}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">Dates</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                  <p className="text-sm font-medium">Start date</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(contract.start_date)}</p>
                </div>
                <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                  <p className="text-sm font-medium">End date</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(contract.end_date)}</p>
                </div>
                <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                  <p className="text-sm font-medium">Signed date</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(contract.signed_date)}</p>
                </div>
                <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                  <p className="text-sm font-medium">Renewal date</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(contract.renewal_date)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">Payment terms</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{contract.payment_terms ?? "No payment terms recorded."}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Linked client</CardTitle>
              <CardDescription>Commercial account attached to this agreement.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-sm font-medium">{contract.client?.name ?? "No client linked"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{contract.client?.contact_email ?? "No contact email"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Linked project</CardTitle>
              <CardDescription>Optional delivery stream associated with this contract.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-sm font-medium">{contract.project?.name ?? "No linked project"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{contract.project?.status ?? "No status"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileStack className="size-4 text-primary" />
                <CardTitle>Linked documents</CardTitle>
              </div>
              <CardDescription>Reserved surface for contract files and approvals.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                Document placeholder ready for future integration.
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CircleDollarSign className="size-4 text-primary" />
                <CardTitle>Linked payments</CardTitle>
              </div>
              <CardDescription>Reserved for billing schedule and payment tracking.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                Payments placeholder ready for finance integration.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ReceiptText className="size-4 text-primary" />
            <CardTitle>Renewal status</CardTitle>
          </div>
          <CardDescription>Summary of renewal timing and current agreement state.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{contract.renewalState.replaceAll("_", " ")}</p>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {contract.daysUntilRenewal !== null ? `${contract.daysUntilRenewal} days` : "No renewal date"}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Renewal review is based on the configured renewal date, or the contract end date when renewal is not explicitly set.
            </p>
          </div>
        </CardContent>
      </Card>

      <ActivityFeed
        activities={contract.recentActivity}
        title="Recent activity"
        description="Latest contract-level changes recorded for this agreement."
      />

      <NotesPanel
        notes={notes}
        entityType="contract"
        entityId={contract.id}
        returnPath={`/contracts/${contract.id}`}
        role={auth.role}
        currentUserId={auth.profile.id}
        title="Contract notes"
        description="Structured contract notes for renewals, approvals, commercial context, and executive follow-up."
      />

      <CommentsPanel
        comments={comments}
        entityType="contract"
        entityId={contract.id}
        returnPath={`/contracts/${contract.id}`}
        role={auth.role}
        currentUserId={auth.profile.id}
        mentionCandidates={mentionCandidates}
      />
    </div>
  );
}
