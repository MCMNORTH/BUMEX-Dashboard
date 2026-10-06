"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { PaymentMethod } from "@/types/finance";
import { toneBadge } from "@/components/ui/tone";

const methodStyles: Record<PaymentMethod, string> = {
  cash: toneBadge.neutral,
  bank_transfer: toneBadge.neutral,
  check: toneBadge.neutral,
  mobile_money: toneBadge.neutral,
  card: toneBadge.neutral,
  other: toneBadge.neutral,
};

export function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  const { t } = useI18n();
  return (
    <Badge className={`rounded-full border px-3 py-1 capitalize ${methodStyles[method]}`}>
      {t(`finance.methods.${method}`, method.replaceAll("_", " "))}
    </Badge>
  );
}
