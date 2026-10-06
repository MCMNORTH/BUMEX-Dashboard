"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import { getTransferEntityLabel } from "@/lib/finance/helpers";
import type { TransferEntity } from "@/types/finance";
import { toneBadge } from "@/components/ui/tone";

const entityStyles: Record<TransferEntity, string> = {
  bumex_it: toneBadge.neutral,
  insec: toneBadge.neutral,
  cnam_intec: toneBadge.neutral,
  ltm_yh: toneBadge.neutral,
  unassigned: toneBadge.neutral,
};

export function TransferEntityBadge({ entity }: { entity: TransferEntity }) {
  const { locale } = useI18n();
  return (
    <Badge className={`rounded-full border px-3 py-1 ${entityStyles[entity]}`}>
      {getTransferEntityLabel(entity, locale)}
    </Badge>
  );
}
