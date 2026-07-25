import type { AlertSeverity } from "@/types/alert";

const widths: Record<AlertSeverity, string> = {
  info: "40%",
  warning: "68%",
  critical: "92%",
};

const tones: Record<AlertSeverity, string> = {
  info: "from-sky-400 via-cyan-300 to-indigo-300",
  warning: "from-amber-400 via-orange-300 to-amber-200",
  critical: "from-rose-500 via-red-400 to-orange-300",
};

export function RiskIndicator({ severity }: { severity: AlertSeverity }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-secondary/70">
      <div className={`h-full rounded-full bg-gradient-to-r ${tones[severity]}`} style={{ width: widths[severity] }} />
    </div>
  );
}

