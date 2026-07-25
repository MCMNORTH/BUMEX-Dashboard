function formatPrintDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ReportPrintHeader({
  title,
  subtitle,
  generatedAt,
}: {
  title: string;
  subtitle?: string | null;
  generatedAt: string;
}) {
  return (
    <div className="report-print-header hidden border-b border-black/15 pb-6 print:block">
      <p className="text-xs font-semibold tracking-[0.2em] uppercase">BUMEX IT</p>
      <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm leading-6 text-black/70">{subtitle}</p> : null}
      <p className="mt-4 text-xs text-black/60">Generated on {formatPrintDate(generatedAt)}</p>
    </div>
  );
}
