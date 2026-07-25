import Link from "next/link";

import { ContractStatusBadge } from "@/components/contracts/contract-status-badge";
import { ContractTypeBadge } from "@/components/contracts/contract-type-badge";
import { formatCurrency, formatDate } from "@/lib/projects/helpers";
import type { ContractRecord } from "@/types/contract";

export function ContractTable({ contracts }: { contracts: ContractRecord[] }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/65 bg-background/35 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-medium">Contract</th>
              <th className="px-5 py-4 font-medium">Status</th>
              <th className="px-5 py-4 font-medium">Type</th>
              <th className="px-5 py-4 font-medium">Client</th>
              <th className="px-5 py-4 font-medium">Renewal</th>
              <th className="px-5 py-4 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => (
              <tr key={contract.id} className="border-b border-border/50 last:border-b-0">
                <td className="px-5 py-4">
                  <Link href={`/contracts/${contract.id}`} className="block">
                    <p className="font-medium">{contract.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{contract.contract_number ?? "No number"}</p>
                  </Link>
                </td>
                <td className="px-5 py-4"><ContractStatusBadge status={contract.status} /></td>
                <td className="px-5 py-4"><ContractTypeBadge type={contract.contract_type} /></td>
                <td className="px-5 py-4">{contract.client?.name ?? "Not linked"}</td>
                <td className="px-5 py-4">{formatDate(contract.renewal_date)}</td>
                <td className="px-5 py-4">{formatCurrency(contract.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

