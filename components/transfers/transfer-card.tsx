import { Building2, CalendarClock, FolderKanban } from "lucide-react";

import { TransferCategoryBadge } from "@/components/transfers/transfer-category-badge";
import { TransferDetailDrawer } from "@/components/transfers/transfer-detail-drawer";
import { TransferEntityBadge } from "@/components/transfers/transfer-entity-badge";
import { TransferStatusBadge } from "@/components/transfers/transfer-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { TransferFiltersData, TransferRecord } from "@/types/finance";

export function TransferCard({
  transfer,
  canManage,
  filterData,
  comments = [],
  role,
  currentUserId,
  mentionCandidates = [],
  returnPath = "/finance/transfers",
}: {
  transfer: TransferRecord;
  canManage: boolean;
  filterData: TransferFiltersData;
  comments?: CommentRecord[];
  role: AppRole;
  currentUserId: string;
  mentionCandidates?: MentionCandidate[];
  returnPath?: string;
}) {
  return (
    <TransferDetailDrawer
      transfer={transfer}
      canManage={canManage}
      filterData={filterData}
      comments={comments}
      role={role}
      currentUserId={currentUserId}
      mentionCandidates={mentionCandidates}
      returnPath={returnPath}
      trigger={
        <button type="button" className="w-full text-left">
          <Card className="group cursor-pointer border-border/70 bg-card/72 transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-soft)]">
            <CardContent className="space-y-4 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold tracking-tight">{transfer.beneficiary_name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {transfer.viewMode === "summary" ? "Restricted reference" : transfer.transfer_reference}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold tracking-[-0.04em]">
                    {formatFinanceCurrency(transfer.amount, transfer.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{transfer.currency}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <TransferStatusBadge status={transfer.status} />
                <TransferEntityBadge entity={transfer.entity} />
                <TransferCategoryBadge category={transfer.category} />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Info icon={CalendarClock} label="Date" value={formatDate(transfer.transfer_date)} />
                <Info icon={Building2} label="Client" value={transfer.relatedClient?.name ?? "Not linked"} />
                <Info icon={FolderKanban} label="Project" value={transfer.relatedProject?.name ?? "Not linked"} />
              </div>
            </CardContent>
          </Card>
        </button>
      }
    />
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/65 bg-background/35 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}
