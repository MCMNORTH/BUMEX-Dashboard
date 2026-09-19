import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const toneClasses = {
  blue: "border-blue-200 bg-[linear-gradient(135deg,#eff8ff_0%,#ffffff_100%)] dark:border-blue-400/20 dark:bg-[linear-gradient(135deg,#14263a_0%,#171d2b_100%)]",
  amber: "border-amber-200 bg-[linear-gradient(135deg,#fff7e7_0%,#ffffff_100%)] dark:border-amber-400/20 dark:bg-[linear-gradient(135deg,#352719_0%,#171d2b_100%)]",
  violet: "border-violet-200 bg-[linear-gradient(135deg,#f5f0ff_0%,#ffffff_100%)] dark:border-violet-400/20 dark:bg-[linear-gradient(135deg,#292044_0%,#171d2b_100%)]",
} as const;

type InsightCardProps = {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
  tone: keyof typeof toneClasses;
};

export function InsightCard({
  icon: Icon,
  label,
  title,
  description,
  tone,
}: InsightCardProps) {
  return (
    <Card className={cn("group relative overflow-hidden border shadow-[var(--shadow-soft)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_42px_rgba(15,23,42,0.14)] dark:shadow-none", toneClasses[tone])}>
      <CardContent className="relative px-4 py-3.5">
        <div className="relative space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[10px] tracking-[0.14em] uppercase">
              {label}
            </Badge>
            <div className="flex size-8 items-center justify-center rounded-[14px] border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.05]">
              <Icon className="size-3.5 text-primary" />
            </div>
          </div>
          <div className="space-y-1.5">
            <h3 className="max-w-[18rem] text-[15px] font-semibold tracking-[-0.02em]">{title}</h3>
            <p className="max-w-[22rem] text-[12px] leading-5 text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/90">
            Explore signal
            <ArrowUpRight className="size-3.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
