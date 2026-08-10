"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { ContractType } from "@/types/contract";

export function ContractTypeBadge({ type }: { type: ContractType }) {
  const { locale } = useI18n();
  const labels: Record<ContractType, string> = { development: "Développement", maintenance: "Maintenance", consulting: "Conseil", support: "Support", hosting: "Hébergement", audit: "Audit", other: "Autre" };
  return (
    <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
      {locale === "fr" ? labels[type] : type.replaceAll("_", " ")}
    </Badge>
  );
}
