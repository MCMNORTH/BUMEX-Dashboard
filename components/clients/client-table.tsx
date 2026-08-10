"use client";

import Link from "next/link";

import { ClientStatusBadge } from "@/components/clients/client-status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/projects/helpers";
import { useI18n } from "@/components/layout/i18n-provider";
import type { ClientRecord } from "@/types/client";

export function ClientTable({ clients }: { clients: ClientRecord[] }) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/65 bg-background/35 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <tr>
              <th className="px-5 py-4 font-medium">Client</th>
              <th className="px-5 py-4 font-medium">{isFr ? "Statut" : "Status"}</th>
              <th className="px-5 py-4 font-medium">{isFr ? "Responsable" : "Manager"}</th>
              <th className="px-5 py-4 font-medium">{isFr ? "Projets actifs" : "Active projects"}</th>
              <th className="px-5 py-4 font-medium">{isFr ? "Valeur du contrat" : "Contract value"}</th>
              <th className="px-5 py-4 font-medium">{isFr ? "Dernière activité" : "Last activity"}</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-b border-border/50 last:border-b-0">
                <td className="px-5 py-4">
                  <Link href={`/clients/${client.id}`} className="block">
                    <p className="font-medium">{client.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{client.industry ?? client.legal_name ?? (isFr ? "Aucune description" : "No descriptor")}</p>
                  </Link>
                </td>
                <td className="px-5 py-4"><ClientStatusBadge status={client.status} /></td>
                <td className="px-5 py-4">
                  <p>{client.accountManager?.full_name ?? (isFr ? "Non attribué" : "Unassigned")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{client.accountManager?.email ?? (isFr ? "Aucun e-mail" : "No email")}</p>
                </td>
                <td className="px-5 py-4">{client.activeProjectsCount}</td>
                <td className="px-5 py-4">
                  <Badge variant="outline" className="rounded-full px-3 py-1">{isFr ? "À définir" : "Placeholder"}</Badge>
                </td>
                <td className="px-5 py-4">{formatDate(client.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
