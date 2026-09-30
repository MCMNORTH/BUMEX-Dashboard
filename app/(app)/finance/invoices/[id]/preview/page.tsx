import Link from "next/link";
import { BellRing, Download, FileText, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";

import { InvoiceDocumentView } from "@/components/invoices/invoice-document-view";
import { InvoiceApprovalTimeline } from "@/components/invoices/invoice-approval-timeline";
import { InvoiceToast } from "@/components/invoices/invoice-toast";
import { SendInvoiceEmailForm } from "@/components/invoices/send-invoice-email-form";
import { approveInvoiceAction, remindInvoiceApproversAction, requestInvoiceChangesAction, revokeInvoiceApprovalAction } from "@/app/(app)/finance/invoices/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmActionForm } from "@/components/shared/confirm-action-form";
import { requireIncomingFinanceOperationsAccess } from "@/lib/auth/server";
import { getInvoiceById } from "@/lib/finance/service";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { getCurrentLocale } from "@/lib/i18n/server";

export default async function InvoicePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireIncomingFinanceOperationsAccess();
  const locale = await getCurrentLocale();
  const { id } = await params;
  const invoice = await getInvoiceById(id, auth.role);

  if (!invoice) {
    return (
      <div className="rounded-[28px] border border-dashed border-border/70 bg-background/35 p-8 text-center text-sm text-muted-foreground">
        {locale === "fr" ? "Facture introuvable." : "Invoice not found."}
      </div>
    );
  }

  const isApproved = invoice.approval_status === "approved";
  const isAdmin = auth.role === "admin";
  const canRemind = auth.role === "manager" || auth.role === "employee";
  const revisionRequest = getActiveRevisionRequest(invoice);

  return (
    <div className="space-y-6">
      <InvoiceToast />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {locale === "fr" ? "Aperçu de facture" : "Invoice preview"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-slate-950">{invoice.invoice_number}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {locale === "fr"
              ? "Vérifiez la mise en page finale, ouvrez le PDF généré ou envoyez-le directement au client."
              : "Review the final client-facing layout, open the generated PDF, or send it directly to the client."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" className="rounded-full px-5">
            <Link href="/finance/invoices">
              <FileText className="size-4" />
              {locale === "fr" ? "Retour aux factures" : "Back to invoices"}
            </Link>
          </Button>
          {isApproved ? <Button asChild variant="secondary" className="rounded-full px-5">
            <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
              <FileText className="size-4" />
              {locale === "fr" ? "Ouvrir le PDF" : "Open PDF"}
            </a>
          </Button> : null}
          {isApproved ? <Button asChild variant="secondary" className="rounded-full px-5">
            <a href={`/api/invoices/${invoice.id}/pdf?download=1`} target="_blank" rel="noreferrer">
              <Download className="size-4" />
              {locale === "fr" ? "Télécharger le PDF" : "Download PDF"}
            </a>
          </Button> : null}
          {isApproved ? <SendInvoiceEmailForm
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoice_number}
            defaultEmail={invoice.client?.contact_email ?? ""}
            returnPath={`/finance/invoices/${invoice.id}/preview`}
          /> : null}
        </div>
      </div>

      <div className={`flex flex-col gap-4 rounded-[26px] border p-5 sm:flex-row sm:items-start sm:justify-between ${isApproved ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100" : revisionRequest ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100" : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100"}`}>
        <div className="flex items-start gap-3">
          {isApproved ? <ShieldCheck className="mt-0.5 size-5 shrink-0" /> : revisionRequest ? <RotateCcw className="mt-0.5 size-5 shrink-0" /> : <LockKeyhole className="mt-0.5 size-5 shrink-0" />}
          <div>
            <p className="font-semibold">{isApproved ? (locale === "fr" ? "Facture validée" : "Invoice approved") : revisionRequest ? (locale === "fr" ? "Corrections demandées" : "Changes requested") : (locale === "fr" ? "Validation administrative requise" : "Administrator approval required")}</p>
            <p className="mt-1 text-sm opacity-80">
              {isApproved
                ? (locale === "fr" ? `Validée par ${invoice.approvedBy?.full_name ?? "un administrateur"} le ${formatApprovalDate(invoice.approved_at)}. Elle peut être téléchargée et envoyée.` : `Approved by ${invoice.approvedBy?.full_name ?? "an administrator"} on ${formatApprovalDate(invoice.approved_at)}. It can now be downloaded and sent.`)
                : revisionRequest
                  ? revisionRequest
                  : (locale === "fr" ? "Le téléchargement du PDF et l’envoi au client sont bloqués jusqu’à la validation d’un administrateur." : "PDF download and client delivery are locked until an administrator approves this invoice.")}
            </p>
          </div>
        </div>
        {!isApproved && isAdmin ? <div className="flex w-full max-w-md flex-col gap-3">
          <div className="flex justify-end">
            <ConfirmActionForm
              action={approveInvoiceAction}
              fields={{ invoice_id: invoice.id, return_path: `/finance/invoices/${invoice.id}/preview` }}
              title={locale === "fr" ? "Confirmer la validation" : "Confirm approval"}
              description={locale === "fr" ? `${invoice.invoice_number} · ${invoice.client?.name ?? "Client non renseigné"} · ${formatFinanceCurrency(invoice.amount_ttc, invoice.currency)}. Après confirmation, la facture pourra être téléchargée et envoyée.` : `${invoice.invoice_number} · ${invoice.client?.name ?? "No client"} · ${formatFinanceCurrency(invoice.amount_ttc, invoice.currency)}. After confirmation, the invoice can be downloaded and sent.`}
              confirmLabel={locale === "fr" ? "Confirmer la validation" : "Confirm approval"}
              cancelLabel={locale === "fr" ? "Annuler" : "Cancel"}
              tone="success"
              trigger={<Button type="button" className="rounded-full px-5"><ShieldCheck className="size-4" />{locale === "fr" ? "Valider la facture" : "Approve invoice"}</Button>}
            />
          </div>
          <form action={requestInvoiceChangesAction} className="space-y-2 rounded-2xl border border-current/15 bg-white/55 p-3 dark:bg-black/10">
            <input type="hidden" name="invoice_id" value={invoice.id} />
            <input type="hidden" name="return_path" value={`/finance/invoices/${invoice.id}/preview`} />
            <Textarea name="reason" required minLength={5} placeholder={locale === "fr" ? "Expliquez clairement ce qui doit être corrigé…" : "Explain clearly what needs to be corrected…"} className="min-h-20 bg-white/80 dark:bg-black/15" />
            <Button type="submit" variant="secondary" className="w-full rounded-full"><RotateCcw className="size-4" />{locale === "fr" ? "Demander des corrections" : "Request changes"}</Button>
          </form>
        </div> : null}
        {!isApproved && canRemind && !revisionRequest ? <form action={remindInvoiceApproversAction}>
          <input type="hidden" name="invoice_id" value={invoice.id} />
          <input type="hidden" name="return_path" value={`/finance/invoices/${invoice.id}/preview`} />
          <Button type="submit" variant="secondary" className="rounded-full px-5"><BellRing className="size-4" />{locale === "fr" ? "Relancer les administrateurs" : "Remind administrators"}</Button>
        </form> : null}
        {isApproved && isAdmin ? <form action={revokeInvoiceApprovalAction} className="w-full max-w-md space-y-2 rounded-2xl border border-emerald-700/15 bg-white/55 p-3 dark:bg-black/10">
          <input type="hidden" name="invoice_id" value={invoice.id} />
          <input type="hidden" name="return_path" value={`/finance/invoices/${invoice.id}/preview`} />
          <Textarea name="reason" required minLength={5} placeholder={locale === "fr" ? "Motif du retrait de validation…" : "Reason for revoking approval…"} className="min-h-20 bg-white/80 dark:bg-black/15" />
          <Button type="submit" variant="secondary" className="w-full rounded-full"><RotateCcw className="size-4" />{locale === "fr" ? "Retirer la validation" : "Revoke approval"}</Button>
        </form> : null}
      </div>

      <InvoiceApprovalTimeline invoice={invoice} locale={locale} />

      <InvoiceDocumentView invoice={invoice} locale={locale} />
    </div>
  );
}

function formatApprovalDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function getActiveRevisionRequest(invoice: { updated_at: string; recentActivity: Array<{ action: string; created_at: string; metadata: { summary?: string } }> }) {
  const request = invoice.recentActivity.find((activity) => activity.action === "Invoice changes requested");
  if (!request || new Date(request.created_at).getTime() <= new Date(invoice.updated_at).getTime()) return null;
  return request.metadata.summary || "Des corrections sont nécessaires avant la validation.";
}
