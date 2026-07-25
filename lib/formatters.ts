export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "0";
  }

  return new Intl.NumberFormat("fr-FR").format(value);
}

export function formatEditableNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numericValue = typeof value === "number" ? value : parseFormattedNumber(value);

  if (numericValue === null) {
    return String(value);
  }

  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
  }).format(numericValue);
}

export function parseFormattedNumber(value: string) {
  const normalized = value
    .replace(/\s/g, "")
    .replace(/\u202f/g, "")
    .replace(/\u00a0/g, "")
    .replace(",", ".");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}
