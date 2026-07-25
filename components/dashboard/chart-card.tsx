import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ChartCardProps = {
  title: string;
  description: string;
  badge?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function ChartCard({
  title,
  description,
  badge,
  children,
  className,
  contentClassName,
}: ChartCardProps) {
  return (
    <Card className={cn("relative min-w-0 overflow-hidden border-slate-200 bg-white shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none", className)}>
      <CardHeader className="relative space-y-1.5 p-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg tracking-[-0.01em]">{title}</CardTitle>
          {badge ? (
            <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[10px] tracking-[0.14em] uppercase">
              {badge}
            </Badge>
          ) : null}
        </div>
        <CardDescription className="max-w-xl text-[12px] leading-5">{description}</CardDescription>
      </CardHeader>
      <CardContent className={cn("relative min-w-0 px-4 pb-4", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
