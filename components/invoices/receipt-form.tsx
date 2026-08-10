"use client";

import { useActionState } from "react";
import { useI18n } from "@/components/layout/i18n-provider";
import { Plus } from "lucide-react";

import { createReceiptAction, type ReceiptActionState } from "@/app/(app)/finance/invoices/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { Textarea } from "@/components/ui/textarea";
import type { InvoiceFiltersData, PaymentRecord } from "@/types/finance";

const initialState: ReceiptActionState = {};

export function ReceiptForm({
  payments,
  filterData,
  returnPath,
}: {
  payments: PaymentRecord[];
  filterData: InvoiceFiltersData;
  returnPath?: string;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [state, formAction] = useActionState(createReceiptAction, initialState);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" className="rounded-full px-5">
          <Plus className="size-4" />
          {isFr ? "Ajouter un justificatif" : "Add receipt"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isFr ? "Créer un justificatif" : "Create receipt"}</DialogTitle>
          <DialogDescription>{isFr ? "Associez un justificatif à un encaissement lié." : "Attach a simple receipt record to a linked payment."}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {returnPath ? <input type="hidden" name="return_path" value={returnPath} /> : null}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="receipt-number">{isFr ? "Numéro du justificatif" : "Receipt number"}</label>
            <Input id="receipt-number" name="receipt_number" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="receipt-payment">{isFr ? "Encaissement" : "Payment"}</label>
            <ModernSelect
              id="receipt-payment"
              name="payment_id"
              placeholder="Select payment"
              options={[
                { value: "", label: "Select payment" },
                ...payments.map((payment) => ({
                  value: payment.id,
                  label: `${payment.reference ?? payment.client?.name ?? "Payment"} / ${payment.amount} ${payment.currency}`,
                })),
              ]}
            />
          </div>
          <div className="space-y-2"><label className="text-sm font-medium" htmlFor="receipt-date">{isFr ? "Date d’émission" : "Issue date"}</label><Input id="receipt-date" name="issue_date" type="date" required /></div>
          <div className="space-y-2"><label className="text-sm font-medium" htmlFor="receipt-amount">{isFr ? "Montant" : "Amount"}</label><Input id="receipt-amount" name="amount" type="number" min="0" step="0.01" required /></div>
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor="receipt-document">{isFr ? "Document lié" : "Linked document"}</label>
            <ModernSelect
              id="receipt-document"
              name="document_id"
              placeholder="No linked document"
              options={[
                { value: "", label: "No linked document" },
                ...filterData.documents.map((document) => ({
                  value: document.id,
                  label: document.title,
                })),
              ]}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor="receipt-notes">{isFr ? "Notes" : "Notes"}</label>
            <Textarea id="receipt-notes" name="notes" />
          </div>
          {state.error ? <div className="sm:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">{state.error}</div> : null}
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" className="rounded-2xl px-5">{isFr ? "Créer le justificatif" : "Create receipt"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
