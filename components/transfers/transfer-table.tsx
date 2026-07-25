import { Eye } from "lucide-react";

import { TransferCategoryBadge } from "@/components/transfers/transfer-category-badge";
import { TransferDetailDrawer } from "@/components/transfers/transfer-detail-drawer";
import { TransferEntityBadge } from "@/components/transfers/transfer-entity-badge";
import { TransferForm } from "@/components/transfers/transfer-form";
import { TransferStatusBadge } from "@/components/transfers/transfer-status-badge";
import { Button } from "@/components/ui/button";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { TransferFiltersData, TransferRecord } from "@/types/finance";

export function TransferTable({
  transfers,
  canManage,
  filterData,
  commentsByTransferId,
  role,
  currentUserId,
  mentionCandidates,
  returnPath = "/finance/transfers",
}: {
  transfers: TransferRecord[];
  canManage: boolean;
  filterData: TransferFiltersData;
  commentsByTransferId: Record<string, CommentRecord[]>;
  role: AppRole;
  currentUserId: string;
  mentionCandidates: MentionCandidate[];
  returnPath?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/65 bg-background/35 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-medium">Beneficiary</th>
              <th className="px-5 py-4 font-medium">Status</th>
              <th className="px-5 py-4 font-medium">Entity</th>
              <th className="px-5 py-4 font-medium">Category</th>
              <th className="px-5 py-4 font-medium">Client</th>
              <th className="px-5 py-4 font-medium">Project</th>
              <th className="px-5 py-4 font-medium">Date</th>
              <th className="px-5 py-4 font-medium">Amount</th>
              <th className="px-5 py-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((transfer) => (
              <tr key={transfer.id} className="border-b border-border/50 last:border-b-0">
                <td className="px-5 py-4">
                  <p className="font-medium">{transfer.beneficiary_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {transfer.viewMode === "summary" ? "Restricted reference" : transfer.transfer_reference}
                  </p>
                </td>
                <td className="px-5 py-4"><TransferStatusBadge status={transfer.status} /></td>
                <td className="px-5 py-4"><TransferEntityBadge entity={transfer.entity} /></td>
                <td className="px-5 py-4"><TransferCategoryBadge category={transfer.category} /></td>
                <td className="px-5 py-4">{transfer.relatedClient?.name ?? "Not linked"}</td>
                <td className="px-5 py-4">{transfer.relatedProject?.name ?? "Not linked"}</td>
                <td className="px-5 py-4">{formatDate(transfer.transfer_date)}</td>
                <td className="px-5 py-4">{formatFinanceCurrency(transfer.amount, transfer.currency)}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <TransferDetailDrawer
                      transfer={transfer}
                      canManage={canManage}
                      filterData={filterData}
                      comments={commentsByTransferId[transfer.id] ?? []}
                      role={role}
                      currentUserId={currentUserId}
                      mentionCandidates={mentionCandidates}
                      returnPath={returnPath}
                      trigger={
                        <Button variant="ghost" size="icon" className="rounded-full">
                          <Eye className="size-4" />
                        </Button>
                      }
                    />
                    {canManage ? (
                      <TransferForm
                        mode="edit"
                        filterData={filterData}
                        defaults={{
                          transfer_id: transfer.id,
                          transfer_reference: transfer.transfer_reference,
                          beneficiary_name: transfer.beneficiary_name,
                          beneficiary_bank: transfer.beneficiary_bank ?? "",
                          beneficiary_account: transfer.beneficiary_account ?? "",
                          amount: transfer.amount.toString(),
                          currency: transfer.currency,
                          transfer_date: transfer.transfer_date,
                          status: transfer.status,
                          category: transfer.category,
                          entity: transfer.entity,
                          related_project_id: transfer.related_project_id ?? "",
                          related_client_id: transfer.related_client_id ?? "",
                          notes: transfer.notes ?? "",
                        }}
                        returnPath={returnPath}
                        triggerLabel="Edit"
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
