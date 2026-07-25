import { Archive } from "lucide-react";

import { archiveClientAction } from "@/app/(app)/clients/actions";
import { ClientForm } from "@/components/clients/client-form";
import { ClientStatusBadge } from "@/components/clients/client-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@/types/auth";
import type { ClientFiltersData, ClientRecord } from "@/types/client";

export function ClientDetailHeader({
  client,
  role,
  canManage,
  filterData,
}: {
  client: ClientRecord;
  role: AppRole;
  canManage: boolean;
  filterData: ClientFiltersData;
}) {
  return (
    <div className="grid gap-5 rounded-[30px] border border-border/70 bg-card/72 p-6 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ClientStatusBadge status={client.status} />
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {client.type.replaceAll("_", " ")}
          </Badge>
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">{client.name}</h1>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            {client.notes || client.legal_name || "No account summary has been added yet."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {canManage ? (
            <ClientForm
              mode="edit"
              filterData={filterData}
              defaults={{
                client_id: client.id,
                name: client.name,
                legal_name: client.legal_name ?? "",
                type: client.type,
                industry: client.industry ?? "",
                contact_email: client.contact_email ?? "",
                contact_phone: client.contact_phone ?? "",
                address: client.address ?? "",
                country: client.country ?? "",
                city: client.city ?? "",
                website: client.website ?? "",
                tax_id: client.tax_id ?? "",
                status: client.status,
                account_manager_id: client.account_manager_id ?? "",
                notes: client.notes ?? "",
              }}
            />
          ) : null}
          {canManage ? (
            <form action={archiveClientAction}>
              <input type="hidden" name="client_id" value={client.id} />
              <Button variant="ghost" className="rounded-full px-5 text-rose-200 hover:bg-rose-500/10 hover:text-rose-100">
                <Archive className="size-4" />
                Archive
              </Button>
            </form>
          ) : null}
          {role === "shareholder" ? (
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Read-only portfolio view
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Legal name</p>
          <p className="mt-2 text-sm font-medium">{client.legal_name ?? "Not set"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{client.industry ?? "No industry"}</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Account manager</p>
          <p className="mt-2 text-sm font-medium">{client.accountManager?.full_name ?? "Unassigned"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{client.accountManager?.email ?? "No email"}</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Location</p>
          <p className="mt-2 text-sm font-medium">{client.city ?? "Unknown city"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{client.country ?? "Unknown country"}</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Website</p>
          <p className="mt-2 text-sm font-medium">{client.website ?? "Not set"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{client.contact_email ?? "No contact email"}</p>
        </div>
      </div>
    </div>
  );
}
