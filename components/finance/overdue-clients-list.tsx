import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import type { OverdueClientPoint } from "@/types/finance";

export function OverdueClientsList({
  clients,
  showLinks = true,
}: {
  clients: OverdueClientPoint[];
  showLinks?: boolean;
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-[var(--shadow-soft)]">
      <CardContent className="space-y-4 px-5 py-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Overdue by client</p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight">Clients with the highest delay exposure</h3>
        </div>
        {clients.length ? (
          <div className="space-y-3">
            {clients.map((client) => {
              const content = (
                <div className="rounded-[22px] border border-border/65 bg-background/35 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{client.clientName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {client.overdueCount} overdue invoice(s) / {client.latePaymentCount} late payment(s)
                      </p>
                    </div>
                    <p className="text-sm font-semibold">{formatFinanceCurrency(client.overdueAmount, "USD")}</p>
                  </div>
                </div>
              );

              return showLinks ? (
                <Link key={client.clientId} href={`/clients/${client.clientId}`} className="block transition-colors">
                  {content}
                </Link>
              ) : (
                <div key={client.clientId}>{content}</div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            No overdue client exposure is currently visible.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
