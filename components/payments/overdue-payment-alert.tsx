import { AlertTriangle } from "lucide-react";

import { PaymentDetailDrawer } from "@/components/payments/payment-detail-drawer";
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { PaymentRecord } from "@/types/finance";

export function OverduePaymentAlert({
  payments,
  commentsByPaymentId,
  role,
  currentUserId,
  mentionCandidates,
}: {
  payments: PaymentRecord[];
  commentsByPaymentId: Record<string, CommentRecord[]>;
  role: AppRole;
  currentUserId: string;
  mentionCandidates: MentionCandidate[];
}) {
  return (
    <Card className="border-rose-500/18 bg-card/72 backdrop-blur-xl">
      <CardContent className="space-y-4 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Overdue payments</p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight">Collections needing attention</h3>
          </div>
          <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/12">
            <AlertTriangle className="size-5 text-rose-400" />
          </div>
        </div>
        {payments.length ? (
          <div className="space-y-3">
            {payments.map((payment) => (
              <PaymentDetailDrawer
                key={payment.id}
                payment={payment}
                canManage={false}
                comments={commentsByPaymentId[payment.id] ?? []}
                role={role}
                currentUserId={currentUserId}
                mentionCandidates={mentionCandidates}
                trigger={
                  <button
                    type="button"
                    className="w-full rounded-[22px] border border-rose-500/16 bg-rose-500/6 px-4 py-3 text-left transition-colors hover:border-rose-400/28"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{payment.client?.name ?? payment.reference ?? "Payment"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Due {formatDate(payment.due_date)} {payment.project ? `• ${payment.project.name}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <PaymentStatusBadge status={payment.status} />
                        <p className="mt-2 text-sm font-medium">{formatFinanceCurrency(payment.amount, payment.currency)}</p>
                      </div>
                    </div>
                  </button>
                }
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            No overdue payments are currently visible in your finance scope.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
