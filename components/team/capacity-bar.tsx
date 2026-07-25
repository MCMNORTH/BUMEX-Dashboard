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
            ? "bg-gradient-to-r from-rose-500 via-orange-400 to-amber-300"
            : tone === "warning"
              ? "bg-gradient-to-r from-amber-500 via-yellow-400 to-lime-300"
              : "bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-300",
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
