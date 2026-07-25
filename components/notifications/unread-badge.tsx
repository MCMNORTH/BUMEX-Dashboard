import { Badge } from "@/components/ui/badge";

export function UnreadBadge({ count }: { count: number }) {
  if (!count) {
    return null;
  }

  return (
    <Badge className="rounded-full px-2 py-0.5 text-[11px]">
      {count > 99 ? "99+" : count}
    </Badge>
  );
}
