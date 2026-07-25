export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function getRelatedTypeLabel(value: string) {
  if (value === "archive") {
    return "General archive";
  }

  if (value === "bank_transfer") {
    return "Bank transfer";
  }

  return value.replaceAll("_", " ");
}
