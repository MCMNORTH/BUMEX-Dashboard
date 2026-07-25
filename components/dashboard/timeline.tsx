import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type TimelineItem = {
  title: string;
  date: string;
  detail: string;
  icon: LucideIcon;
};

export function Timeline({ items }: { items: readonly TimelineItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        const Icon = item.icon;

        return (
          <div key={`${item.title}-${index}`} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-background/60">
                <Icon className="size-4 text-primary" />
              </div>
              {index < items.length - 1 ? <div className="mt-3 h-full w-px bg-border/80" /> : null}
            </div>
            <div
              className={cn(
                "mb-4 flex-1 rounded-2xl border border-border/65 bg-background/38 p-4 transition-colors duration-300 hover:bg-background/56",
                index === items.length - 1 && "mb-0",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{item.title}</p>
                <span className="text-xs text-muted-foreground">{item.date}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
