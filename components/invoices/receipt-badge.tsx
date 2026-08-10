"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";

export function ReceiptBadge({ count }: { count: number }) {
  const { locale } = useI18n();
  return (
    <Badge variant="secondary" className="rounded-full px-3 py-1">
      {count} {locale === "fr" ? `justificatif${count === 1 ? "" : "s"}` : `receipt${count === 1 ? "" : "s"}`}
    </Badge>
  );
}
