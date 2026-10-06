import type { AlertSeverity } from "@/types/alert";

const widths: Record<AlertSeverity, string> = {
  info: "40%",
  warning: "68%",
  critical: "92%",
};

const tones: Record<AlertSeverity, string> = {
  info: "bg-primary",
  warning: "bg-warning",
  critical: "bg-danger",
};

export function RiskIndicator({ severity }: { severity: AlertSeverity }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-secondary/70">
      <div className={`h-full rounded-full ${tones[severity]}`} style={{ width: widths[severity] }} />
    </div>
  );
}

