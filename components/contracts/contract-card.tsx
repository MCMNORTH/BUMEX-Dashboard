import Link from "next/link";
import { ArrowRight, CalendarClock, FileText, Landmark } from "lucide-react";

import { ContractStatusBadge } from "@/components/contracts/contract-status-badge";
import { ContractTypeBadge } from "@/components/contracts/contract-type-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/projects/helpers";
import type { ContractRecord } from "@/types/contract";

export function ContractCard({ contract }: { contract: ContractRecord }) {
  return (
    <Link href={`/contracts/${contract.id}`} className="block">
      <Card className="surface-highlight group overflow-hidden rounded-[30px] border-border/70 bg-white/96 shadow-[0_24px_64px_-46px_rgba(37,99,235,0.24)] transition-all duration-300 hover:-translate-y-1 hover:border-sky-200/80 hover:shadow-[0_30px_72px_-48px_rgba(37,99,235,0.3)] dark:bg-[#161b26] dark:shadow-none dark:hover:border-sky-400/20">
        <CardContent className="space-y-5 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <ContractStatusBadge status={contract.status} />
                <ContractTypeBadge type={contract.contract_type} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold tracking-[-0.05em] text-slate-950 transition-colors group-hover:text-primary dark:text-white dark:group-hover:text-sky-200">
                  {contract.title}
                </h3>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {contract.contract_number ?? contract.payment_terms ?? "Structured commercial agreement linked to delivery operations."}
                </p>
              </div>
            </div>
            <div className="flex size-14 shrink-0 items-center justify-center rounded-[22px] border border-white/70 bg-white/84 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.42)] dark:border-white/10 dark:bg-white/5 dark:shadow-none">
              <FileText className="size-5 text-primary dark:text-sky-200" />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,0.78fr))]">
            <InsightPanel label="Client" value={contract.client?.name ?? "Not linked"} tone="sky" />
            <InsightPanel label="Value" value={formatCurrency(contract.amount)} tone="indigo" />
            <InsightPanel label="Renewal" value={formatDate(contract.renewal_date)} tone="amber" />
            <InsightPanel label="Owner" value={contract.responsibleUser?.full_name ?? "Unassigned"} tone="slate" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-1 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Landmark className="size-4" />
                {contract.currency}
              </span>
              <span className="flex items-center gap-2">
                <CalendarClock className="size-4" />
                {contract.renewalState.replaceAll("_", " ")}
              </span>
            </div>
            <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 transition-colors group-hover:text-[#244b86] dark:text-slate-200 dark:group-hover:text-sky-300">
              View detail
              <span className="flex size-8 items-center justify-center rounded-full border border-border/70 bg-white/75 dark:border-white/10 dark:bg-white/5">
                <ArrowRight className="size-4" />
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function InsightPanel({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "sky" | "indigo" | "amber" | "slate";
}) {
  const toneClass =
    tone === "sky"
      ? "border-sky-100/80 bg-sky-50/70 dark:border-sky-400/15 dark:bg-sky-400/8"
      : tone === "indigo"
        ? "border-indigo-100/80 bg-indigo-50/70 dark:border-indigo-400/15 dark:bg-indigo-400/8"
        : tone === "amber"
          ? "border-amber-100/80 bg-amber-50/70 dark:border-amber-400/15 dark:bg-amber-400/8"
          : "border-slate-200/80 bg-slate-100/76 dark:border-white/8 dark:bg-white/3";

  return (
    <div className={`rounded-[24px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:shadow-none ${toneClass}`}>
      <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-3 text-base font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
