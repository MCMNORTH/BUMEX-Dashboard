import { Dot } from "lucide-react";

import { cn } from "@/lib/utils";

const toneClasses = {
  blue: "bg-sky-400",
  amber: "bg-amber-400",
  emerald: "bg-emerald-400",
  violet: "bg-violet-400",
} as const;

type ActivityItem = {
  title: string;
  description: string;
  time: string;
  actor: string;
  tone: keyof typeof toneClasses;
};

export function ActivityFeed({ items }: { items: readonly ActivityItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div
          key={`${item.title}-${index}`}
          className="group rounded-[18px] border border-sky-100 bg-white/75 p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-sky-200 hover:bg-white hover:shadow-[0_16px_30px_rgba(14,116,144,0.12)] dark:border-sky-400/12 dark:bg-white/[0.045] dark:hover:border-sky-400/25 dark:hover:bg-white/[0.075]"
        >
          <div className="flex items-start gap-3">
            <span className="relative mt-1 flex size-3 shrink-0 items-center justify-center">
              <span className={cn("absolute size-2 rounded-full", toneClasses[item.tone])} />
              <Dot className="size-5 text-muted-foreground/35" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-[15rem] text-sm font-medium tracking-[-0.02em]">{item.title}</p>
                <span className="rounded-full bg-secondary/65 px-2.5 py-1 text-[11px] text-muted-foreground">{item.time}</span>
              </div>
              <p className="mt-2 max-w-[18rem] text-sm leading-6 text-muted-foreground">{item.description}</p>
              <p className="mt-3 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                {item.actor}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
