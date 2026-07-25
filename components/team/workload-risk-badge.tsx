import { Badge } from "@/components/ui/badge";
import type { WorkloadRisk } from "@/types/team";

const labels: Record<WorkloadRisk, string> = {
  low: "Low usage",
  moderate: "Moderate usage",
  high: "High usage",
};

const tones: Record<WorkloadRisk, string> = {
  low: "border-emerald-500/25 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100",
  moderate: "border-amber-500/25 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/12 dark:text-amber-100",
  high: "border-rose-500/25 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-100",
};

export function WorkloadRiskBadge({ risk }: { risk: WorkloadRisk }) {
  return (
    <Badge variant="outline" className={`rounded-full px-3 py-1 ${tones[risk]}`}>
      {labels[risk]}
    </Badge>
  );
}
