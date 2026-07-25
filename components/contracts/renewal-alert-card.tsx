import Link from "next/link";
import { CalendarClock, TriangleAlert } from "lucide-react";

import { ContractStatusBadge } from "@/components/contracts/contract-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ContractRecord } from "@/types/contract";

export function RenewalAlertCard({ contract }: { contract: ContractRecord }) {
  return (
    <Link href={`/contracts/${contract.id}`} className="block">
      <Card className="border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow)]">
        <CardContent className="space-y-3 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex size-10 items-center justify-center rounded-2xl border border-border/65 bg-background/45">
                <TriangleAlert className="size-4 text-amber-300" />
              </div>
              <div>
                <p className="text-sm font-medium">{contract.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{contract.client?.name ?? "No client"}</p>
              </div>
            </div>
            <ContractStatusBadge status={contract.status} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5" />
            {contract.daysUntilRenewal !== null
              ? `${contract.daysUntilRenewal} day${contract.daysUntilRenewal === 1 ? "" : "s"} until renewal`
              : "Renewal date not set"}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

