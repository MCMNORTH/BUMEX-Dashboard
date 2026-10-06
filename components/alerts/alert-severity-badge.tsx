"use client";

import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";
import type { AlertSeverity } from "@/types/alert";

const labels: Record<"en" | "fr", Record<AlertSeverity, string>> = {
  en: { info: "Info", warning: "Warning", critical: "Critical" },
  fr: { info: "Info", warning: "Vigilance", critical: "Critique" },
};

const classes: Record<AlertSeverity, string> = {
  info: "border-sky-400/20 bg-sky-400/10 text-sky-700 dark:text-sky-100",
  warning: "border-amber-400/20 bg-amber-400/10 text-amber-700 dark:text-amber-100",
  critical: "border-rose-400/20 bg-rose-400/10 text-rose-700 dark:text-rose-100",
};

export function AlertSeverityBadge({ severity }: { severity: AlertSeverity }) {
  const { locale } = useI18n();

  return (
    <Badge className={classes[severity]}>
      {labels[locale][severity]}
    </Badge>
  );
}

