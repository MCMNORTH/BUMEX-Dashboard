"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Download, History, Link2, Trash2 } from "lucide-react";

import { deletePaymentAction } from "@/app/(app)/finance/payments/actions";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { PaymentForm } from "@/components/payments/payment-form";
import { PaymentMethodBadge } from "@/components/payments/payment-method-badge";
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge";
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
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { PaymentFiltersData, PaymentRecord } from "@/types/finance";

export function PaymentDetailDrawer({
  payment,
  trigger,
  canManage,
  filterData,
  comments = [],
  role,
  currentUserId,
  mentionCandidates = [],
}: {
  payment: PaymentRecord;
  trigger: ReactNode;
  canManage: boolean;
  filterData?: PaymentFiltersData;
  comments?: CommentRecord[];
  role: AppRole;
  currentUserId: string;
  mentionCandidates?: MentionCandidate[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="top-0 right-0 left-auto h-screen max-h-screen w-full max-w-2xl translate-x-0 translate-y-0 rounded-none border-l border-border/70 px-0 py-0">
        <div className="flex h-full flex-col overflow-hidden">
          <DialogHeader className="border-b border-border/65 px-6 py-5">
            <DialogTitle className="text-xl">
              {payment.reference ?? payment.client?.name ?? "Payment detail"}
            </DialogTitle>
            <DialogDescription>
              Client payment record with linked project, contract, invoice, and activity history.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="flex flex-wrap gap-2">
              <PaymentStatusBadge status={payment.status} />
              <PaymentMethodBadge method={payment.method} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Amount" value={formatFinanceCurrency(payment.amount, payment.currency)} detail={payment.currency} />
              <Metric label="Client" value={payment.client?.name ?? "Not linked"} detail={payment.client?.contact_email ?? "No client email"} />
              <Metric label="Project" value={payment.project?.name ?? "No linked project"} detail={payment.project?.status ?? "No project status"} />
              <Metric label="Contract" value={payment.contract?.title ?? "No linked contract"} detail={payment.contract?.status ?? "No contract status"} />
              <Metric label="Due date" value={formatDate(payment.due_date)} detail="Expected collection date" />
              <Metric label="Payment date" value={formatDate(payment.payment_date)} detail="Recorded receipt date" />
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Linked invoice</p>
              {payment.invoice ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{payment.invoice.invoice_number}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatFinanceCurrency(payment.invoice.amount_ttc, payment.currency)} due {formatDate(payment.invoice.due_date)}
                    </p>
                  </div>
                  <PaymentStatusBadge status={payment.status} />
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">This payment is not linked to an invoice yet.</p>
              )}
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">Reference</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {payment.reference ?? "No payment reference has been recorded."}
              </p>
              <Separator className="my-4 bg-border/60" />
              <p className="text-sm font-medium">Notes</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {payment.notes ?? "No additional payment notes have been recorded."}
              </p>
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-primary" />
                <h3 className="text-base font-semibold">Linked records</h3>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <LinkButton href={payment.client ? `/clients/${payment.client.id}` : undefined} label="Client profile" />
                <LinkButton href={payment.project ? `/projects/${payment.project.id}` : undefined} label="Project detail" />
                <LinkButton href={payment.contract ? `/contracts/${payment.contract.id}` : undefined} label="Contract detail" />
              </div>
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">Supporting documents</p>
              {payment.supportingDocuments.length ? (
                <div className="mt-4 space-y-3">
                  {payment.supportingDocuments.map((document) => (
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
                <p className="mt-2 text-sm text-muted-foreground">
                  No payment proof has been attached yet.
                </p>
              )}
            </div>

            {canManage && filterData ? (
              <div className="flex flex-wrap gap-3">
                <PaymentForm
                  mode="edit"
                  filterData={filterData}
                  defaults={{
                    payment_id: payment.id,
                    client_id: payment.client_id,
                    project_id: payment.project_id ?? "",
                    contract_id: payment.contract_id ?? "",
                    invoice_id: payment.invoice_id ?? "",
                    amount: payment.amount.toString(),
                    currency: payment.currency,
                    due_date: payment.due_date ?? "",
                    payment_date: payment.payment_date ?? "",
                    method: payment.method,
                    status: payment.status,
                    reference: payment.reference ?? "",
                    notes: payment.notes ?? "",
                  }}
                />
                <ConfirmActionForm
                  action={deletePaymentAction}
                  fields={{ payment_id: payment.id }}
                  title="Delete payment?"
                  description="This will permanently delete this payment record. This action cannot be undone."
                  confirmLabel="Delete payment"
                  trigger={(
                    <Button type="button" variant="ghost" className="rounded-2xl px-5 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100">
                      <Trash2 className="size-4" />
                      Delete payment
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
              {payment.recentActivity.length ? (
                payment.recentActivity.map((activity) => (
                  <div key={activity.id} className="rounded-2xl border border-border/65 bg-background/38 p-4">
                    <p className="text-sm font-medium">{activity.action}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {activity.metadata.summary
                        ?? (activity.metadata.field
                          ? `${activity.metadata.field} changed from ${activity.metadata.from ?? "empty"} to ${activity.metadata.to ?? "empty"}`
                          : "Payment activity recorded.")}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {activity.user?.full_name ?? "System"} / {formatDate(activity.created_at)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  No payment activity has been recorded yet.
                </div>
              )}
            </div>

            <CommentsPanel
              comments={comments}
              entityType="payment"
              entityId={payment.id}
              returnPath="/finance/payments"
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
