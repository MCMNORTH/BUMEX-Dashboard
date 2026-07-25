import { Badge } from "@/components/ui/badge";
import { getTransferCategoryLabel } from "@/lib/finance/helpers";
import type { TransferCategory } from "@/types/finance";

const categoryStyles: Record<TransferCategory, string> = {
  supplier: "border-cyan-500/20 bg-cyan-500/12 text-cyan-100",
  salary: "border-indigo-500/20 bg-indigo-500/12 text-indigo-100",
  subcontractor: "border-violet-500/20 bg-violet-500/12 text-violet-100",
  software: "border-blue-500/20 bg-blue-500/12 text-blue-100",
  hosting: "border-sky-500/20 bg-sky-500/12 text-sky-100",
  taxes: "border-amber-500/20 bg-amber-500/12 text-amber-100",
  rent: "border-orange-500/20 bg-orange-500/12 text-orange-100",
  other: "border-border/70 bg-background/45 text-foreground",
};

export function TransferCategoryBadge({ category }: { category: TransferCategory }) {
  return (
    <Badge className={`rounded-full border px-3 py-1 capitalize ${categoryStyles[category]}`}>
      {getTransferCategoryLabel(category)}
    </Badge>
  );
}
