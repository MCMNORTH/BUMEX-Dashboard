import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Layers3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/layout/section-card";

type EmptyStateProps = {
  title: string;
  description: string;
  label: string;
  icon?: LucideIcon;
  actions?: ReactNode;
};

export function EmptyState({
  title,
  description,
  label,
  icon: Icon = Layers3,
  actions,
}: EmptyStateProps) {
  return (
    <SectionCard className="overflow-hidden animate-fade-up" contentClassName="px-6 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-6">
        <div className="flex size-14 items-center justify-center rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900/75 dark:shadow-none">
          <Icon className="size-6 text-sky-600 dark:text-sky-300" />
        </div>
        <div className="space-y-3">
          <Badge variant="outline" className="w-fit rounded-full border-slate-300 bg-slate-50 px-3 py-1 text-slate-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200">
            {label}
          </Badge>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-50 sm:text-[2rem]">{title}</h2>
          <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
            {description}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap gap-3 pt-1">{actions}</div> : null}
      </div>
    </SectionCard>
  );
}
