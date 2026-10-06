"use client";

import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";
import type { WorkloadRisk } from "@/types/team";
import { toneBadge } from "@/components/ui/tone";

const labels: Record<"en" | "fr", Record<WorkloadRisk, string>> = {
  en: { low: "Low load", moderate: "Moderate load", high: "High load" },
  fr: { low: "Charge faible", moderate: "Charge modérée", high: "Charge élevée" },
};

const tones: Record<WorkloadRisk, string> = {
  low: toneBadge.success,
  moderate: toneBadge.warning,
  high: toneBadge.danger,
};

export function WorkloadRiskBadge({ risk }: { risk: WorkloadRisk }) {
  const { locale } = useI18n();

  return (
    <Badge variant="outline" className={tones[risk]}>
      {labels[locale][risk]}
    </Badge>
  );
}
