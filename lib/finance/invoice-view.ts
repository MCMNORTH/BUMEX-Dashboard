import type { Locale } from "@/lib/i18n/config";
import { getBumexEntity } from "@/lib/entities/config";
import { parseInvoiceMetadata } from "@/lib/finance/invoice-metadata";
import { siteConfig } from "@/lib/site";
import type { InvoiceLineItem, InvoiceRecord, PaymentMethod } from "@/types/finance";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const GENERATED_INVOICE_DESCRIPTION =
  "System-generated invoice PDF. Regenerated automatically from invoice data.";

export type InvoiceBranding = {
  addressLine: string;
  companyName: string;
  logoPath: string;
  logoLabel: string;
  logoPrimaryColor: string;
  logoSecondaryColor: string;
  usePlaceholderLogo: boolean;
  email: string;
  phone: string;
  taxId: string;
  website: string;
  bankName: string;
  accountOwner: string;
  iban: string;
  bic: string;
  capitalLabel: string;
  footerLabel: string;
};

export type InvoicePresentationLine = {
  name: string;
  quantityLabel: string;
  unitPriceLabel: string;
  vatRateLabel: string;
  whtRateLabel: string | null;
  totalLabel: string;
};

export type InvoicePresentation = {
  amountHtLabel: string;
  amountInWords: string;
  amountTtcLabel: string;
  brand: InvoiceBranding;
  clientAddress: string;
  clientEmail: string;
  clientName: string;
  contactAddressLine: string;
  createdByName: string;
  currency: string;
  dueDateLabel: string;
  invoiceDateLabel: string;
  invoiceLabel: string;
  invoiceNumber: string;
  isGta: boolean;
  isTaxFree: boolean;
  lineItems: InvoicePresentationLine[];
  notes: string;
  paymentMethodLabel: string;
  paymentStatusLabel: string;
  paymentTermsLabel: string;
  quantityLabel: string;
  regimeNote: string | null;
  remainingBalanceLabel: string;
  taxAmountLabel: string;
  totalDueLabel: string;
  totalPaidLabel: string;
  totalWhtLabel: string | null;
  vatNote: string | null;
  vatRateLabel: string;
  whtRateLabel: string | null;
};

function getEnv(name: string, fallback = "") {
  const value = process.env[name];
  return value?.trim() || fallback;
}

function getLocalDevBaseUrl() {
  const devLogPath = join(process.cwd(), "webpack-dev.out.log");

  if (existsSync(devLogPath)) {
    try {
      const logContent = readFileSync(devLogPath, "utf8");
      const networkMatch = logContent.match(/- Network:\s+(http:\/\/[^\s]+)/);

      if (networkMatch?.[1]) {
        return networkMatch[1];
      }
    } catch {
      // Fall through to the default local URL.
    }
  }

  return "http://localhost:3000";
}

function getInvoicePublicBaseUrl() {
  const explicitUrl =
    getEnv("NEXT_PUBLIC_APP_URL")
    || getEnv("APP_URL")
    || getEnv("NEXT_PUBLIC_SITE_URL");

  if (explicitUrl) {
    return explicitUrl;
  }

  const vercelUrl = getEnv("VERCEL_URL");

  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
  }

  if (process.env.NODE_ENV === "development") {
    return getLocalDevBaseUrl();
  }

  return "";
}

