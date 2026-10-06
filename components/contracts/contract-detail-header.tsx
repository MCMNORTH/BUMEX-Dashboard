import { Archive } from "lucide-react";

import { archiveContractAction } from "@/app/(app)/contracts/actions";
import { ContractForm } from "@/components/contracts/contract-form";
import { ContractStatusBadge } from "@/components/contracts/contract-status-badge";
import { ContractTypeBadge } from "@/components/contracts/contract-type-badge";
import { ConfirmActionForm } from "@/components/shared/confirm-action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentLocale } from "@/lib/i18n/server";
import { formatCurrency, formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { ContractFiltersData, ContractRecord } from "@/types/contract";

export async function ContractDetailHeader({
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
  const isFr = (await getCurrentLocale()) === "fr";
  const tr = (fr: string, en: string) => (isFr ? fr : en);

  return (
    <div className="grid gap-5 rounded-xl border border-border/70 bg-card p-6 shadow-[var(--shadow-soft)] xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ContractStatusBadge status={contract.status} />
          <ContractTypeBadge type={contract.contract_type} />
          <Badge variant="secondary" className="rounded-full px-3 py-1">{contract.currency}</Badge>
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">{contract.title}</h1>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            {contract.notes || contract.payment_terms || tr("Aucun résumé commercial pour ce contrat.", "No commercial summary has been added to this contract yet.")}
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
            <ConfirmActionForm
              action={archiveContractAction}
              fields={{ contract_id: contract.id }}
              title={tr("Archiver ce contrat ?", "Archive this contract?")}
              description={tr(
                `Le contrat « ${contract.title} » sera retiré de la liste des contrats actifs.`,
                `“${contract.title}” will be removed from the list of active contracts.`,
              )}
              confirmLabel={tr("Archiver", "Archive")}
              trigger={(
                <Button type="button" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger">
                  <Archive className="size-4" />
                  {tr("Archiver", "Archive")}
                </Button>
              )}
            />
          ) : null}
          {role === "shareholder" ? (
            <Badge variant="outline">{tr("Lecture seule", "Read-only")}</Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{tr("Client", "Client")}</p>
          <p className="mt-2 text-sm font-medium">{contract.client?.name ?? tr("Non lié", "Not linked")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{contract.client?.contact_email ?? tr("Pas d’e-mail de contact", "No contact email")}</p>
        </div>
        <div className="rounded-xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{tr("Projet", "Project")}</p>
          <p className="mt-2 text-sm font-medium">{contract.project?.name ?? tr("Aucun projet lié", "No project linked")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{contract.project?.status ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{tr("Renouvellement", "Renewal")}</p>
          <p className="mt-2 text-sm font-medium">{formatDate(contract.renewal_date)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{contract.renewalState.replaceAll("_", " ")}</p>
        </div>
        <div className="rounded-xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{tr("Montant", "Amount")}</p>
          <p className="mt-2 text-sm font-medium">{formatCurrency(contract.amount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{contract.contract_number ?? tr("Sans numéro", "No number")}</p>
        </div>
      </div>
    </div>
  );
}
