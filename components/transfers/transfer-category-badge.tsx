"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { TransferCategory } from "@/types/finance";
import { toneBadge } from "@/components/ui/tone";

const categoryStyles: Record<TransferCategory, string> = {
  supplier: toneBadge.neutral,
  salary: toneBadge.neutral,
  subcontractor: toneBadge.neutral,
  software: toneBadge.neutral,
  hosting: toneBadge.neutral,
  taxes: toneBadge.neutral,
  rent: toneBadge.neutral,
  other: toneBadge.neutral,
};

export function TransferCategoryBadge({ category }: { category: TransferCategory }) {
  const { t } = useI18n();
  return (
    <Badge className={`rounded-full border px-3 py-1 capitalize ${categoryStyles[category]}`}>
      {t(`finance.categories.${category}`, category.replaceAll("_", " "))}
    </Badge>
  );
}
