import type { FinanceFilters } from "@/types/finance";

export function getDueWindowDates(_window: FinanceFilters["dueWindow"]) {
  void _window;
  const today = new Date();
  const current = today.toISOString().slice(0, 10);
  const next7 = new Date(today);
  next7.setDate(today.getDate() + 7);
  const next30 = new Date(today);
  next30.setDate(today.getDate() + 30);

  return {
    today: current,
    next7: next7.toISOString().slice(0, 10),
    next30: next30.toISOString().slice(0, 10),
  };
}

export function formatFinanceCurrency(amount: number | null, currency = "USD") {
  if (amount === null) {
    return "Not set";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}

export function getPaymentStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function getInvoiceStatusLabel(status: string) {
  if (status === "sent") {
    return "Pending";
  }

  if (status === "draft") {
    return "Standby";
  }

  return status.replaceAll("_", " ");
}

export function getPaymentMethodLabel(method: string) {
  return method.replaceAll("_", " ");
}

export function getTransferStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function getTransferCategoryLabel(category: string) {
  return category.replaceAll("_", " ");
}

export function getTransferEntityLabel(entity: string, locale: "fr" | "en" = "en") {
  switch (entity) {
    case "bumex_it":
      return "BUMEX IT";
    case "insec":
      return "INSEC";
    case "cnam_intec":
      return "CNAM INTEC";
    case "ltm_yh":
      return "LTM-YH";
    default:
      return locale === "fr" ? "Non attribuée" : "Unassigned";
  }
}

const TRANSFER_ENTITY_PREFIX = /^@@entity:([a-z_]+)@@\s*/i;
const TRANSFER_RENEWAL_PREFIX = /^@@renewal:([^\n]+)@@\s*/i;

type StoredTransferRenewal = {
  enabled?: boolean;
  next_due_date?: string | null;
  reminder_days?: number;
  interval_months?: number;
};

function parseTransferRenewal(value: string | undefined) {
  try {
    const parsed = value ? JSON.parse(value) as StoredTransferRenewal : {};
    return {
      enabled: Boolean(parsed.enabled),
      next_due_date: typeof parsed.next_due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.next_due_date) ? parsed.next_due_date : null,
      reminder_days: Number.isInteger(parsed.reminder_days) && (parsed.reminder_days as number) >= 0 ? parsed.reminder_days as number : 30,
      interval_months: Number.isInteger(parsed.interval_months) && (parsed.interval_months as number) > 0 ? parsed.interval_months as number : 12,
    };
  } catch {
    return { enabled: false, next_due_date: null, reminder_days: 30, interval_months: 12 };
  }
}

export function parseTransferNotesMetadata(notes: string | null) {
  if (!notes) {
    return {
      entity: "unassigned",
      notes: null,
      renewal: { enabled: false, next_due_date: null, reminder_days: 30, interval_months: 12 },
    } as const;
  }

  const match = notes.match(TRANSFER_ENTITY_PREFIX);
  const entity = (match?.[1] ?? "unassigned").toLowerCase();
  const withoutEntity = notes.replace(TRANSFER_ENTITY_PREFIX, "");
  const renewalMatch = withoutEntity.match(TRANSFER_RENEWAL_PREFIX);
  const cleanNotes = withoutEntity.replace(TRANSFER_RENEWAL_PREFIX, "").trim();

  return {
    entity,
    notes: cleanNotes || null,
    renewal: parseTransferRenewal(renewalMatch?.[1]),
  } as const;
}

export function buildTransferNotes(entity: string, notes: string, renewal?: StoredTransferRenewal) {
  const cleanNotes = notes.trim();
  const prefix = `@@entity:${entity || "unassigned"}@@`;
  const renewalMetadata = renewal?.enabled
    ? `@@renewal:${JSON.stringify({
      enabled: true,
      next_due_date: renewal.next_due_date ?? null,
      reminder_days: renewal.reminder_days ?? 30,
      interval_months: renewal.interval_months ?? 12,
    })}@@`
    : "";
  return [prefix, renewalMetadata, cleanNotes].filter(Boolean).join("\n");
}
