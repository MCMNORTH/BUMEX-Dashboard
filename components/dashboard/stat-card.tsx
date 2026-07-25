"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, TrendingDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const toneStyles = {
  blue: {
    card: "border-sky-200/80 bg-white/96 dark:border-sky-500/20 dark:bg-[#161b26]",
    icon: "border-sky-300/45 bg-white/70 text-sky-700 shadow-[0_10px_24px_rgba(14,116,144,0.14)] dark:border-sky-400/20 dark:bg-sky-500/12 dark:text-sky-100 dark:shadow-none",
    badge: "border-sky-200/80 bg-white/82 text-sky-800 dark:border-sky-400/20 dark:bg-sky-500/12 dark:text-sky-100",
  },
  amber: {
    card: "border-amber-200/80 bg-white/96 dark:border-amber-500/20 dark:bg-[#161b26]",
    icon: "border-amber-300/45 bg-white/70 text-amber-700 shadow-[0_10px_24px_rgba(217,119,6,0.14)] dark:border-amber-400/20 dark:bg-amber-500/12 dark:text-amber-100 dark:shadow-none",
    badge: "border-amber-200/80 bg-white/82 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/12 dark:text-amber-100",
  },
  emerald: {
    card: "border-emerald-200/80 bg-white/96 dark:border-emerald-500/20 dark:bg-[#161b26]",
    icon: "border-emerald-300/45 bg-white/70 text-emerald-700 shadow-[0_10px_24px_rgba(5,150,105,0.14)] dark:border-emerald-400/20 dark:bg-emerald-500/12 dark:text-emerald-100 dark:shadow-none",
    badge: "border-emerald-200/80 bg-white/82 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/12 dark:text-emerald-100",
  },
  violet: {
    card: "border-violet-200/80 bg-white/96 dark:border-violet-500/20 dark:bg-[#161b26]",
    icon: "border-violet-300/45 bg-white/70 text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.14)] dark:border-violet-400/20 dark:bg-violet-500/12 dark:text-violet-100 dark:shadow-none",
    badge: "border-violet-200/80 bg-white/82 text-violet-800 dark:border-violet-400/20 dark:bg-violet-500/12 dark:text-violet-100",
  },
} as const;

type StatCardProps = {
  title: string;
  value: string;
  change: string;
  caption: string;
  icon: LucideIcon;
  tone: keyof typeof toneStyles;
  sparkline: readonly number[];
  index?: number;
};

export function StatCard({
  title,
  value,
  change,
  caption,
  icon: Icon,
  tone,
  sparkline,
  index = 0,
}: StatCardProps) {
  const positive = change.startsWith("+");
  void sparkline;
  const toneStyle = toneStyles[tone];

  return (
    <Card
      className={cn(
        "group overflow-hidden border shadow-[var(--shadow-soft)]",
        "transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(15,23,42,0.12)]",
        toneStyle.card,
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <CardContent className="flex h-full flex-col gap-3 px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-500 uppercase dark:text-slate-300/80">
              {title}
            </p>
            <p className="mt-1.5 text-[1.8rem] font-bold tracking-[-0.025em] text-slate-900 dark:text-white">
              {value}
            </p>
          </div>
          <div className={cn("flex size-9 items-center justify-center rounded-[16px] border backdrop-blur-sm", toneStyle.icon)}>
            <Icon className="size-4" />
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-4">
          <div className="space-y-1.5">
            <Badge variant="outline" className={cn("rounded-full px-2 py-0.5 text-[10px] shadow-sm", toneStyle.badge)}>
              {positive ? <ArrowUpRight className="mr-1 size-3" /> : <TrendingDown className="mr-1 size-3" />}
              {change}
            </Badge>
            <p className="max-w-[13rem] text-[11px] leading-4.5 text-slate-500 dark:text-slate-300/75">{caption}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
