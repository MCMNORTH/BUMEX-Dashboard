import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";

import { addDays, formatDateKey, getWeekRangeLabel, getWeekStart } from "@/lib/planning/helpers";
import { Button } from "@/components/ui/button";
import { getCurrentLocale } from "@/lib/i18n/server";

type WeekNavigatorProps = {
  week: string;
};

export async function WeekNavigator({ week }: WeekNavigatorProps) {
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";
  const weekStart = getWeekStart(week);
  const previousWeek = formatDateKey(addDays(weekStart, -7));
  const nextWeek = formatDateKey(addDays(weekStart, 7));
  const currentWeek = formatDateKey(getWeekStart());

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl">
      <Button asChild variant="secondary" className="rounded-full px-4">
        <Link href={`/planning?week=${previousWeek}`}>
          <ArrowLeft className="size-4" />
          {isFr ? "Précédente" : "Previous"}
        </Link>
      </Button>

      <div className="min-w-[12rem] flex-1 rounded-[22px] border border-border/65 bg-background/40 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          <CalendarDays className="size-4" />
          {isFr ? "Semaine actuelle" : "Current week"}
        </div>
        <p className="mt-2 text-lg font-semibold tracking-tight">{getWeekRangeLabel(weekStart)}</p>
      </div>

      <Button asChild variant="secondary" className="rounded-full px-4">
        <Link href={`/planning?week=${currentWeek}`}>{isFr ? "Aujourd'hui" : "Today"}</Link>
      </Button>

      <Button asChild variant="secondary" className="rounded-full px-4">
        <Link href={`/planning?week=${nextWeek}`}>
          {isFr ? "Suivante" : "Next"}
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
