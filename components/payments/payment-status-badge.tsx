"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { PaymentStatus } from "@/types/finance";
import { toneBadge } from "@/components/ui/tone";

const statusStyles: Record<PaymentStatus, string> = {
  expected: toneBadge.brand,
  received: toneBadge.success,
  late: toneBadge.danger,
  cancelled: toneBadge.neutral,
  reconciled: toneBadge.success,
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { t } = useI18n();
  return (
    <Badge className={`rounded-full border px-3 py-1 capitalize ${statusStyles[status]}`}>
      {t(`finance.status.payment.${status}`, status.replaceAll("_", " "))}
    </Badge>
  );
}
