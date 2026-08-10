"use client";

import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";
import type { ClientStatus, ProspectStage } from "@/types/client";

const classes: Record<ClientStatus, string> = {
  prospect: "border-sky-500/20 bg-sky-500/12 text-sky-700 dark:border-sky-300/10 dark:text-sky-100",
  active: "border-emerald-500/20 bg-emerald-500/12 text-emerald-700 dark:border-emerald-300/10 dark:text-emerald-100",
  inactive: "border-slate-500/20 bg-slate-500/12 text-slate-700 dark:border-slate-300/10 dark:text-slate-100",
  suspended: "border-amber-500/22 bg-amber-500/12 text-amber-700 dark:border-amber-300/10 dark:text-amber-100",
  archived: "border-rose-500/20 bg-rose-500/12 text-rose-700 dark:border-rose-300/10 dark:text-rose-100",
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const { locale } = useI18n();
  const labels: Record<ClientStatus, string> = locale === "fr"
    ? { prospect: "Contact à suivre", active: "Client actif", inactive: "Inactif", suspended: "Suspendu", archived: "Archivé" }
    : { prospect: "Prospect", active: "Active", inactive: "Inactive", suspended: "Suspended", archived: "Archived" };
  return <Badge variant="outline" className={`rounded-full px-3 py-1 text-[11px] tracking-[0.12em] uppercase ${classes[status]}`}>{labels[status]}</Badge>;
}

export function ProspectStageBadge({ stage }: { stage: ProspectStage }) {
  const { locale } = useI18n();
  const labels: Record<ProspectStage, string> = locale === "fr"
    ? { initial_contact: "Premier contact", qualification: "À qualifier", negotiation: "En négociation", proposal_sent: "Proposition envoyée", pending_signature: "À signer" }
    : { initial_contact: "Initial contact", qualification: "Qualification", negotiation: "Negotiation", proposal_sent: "Proposal sent", pending_signature: "Pending signature" };
  return <Badge variant="outline" className="rounded-full border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[11px] tracking-[0.08em] text-violet-700 dark:text-violet-100">{labels[stage]}</Badge>;
}
