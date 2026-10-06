"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { InvoiceStatus } from "@/types/finance";
import { toneBadge } from "@/components/ui/tone";

const statusStyles: Record<InvoiceStatus, string> = {
  draft: toneBadge.neutral,
  sent: toneBadge.brand,
  partially_paid: toneBadge.warning,
  paid: toneBadge.success,
  overdue: toneBadge.danger,
  cancelled: toneBadge.neutral,
  archived: toneBadge.neutral,
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { t } = useI18n();
  return (
    <Badge variant="outline" className={`rounded-full border px-3 py-1 capitalize ${statusStyles[status]}`}>
      {t(`finance.status.invoice.${status}`, status.replaceAll("_", " "))}
    </Badge>
  );
}
