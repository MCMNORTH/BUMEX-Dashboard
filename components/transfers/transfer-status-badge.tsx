"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { TransferStatus } from "@/types/finance";

const statusStyles: Record<TransferStatus, string> = {
  planned: "border-slate-400/20 bg-slate-400/12 text-slate-200",
  pending: "border-amber-500/20 bg-amber-500/12 text-amber-100",
  sent: "border-sky-500/20 bg-sky-500/12 text-sky-100",
  confirmed: "border-emerald-500/20 bg-emerald-500/12 text-emerald-100",
  failed: "border-rose-500/20 bg-rose-500/12 text-rose-100",
  cancelled: "border-zinc-500/20 bg-zinc-500/12 text-zinc-200",
};

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const { t } = useI18n();
  return (
    <Badge className={`rounded-full border px-3 py-1 capitalize ${statusStyles[status]}`}>
      {t(`finance.status.transfer.${status}`, status.replaceAll("_", " "))}
    </Badge>
  );
}
