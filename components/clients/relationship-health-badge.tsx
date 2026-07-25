import { Badge } from "@/components/ui/badge";
import type { RelationshipHealth } from "@/types/client";

const config: Record<RelationshipHealth, { label: string; className: string }> = {
  healthy: {
    label: "Healthy",
    className: "border-emerald-400/30 bg-emerald-400/12 text-emerald-100",
  },
  attention_needed: {
    label: "Attention needed",
    className: "border-amber-400/30 bg-amber-400/12 text-amber-100",
  },
  at_risk: {
    label: "At risk",
    className: "border-rose-400/30 bg-rose-400/12 text-rose-100",
  },
};

export function RelationshipHealthBadge({ health }: { health: RelationshipHealth }) {
  const item = config[health];

  return (
    <Badge variant="outline" className={`rounded-full px-3 py-1 ${item.className}`}>
      {item.label}
    </Badge>
  );
}
