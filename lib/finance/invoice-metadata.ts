import type { InvoiceLineItem, PaymentMethod } from "@/types/finance";

type InvoiceMetadata = {
  paymentMethod: PaymentMethod;
  items: InvoiceLineItem[];
};

const TAX_REGIME_PATTERN = /\[TAX_REGIME:(GTA|STANDARD)\]\s*/gi;
const META_PATTERN = /\[INVOICE_META\]([\s\S]*?)\[\/INVOICE_META\]\s*/gi;

export function normalizeInvoiceItems(items: InvoiceLineItem[]) {
  return items
    .map((item) => ({
      name: item.name.trim(),
      price: Number(item.price),
    }))
    .filter((item) => item.name && Number.isFinite(item.price) && item.price >= 0);
}

export function stripInvoiceMetadata(value: string | null | undefined) {
  return (value ?? "")
    .replace(TAX_REGIME_PATTERN, "")
    .replace(META_PATTERN, "")
    .trim();
}

export function parseInvoiceMetadata(notes: string | null | undefined): {
  cleanNotes: string;
  isGta: boolean;
  paymentMethod: PaymentMethod;
  items: InvoiceLineItem[];
} {
  const source = notes ?? "";
  const cleanNotes = stripInvoiceMetadata(source);
  const isGta = source.toLowerCase().includes("[tax_regime:gta]");
  let paymentMethod: PaymentMethod = "bank_transfer";
  let items: InvoiceLineItem[] = [];

  const metaMatch = source.match(/\[INVOICE_META\]([\s\S]*?)\[\/INVOICE_META\]/i);
  if (metaMatch?.[1]) {
    try {
      const parsed = JSON.parse(metaMatch[1]) as Partial<InvoiceMetadata>;
      if (parsed.paymentMethod) {
        paymentMethod = parsed.paymentMethod;
      }
      if (Array.isArray(parsed.items)) {
        items = normalizeInvoiceItems(parsed.items as InvoiceLineItem[]);
      }
    } catch {
      items = [];
    }
  }

  return {
    cleanNotes,
    isGta,
    paymentMethod,
    items,
  };
}

export function buildInvoiceNotes(options: {
  notes: string;
  isGta: boolean;
  paymentMethod: PaymentMethod;
  items: InvoiceLineItem[];
}) {
  const cleanNotes = stripInvoiceMetadata(options.notes);
  const items = normalizeInvoiceItems(options.items);
  const sections = [
    options.isGta ? "[TAX_REGIME:GTA]" : "[TAX_REGIME:STANDARD]",
    `[INVOICE_META]${JSON.stringify({
      paymentMethod: options.paymentMethod,
      items,
    })}[/INVOICE_META]`,
  ];

  if (cleanNotes) {
    sections.push(cleanNotes);
  }

  return sections.join("\n");
}
