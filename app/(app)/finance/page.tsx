import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { requireRouteAccess } from "@/lib/auth/server";
import {
  getBankStatements,
  getBankStatementSummary,
  getInvoiceFiltersData,
  getInvoices,
  getInvoiceSummary,
  getPayments,
  getPaymentsFilterData,
  getPaymentSummary,
  getTransfers,
  getTransfersFilterData,
  getTransferSummary,
} from "@/lib/finance/service";

export default async function FinancePage() {
  const auth = await requireRouteAccess("finance");
  const canManageIncomingFinance = auth.role === "admin" || auth.role === "manager" || auth.role === "employee";
  const canManageOutgoingFinance = auth.role === "admin" || auth.role === "manager" || auth.role === "employee";
  const canManageBankFinance = auth.role === "admin" || auth.role === "manager" || auth.role === "employee";
  const loadWarnings: string[] = [];

  const [invoicesResult, paymentsResult, transfersResult, bankStatementsResult] = await Promise.allSettled([
    getInvoices(auth.role, {}),
    getPayments(auth.role, {}),
    getTransfers(auth.role, {}),
    canManageBankFinance ? getBankStatements(auth.role) : Promise.resolve([]),
  ]);

  const [invoiceFilterResult, paymentFilterResult, transferFilterResult] = await Promise.allSettled([
    canManageIncomingFinance ? getInvoiceFiltersData() : Promise.resolve(null),
    canManageIncomingFinance ? getPaymentsFilterData() : Promise.resolve(null),
    canManageOutgoingFinance ? getTransfersFilterData() : Promise.resolve(null),
  ]);

  const invoices = invoicesResult.status === "fulfilled" ? invoicesResult.value : [];
  const payments = paymentsResult.status === "fulfilled" ? paymentsResult.value : [];
  const transfers = transfersResult.status === "fulfilled" ? transfersResult.value : [];
  const bankStatements = bankStatementsResult.status === "fulfilled" ? bankStatementsResult.value : [];
  const invoiceFilterData = invoiceFilterResult.status === "fulfilled" ? invoiceFilterResult.value : null;
  const paymentFilterData = paymentFilterResult.status === "fulfilled" ? paymentFilterResult.value : null;
  const transferFilterData = transferFilterResult.status === "fulfilled" ? transferFilterResult.value : null;

  if (invoicesResult.status === "rejected") {
    console.error("Finance page failed to load invoices.", invoicesResult.reason);
    loadWarnings.push("invoices");
  }

  if (paymentsResult.status === "rejected") {
    console.error("Finance page failed to load payments.", paymentsResult.reason);
    loadWarnings.push("payments");
  }

  if (transfersResult.status === "rejected") {
    console.error("Finance page failed to load transfers.", transfersResult.reason);
    loadWarnings.push("transfers");
  }

  if (bankStatementsResult.status === "rejected") {
    console.error("Finance page failed to load bank statements.", bankStatementsResult.reason);
    loadWarnings.push("bankStatements");
  }

  if (invoiceFilterResult.status === "rejected") {
    console.error("Finance page failed to load invoice filters.", invoiceFilterResult.reason);
    loadWarnings.push("invoiceFilters");
  }

  if (paymentFilterResult.status === "rejected") {
    console.error("Finance page failed to load payment filters.", paymentFilterResult.reason);
    loadWarnings.push("paymentFilters");
  }

  if (transferFilterResult.status === "rejected") {
    console.error("Finance page failed to load transfer filters.", transferFilterResult.reason);
    loadWarnings.push("transferFilters");
  }

  return (
    <FinanceWorkspace
      canManageIncomingFinance={canManageIncomingFinance}
      canManageOutgoingFinance={canManageOutgoingFinance}
      canManageBankFinance={canManageBankFinance}
      loadWarnings={loadWarnings}
      invoices={invoices}
      invoiceSummary={getInvoiceSummary(invoices)}
      invoiceFilterData={invoiceFilterData}
      payments={payments}
      paymentSummary={getPaymentSummary(payments)}
      paymentFilterData={paymentFilterData}
      transfers={transfers}
      transferSummary={getTransferSummary(transfers)}
      transferFilterData={transferFilterData}
      bankStatements={bankStatements}
      bankSummary={canManageBankFinance ? getBankStatementSummary(bankStatements) : null}
    />
  );
}
