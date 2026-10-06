import { cn } from "@/lib/utils";

export function CapacityBar({
  percentage,
  tone = "default",
}: {
  percentage: number;
  tone?: "default" | "warning" | "critical";
}) {
  const width = Math.min(Math.max(percentage, 0), 100);

  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-secondary/70">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          tone === "critical"
            ? "bg-rose-500"
            : tone === "warning"
              ? "bg-amber-500"
              : "bg-primary",
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
