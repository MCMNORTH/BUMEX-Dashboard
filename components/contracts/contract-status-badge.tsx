"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { ContractStatus } from "@/types/contract";
import { toneBadge } from "@/components/ui/tone";

const labels: Record<ContractStatus, string> = {
  draft: "Draft",
  under_review: "Under review",
  signed: "Signed",
  active: "Active",
  expired: "Expired",
  cancelled: "Cancelled",
  archived: "Archived",
};

const classes: Record<ContractStatus, string> = {
  draft: toneBadge.neutral,
  under_review: toneBadge.brand,
  signed: toneBadge.brand,
  active: toneBadge.success,
  expired: toneBadge.warning,
  cancelled: toneBadge.neutral,
  archived: toneBadge.neutral,
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const { locale } = useI18n();
  const localizedLabels = locale === "fr" ? { draft: "Brouillon", under_review: "En révision", signed: "Signé", active: "Actif", expired: "Expiré", cancelled: "Annulé", archived: "Archivé" } : labels;
  return (
    <Badge variant="outline" className={classes[status]}>
      {localizedLabels[status]}
    </Badge>
  );
}
