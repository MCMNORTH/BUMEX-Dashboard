import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { CalendarView } from "@/types/calendar";

export function CalendarToolbar({
  view,
  label,
  previousHref,
  nextHref,
  todayHref,
  baseHref,
}: {
  view: CalendarView;
  label: string;
  previousHref: string;
  nextHref: string;
  todayHref: string;
  baseHref: (nextView: CalendarView) => string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <Link href={previousHref} className="flex size-11 items-center justify-center rounded-2xl border border-border/65 bg-background/45 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:text-white">
          <ChevronLeft className="size-4" />
        </Link>
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Calendar range</p>
          <p className="mt-1 text-lg font-semibold tracking-[-0.03em]">{label}</p>
        </div>
        <Link href={nextHref} className="flex size-11 items-center justify-center rounded-2xl border border-border/65 bg-background/45 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:text-white">
          <ChevronRight className="size-4" />
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["month", "week", "agenda"] as const).map((item) => (
          <Link
            key={item}
            href={baseHref(item)}
            className={`inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition-all ${view === item ? "border border-primary/30 bg-primary/12 text-primary" : "border border-border/65 bg-background/40 text-muted-foreground hover:text-foreground"}`}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </Link>
        ))}
        <Link href={todayHref} className="inline-flex h-10 items-center justify-center rounded-full border border-border/65 bg-background/40 px-4 text-sm font-medium transition-all hover:text-foreground">
          <CalendarDays className="mr-2 size-4" />
          Today
        </Link>
        <Badge variant="secondary" className="rounded-full px-3 py-1">
          Interactive calendar
        </Badge>
      </div>
    </div>
  );
}