function formatCurrency(amount: number | null, currency = "USD", locale: Locale = "en") {
  if (amount === null) {
    return locale === "fr" ? "Non défini" : "Not set";
  }

  try {
    return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatDateLabel(value: string | null, locale: Locale) {
  if (!value) {
    return locale === "fr" ? "Non défini" : "Not set";
  }

  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function numberToWordsEn(value: number): string {
  const underTwenty = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  if (value < 20) return underTwenty[value];
  if (value < 100) return `${tens[Math.floor(value / 10)]}${value % 10 ? `-${underTwenty[value % 10]}` : ""}`;
  if (value < 1000) {
    const rest = value % 100;
    return `${underTwenty[Math.floor(value / 100)]} hundred${rest ? ` ${numberToWordsEn(rest)}` : ""}`;
  }
  if (value < 1000000) {
    const rest = value % 1000;
    return `${numberToWordsEn(Math.floor(value / 1000))} thousand${rest ? ` ${numberToWordsEn(rest)}` : ""}`;
  }
  return `${value}`;
}

function numberToWordsFr(value: number): string {
  const units = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];

  if (value < 17) return units[value];
  if (value < 20) return `dix-${units[value - 10]}`;
  if (value < 100) {
    const tensMap: Record<number, string> = {
      20: "vingt",
      30: "trente",
      40: "quarante",
      50: "cinquante",
      60: "soixante",
      70: "soixante-dix",
      80: "quatre-vingts",
      90: "quatre-vingt-dix",
    };
    const tensValue = Math.floor(value / 10) * 10;
    const unit = value % 10;

    if (value < 70) {
      if (unit === 1 && tensValue !== 80) return `${tensMap[tensValue]} et un`;
      return `${tensMap[tensValue]}${unit ? `-${numberToWordsFr(unit)}` : ""}`;
    }

    if (value < 80) return `soixante-${numberToWordsFr(value - 60)}`;
    if (value === 80) return "quatre-vingts";
    return `quatre-vingt-${numberToWordsFr(value - 80)}`;
  }

  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;
    const hundredLabel = hundreds === 1 ? "cent" : `${numberToWordsFr(hundreds)} cent`;
    return `${hundredLabel}${rest ? ` ${numberToWordsFr(rest)}` : ""}`;
  }

  if (value < 1000000) {
    const thousands = Math.floor(value / 1000);
    const rest = value % 1000;
    const thousandLabel = thousands === 1 ? "mille" : `${numberToWordsFr(thousands)} mille`;
    return `${thousandLabel}${rest ? ` ${numberToWordsFr(rest)}` : ""}`;
  }

  return `${value}`;
}

function getAmountInWords(amount: number, currency: string, locale: Locale) {
  const integerValue = Math.round(amount);
  const words = locale === "fr" ? numberToWordsFr(integerValue) : numberToWordsEn(integerValue);
  const currencyLabel = currency === "EUR" ? (locale === "fr" ? "euros" : "Euros") : currency;

  return locale === "fr"
    ? `Cette facture s'élève à ${words} ${currencyLabel}`
    : `This invoice amounts to ${words} ${currencyLabel}`;
}

function getInvoiceBranding(invoice: InvoiceRecord): InvoiceBranding {
  const entity = getBumexEntity(invoice.entity_code);
  const companyName = entity?.billingName ?? getEnv("BUMEX_BILLING_COMPANY", "BUMEX S.A");
  const email = getEnv("BUMEX_BILLING_EMAIL", "bumex@bumex.mr");
  const phone = getEnv("BUMEX_BILLING_PHONE", "45 25 26 26 - Fax: 45 25 51 51");
  const website = getEnv("BUMEX_BILLING_WEBSITE", "https://bumex.mr");
  const taxId = getEnv("BUMEX_BILLING_TAX_ID", "21100778");
  const bankName = getEnv("BUMEX_BILLING_BANK_NAME", "Société Générale Mauritanie (SGM)");
  const accountOwner = getEnv("BUMEX_BILLING_ACCOUNT_OWNER", companyName);
  const iban = getEnv("BUMEX_BILLING_IBAN", "MR13 0001 2000 0100 0003 4369 703");
  const bic = getEnv("BUMEX_BILLING_BIC", "BIIMMRMRXXX");

  const addressLine = [
    getEnv("BUMEX_BILLING_ADDRESS", "301, Rue Cheikh Saad Bouh Kane"),
    getEnv("BUMEX_BILLING_ADDRESS_LINE_2", "Extension Module B suite Tavragh Zeina"),
    getEnv("BUMEX_BILLING_CITY", "7763 Nouakchott"),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    companyName,
    logoPath: entity?.logoPath ?? "/bumex-official-logo-transparent.png",
    logoLabel: entity?.shortLabel ?? "BUMEX",
    logoPrimaryColor: entity?.primaryColor ?? "#14386b",
    logoSecondaryColor: entity?.secondaryColor ?? "#7ea6e5",
    usePlaceholderLogo: !entity?.logoPath,
    email,
    phone,
    website,
    taxId,
    addressLine,
    bankName,
    accountOwner,
    iban,
    bic,
    capitalLabel: getEnv("BUMEX_BILLING_CAPITAL", "Capital of 10,000,000 MRU"),
    footerLabel: getEnv(
      "BUMEX_BILLING_FOOTER",
      "Registered office: BUMEX S.A - 301, Rue Cheikh Saad Bouh Kane, Extension Module B suite Tavragh Zeina - 7763 Nouakchott, Mauritania",
    ),
  };
}

function getClientAddress(invoice: InvoiceRecord) {
  return invoice.client?.name ?? "";
}

function getStatusLabel(status: string, locale: Locale) {
  const labels: Record<string, { fr: string; en: string }> = {
    draft: { fr: "Brouillon", en: "Draft" },
    sent: { fr: "En attente", en: "Pending" },
    partially_paid: { fr: "Partiellement payée", en: "Partially paid" },
    paid: { fr: "Payée", en: "Paid" },
    overdue: { fr: "En retard", en: "Overdue" },
    cancelled: { fr: "Annulée", en: "Cancelled" },
    archived: { fr: "Archivée", en: "Archived" },
  };

  return labels[status]?.[locale] ?? status;
}

function getPaymentMethodLabel(method: PaymentMethod, locale: Locale) {
  const labels: Record<PaymentMethod, { fr: string; en: string }> = {
    bank_transfer: { fr: "Virement bancaire", en: "Bank transfer" },
    cash: { fr: "Espèces", en: "Cash" },
    check: { fr: "Chèque", en: "Check" },
    mobile_money: { fr: "Mobile money", en: "Mobile money" },
    card: { fr: "Carte", en: "Card" },
    other: { fr: "Autre", en: "Other" },
  };

  return labels[method][locale];
}

function getFallbackItems(invoice: InvoiceRecord, locale: Locale): InvoiceLineItem[] {
  return [
    {
      name: locale === "fr" ? "Prestation professionnelle" : "Professional service",
      price: invoice.amount_ht,
    },
  ];
}

export function getInvoicePdfFileName(invoice: InvoiceRecord) {
  return `${invoice.invoice_number.toLowerCase()}.pdf`;
}

export function getInvoiceDocumentTitle(invoice: InvoiceRecord) {
  return `Invoice PDF - ${invoice.invoice_number}`;
}

export function getInvoiceQrPayload(invoice: InvoiceRecord, locale: Locale = "en") {
  const presentation = getInvoicePresentation(invoice, locale);
  const appUrl = getInvoicePublicBaseUrl();

  if (appUrl) {
    try {
      return new URL(`/api/invoices/${invoice.id}/pdf`, appUrl).toString();
    } catch {
      // Fall through to the structured payment payload below.
    }
  }

  return [
    locale === "fr" ? "BUMEX FACTURE - VERIFICATION ET PAIEMENT" : "BUMEX INVOICE - VERIFICATION AND PAYMENT",
    `${locale === "fr" ? "Reference" : "Reference"}: ${presentation.invoiceNumber}`,
    `${locale === "fr" ? "Entite" : "Entity"}: ${presentation.brand.companyName}`,
    `${locale === "fr" ? "Client" : "Client"}: ${presentation.clientName}`,
    `${locale === "fr" ? "Montant du" : "Amount due"}: ${presentation.totalDueLabel}`,
    `${locale === "fr" ? "Devise" : "Currency"}: ${presentation.currency}`,
    `${locale === "fr" ? "Echeance" : "Due date"}: ${presentation.dueDateLabel}`,
    `${locale === "fr" ? "Mode de paiement" : "Payment method"}: ${presentation.paymentMethodLabel}`,
    `${locale === "fr" ? "Banque" : "Bank"}: ${presentation.brand.bankName}`,
    `IBAN: ${presentation.brand.iban}`,
    `BIC: ${presentation.brand.bic}`,
    `${locale === "fr" ? "Titulaire du compte" : "Account owner"}: ${presentation.brand.accountOwner}`,
  ].join("\n");
}

export function getInvoicePresentation(invoice: InvoiceRecord, locale: Locale = "en"): InvoicePresentation {
  const metadata = parseInvoiceMetadata(invoice.notes);
  const isGta = metadata.isGta;
  const whtRate = isGta ? 0.07 : 0;
  const totalWht = isGta ? Number((invoice.amount_ttc * whtRate).toFixed(2)) : 0;
  const totalDue = Math.max(invoice.amount_ttc - totalWht, 0);
  const isTaxFree = invoice.tax_amount === 0;
  const vatRate =
    invoice.amount_ht > 0
      ? Number(((invoice.tax_amount / Math.max(invoice.amount_ht, 1)) * 100).toFixed(0))
      : 0;
  const items = metadata.items.length ? metadata.items : getFallbackItems(invoice, locale);
  const lines = items.map((item) => {
    const lineTaxAmount =
      invoice.amount_ht > 0
        ? Number(((item.price / invoice.amount_ht) * invoice.tax_amount).toFixed(2))
        : 0;
    const lineTotalAmount = Number((item.price + lineTaxAmount).toFixed(2));

    return {
      name: item.name,
      quantityLabel: "1",
      unitPriceLabel: formatCurrency(item.price, invoice.currency, locale),
      vatRateLabel: `${vatRate}%`,
      whtRateLabel: isGta ? `${Math.round(whtRate * 100)}%` : null,
      totalLabel: formatCurrency(lineTotalAmount, invoice.currency, locale),
    };
  });

  return {
    invoiceNumber: invoice.invoice_number,
    invoiceLabel: locale === "fr" ? "Facture" : "Invoice",
    brand: getInvoiceBranding(invoice),
    clientName: invoice.client?.name ?? "Client",
    clientEmail: invoice.client?.contact_email ?? (locale === "fr" ? "Aucun e-mail client" : "No client email"),
    clientAddress: getClientAddress(invoice),
    contactAddressLine: invoice.createdBy?.full_name ?? "LUIS SANTIAGO",
    createdByName: invoice.createdBy?.full_name ?? siteConfig.company,
    invoiceDateLabel: formatDateLabel(invoice.issue_date, locale),
    dueDateLabel: formatDateLabel(invoice.due_date, locale),
    paymentStatusLabel: getStatusLabel(invoice.paymentStatus, locale),
    amountHtLabel: formatCurrency(invoice.amount_ht, invoice.currency, locale),
    taxAmountLabel: formatCurrency(invoice.tax_amount, invoice.currency, locale),
    amountTtcLabel: formatCurrency(invoice.amount_ttc, invoice.currency, locale),
    totalPaidLabel: formatCurrency(invoice.totalPaid, invoice.currency, locale),
    remainingBalanceLabel: formatCurrency(invoice.remainingBalance, invoice.currency, locale),
    totalWhtLabel: isGta ? formatCurrency(-totalWht, invoice.currency, locale) : null,
    totalDueLabel: formatCurrency(totalDue, invoice.currency, locale),
    amountInWords: getAmountInWords(totalDue, invoice.currency, locale),
    currency: invoice.currency,
    notes:
      metadata.cleanNotes ||
      (locale === "fr"
        ? "Aucune note de facturation n'a été ajoutée."
        : "No billing notes were added for this invoice."),
    lineItems: lines,
    paymentMethodLabel: getPaymentMethodLabel(metadata.paymentMethod, locale),
    paymentTermsLabel: locale === "fr" ? "Paiement à réception" : "Due upon receipt",
    quantityLabel: "1",
    vatRateLabel: `${vatRate}%`,
    whtRateLabel: isGta ? `${Math.round(whtRate * 100)}%` : null,
    isGta,
    isTaxFree,
    regimeNote: isGta
      ? locale === "fr"
        ? "Facture émise sous le régime fiscal spécifique du projet GTA (Mauritanie-Sénégal). La retenue à la source (WHT) est prélevée par le client puis reversée à l'Unité conjointe."
        : "Invoice issued under the specific tax regime of the GTA Project (Mauritania-Senegal). The withholding tax (WHT) is withheld by the client and remitted to the Joint Unit."
      : null,
    vatNote: isGta
      ? locale === "fr"
        ? "La TVA n'est pas applicable conformément au régime fiscal GTA."
        : "VAT not applicable in accordance with the GTA tax regime."
      : isTaxFree
        ? locale === "fr"
          ? "TVA non appliquée sur cette facture."
          : "VAT is not applied on this invoice."
        : null,
  };
}

export function getInvoiceEmailSubject(invoice: InvoiceRecord) {
  return `${siteConfig.company} invoice ${invoice.invoice_number}`;
}

export function getInvoiceEmailText(invoice: InvoiceRecord) {
  const presentation = getInvoicePresentation(invoice, "en");

  return [
    "Hello,",
    "",
    `Please find attached invoice ${presentation.invoiceNumber} from ${presentation.brand.companyName}.`,
    `Invoice date: ${presentation.invoiceDateLabel}`,
    `Due date: ${presentation.dueDateLabel}`,
    `Amount due: ${presentation.totalDueLabel}`,
    "",
    `If you need any clarification, reply to ${presentation.brand.email}.`,
    "",
    `${presentation.brand.companyName}`,
  ].join("\n");
}

export function getInvoiceEmailHtml(invoice: InvoiceRecord) {
  const presentation = getInvoicePresentation(invoice, "en");

  return `
    <div style="font-family:Arial,sans-serif;background:#f5f8ff;padding:32px;color:#172033">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:24px;padding:32px;border:1px solid #d9e2f2">
        <h1 style="margin:0;font-size:28px">${presentation.invoiceLabel} ${presentation.invoiceNumber}</h1>
        <p style="margin:16px 0 0;font-size:16px;line-height:1.7;color:#46566f">
          Please find attached your invoice from ${presentation.brand.companyName}.
        </p>
        <p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#5a6880">
          Invoice date: ${presentation.invoiceDateLabel}<br />
          Due date: ${presentation.dueDateLabel}<br />
          Total due: ${presentation.totalDueLabel}
        </p>
      </div>
    </div>
  `;
}
