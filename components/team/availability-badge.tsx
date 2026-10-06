import { Badge } from "@/components/ui/badge";
import type { AvailabilityStatus } from "@/types/auth";
import { toneBadge } from "@/components/ui/tone";

const labels: Record<AvailabilityStatus, string> = {
  available: "Available",
  busy: "Busy",
  overloaded: "Overloaded",
  away: "Away",
  inactive: "Inactive",
};

const styles: Record<AvailabilityStatus, string> = {
  available: toneBadge.success,
  busy: toneBadge.brand,
  overloaded: toneBadge.danger,
  away: toneBadge.warning,
  inactive: toneBadge.neutral,
};

export function AvailabilityBadge({ status, isFr = false }: { status: AvailabilityStatus; isFr?: boolean }) {
  const label = isFr ? ({ available: "Disponible", busy: "Occupé", overloaded: "Surchargé", away: "Absent", inactive: "Inactif" } as const)[status] : labels[status];
  return (
    <Badge variant="outline" className={`rounded-full px-3 py-1 ${styles[status]}`}>
      {label}
    </Badge>
  );
}
