"use client";

import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";
import type { RelationshipHealth } from "@/types/client";
import { toneBadge } from "@/components/ui/tone";

const classes: Record<RelationshipHealth, string> = {
  healthy: toneBadge.success,
  attention_needed: toneBadge.warning,
  at_risk: toneBadge.danger,
};

export function RelationshipHealthBadge({ health }: { health: RelationshipHealth }) {
  const { locale } = useI18n();
  const labels: Record<RelationshipHealth, string> = locale === "fr"
    ? { healthy: "Saine", attention_needed: "À surveiller", at_risk: "À risque" }
    : { healthy: "Healthy", attention_needed: "Attention needed", at_risk: "At risk" };
  return <Badge variant="outline" className={`rounded-full px-3 py-1 ${classes[health]}`}>{labels[health]}</Badge>;
}
