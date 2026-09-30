import { Badge } from "@/components/ui/badge";
import type { AvailabilityStatus } from "@/types/auth";

const labels: Record<AvailabilityStatus, string> = {
  available: "Available",
  busy: "Busy",
  overloaded: "Overloaded",
  away: "Away",
  inactive: "Inactive",
};

const styles: Record<AvailabilityStatus, string> = {
  available: "border-emerald-500/25 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100",
  busy: "border-sky-500/25 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/12 dark:text-sky-100",
  overloaded: "border-rose-500/25 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-100",
  away: "border-amber-500/25 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/12 dark:text-amber-100",
  inactive: "border-slate-500/25 bg-slate-100 text-slate-700 dark:border-slate-400/30 dark:bg-slate-500/12 dark:text-slate-200",
};

export function AvailabilityBadge({ status, isFr = false }: { status: AvailabilityStatus; isFr?: boolean }) {
  const label = isFr ? ({ available: "Disponible", busy: "Occupé", overloaded: "Surchargé", away: "Absent", inactive: "Inactif" } as const)[status] : labels[status];
  return (
    <Badge variant="outline" className={`rounded-full px-3 py-1 ${styles[status]}`}>
      {label}
    </Badge>
  );
}
