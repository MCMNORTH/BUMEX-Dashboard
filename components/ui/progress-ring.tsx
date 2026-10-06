import { cn } from "@/lib/utils";

/**
 * A circular percentage. Only the number sits inside the ring so it never overflows;
 * the label is for screen readers and the tooltip.
 */
export function ProgressRing({
  value,
  label,
  size = 72,
  stroke = 6,
  className,
  trackClassName = "stroke-white/15",
  indicatorClassName = "stroke-white",
}: {
  value: number;
  label: string;
  size?: number;
  stroke?: number;
  className?: string;
  trackClassName?: string;
  indicatorClassName?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${clamped}% ${label}`}
      title={`${clamped}% ${label}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className={trackClassName} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className={cn("transition-[stroke-dashoffset] duration-500", clamped === 0 && "opacity-0", indicatorClassName)}
        />
      </svg>
      <span className="absolute text-base font-semibold tabular-nums" aria-hidden="true">{clamped}%</span>
    </div>
  );
}
