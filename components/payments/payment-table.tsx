import { Eye } from "lucide-react";

import { PaymentDetailDrawer } from "@/components/payments/payment-detail-drawer";
import { PaymentForm } from "@/components/payments/payment-form";
import { PaymentMethodBadge } from "@/components/payments/payment-method-badge";
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge";
import { Button } from "@/components/ui/button";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { PaymentFiltersData, PaymentRecord } from "@/types/finance";

export function PaymentTable({
  payments,
  canManage,
  filterData,
  commentsByPaymentId,
  role,
  currentUserId,
  mentionCandidates,
}: {
  payments: PaymentRecord[];
  canManage: boolean;
  filterData: PaymentFiltersData;
  commentsByPaymentId: Record<string, CommentRecord[]>;
  role: AppRole;
  currentUserId: string;
  mentionCandidates: MentionCandidate[];
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/65 bg-background/35 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-medium">Payment</th>
              <th className="px-5 py-4 font-medium">Status</th>
              <th className="px-5 py-4 font-medium">Method</th>
              <th className="px-5 py-4 font-medium">Client</th>
              <th className="px-5 py-4 font-medium">Project</th>
              <th className="px-5 py-4 font-medium">Due date</th>
              <th className="px-5 py-4 font-medium">Updated</th>
              <th className="px-5 py-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-b border-border/50 last:border-b-0">
                <td className="px-5 py-4">
                  <p className="font-medium">{payment.reference ?? payment.client?.name ?? "Payment"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatFinanceCurrency(payment.amount, payment.currency)}
                  </p>
                </td>
                <td className="px-5 py-4"><PaymentStatusBadge status={payment.status} /></td>
                <td className="px-5 py-4"><PaymentMethodBadge method={payment.method} /></td>
                <td className="px-5 py-4">{payment.client?.name ?? "Not linked"}</td>
                <td className="px-5 py-4">{payment.project?.name ?? "No linked project"}</td>
                <td className="px-5 py-4">{formatDate(payment.due_date)}</td>
                <td className="px-5 py-4">{formatDate(payment.updated_at)}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <PaymentDetailDrawer
                      payment={payment}
                      canManage={canManage}
                      filterData={filterData}
                      comments={commentsByPaymentId[payment.id] ?? []}
                      role={role}
                      currentUserId={currentUserId}
                      mentionCandidates={mentionCandidates}
                      trigger={
                        <Button variant="ghost" size="icon" className="rounded-full">
                          <Eye className="size-4" />
                        </Button>
                      }
                    />
                    {canManage ? (
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
                        triggerLabel="Edit"
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
