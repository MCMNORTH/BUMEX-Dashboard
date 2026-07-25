import { Badge } from "@/components/ui/badge";
import type { AlertSeverity } from "@/types/alert";

const labels: Record<AlertSeverity, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

const classes: Record<AlertSeverity, string> = {
  info: "border-sky-400/20 bg-sky-400/10 text-sky-100",
  warning: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  critical: "border-rose-400/20 bg-rose-400/10 text-rose-100",
};

export function AlertSeverityBadge({ severity }: { severity: AlertSeverity }) {
  return (
    <Badge className={`rounded-full px-3 py-1 text-[11px] tracking-[0.14em] uppercase ${classes[severity]}`}>
      {labels[severity]}
    </Badge>
  );
}

