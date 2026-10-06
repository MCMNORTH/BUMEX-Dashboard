"use client";

import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";
import type { AlertSeverity } from "@/types/alert";
import { toneBadge } from "@/components/ui/tone";

const labels: Record<"en" | "fr", Record<AlertSeverity, string>> = {
  en: { info: "Info", warning: "Warning", critical: "Critical" },
  fr: { info: "Info", warning: "Vigilance", critical: "Critique" },
};

const classes: Record<AlertSeverity, string> = {
  info: toneBadge.brand,
  warning: toneBadge.warning,
  critical: toneBadge.danger,
};

export function AlertSeverityBadge({ severity }: { severity: AlertSeverity }) {
  const { locale } = useI18n();

  return (
    <Badge className={classes[severity]}>
      {labels[locale][severity]}
    </Badge>
  );
}

