import { Badge } from "@/components/ui/badge";
import { getTransferEntityLabel } from "@/lib/finance/helpers";
import type { TransferEntity } from "@/types/finance";

const entityStyles: Record<TransferEntity, string> = {
  bumex_it: "border-blue-500/20 bg-blue-500/12 text-blue-100",
  insec: "border-emerald-500/20 bg-emerald-500/12 text-emerald-100",
  cnam_intec: "border-violet-500/20 bg-violet-500/12 text-violet-100",
  ltm_yh: "border-amber-500/20 bg-amber-500/12 text-amber-100",
  unassigned: "border-border/70 bg-background/45 text-foreground",
};

export function TransferEntityBadge({ entity }: { entity: TransferEntity }) {
  return (
    <Badge className={`rounded-full border px-3 py-1 ${entityStyles[entity]}`}>
      {getTransferEntityLabel(entity)}
    </Badge>
  );
}
