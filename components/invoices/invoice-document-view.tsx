import Image from "next/image";
import QRCode from "qrcode";

import { getInvoicePresentation, getInvoiceQrPayload } from "@/lib/finance/invoice-view";
import type { Locale } from "@/lib/i18n/config";
import type { InvoiceRecord } from "@/types/finance";

export async function InvoiceDocumentView({
  invoice,
  locale,
}: {
  invoice: InvoiceRecord;
  locale: Locale;
}) {
  const presentation = getInvoicePresentation(invoice, locale);
  const qrCodeDataUrl = await QRCode.toDataURL(getInvoiceQrPayload(invoice, locale), {
    margin: 1,
    width: 220,
    color: {
      dark: presentation.brand.logoPrimaryColor,
      light: "#FFFFFF",
    },
  });

  const labels = {
    to: locale === "fr" ? "A" : "To",
    invoiceDate: locale === "fr" ? "Date de facture" : "Invoice date",
    dueDate: locale === "fr" ? "Date d'echeance" : "Due date",
    paymentMethod: locale === "fr" ? "Mode de paiement" : "Payment method",
    paymentTerms: locale === "fr" ? "Conditions de paiement" : "Payment terms",
    contactAddress: locale === "fr" ? "Contact / Adresse" : "Contact / Address",
    amountInCurrency:
      locale === "fr"
        ? `Montant en ${presentation.currency === "EUR" ? "euros" : presentation.currency}`
        : `Amount in ${presentation.currency === "EUR" ? "Euros" : presentation.currency}`,
    description: "DESCRIPTION",
    qty: locale === "fr" ? "QTE" : "QTY",
    unitPrice: locale === "fr" ? "P.U." : "U.P.",
    vat: "VAT",
    wht: "WHT",
    total: "TOTAL",
    totalNet: locale === "fr" ? "Total net" : "Total net",
    totalTax: locale === "fr" ? "Total taxe" : "Total tax",
    totalInclTax: locale === "fr" ? "Total TTC" : "Total (inc. tax)",
    totalWht: "Total WHT",
    totalDue: locale === "fr" ? "TOTAL DU" : "TOTAL DUE",
    paymentInformation:
      locale === "fr" ? "INFORMATIONS DE PAIEMENT" : "PAYMENT INFORMATION",
  };

  const totalRows: Array<[string, string]> = [
    [labels.totalNet, presentation.amountHtLabel],
    [labels.totalTax, presentation.taxAmountLabel],
    [labels.totalInclTax, presentation.amountTtcLabel],
  ];

  const settlementRows: Array<[string, string]> = presentation.totalWhtLabel
    ? [[labels.totalWht, presentation.totalWhtLabel]]
    : [];

  return (
    <div className="mx-auto w-full max-w-[1120px] bg-white px-6 py-8 text-slate-700">
      <section className="rounded-[18px] border border-slate-200 bg-white px-8 py-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex gap-5">
            <div className="pt-1">
              {presentation.brand.usePlaceholderLogo ? (
                <LogoPlaceholder presentation={presentation} />
              ) : (
                <Image
                  src={presentation.brand.logoPath}
                  alt={presentation.brand.companyName}
                  width={116}
                  height={116}
                  className="h-24 w-24 object-contain"
                />
              )}
            </div>
            <div>
              <h1 className="text-[26px] font-bold tracking-[-0.03em] text-slate-900">
                {presentation.brand.companyName}
              </h1>
              {presentation.brand.addressLine.split("\n").map((line) => (
                <p key={line} className="text-[17px] leading-7 text-slate-700">
                  {line}
                </p>
              ))}
              <div className="mt-6 space-y-1 text-[17px] leading-7">
                <p>Phone: {presentation.brand.phone}</p>
                <p>Email: {presentation.brand.email}</p>
                <p>Web: {presentation.brand.website}</p>
              </div>
            </div>
          </div>

          <div className="justify-self-end text-left text-[17px] leading-7">
            <h2 className="text-[30px] font-bold tracking-[-0.03em] text-slate-900">
              {presentation.invoiceLabel} ({presentation.invoiceNumber})
            </h2>
            <div className="mt-5 grid grid-cols-[auto_auto] gap-x-4">
              <FieldLine label={labels.invoiceDate} value={presentation.invoiceDateLabel} />
              <FieldLine label={labels.dueDate} value={presentation.dueDateLabel} />
              <FieldLine label={labels.paymentMethod} value={presentation.paymentMethodLabel} />
              <FieldLine label={labels.paymentTerms} value={presentation.paymentTermsLabel} />
              <FieldLine label={labels.contactAddress} value={presentation.contactAddressLine} />
            </div>
          </div>
        </div>

        <div className="mt-5 h-[9px] bg-[#162b45]" />

        <div className="mt-6 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="flex min-h-48 items-center justify-center bg-white px-6 py-6">
            <div className="bg-transparent p-0 shadow-none">
              <Image
                src={qrCodeDataUrl}
                alt={`QR ${presentation.invoiceNumber}`}
                width={156}
                height={156}
                className="h-[156px] w-[156px]"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[18px] font-semibold text-slate-600">{labels.to}</p>
            <div className="rounded-[16px] border border-slate-300 bg-[#f3f5f8] px-7 py-6 text-[16px] leading-8">
              <p className="text-[20px] font-bold text-slate-700">{presentation.clientName}</p>
              <p>{presentation.clientAddress}</p>
              <p>
                {labels.contactAddress}: {presentation.contactAddressLine}
              </p>
              <p>Email: {presentation.clientEmail}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-2 text-right text-[16px] italic text-slate-500">
          {labels.amountInCurrency}
        </div>

        <div className="mt-3 overflow-hidden rounded-[10px] border border-slate-200">
          <table className="w-full table-fixed border-collapse text-[16px] text-slate-800">
            <colgroup>
              {presentation.isGta ? (
                <>
                  <col className="w-[46%]" />
                  <col className="w-[8%]" />
                  <col className="w-[16%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[14%]" />
                </>
              ) : (
                <>
                  <col className="w-[52%]" />
                  <col className="w-[8%]" />
                  <col className="w-[17%]" />
                  <col className="w-[8%]" />
                  <col className="w-[15%]" />
                </>
              )}
            </colgroup>
            <thead>
              <tr className="bg-[#c9d9ea] text-[14px] font-bold tracking-[0.02em] text-slate-800">
                <th className="px-6 py-4 text-left">{labels.description}</th>
                <th className="px-3 py-4 text-center">{labels.qty}</th>
                <th className="px-3 py-4 text-right">{labels.unitPrice}</th>
                <th className="px-3 py-4 text-right">{labels.vat}</th>
                {presentation.isGta ? <th className="px-3 py-4 text-right">{labels.wht}</th> : null}
                <th className="px-6 py-4 text-right">{labels.total}</th>
              </tr>
            </thead>
            <tbody>
              {presentation.lineItems.map((line, index) => (
                <tr key={`${line.name}-${index}`} className="border-t border-slate-200">
                  <td className="px-6 py-5 pr-8 leading-7">{line.name}</td>
                  <td className="px-3 py-5 text-center tabular-nums">{line.quantityLabel}</td>
                  <td className="px-3 py-5 text-right tabular-nums">{line.unitPriceLabel}</td>
                  <td className="px-3 py-5 text-right tabular-nums">{line.vatRateLabel}</td>
                  {presentation.isGta ? (
                    <td className="px-3 py-5 text-right tabular-nums">{line.whtRateLabel}</td>
                  ) : null}
                  <td className="px-6 py-5 text-right tabular-nums">{line.totalLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 border-b border-t border-slate-300 py-2 text-[18px] italic text-slate-700">
          {presentation.amountInWords}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[0.98fr_0.9fr]">
          <div className="space-y-4">
            {presentation.regimeNote ? <InfoBox text={presentation.regimeNote} /> : null}
            {presentation.vatNote ? <InfoBox text={presentation.vatNote} compact /> : null}

            <div className="rounded-[16px] border border-slate-300 bg-[#f3f5f8] px-7 py-6">
              <p className="text-[20px] font-bold text-slate-900">
                {labels.paymentInformation}
              </p>
              <div className="mt-3 space-y-2 text-[16px] leading-8">
                <p>BANK: {presentation.brand.bankName}</p>
                <p>ACCOUNT OWNER NAME: {presentation.brand.accountOwner}</p>
                <p>IBAN: {presentation.brand.iban}</p>
                <p>BIC/SWIFT: {presentation.brand.bic}</p>
              </div>
            </div>
          </div>

          <div>
            <TotalsTable rows={totalRows} />
            {settlementRows.length ? (
              <div className="mt-6">
                <TotalsTable rows={settlementRows} finalRow={[labels.totalDue, presentation.totalDueLabel]} />
              </div>
            ) : (
              <div className="mt-6">
                <TotalsTable rows={[]} finalRow={[labels.totalDue, presentation.totalDueLabel]} />
              </div>
            )}

            <div className="mt-10 flex flex-col items-end pr-8">
              <p className="text-[18px] font-bold text-slate-700">
                {presentation.brand.companyName}
              </p>
              <div className="mt-4 h-28 w-56 rounded-[18px] border border-dashed border-slate-300 bg-white/60" />
            </div>
          </div>
        </div>

        <div className="mt-16 border-t-[6px] border-[#162b45] pt-3 text-center text-[14px] leading-6 text-slate-700">
          <p className="font-semibold">{presentation.brand.footerLabel}</p>
          <p>
            {presentation.brand.phone} - {presentation.brand.website} - {presentation.brand.email}
          </p>
          <p>{presentation.brand.capitalLabel}</p>
          <p>NIF: {presentation.brand.taxId}</p>
        </div>
      </section>
    </div>
  );
}

function LogoPlaceholder({
  presentation,
}: {
  presentation: ReturnType<typeof getInvoicePresentation>;
}) {
  return (
    <div
      className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_14px_35px_rgba(15,23,42,0.08)]"
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at top, ${presentation.brand.logoSecondaryColor}33, transparent 62%), linear-gradient(180deg, white, #f8fbff)`,
        }}
      />
      <span
        className="relative text-center font-semibold tracking-[-0.04em]"
        style={{
          color: presentation.brand.logoPrimaryColor,
          fontSize: "1.05rem",
        }}
      >
        {presentation.brand.logoLabel}
      </span>
    </div>
  );
}

function FieldLine({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-slate-500">{label}:</span>
      <span className="font-semibold text-slate-700">{value}</span>
    </>
  );
}

function InfoBox({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div
      className={`rounded-[16px] border border-slate-300 bg-[#f3f5f8] px-5 text-[16px] leading-8 text-slate-700 ${
        compact ? "py-3" : "py-4"
      }`}
    >
      {text}
    </div>
  );
}

function TotalsTable({
  rows,
  finalRow,
}: {
  rows: Array<[string, string]>;
  finalRow?: [string, string];
}) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-slate-300">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid grid-cols-[1fr_0.46fr] border-b border-slate-300 last:border-b-0"
        >
          <div className="px-6 py-3 text-[18px] font-semibold text-slate-700">{label}</div>
          <div className="border-l border-slate-300 px-6 py-3 text-right text-[18px] font-semibold text-slate-700">
            {value}
          </div>
        </div>
      ))}
      {finalRow ? (
        <div className="grid grid-cols-[1fr_0.46fr] bg-[#376796] text-white">
          <div className="px-6 py-4 text-[20px] font-bold">{finalRow[0]}</div>
          <div className="border-l border-white/20 px-6 py-4 text-right text-[20px] font-bold">
            {finalRow[1]}
          </div>
        </div>
      ) : null}
    </div>
  );
}
