import { Badge } from "@/components/ui/badge";
import type { ClientStatus } from "@/types/client";

const labels: Record<ClientStatus, string> = {
  prospect: "Prospect",
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
  archived: "Archived",
};

const classes: Record<ClientStatus, string> = {
  prospect: "border-sky-500/20 bg-sky-500/12 text-sky-700 dark:border-sky-300/10 dark:text-sky-100",
  active: "border-emerald-500/20 bg-emerald-500/12 text-emerald-700 dark:border-emerald-300/10 dark:text-emerald-100",
  inactive: "border-slate-500/20 bg-slate-500/12 text-slate-700 dark:border-slate-300/10 dark:text-slate-100",
  suspended: "border-amber-500/22 bg-amber-500/12 text-amber-700 dark:border-amber-300/10 dark:text-amber-100",
  archived: "border-rose-500/20 bg-rose-500/12 text-rose-700 dark:border-rose-300/10 dark:text-rose-100",
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return (
    <Badge variant="outline" className={`rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase ${classes[status]}`}>
      {labels[status]}
    </Badge>
  );
}
