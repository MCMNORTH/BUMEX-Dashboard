import Link from "next/link";

import { ContractStatusBadge } from "@/components/contracts/contract-status-badge";
import { ContractTypeBadge } from "@/components/contracts/contract-type-badge";
import { getCurrentLocale } from "@/lib/i18n/server";
import { formatCurrency, formatDate } from "@/lib/projects/helpers";
import type { ContractRecord } from "@/types/contract";

export async function ContractTable({ contracts }: { contracts: ContractRecord[] }) {
  const isFr = (await getCurrentLocale()) === "fr";
  const tr = (fr: string, en: string) => (isFr ? fr : en);

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-soft)]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/65 bg-background/35 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-medium">{tr("Contrat", "Contract")}</th>
              <th className="px-5 py-4 font-medium">{tr("Statut", "Status")}</th>
              <th className="px-5 py-4 font-medium">{tr("Type", "Type")}</th>
              <th className="px-5 py-4 font-medium">{tr("Client", "Client")}</th>
              <th className="px-5 py-4 font-medium">{tr("Renouvellement", "Renewal")}</th>
              <th className="px-5 py-4 font-medium">{tr("Montant", "Amount")}</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => (
              <tr key={contract.id} className="border-b border-border/50 last:border-b-0">
                <td className="px-5 py-4">
                  <Link href={`/contracts/${contract.id}`} className="block">
                    <p className="font-medium">{contract.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{contract.contract_number ?? tr("Sans numéro", "No number")}</p>
                  </Link>
                </td>
                <td className="px-5 py-4"><ContractStatusBadge status={contract.status} /></td>
                <td className="px-5 py-4"><ContractTypeBadge type={contract.contract_type} /></td>
                <td className="px-5 py-4">{contract.client?.name ?? tr("Non lié", "Not linked")}</td>
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

