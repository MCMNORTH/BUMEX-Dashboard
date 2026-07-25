"use client";

import { useActionState } from "react";
import { Plus, SquarePen } from "lucide-react";

import {
  createPaymentAction,
  updatePaymentAction,
  type PaymentActionState,
} from "@/app/(app)/finance/payments/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/layout/i18n-provider";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentFiltersData, PaymentFormValues } from "@/types/finance";

const initialState: PaymentActionState = {};

export function PaymentForm({
  mode,
  filterData,
  defaults,
  triggerLabel,
  returnPath,
}: {
  mode: "create" | "edit";
  filterData: PaymentFiltersData;
  defaults?: Partial<PaymentFormValues> & { payment_id?: string };
  triggerLabel?: string;
  returnPath?: string;
}) {
  const { t } = useI18n();
  const [state, formAction] = useActionState(
    mode === "create" ? createPaymentAction : updatePaymentAction,
    initialState,
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="rounded-full px-5">
            <Plus className="size-4" />
            {triggerLabel ?? t("finance.paymentForm.actions.create", "Create payment")}
          </Button>
        ) : (
          <Button variant="secondary" className="rounded-full px-5">
            <SquarePen className="size-4" />
            {triggerLabel ?? t("finance.paymentForm.actions.edit", "Edit payment")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-[min(94vw,1200px)] rounded-[28px]">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("finance.paymentForm.titleCreate", "Create payment") : t("finance.paymentForm.titleEdit", "Edit payment")}</DialogTitle>
          <DialogDescription>
            {t("finance.paymentForm.description", "Track expected and received client payments with linked project, contract, and invoice context.")}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {defaults?.payment_id ? <input type="hidden" name="payment_id" value={defaults.payment_id} /> : null}
          {returnPath ? <input type="hidden" name="return_path" value={returnPath} /> : null}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-client`}>{t("finance.paymentForm.fields.client", "Client")}</label>
            <ModernSelect
              id={`${mode}-client`}
              name="client_id"
              defaultValue={defaults?.client_id ?? ""}
              placeholder={t("finance.paymentForm.placeholders.selectClient", "Select client")}
              options={[
                { value: "", label: t("finance.paymentForm.placeholders.selectClient", "Select client") },
                ...filterData.clients.map((client) => ({ value: client.id, label: client.name })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-invoice`}>{t("finance.paymentForm.fields.invoice", "Invoice")}</label>
            <ModernSelect
              id={`${mode}-invoice`}
              name="invoice_id"
              defaultValue={defaults?.invoice_id ?? ""}
              placeholder={t("finance.paymentForm.placeholders.noLinkedInvoice", "No linked invoice")}
              options={[
                { value: "", label: t("finance.paymentForm.placeholders.noLinkedInvoice", "No linked invoice") },
                ...filterData.invoices.map((invoice) => ({ value: invoice.id, label: invoice.invoice_number })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-project`}>{t("finance.paymentForm.fields.project", "Project")}</label>
            <ModernSelect
              id={`${mode}-project`}
              name="project_id"
              defaultValue={defaults?.project_id ?? ""}
              placeholder={t("finance.paymentForm.placeholders.noLinkedProject", "No linked project")}
              options={[
                { value: "", label: t("finance.paymentForm.placeholders.noLinkedProject", "No linked project") },
                ...filterData.projects.map((project) => ({ value: project.id, label: project.name })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-contract`}>{t("finance.paymentForm.fields.contract", "Contract")}</label>
            <ModernSelect
              id={`${mode}-contract`}
              name="contract_id"
              defaultValue={defaults?.contract_id ?? ""}
              placeholder={t("finance.paymentForm.placeholders.noLinkedContract", "No linked contract")}
              options={[
                { value: "", label: t("finance.paymentForm.placeholders.noLinkedContract", "No linked contract") },
                ...filterData.contracts.map((contract) => ({ value: contract.id, label: contract.title })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-amount`}>{t("finance.paymentForm.fields.amount", "Amount")}</label>
            <Input id={`${mode}-amount`} name="amount" type="number" min="0" step="0.01" defaultValue={defaults?.amount ?? ""} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-currency`}>{t("finance.paymentForm.fields.currency", "Currency")}</label>
            <Input id={`${mode}-currency`} name="currency" defaultValue={defaults?.currency ?? "USD"} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-due-date`}>{t("finance.paymentForm.fields.dueDate", "Due date")}</label>
            <Input id={`${mode}-due-date`} name="due_date" type="date" defaultValue={defaults?.due_date ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-payment-date`}>{t("finance.paymentForm.fields.paymentDate", "Payment date")}</label>
            <Input id={`${mode}-payment-date`} name="payment_date" type="date" defaultValue={defaults?.payment_date ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-method`}>{t("finance.paymentForm.fields.method", "Method")}</label>
            <ModernSelect
              id={`${mode}-method`}
              name="method"
              defaultValue={defaults?.method ?? "bank_transfer"}
              options={[
                { value: "bank_transfer", label: t("finance.methods.bank_transfer", "Bank transfer") },
                { value: "card", label: t("finance.methods.card", "Card") },
                { value: "cash", label: t("finance.methods.cash", "Cash") },
                { value: "check", label: t("finance.methods.check", "Check") },
                { value: "mobile_money", label: t("finance.methods.mobile_money", "Mobile money") },
                { value: "other", label: t("finance.methods.other", "Other") },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-status`}>{t("finance.paymentForm.fields.status", "Status")}</label>
            <ModernSelect
              id={`${mode}-status`}
              name="status"
              defaultValue={defaults?.status ?? "expected"}
              options={[
                { value: "expected", label: t("finance.status.payment.expected", "Expected") },
                { value: "received", label: t("finance.status.payment.received", "Received") },
                { value: "late", label: t("finance.status.payment.late", "Late") },
                { value: "cancelled", label: t("finance.status.payment.cancelled", "Cancelled") },
                { value: "reconciled", label: t("finance.status.payment.reconciled", "Reconciled") },
              ]}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-reference`}>{t("finance.paymentForm.fields.reference", "Reference")}</label>
            <Input id={`${mode}-reference`} name="reference" defaultValue={defaults?.reference ?? ""} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-notes`}>{t("finance.paymentForm.fields.notes", "Notes")}</label>
            <Textarea id={`${mode}-notes`} name="notes" defaultValue={defaults?.notes ?? ""} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-supporting-file`}>{t("finance.paymentForm.fields.supportingDocument", "Supporting document")}</label>
            <Input id={`${mode}-supporting-file`} name="supporting_file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" />
            <p className="text-xs text-muted-foreground">
              {t("finance.paymentForm.supportingFileHint", "Upload proof of payment, bank advice, receipt scan, or any client payment evidence.")}
            </p>
          </div>

          {state.error ? (
            <div className="sm:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
              {state.error}
            </div>
          ) : null}

          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="submit" className="rounded-2xl px-5">
              {mode === "create" ? t("finance.paymentForm.actions.create", "Create payment") : t("finance.paymentForm.actions.save", "Save changes")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
