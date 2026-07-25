import { Badge } from "@/components/ui/badge";
import type { ContractType } from "@/types/contract";

export function ContractTypeBadge({ type }: { type: ContractType }) {
  return (
    <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
      {type.replaceAll("_", " ")}
    </Badge>
  );
}

