"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BellRing, Download, Eye, History, Link2, LockKeyhole, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";

import { approveInvoiceAction, deleteInvoiceAction, remindInvoiceApproversAction, requestInvoiceChangesAction, revokeInvoiceApprovalAction } from "@/app/(app)/finance/invoices/actions";
import { useI18n } from "@/components/layout/i18n-provider";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { SendInvoiceEmailForm } from "@/components/invoices/send-invoice-email-form";
import { InvoicePaymentSummary } from "@/components/invoices/invoice-payment-summary";
import { InvoiceApprovalTimeline } from "@/components/invoices/invoice-approval-timeline";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { ReceiptBadge } from "@/components/invoices/receipt-badge";
import { ReceiptForm } from "@/components/invoices/receipt-form";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge";
import { ConfirmActionForm } from "@/components/shared/confirm-action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { InvoiceFiltersData, InvoiceRecord } from "@/types/finance";

export function InvoiceDetailDrawer({
  invoice,
  trigger,
  canManage,
  filterData,
  comments = [],
  role,
  currentUserId,
  mentionCandidates = [],
  returnPath = "/finance/invoices",
}: {
  invoice: InvoiceRecord;
  trigger: ReactNode;
  canManage: boolean;
  filterData?: InvoiceFiltersData;
  comments?: CommentRecord[];
  role: AppRole;
  currentUserId: string;
  mentionCandidates?: MentionCandidate[];
  returnPath?: string;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const isApproved = invoice.approval_status === "approved";
  const revisionRequest = getActiveRevisionRequest(invoice);
  const summary = {
    totalPaid: invoice.totalPaid,
    remainingBalance: invoice.remainingBalance,
    linkedPaymentsCount: invoice.linkedPayments.length,
    receiptCount: invoice.receipts.length,
    paymentStatus: invoice.paymentStatus,
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="top-0 right-0 left-auto h-screen max-h-screen w-full max-w-3xl translate-x-0 translate-y-0 rounded-none border-l border-border/70 px-0 py-0">
        <div className="flex h-full flex-col overflow-hidden">
          <DialogHeader className="border-b border-border/65 px-6 py-5">
            <DialogTitle className="text-xl">{invoice.invoice_number}</DialogTitle>
            <DialogDescription>Invoice record with linked payments, receipts, related scope, and activity history.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="flex flex-wrap gap-2">
              <InvoiceStatusBadge status={invoice.paymentStatus} />
              <ReceiptBadge count={invoice.receipts.length} />
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${isApproved ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100" : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100"}`}>
                {isApproved ? <ShieldCheck className="size-3.5" /> : <LockKeyhole className="size-3.5" />}
                {isApproved ? (isFr ? "Validée" : "Approved") : (isFr ? "En attente de validation" : "Awaiting approval")}
              </span>
            </div>

            {isApproved && role === "admin" ? <form action={revokeInvoiceApprovalAction} className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100">
              <p className="text-sm font-semibold">{isFr ? "Retirer une validation accordée" : "Revoke an approval"}</p>
              <input type="hidden" name="invoice_id" value={invoice.id} />
              <input type="hidden" name="return_path" value={returnPath} />
              <Textarea name="reason" required minLength={5} placeholder={isFr ? "Motif du retrait…" : "Reason for revocation…"} className="min-h-20 bg-white/80 dark:bg-black/15" />
              <Button type="submit" variant="secondary" className="rounded-full"><RotateCcw className="size-4" />{isFr ? "Retirer la validation" : "Revoke approval"}</Button>
            </form> : null}

            {!isApproved ? <div className={`rounded-2xl border p-4 text-sm ${revisionRequest ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100" : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100"}`}>
              <p className="font-semibold">{revisionRequest ? (isFr ? "Corrections demandées" : "Changes requested") : (isFr ? "Diffusion verrouillée" : "Delivery locked")}</p>
              <p className="mt-1 opacity-80">{revisionRequest ?? (isFr ? "Le PDF ne peut être ni ouvert, ni téléchargé, ni envoyé avant la validation d’un administrateur." : "The PDF cannot be opened, downloaded, or sent until an administrator approves it.")}</p>
              {role === "admin" ? <div className="mt-3 space-y-3">
                <ConfirmActionForm
                  action={approveInvoiceAction}
                  fields={{ invoice_id: invoice.id, return_path: returnPath }}
                  title={isFr ? "Confirmer la validation" : "Confirm approval"}
                  description={isFr ? `${invoice.invoice_number} · ${invoice.client?.name ?? "Client non renseigné"} · ${formatFinanceCurrency(invoice.amount_ttc, invoice.currency)}. Après confirmation, la facture pourra être téléchargée et envoyée.` : `${invoice.invoice_number} · ${invoice.client?.name ?? "No client"} · ${formatFinanceCurrency(invoice.amount_ttc, invoice.currency)}. After confirmation, the invoice can be downloaded and sent.`}
                  confirmLabel={isFr ? "Confirmer la validation" : "Confirm approval"}
                  cancelLabel={isFr ? "Annuler" : "Cancel"}
                  tone="success"
                  trigger={<Button type="button" className="rounded-full px-4"><ShieldCheck className="size-4" />{isFr ? "Valider la facture" : "Approve invoice"}</Button>}
                />
                <form action={requestInvoiceChangesAction} className="space-y-2 rounded-xl border border-current/15 bg-white/60 p-3 dark:bg-black/10">
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <input type="hidden" name="return_path" value={returnPath} />
                  <Textarea name="reason" required minLength={5} placeholder={isFr ? "Corrections à effectuer…" : "Changes to make…"} className="min-h-20 bg-white/80 dark:bg-black/15" />
                  <Button type="submit" variant="secondary" className="rounded-full"><RotateCcw className="size-4" />{isFr ? "Demander des corrections" : "Request changes"}</Button>
                </form>
              </div> : canManage && !revisionRequest ? <form action={remindInvoiceApproversAction} className="mt-3">
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <input type="hidden" name="return_path" value={returnPath} />
                <Button type="submit" variant="secondary" className="rounded-full"><BellRing className="size-4" />{isFr ? "Relancer les administrateurs" : "Remind administrators"}</Button>
              </form> : null}
            </div> : null}

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" className="rounded-full px-4">
                <Link href={`/finance/invoices/${invoice.id}/preview`}>
                  <Eye className="size-4" />
                  Preview invoice
                </Link>
              </Button>
              {isApproved ? <Button asChild variant="secondary" className="rounded-full px-4">
                <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
                  <Eye className="size-4" />
                  Open PDF
                </a>
              </Button> : null}
              {isApproved ? <Button asChild variant="secondary" className="rounded-full px-4">
                <a href={`/api/invoices/${invoice.id}/pdf?download=1`} target="_blank" rel="noreferrer">
                  <Download className="size-4" />
                  Download PDF
                </a>
              </Button> : null}
              {canManage && isApproved ? (
                <SendInvoiceEmailForm
                  invoiceId={invoice.id}
                  invoiceNumber={invoice.invoice_number}
                  defaultEmail={invoice.client?.contact_email ?? ""}
                  returnPath={returnPath}
                />
              ) : null}
            </div>

            <InvoicePaymentSummary summary={summary} currency={invoice.currency} />
            <InvoiceApprovalTimeline invoice={invoice} locale={locale} />

            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Client" value={invoice.client?.name ?? "Not linked"} detail={invoice.client?.contact_email ?? "No client contact"} />
              <Metric label="Project" value={invoice.project?.name ?? "No linked project"} detail={invoice.project?.status ?? "No project status"} />
              <Metric label="Contract" value={invoice.contract?.title ?? "No linked contract"} detail={invoice.contract?.status ?? "No contract status"} />
              <Metric label="Issue / due date" value={`${formatDate(invoice.issue_date)} / ${formatDate(invoice.due_date)}`} detail="Invoice timing" />
              <Metric label="Amount HT" value={formatFinanceCurrency(invoice.amount_ht, invoice.currency)} detail="Net amount" />
              <Metric label="Amount TTC" value={formatFinanceCurrency(invoice.amount_ttc, invoice.currency)} detail="Gross amount" />
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">Linked payments</p>
              {invoice.linkedPayments.length ? (
                <div className="mt-4 space-y-3">
                  {invoice.linkedPayments.map((payment) => (
                    <div key={payment.id} className="rounded-2xl border border-border/65 bg-background/35 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{payment.reference ?? payment.client?.name ?? "Payment"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatFinanceCurrency(payment.amount, payment.currency)} / {formatDate(payment.payment_date)}
                          </p>
                        </div>
                        <PaymentStatusBadge status={payment.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No payments are linked to this invoice yet.</p>
              )}
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Receipts</p>
                {canManage && filterData && invoice.linkedPayments.length ? (
                  <ReceiptForm payments={invoice.linkedPayments} filterData={filterData} returnPath={returnPath} />
                ) : null}
              </div>
              {invoice.receipts.length ? (
                <div className="mt-4 space-y-3">
                  {invoice.receipts.map((receipt) => (
                    <div key={receipt.id} className="rounded-2xl border border-border/65 bg-background/35 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{receipt.receipt_number}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatFinanceCurrency(receipt.amount, receipt.payment?.currency ?? invoice.currency)} / {formatDate(receipt.issue_date)}
                          </p>
                        </div>
                        <ReceiptBadge count={1} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No receipts have been recorded yet.</p>
              )}
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-primary" />
                <h3 className="text-base font-semibold">Linked records</h3>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <LinkButton href={invoice.client ? `/clients/${invoice.client.id}` : undefined} label="Client profile" />
                <LinkButton href={invoice.project ? `/projects/${invoice.project.id}` : undefined} label="Project detail" />
                <LinkButton href={invoice.contract ? `/contracts/${invoice.contract.id}` : undefined} label="Contract detail" />
              </div>
              <Separator className="my-4 bg-border/60" />
              <p className="text-sm font-medium">Notes</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{invoice.notes ?? "No invoice notes recorded."}</p>
              <Separator className="my-4 bg-border/60" />
              <p className="text-sm font-medium">Supporting documents</p>
              {invoice.supportingDocuments.length ? (
                <div className="mt-4 space-y-3">
                  {invoice.supportingDocuments.map((document) => (
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
                <p className="mt-3 text-sm leading-6 text-muted-foreground">No invoice file or proof has been attached yet.</p>
              )}
            </div>

            {canManage && filterData ? (
              <div className="flex flex-wrap gap-3">
                <InvoiceForm
                  mode="edit"
                  filterData={filterData}
                  returnPath={returnPath}
                  resetsApproval={invoice.approval_status === "approved"}
                  defaults={{
                    invoice_id: invoice.id,
                    invoice_number: invoice.invoice_number,
                    client_id: invoice.client_id,
                    project_id: invoice.project_id ?? "",
                    contract_id: invoice.contract_id ?? "",
                    issue_date: invoice.issue_date,
                    due_date: invoice.due_date,
                    amount_ht: invoice.amount_ht.toString(),
                    tax_amount: invoice.tax_amount.toString(),
                    amount_ttc: invoice.amount_ttc.toString(),
                    currency: invoice.currency,
                    status: invoice.status,
                    notes: invoice.notes ?? "",
                  }}
                />
                {invoice.approval_status !== "approved" || role === "admin" ? <ConfirmActionForm
                  action={deleteInvoiceAction}
                  fields={{ invoice_id: invoice.id, return_path: returnPath }}
                  title="Delete invoice?"
                  description={`This will permanently delete invoice ${invoice.invoice_number}. This action cannot be undone.`}
                  confirmLabel="Delete invoice"
                  trigger={(
                    <Button type="button" variant="ghost" className="rounded-2xl px-5 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100">
                      <Trash2 className="size-4" />
                      Delete invoice
                    </Button>
                  )}
                /> : null}
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <History className="size-4 text-primary" />
                <h3 className="text-base font-semibold">Activity history</h3>
              </div>
              {invoice.recentActivity.length ? (
                invoice.recentActivity.map((activity) => (
                  <div key={activity.id} className="rounded-2xl border border-border/65 bg-background/38 p-4">
                    <p className="text-sm font-medium">{activity.action}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {activity.metadata.summary
                        ?? (activity.metadata.field
                          ? `${activity.metadata.field} changed from ${activity.metadata.from ?? "empty"} to ${activity.metadata.to ?? "empty"}`
                          : "Invoice activity recorded.")}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {activity.user?.full_name ?? "System"} / {formatDate(activity.created_at)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  No invoice activity has been recorded yet.
                </div>
              )}
            </div>

            <CommentsPanel
              comments={comments}
              entityType="invoice"
              entityId={invoice.id}
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

function getActiveRevisionRequest(invoice: Pick<InvoiceRecord, "updated_at" | "recentActivity">) {
  const request = invoice.recentActivity.find((activity) => activity.action === "Invoice changes requested");
  if (!request || new Date(request.created_at).getTime() <= new Date(invoice.updated_at).getTime()) return null;
  return request.metadata.summary || "Des corrections sont nécessaires avant la validation.";
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
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
    return <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 px-4 py-3 text-sm text-muted-foreground">{label} unavailable</div>;
  }
  return <Button asChild variant="secondary" className="justify-start rounded-2xl px-4"><Link href={href}>{label}</Link></Button>;
}
