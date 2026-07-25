import { CalendarClock, Landmark, ReceiptText } from "lucide-react";

import { PaymentDetailDrawer } from "@/components/payments/payment-detail-drawer";
import { PaymentMethodBadge } from "@/components/payments/payment-method-badge";
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { PaymentFiltersData, PaymentRecord } from "@/types/finance";

export function PaymentCard({
  payment,
  canManage,
  filterData,
  comments = [],
  role,
  currentUserId,
  mentionCandidates = [],
}: {
  payment: PaymentRecord;
  canManage: boolean;
  filterData: PaymentFiltersData;
  comments?: CommentRecord[];
  role: AppRole;
  currentUserId: string;
  mentionCandidates?: MentionCandidate[];
}) {
  return (
    <PaymentDetailDrawer
      payment={payment}
      canManage={canManage}
      filterData={filterData}
      comments={comments}
      role={role}
      currentUserId={currentUserId}
      mentionCandidates={mentionCandidates}
      trigger={
        <button type="button" className="w-full text-left">
          <Card className="group cursor-pointer border-border/70 bg-card/72 transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-soft)]">
            <CardContent className="space-y-4 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold tracking-tight">
                    {payment.reference ?? payment.client?.name ?? "Client payment"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {payment.client?.name ?? "No client"} {payment.project ? ` / ${payment.project.name}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold tracking-[-0.04em]">
                    {formatFinanceCurrency(payment.amount, payment.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{payment.currency}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <PaymentStatusBadge status={payment.status} />
                <PaymentMethodBadge method={payment.method} />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Info icon={CalendarClock} label="Due date" value={formatDate(payment.due_date)} />
                <Info icon={Landmark} label="Payment date" value={formatDate(payment.payment_date)} />
                <Info icon={ReceiptText} label="Invoice" value={payment.invoice?.invoice_number ?? "Not linked"} />
              </div>

              <div className="flex w-full items-center justify-between rounded-2xl border border-border/65 bg-background/30 px-4 py-2.5 text-sm font-medium text-foreground">
                Open payment detail
              </div>
            </CardContent>
          </Card>
        </button>
      }
    />
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/65 bg-background/35 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}
