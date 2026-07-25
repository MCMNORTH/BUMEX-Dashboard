import type { LucideIcon } from "lucide-react";

import { SectionCard } from "@/components/layout/section-card";

type StatCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  className?: string;
};

export function StatCard({ icon: Icon, label, value, detail, className }: StatCardProps) {
  return (
    <SectionCard className={className} contentClassName="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">{label}</p>
          <p className="mt-2.5 text-lg font-semibold tracking-[-0.04em]">{value}</p>
          <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">{detail}</p>
        </div>
        <div className="flex size-9 items-center justify-center rounded-[16px] border border-border/70 bg-background/50 shadow-[var(--shadow-inner)]">
          <Icon className="size-4 text-primary" />
        </div>
          </div>
    </SectionCard>
  );
}
