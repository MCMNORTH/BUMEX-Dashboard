import Link from "next/link";
import { CircleDollarSign, FileText, Landmark } from "lucide-react";

import { InvoiceDetailDrawer } from "@/components/invoices/invoice-detail-drawer";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { InvoiceToast } from "@/components/invoices/invoice-toast";
import { PageHeader } from "@/components/layout/page-header";
import { PaymentForm } from "@/components/payments/payment-form";
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireIncomingFinanceOperationsAccess } from "@/lib/auth/server";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { getInvoiceFiltersData, getInvoices, getInvoiceSummary, getPayments, getPaymentsFilterData, getPaymentSummary } from "@/lib/finance/service";
import { getCurrentLocale, getDictionary, getMessage } from "@/lib/i18n/server";
import { formatDate } from "@/lib/projects/helpers";

export default async function FinanceIncomingPage() {
  const auth = await requireIncomingFinanceOperationsAccess();
  const locale = await getCurrentLocale();
  const dictionary = getDictionary(locale);
  const [invoiceFilterData, paymentFilterData, invoices, payments] = await Promise.all([
    getInvoiceFiltersData(),
    getPaymentsFilterData(),
    getInvoices(auth.role, {}),
    getPayments(auth.role, {}),
  ]);

  const invoiceSummary = getInvoiceSummary(invoices);
  const paymentSummary = getPaymentSummary(payments);

  const canManage = auth.role === "admin" || auth.role === "manager" || auth.role === "employee";

  return (
    <div className="space-y-6">
      <InvoiceToast />

      <div className="flex flex-col gap-4">
        <PageHeader
          eyebrow={getMessage(dictionary, "finance.incoming.eyebrow", "Incoming finance")}
          title={getMessage(dictionary, "finance.incoming.title", "Everything related to money coming from clients.")}
          subtitle={getMessage(dictionary, "finance.incoming.subtitle", "Create invoices, mark them pending, standby, or paid, then track the incoming payments with proof files.")}
        />
        {canManage ? (
          <div className="flex flex-wrap justify-end gap-2">
            <InvoiceForm mode="create" filterData={invoiceFilterData} returnPath="/finance/incoming" triggerLabel={getMessage(dictionary, "finance.incoming.actions.createInvoice", "Create invoice")} />
            <PaymentForm mode="create" filterData={paymentFilterData} triggerLabel={getMessage(dictionary, "finance.incoming.actions.addIncomingPayment", "Add incoming payment")} returnPath="/finance/incoming" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" className="rounded-full px-4">
          <Link href="/finance">{getMessage(dictionary, "finance.incoming.actions.backToFinance", "Back to finance")}</Link>
        </Button>
        <Button asChild variant="secondary" className="rounded-full px-4">
          <Link href="/finance/invoices">{getMessage(dictionary, "finance.incoming.actions.fullInvoices", "Full invoices list")}</Link>
        </Button>
        <Button asChild variant="secondary" className="rounded-full px-4">
          <Link href="/finance/payments">{getMessage(dictionary, "finance.incoming.actions.fullIncomingPayments", "Full incoming payments list")}</Link>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SummaryCard icon={FileText} label={getMessage(dictionary, "finance.incoming.cards.pendingInvoices", "Pending invoices")} value={String(invoiceSummary.sentCount)} detail={getMessage(dictionary, "finance.incoming.cards.pendingInvoicesDetail", "Active client invoices waiting for payment")} />
        <SummaryCard icon={Landmark} label={getMessage(dictionary, "finance.incoming.cards.receivedPayments", "Received payments")} value={formatFinanceCurrency(paymentSummary.totalReceivedAmount, payments[0]?.currency ?? "USD")} detail={getMessage(dictionary, "finance.incoming.cards.receivedPaymentsDetail", "Cash already recorded from clients")} />
        <SummaryCard icon={CircleDollarSign} label={getMessage(dictionary, "finance.incoming.cards.expectedPayments", "Expected payments")} value={formatFinanceCurrency(paymentSummary.totalExpectedAmount, payments[0]?.currency ?? "USD")} detail={getMessage(dictionary, "finance.incoming.cards.expectedPaymentsDetail", "Open incoming cash still to collect")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70 bg-card/72 shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/42 dark:shadow-none">
          <CardContent className="space-y-4 px-5 py-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{getMessage(dictionary, "finance.incoming.sections.invoices", "Invoices")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{getMessage(dictionary, "finance.incoming.sections.latestInvoices", "Latest client invoices")}</h2>
            </div>
            <div className="space-y-3">
              {invoices.slice(0, 5).map((invoice) => (
                <InvoiceDetailDrawer
                  key={invoice.id}
                  invoice={invoice}
                  canManage={canManage}
                  filterData={invoiceFilterData}
                  comments={[]}
                  role={auth.role}
                  currentUserId={auth.profile.id}
                  mentionCandidates={[]}
                  returnPath="/finance/incoming"
                  trigger={(
                    <button type="button" className="w-full text-left">
                      <div className="rounded-2xl border border-border/70 bg-background/45 p-4 transition-colors hover:border-primary/25 dark:border-white/10 dark:bg-slate-900/55">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{invoice.invoice_number}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {invoice.client?.name ?? getMessage(dictionary, "finance.incoming.misc.noClient", "No client")} / {getMessage(dictionary, "finance.incoming.misc.due", "due")} {formatDate(invoice.due_date)}
                            </p>
                          </div>
                          <div className="text-right">
                            <InvoiceStatusBadge status={invoice.paymentStatus} />
                            <p className="mt-2 text-sm font-semibold">{formatFinanceCurrency(invoice.amount_ttc, invoice.currency)}</p>
                          </div>
                        </div>
                      </div>
                    </button>
                  )}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/72 shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/42 dark:shadow-none">
          <CardContent className="space-y-4 px-5 py-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{getMessage(dictionary, "finance.incoming.sections.incomingPayments", "Incoming payments")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{getMessage(dictionary, "finance.incoming.sections.latestCollections", "Latest client collections")}</h2>
            </div>
            <div className="space-y-3">
              {payments.slice(0, 5).map((payment) => (
                <div key={payment.id} className="rounded-2xl border border-border/70 bg-background/45 p-4 dark:border-white/10 dark:bg-slate-900/55">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{payment.reference ?? payment.client?.name ?? getMessage(dictionary, "finance.incoming.misc.incomingPayment", "Incoming payment")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {payment.client?.name ?? getMessage(dictionary, "finance.incoming.misc.noClient", "No client")} / {payment.payment_date ? `${getMessage(dictionary, "finance.incoming.misc.paid", "paid")} ${formatDate(payment.payment_date)}` : `${getMessage(dictionary, "finance.incoming.misc.due", "due")} ${formatDate(payment.due_date)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <PaymentStatusBadge status={payment.status} />
                      <p className="mt-2 text-sm font-semibold">{formatFinanceCurrency(payment.amount, payment.currency)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="border-border/70 bg-card/72 shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/42 dark:shadow-none">
      <CardContent className="px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
          </div>
          <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45 dark:border-white/10 dark:bg-slate-900/60">
            <Icon className="size-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
