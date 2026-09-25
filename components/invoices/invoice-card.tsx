import { CalendarClock, ReceiptText, Wallet } from "lucide-react";

import { InvoiceDetailDrawer } from "@/components/invoices/invoice-detail-drawer";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { InvoiceApprovalBadge } from "@/components/invoices/invoice-approval-badge";
import { ReceiptBadge } from "@/components/invoices/receipt-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { InvoiceFiltersData, InvoiceRecord } from "@/types/finance";

export function InvoiceCard({
  invoice,
  canManage,
  filterData,
  comments = [],
  role,
  currentUserId,
  mentionCandidates = [],
  returnPath = "/finance/invoices",
}: {
  invoice: InvoiceRecord;
  canManage: boolean;
  filterData: InvoiceFiltersData;
  comments?: CommentRecord[];
  role: AppRole;
  currentUserId: string;
  mentionCandidates?: MentionCandidate[];
  returnPath?: string;
}) {
  return (
    <InvoiceDetailDrawer
      invoice={invoice}
      canManage={canManage}
      filterData={filterData}
      comments={comments}
      role={role}
      currentUserId={currentUserId}
      mentionCandidates={mentionCandidates}
      returnPath={returnPath}
      trigger={
        <button type="button" className="w-full text-left">
          <Card className="group cursor-pointer border-slate-200 bg-white transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-[var(--shadow-soft)]">
            <CardContent className="space-y-4 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold tracking-tight">{invoice.invoice_number}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{invoice.client?.name ?? "No client"} {invoice.project ? ` / ${invoice.project.name}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold tracking-[-0.02em]">{formatFinanceCurrency(invoice.amount_ttc, invoice.currency)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{invoice.currency}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <InvoiceStatusBadge status={invoice.paymentStatus} />
                <InvoiceApprovalBadge status={invoice.approval_status} changesRequested={hasActiveRevisionRequest(invoice)} />
                {invoice.approval_status === "pending" ? (
                  <span className={`self-center text-xs ${getWaitingDays(invoice.updated_at) >= 3 ? "font-semibold text-rose-600" : "text-muted-foreground"}`}>
                    {getWaitingDays(invoice.updated_at)} j
                  </span>
                ) : null}
                <ReceiptBadge count={invoice.receipts.length} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Info icon={CalendarClock} label="Due date" value={formatDate(invoice.due_date)} />
                <Info icon={Wallet} label="Paid" value={formatFinanceCurrency(invoice.totalPaid, invoice.currency)} />
                <Info icon={ReceiptText} label="Remaining" value={formatFinanceCurrency(invoice.remainingBalance, invoice.currency)} />
              </div>
            </CardContent>
          </Card>
        </button>
      }
    />
  );
}

function getWaitingDays(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

function hasActiveRevisionRequest(invoice: Pick<InvoiceRecord, "updated_at" | "recentActivity">) {
  const request = invoice.recentActivity.find((activity) => activity.action === "Invoice changes requested");
  return Boolean(request && new Date(request.created_at).getTime() > new Date(invoice.updated_at).getTime());
}

function Info({ icon: Icon, label, value }: { icon: typeof CalendarClock; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}
