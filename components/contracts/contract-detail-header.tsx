import { Archive } from "lucide-react";

import { archiveContractAction } from "@/app/(app)/contracts/actions";
import { ContractForm } from "@/components/contracts/contract-form";
import { ContractStatusBadge } from "@/components/contracts/contract-status-badge";
import { ContractTypeBadge } from "@/components/contracts/contract-type-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { ContractFiltersData, ContractRecord } from "@/types/contract";

export function ContractDetailHeader({
  contract,
  role,
  canManage,
  filterData,
}: {
  contract: ContractRecord;
  role: AppRole;
  canManage: boolean;
  filterData: ContractFiltersData;
}) {
  return (
    <div className="grid gap-5 rounded-[30px] border border-border/70 bg-card/72 p-6 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ContractStatusBadge status={contract.status} />
          <ContractTypeBadge type={contract.contract_type} />
          <Badge variant="secondary" className="rounded-full px-3 py-1">{contract.currency}</Badge>
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">{contract.title}</h1>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            {contract.notes || contract.payment_terms || "No commercial summary has been added to this contract yet."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {canManage ? (
            <ContractForm
              mode="edit"
              filterData={filterData}
              defaults={{
                contract_id: contract.id,
                title: contract.title,
                contract_number: contract.contract_number ?? "",
                client_id: contract.client_id,
                project_id: contract.project_id ?? "",
                status: contract.status,
                contract_type: contract.contract_type,
                start_date: contract.start_date ?? "",
                end_date: contract.end_date ?? "",
                signed_date: contract.signed_date ?? "",
                renewal_date: contract.renewal_date ?? "",
                amount: contract.amount?.toString() ?? "",
                currency: contract.currency,
                payment_terms: contract.payment_terms ?? "",
                responsible_user_id: contract.responsible_user_id ?? "",
                notes: contract.notes ?? "",
              }}
            />
          ) : null}
          {canManage ? (
            <form action={archiveContractAction}>
              <input type="hidden" name="contract_id" value={contract.id} />
              <Button variant="ghost" className="rounded-full px-5 text-rose-200 hover:bg-rose-500/10 hover:text-rose-100">
                <Archive className="size-4" />
                Archive
              </Button>
            </form>
          ) : null}
          {role === "shareholder" ? (
            <Badge variant="outline" className="rounded-full px-3 py-1">Read-only portfolio view</Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Client</p>
          <p className="mt-2 text-sm font-medium">{contract.client?.name ?? "Not linked"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{contract.client?.contact_email ?? "No contact email"}</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Project</p>
          <p className="mt-2 text-sm font-medium">{contract.project?.name ?? "No project linked"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{contract.project?.status ?? "No status"}</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Renewal</p>
          <p className="mt-2 text-sm font-medium">{formatDate(contract.renewal_date)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{contract.renewalState.replaceAll("_", " ")}</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Amount</p>
          <p className="mt-2 text-sm font-medium">{formatCurrency(contract.amount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{contract.contract_number ?? "No number"}</p>
        </div>
      </div>
    </div>
  );
}
