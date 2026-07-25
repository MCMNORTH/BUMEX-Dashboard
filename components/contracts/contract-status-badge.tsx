import { Badge } from "@/components/ui/badge";
import type { ContractStatus } from "@/types/contract";

const labels: Record<ContractStatus, string> = {
  draft: "Draft",
  under_review: "Under review",
  signed: "Signed",
  active: "Active",
  expired: "Expired",
  cancelled: "Cancelled",
  archived: "Archived",
};

const classes: Record<ContractStatus, string> = {
  draft: "border-slate-300/50 bg-slate-500/10 text-slate-700 dark:border-slate-300/10 dark:bg-slate-500/12 dark:text-slate-100",
  under_review: "border-sky-300/50 bg-sky-500/10 text-sky-700 dark:border-sky-300/10 dark:bg-sky-500/12 dark:text-sky-100",
  signed: "border-cyan-300/50 bg-cyan-500/10 text-cyan-700 dark:border-cyan-300/10 dark:bg-cyan-500/12 dark:text-cyan-100",
  active: "border-emerald-300/55 bg-emerald-500/10 text-emerald-700 dark:border-emerald-300/10 dark:bg-emerald-500/12 dark:text-emerald-100",
  expired: "border-amber-300/55 bg-amber-500/10 text-amber-700 dark:border-amber-300/10 dark:bg-amber-500/12 dark:text-amber-100",
  cancelled: "border-rose-300/55 bg-rose-500/10 text-rose-700 dark:border-rose-300/10 dark:bg-rose-500/12 dark:text-rose-100",
  archived: "border-zinc-300/55 bg-zinc-500/10 text-zinc-700 dark:border-zinc-300/10 dark:bg-zinc-500/12 dark:text-zinc-100",
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return (
    <Badge variant="outline" className={`rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase ${classes[status]}`}>
      {labels[status]}
    </Badge>
  );
}
