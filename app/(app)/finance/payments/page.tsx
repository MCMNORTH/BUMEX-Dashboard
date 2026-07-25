import Link from "next/link";
import { AlertTriangle, ArrowDownCircle, Clock3, Landmark, WalletCards } from "lucide-react";

import { PaymentCard } from "@/components/payments/payment-card";
import { PaymentDetailDrawer } from "@/components/payments/payment-detail-drawer";
import { PaymentFilters } from "@/components/payments/payment-filters";
import { PaymentForm } from "@/components/payments/payment-form";
import { PaymentTable } from "@/components/payments/payment-table";
import { PaymentToast } from "@/components/payments/payment-toast";
import { OverduePaymentAlert } from "@/components/payments/overdue-payment-alert";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getExpectedPayments,
  getOverduePayments,
  getPayments,
  getPaymentsFilterData,
  getPaymentSummary,
  getReceivedPayments,
} from "@/lib/finance/service";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatNumber } from "@/lib/formatters";
import { requireIncomingFinanceOperationsAccess } from "@/lib/auth/server";
import { getCommentsForEntities } from "@/lib/comments/service";
import { getMentionCandidates } from "@/lib/notifications/service";
import type { CommentRecord } from "@/types/comment";
import type { FinanceFilters } from "@/types/finance";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FinancePaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireIncomingFinanceOperationsAccess();
  const params = (await searchParams) ?? {};
  const filters: FinanceFilters = {
    search: getString(params.search) ?? "",
    clientId: getString(params.client) ?? "",
    projectId: getString(params.project) ?? "",
    contractId: getString(params.contract) ?? "",
    status: getString(params.status) ?? "",
    method: (getString(params.method) as FinanceFilters["method"]) ?? "",
    dueWindow: (getString(params.due) as FinanceFilters["dueWindow"]) ?? "all",
  };

  const [payments, filterData, overduePayments, expectedPayments, receivedPayments, mentionCandidates] = await Promise.all([
    getPayments(auth.role, filters),
    getPaymentsFilterData(),
    getOverduePayments(auth.role),
    getExpectedPayments(auth.role),
    getReceivedPayments(auth.role),
    getMentionCandidates(),
  ]);
  const commentsByPaymentId = (await getCommentsForEntities("payment", payments.map((payment) => payment.id))) as Record<string, CommentRecord[]>;

  const summary = getPaymentSummary(payments);
  const canManage = auth.role === "admin" || auth.role === "manager" || auth.role === "employee";
  return (
    <div className="space-y-6">
      <PaymentToast />

      <div className="flex flex-col gap-4">
        <PageHeader
          eyebrow="Payments module"
          title="A controlled payment tracking workspace for expected, overdue, and received client cash flow."
          subtitle="Track operational receivables by client, project, contract, and due date with premium visibility over collection pressure and payment movement."
        />
        {canManage ? (
          <div className="flex justify-end">
            <PaymentForm mode="create" filterData={filterData} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" className="rounded-full px-4">
          <Link href="/finance/incoming">Incoming overview</Link>
        </Button>
        <Button asChild variant="secondary" className="rounded-full px-4">
          <Link href="/finance/invoices">Invoices</Link>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {[
          {
            icon: WalletCards,
            label: "Visible payments",
            value: formatNumber(summary.total),
            detail: "Payments in the current finance scope",
          },
          {
            icon: AlertTriangle,
            label: "Overdue amount",
            value: formatFinanceCurrency(
              overduePayments.reduce((sum, payment) => sum + payment.amount, 0),
              overduePayments[0]?.currency ?? "USD",
            ),
            detail: `${formatNumber(summary.overdueCount)} late payment${summary.overdueCount === 1 ? "" : "s"}`,
          },
          {
            icon: Clock3,
            label: "Expected amount",
            value: formatFinanceCurrency(summary.totalExpectedAmount, expectedPayments[0]?.currency ?? "USD"),
            detail: `${formatNumber(summary.expectedCount)} expected payment${summary.expectedCount === 1 ? "" : "s"}`,
          },
          {
            icon: Landmark,
            label: "Received amount",
            value: formatFinanceCurrency(summary.totalReceivedAmount, receivedPayments[0]?.currency ?? "USD"),
            detail: `${formatNumber(summary.receivedCount)} received or reconciled`,
          },
        ].map(({ icon: Icon, label, value, detail }) => (
          <Card key={label} className="surface-highlight relative overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45">
                  <Icon className="size-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <PaymentFilters filters={filters} filterData={filterData} />

      <div className="grid gap-4 xl:grid-cols-3">
        <OverduePaymentAlert
          payments={overduePayments.slice(0, 3)}
          commentsByPaymentId={commentsByPaymentId}
          role={auth.role}
          currentUserId={auth.profile.id}
          mentionCandidates={mentionCandidates}
        />

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-5 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Expected payments</p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">Upcoming collection pipeline</h3>
              </div>
              <ArrowDownCircle className="size-5 text-primary" />
            </div>
            {expectedPayments.length ? (
              <div className="space-y-3">
                {expectedPayments.slice(0, 3).map((payment) => (
                  <PaymentDetailDrawer
                    key={payment.id}
                    payment={payment}
                    canManage={canManage}
                    filterData={filterData}
                    comments={commentsByPaymentId[payment.id] ?? []}
                    role={auth.role}
                    currentUserId={auth.profile.id}
                    mentionCandidates={mentionCandidates}
                    trigger={
                      <Button variant="ghost" className="h-auto w-full justify-start rounded-[22px] border border-border/65 bg-background/35 px-4 py-3">
                        <div className="w-full text-left">
                          <p className="text-sm font-medium">{payment.client?.name ?? "Client payment"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatFinanceCurrency(payment.amount, payment.currency)} due {payment.due_date ?? "unscheduled"}
                          </p>
                        </div>
                      </Button>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                No expected payments are currently visible.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-5 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Received payments</p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">Latest incoming cash movement</h3>
              </div>
              <Landmark className="size-5 text-primary" />
            </div>
            {receivedPayments.length ? (
              <div className="space-y-3">
                {receivedPayments.slice(0, 3).map((payment) => (
                  <PaymentDetailDrawer
                    key={payment.id}
                    payment={payment}
                    canManage={canManage}
                    filterData={filterData}
                    comments={commentsByPaymentId[payment.id] ?? []}
                    role={auth.role}
                    currentUserId={auth.profile.id}
                    mentionCandidates={mentionCandidates}
                    trigger={
                      <Button variant="ghost" className="h-auto w-full justify-start rounded-[22px] border border-border/65 bg-background/35 px-4 py-3">
                        <div className="w-full text-left">
                          <p className="text-sm font-medium">{payment.client?.name ?? "Client payment"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatFinanceCurrency(payment.amount, payment.currency)} received {payment.payment_date ?? "recently"}
                          </p>
                        </div>
                      </Button>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                No received payments have been recorded in your current scope.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Ledger</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">Payments list</h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">{formatNumber(payments.length)} results</Badge>
          </div>
        </div>

        {payments.length ? (
          <>
            <div className="hidden xl:block">
              <PaymentTable
                payments={payments}
                canManage={canManage}
                filterData={filterData}
                commentsByPaymentId={commentsByPaymentId}
                role={auth.role}
                currentUserId={auth.profile.id}
                mentionCandidates={mentionCandidates}
              />
            </div>

            <div className="grid gap-4 xl:hidden">
              {payments.map((payment) => (
                <PaymentCard
                  key={payment.id}
                  payment={payment}
                  canManage={canManage}
                  filterData={filterData}
                  comments={commentsByPaymentId[payment.id] ?? []}
                  role={auth.role}
                  currentUserId={auth.profile.id}
                  mentionCandidates={mentionCandidates}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-[28px] border border-dashed border-border/70 bg-background/35 p-8 text-center text-sm text-muted-foreground">
            No payments match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
