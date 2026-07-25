"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { PaymentStatus } from "@/types/finance";

const statusStyles: Record<PaymentStatus, string> = {
  expected: "border-sky-500/20 bg-sky-500/12 text-sky-100",
  received: "border-emerald-500/20 bg-emerald-500/12 text-emerald-100",
  late: "border-rose-500/20 bg-rose-500/12 text-rose-100",
  cancelled: "border-slate-400/20 bg-slate-400/12 text-slate-200",
  reconciled: "border-violet-500/20 bg-violet-500/12 text-violet-100",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { t } = useI18n();
  return (
    <Badge className={`rounded-full border px-3 py-1 capitalize ${statusStyles[status]}`}>
      {t(`finance.status.payment.${status}`, status.replaceAll("_", " "))}
    </Badge>
  );
}
