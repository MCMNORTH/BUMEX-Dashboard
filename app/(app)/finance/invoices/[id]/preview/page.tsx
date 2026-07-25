import Link from "next/link";
import { Download, FileText } from "lucide-react";

import { InvoiceDocumentView } from "@/components/invoices/invoice-document-view";
import { InvoiceToast } from "@/components/invoices/invoice-toast";
import { SendInvoiceEmailForm } from "@/components/invoices/send-invoice-email-form";
import { Button } from "@/components/ui/button";
import { requireIncomingFinanceOperationsAccess } from "@/lib/auth/server";
import { getInvoiceById } from "@/lib/finance/service";
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
          <Button asChild variant="secondary" className="rounded-full px-5">
            <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
              <FileText className="size-4" />
              {locale === "fr" ? "Ouvrir le PDF" : "Open PDF"}
            </a>
          </Button>
          <Button asChild variant="secondary" className="rounded-full px-5">
            <a href={`/api/invoices/${invoice.id}/pdf?download=1`} target="_blank" rel="noreferrer">
              <Download className="size-4" />
              {locale === "fr" ? "Télécharger le PDF" : "Download PDF"}
            </a>
          </Button>
          <SendInvoiceEmailForm
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoice_number}
            defaultEmail={invoice.client?.contact_email ?? ""}
            returnPath={`/finance/invoices/${invoice.id}/preview`}
          />
        </div>
      </div>

      <InvoiceDocumentView invoice={invoice} locale={locale} />
    </div>
  );
}
