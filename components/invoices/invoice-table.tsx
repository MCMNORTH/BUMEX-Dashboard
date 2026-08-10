"use client";

import { memo } from "react";
import { Eye, Trash2 } from "lucide-react";

import { deleteInvoiceAction } from "@/app/(app)/finance/invoices/actions";
import { ConfirmActionForm } from "@/components/shared/confirm-action-form";
import { InvoiceDetailDrawer } from "@/components/invoices/invoice-detail-drawer";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { ReceiptBadge } from "@/components/invoices/receipt-badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/layout/i18n-provider";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { InvoiceFiltersData, InvoiceRecord } from "@/types/finance";

function InvoiceTableComponent({
  invoices,
  canManage,
  filterData,
  commentsByInvoiceId,
  role,
  currentUserId,
  mentionCandidates,
  returnPath = "/finance/invoices",
}: {
  invoices: InvoiceRecord[];
  canManage: boolean;
  filterData: InvoiceFiltersData;
  commentsByInvoiceId: Record<string, CommentRecord[]>;
  role: AppRole;
  currentUserId: string;
  mentionCandidates: MentionCandidate[];
  returnPath?: string;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  return (
    <div className="overflow-hidden rounded-[22px] border border-border/80 bg-white shadow-[var(--shadow-soft)] dark:bg-card/72">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/65 bg-slate-50/80 text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:bg-white/[0.03] dark:text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-medium">{isFr ? "Facture" : "Invoice"}</th>
              <th className="px-5 py-4 font-medium">{isFr ? "Statut" : "Status"}</th>
              <th className="px-5 py-4 font-medium">Client</th>
              <th className="px-5 py-4 font-medium">{isFr ? "Échéance" : "Due date"}</th>
              <th className="px-5 py-4 font-medium">{isFr ? "Montant TTC" : "Gross amount"}</th>
              <th className="px-5 py-4 font-medium">{isFr ? "Payé / restant" : "Paid / Remaining"}</th>
              <th className="px-5 py-4 font-medium">{isFr ? "Justificatifs" : "Receipts"}</th>
              <th className="px-5 py-4 font-medium">{isFr ? "Actions" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b border-border/50 transition-colors last:border-b-0 hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                <td className="px-5 py-4">
                  <p className="font-medium">{invoice.invoice_number}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{invoice.project?.name ?? (isFr ? "Aucun projet lié" : "No linked project")}</p>
                </td>
                <td className="px-5 py-4"><InvoiceStatusBadge status={invoice.paymentStatus} /></td>
                <td className="px-5 py-4">{invoice.client?.name ?? (isFr ? "Non lié" : "Not linked")}</td>
                <td className="px-5 py-4">{formatDate(invoice.due_date)}</td>
                <td className="px-5 py-4">{formatFinanceCurrency(invoice.amount_ttc, invoice.currency)}</td>
                <td className="px-5 py-4">
                  <p>{formatFinanceCurrency(invoice.totalPaid, invoice.currency)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatFinanceCurrency(invoice.remainingBalance, invoice.currency)} {isFr ? "restant" : "remaining"}</p>
                </td>
                <td className="px-5 py-4"><ReceiptBadge count={invoice.receipts.length} /></td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <InvoiceDetailDrawer
                      invoice={invoice}
                      canManage={canManage}
                      filterData={filterData}
                      comments={commentsByInvoiceId[invoice.id] ?? []}
                      role={role}
                      currentUserId={currentUserId}
                      mentionCandidates={mentionCandidates}
                      returnPath={returnPath}
                      trigger={<Button variant="ghost" size="icon" className="rounded-full"><Eye className="size-4" /></Button>}
                    />
                    {canManage ? (
                      <>
                        <InvoiceForm
                          mode="edit"
                          filterData={filterData}
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
                          triggerLabel={isFr ? "Modifier" : "Edit"}
                          returnPath={returnPath}
                        />
                        <ConfirmActionForm
                          action={deleteInvoiceAction}
                          fields={{ invoice_id: invoice.id, return_path: returnPath }}
                          title={isFr ? "Supprimer la facture ?" : "Delete invoice?"}
                          description={isFr ? `La facture ${invoice.invoice_number} sera supprimée définitivement. Cette action est irréversible.` : `This will permanently delete invoice ${invoice.invoice_number}. This action cannot be undone.`}
                          confirmLabel={isFr ? "Supprimer la facture" : "Delete invoice"}
                          trigger={(
                            <Button variant="ghost" size="icon" className="rounded-full text-rose-700 hover:bg-rose-500/10 hover:text-rose-800">
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        />
                      </>
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

export const InvoiceTable = memo(InvoiceTableComponent);
