"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { InvoiceStatus } from "@/types/finance";

const statusStyles: Record<InvoiceStatus, string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-300/10 dark:bg-slate-500/12 dark:text-slate-100",
  sent: "border-blue-500/20 bg-blue-50 text-blue-700 dark:border-sky-300/10 dark:bg-sky-500/12 dark:text-sky-100",
  partially_paid: "border-amber-500/25 bg-amber-50 text-amber-700 dark:border-amber-300/10 dark:bg-amber-500/12 dark:text-amber-100",
  paid: "border-emerald-500/25 bg-emerald-50 text-emerald-700 dark:border-emerald-300/10 dark:bg-emerald-500/12 dark:text-emerald-100",
  overdue: "!border-red-600/30 !bg-red-600 !text-white dark:!border-rose-400/20 dark:!bg-rose-500 dark:!text-white",
  cancelled: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-300/10 dark:bg-zinc-500/12 dark:text-zinc-200",
  archived: "border-border/70 bg-background/45 text-foreground",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { t } = useI18n();
  return (
    <Badge variant="outline" className={`rounded-full border px-3 py-1 capitalize ${statusStyles[status]}`}>
      {t(`finance.status.invoice.${status}`, status.replaceAll("_", " "))}
    </Badge>
  );
}
