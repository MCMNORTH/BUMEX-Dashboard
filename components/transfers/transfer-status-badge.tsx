"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { TransferStatus } from "@/types/finance";
import { toneBadge } from "@/components/ui/tone";

const statusStyles: Record<TransferStatus, string> = {
  planned: toneBadge.neutral,
  pending: toneBadge.warning,
  sent: toneBadge.brand,
  confirmed: toneBadge.success,
  failed: toneBadge.danger,
  cancelled: toneBadge.neutral,
};

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const { t } = useI18n();
  return (
    <Badge className={`rounded-full border px-3 py-1 capitalize ${statusStyles[status]}`}>
      {t(`finance.status.transfer.${status}`, status.replaceAll("_", " "))}
    </Badge>
  );
}
