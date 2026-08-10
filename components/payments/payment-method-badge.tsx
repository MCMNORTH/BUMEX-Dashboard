"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { PaymentMethod } from "@/types/finance";

const methodStyles: Record<PaymentMethod, string> = {
  cash: "border-amber-500/20 bg-amber-500/12 text-amber-100",
  bank_transfer: "border-primary/25 bg-primary/12 text-primary-foreground",
  check: "border-cyan-500/20 bg-cyan-500/12 text-cyan-100",
  mobile_money: "border-fuchsia-500/20 bg-fuchsia-500/12 text-fuchsia-100",
  card: "border-indigo-500/20 bg-indigo-500/12 text-indigo-100",
  other: "border-border/70 bg-background/45 text-foreground",
};

export function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  const { t } = useI18n();
  return (
    <Badge className={`rounded-full border px-3 py-1 capitalize ${methodStyles[method]}`}>
      {t(`finance.methods.${method}`, method.replaceAll("_", " "))}
    </Badge>
  );
}
