"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Download, History, Link2, Repeat2, ShieldAlert, Trash2 } from "lucide-react";

import { deleteTransferAction } from "@/app/(app)/finance/transfers/actions";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { TransferCategoryBadge } from "@/components/transfers/transfer-category-badge";
import { TransferEntityBadge } from "@/components/transfers/transfer-entity-badge";
import { TransferForm } from "@/components/transfers/transfer-form";
import { TransferStatusBadge } from "@/components/transfers/transfer-status-badge";
import { ConfirmActionForm } from "@/components/shared/confirm-action-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatFinanceCurrency, getTransferEntityLabel } from "@/lib/finance/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { TransferFiltersData, TransferRecord } from "@/types/finance";

function getRestrictedValue(value: string | null) {
  return value ? "Restricted" : "Not set";
}

export function TransferDetailDrawer({
  transfer,
  trigger,
  canManage,
  filterData,
  comments = [],
  role,
  currentUserId,
  mentionCandidates = [],
  returnPath = "/finance/transfers",
}: {
  transfer: TransferRecord;
  trigger: ReactNode;
  canManage: boolean;
  filterData?: TransferFiltersData;
  comments?: CommentRecord[];
  role: AppRole;
  currentUserId: string;
  mentionCandidates?: MentionCandidate[];
  returnPath?: string;
}) {
  const isSummary = transfer.viewMode === "summary";

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="top-0 right-0 left-auto h-screen max-h-screen w-full max-w-3xl translate-x-0 translate-y-0 rounded-none border-l border-border/70 px-0 py-0">
        <div className="flex h-full flex-col overflow-hidden">
          <DialogHeader className="border-b border-border/65 px-6 py-5">
            <DialogTitle className="text-xl">
              {isSummary ? transfer.beneficiary_name : transfer.transfer_reference}
            </DialogTitle>
            <DialogDescription>
              Outgoing transfer record with beneficiary, category, related scope, and activity history.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="flex flex-wrap gap-2">
              <TransferStatusBadge status={transfer.status} />
              <TransferEntityBadge entity={transfer.entity} />
              <TransferCategoryBadge category={transfer.category} />
            </div>

            {isSummary ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldAlert className="size-4" />
                  Sensitive transfer fields are hidden in summary mode.
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Beneficiary" value={transfer.beneficiary_name} detail="Transfer recipient" />
              <Metric label="Amount" value={formatFinanceCurrency(transfer.amount, transfer.currency)} detail={transfer.currency} />
              <Metric label="Transfer date" value={formatDate(transfer.transfer_date)} detail="Planned or executed date" />
              <Metric label="Entity" value={getTransferEntityLabel(transfer.entity)} detail="Operating portfolio / company line" />
              <Metric label="Client" value={transfer.relatedClient?.name ?? "No linked client"} detail={transfer.relatedClient?.contact_email ?? "No client context"} />
              <Metric label="Project" value={transfer.relatedProject?.name ?? "No linked project"} detail={transfer.relatedProject?.status ?? "No project context"} />
              <Metric
                label="Reference"
                value={isSummary ? getRestrictedValue(transfer.transfer_reference) : transfer.transfer_reference}
                detail="Internal transfer reference"
              />
            </div>

            {transfer.renewal.enabled ? (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-400/20 dark:bg-indigo-500/10">
                <div className="flex items-center gap-2"><Repeat2 className="size-4 text-indigo-600 dark:text-indigo-200" /><p className="text-sm font-semibold text-indigo-800 dark:text-indigo-100">Renouvellement suivi</p></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Metric label="Prochaine échéance" value={transfer.renewal.next_due_date ? formatDate(transfer.renewal.next_due_date) : "À définir"} detail="Date du prochain paiement" />
                  <Metric label="Alerte" value={`${transfer.renewal.reminder_days} jours avant`} detail="Notification dans le logiciel" />
                  <Metric label="Fréquence" value={`${transfer.renewal.interval_months} mois`} detail="Période de renouvellement" />
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">Bank details</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Metric
                  label="Bank"
                  value={isSummary ? getRestrictedValue(transfer.beneficiary_bank) : (transfer.beneficiary_bank ?? "Not set")}
                  detail="Beneficiary bank"
                />
                <Metric
                  label="Account"
                  value={isSummary ? getRestrictedValue(transfer.beneficiary_account) : (transfer.beneficiary_account ?? "Not set")}
                  detail="Beneficiary account"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">Notes</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {isSummary ? getRestrictedValue(transfer.notes) : (transfer.notes ?? "No transfer notes recorded.")}
              </p>
              <Separator className="my-4 bg-border/60" />
              <p className="text-sm font-medium">Supporting documents</p>
              {transfer.supportingDocuments.length ? (
                <div className="mt-4 space-y-3">
                  {transfer.supportingDocuments.map((document) => (
                    <div key={document.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/65 bg-background/35 p-4">
                      <div>
                        <p className="text-sm font-medium">{document.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{document.file_name}</p>
                      </div>
                      <Button asChild variant="secondary" className="rounded-full px-4">
                        <a href={`/api/documents/${document.id}/download`} target="_blank" rel="noreferrer">
                          <Download className="size-4" />
                          Open
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  No outgoing proof has been attached yet.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-primary" />
                <h3 className="text-base font-semibold">Linked records</h3>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <LinkButton href={transfer.relatedClient ? `/clients/${transfer.relatedClient.id}` : undefined} label="Client profile" />
                <LinkButton href={transfer.relatedProject ? `/projects/${transfer.relatedProject.id}` : undefined} label="Project detail" />
              </div>
            </div>

            {canManage && filterData ? (
              <div className="flex flex-wrap gap-3">
                <TransferForm
                  mode="edit"
                  filterData={filterData}
                  defaults={{
                    transfer_id: transfer.id,
                    transfer_reference: transfer.transfer_reference,
                    beneficiary_name: transfer.beneficiary_name,
                    beneficiary_bank: transfer.beneficiary_bank ?? "",
                    beneficiary_account: transfer.beneficiary_account ?? "",
                    amount: transfer.amount.toString(),
                    currency: transfer.currency,
                    transfer_date: transfer.transfer_date,
                    status: transfer.status,
                    category: transfer.category,
                    entity: transfer.entity,
                    related_project_id: transfer.related_project_id ?? "",
                    related_client_id: transfer.related_client_id ?? "",
                    notes: transfer.notes ?? "",
                    renewal_enabled: transfer.renewal.enabled,
                    renewal_next_due_date: transfer.renewal.next_due_date ?? "",
                    renewal_reminder_days: String(transfer.renewal.reminder_days),
                    renewal_interval_months: String(transfer.renewal.interval_months),
                  }}
                />
                <ConfirmActionForm
                  action={deleteTransferAction}
                  fields={{ transfer_id: transfer.id, return_path: returnPath }}
                  title="Delete transfer?"
                  description={`This will permanently delete transfer ${transfer.transfer_reference}. This action cannot be undone.`}
                  confirmLabel="Delete transfer"
                  trigger={(
                    <Button type="button" variant="ghost" className="rounded-2xl px-5 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100">
                      <Trash2 className="size-4" />
                      Delete transfer
                    </Button>
                  )}
                />
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <History className="size-4 text-primary" />
                <h3 className="text-base font-semibold">Activity history</h3>
              </div>
              {transfer.recentActivity.length ? (
                transfer.recentActivity.map((activity) => (
                  <div key={activity.id} className="rounded-2xl border border-border/65 bg-background/38 p-4">
                    <p className="text-sm font-medium">{activity.action}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {activity.metadata.summary
                        ?? (activity.metadata.field
                          ? `${activity.metadata.field} changed from ${activity.metadata.from ?? "empty"} to ${activity.metadata.to ?? "empty"}`
                          : "Transfer activity recorded.")}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {activity.user?.full_name ?? "System"} / {formatDate(activity.created_at)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  No transfer activity has been recorded yet.
                </div>
              )}
            </div>

            <CommentsPanel
              comments={comments}
              entityType="transfer"
              entityId={transfer.id}
              returnPath={returnPath}
              role={role}
              currentUserId={currentUserId}
              mentionCandidates={mentionCandidates}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
      <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 text-sm font-medium">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function LinkButton({ href, label }: { href?: string; label: string }) {
  if (!href) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 px-4 py-3 text-sm text-muted-foreground">
        {label} unavailable
      </div>
    );
  }

  return (
    <Button asChild variant="secondary" className="justify-start rounded-2xl px-4">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
