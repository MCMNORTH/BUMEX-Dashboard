import { Badge } from "@/components/ui/badge";

export function UnreadBadge({ count }: { count: number }) {
  if (!count) {
    return null;
  }

  return (
    <Badge className="rounded-sm px-2 py-0.5 text-xs">
      {count > 99 ? "99+" : count}
    </Badge>
  );
}
