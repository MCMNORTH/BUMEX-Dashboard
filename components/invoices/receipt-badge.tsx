import { Badge } from "@/components/ui/badge";

export function ReceiptBadge({ count }: { count: number }) {
  return (
    <Badge variant="secondary" className="rounded-full px-3 py-1">
      {count} receipt{count === 1 ? "" : "s"}
    </Badge>
  );
}
