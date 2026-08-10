"use client";

import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";
import type { RelationshipHealth } from "@/types/client";

const classes: Record<RelationshipHealth, string> = {
  healthy: "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:border-emerald-300/20 dark:text-emerald-100",
  attention_needed: "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:border-amber-300/20 dark:text-amber-100",
  at_risk: "border-rose-500/30 bg-rose-500/12 text-rose-700 dark:border-rose-300/20 dark:text-rose-100",
};

export function RelationshipHealthBadge({ health }: { health: RelationshipHealth }) {
  const { locale } = useI18n();
  const labels: Record<RelationshipHealth, string> = locale === "fr"
    ? { healthy: "Saine", attention_needed: "À surveiller", at_risk: "À risque" }
    : { healthy: "Healthy", attention_needed: "Attention needed", at_risk: "At risk" };
  return <Badge variant="outline" className={`rounded-full px-3 py-1 ${classes[health]}`}>{labels[health]}</Badge>;
}
