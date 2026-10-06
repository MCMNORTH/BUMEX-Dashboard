"use client";

import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";
import type { ClientStatus, ProspectStage } from "@/types/client";
import { toneBadge } from "@/components/ui/tone";

const classes: Record<ClientStatus, string> = {
  prospect: toneBadge.brand,
  active: toneBadge.success,
  inactive: toneBadge.neutral,
  suspended: toneBadge.warning,
  archived: toneBadge.neutral,
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const { locale } = useI18n();
  const labels: Record<ClientStatus, string> = locale === "fr"
    ? { prospect: "Contact à suivre", active: "Client actif", inactive: "Inactif", suspended: "Suspendu", archived: "Archivé" }
    : { prospect: "Prospect", active: "Active", inactive: "Inactive", suspended: "Suspended", archived: "Archived" };
  return <Badge variant="outline" className={classes[status]}>{labels[status]}</Badge>;
}

export function ProspectStageBadge({ stage }: { stage: ProspectStage }) {
  const { locale } = useI18n();
  const labels: Record<ProspectStage, string> = locale === "fr"
    ? { initial_contact: "Premier contact", qualification: "À qualifier", negotiation: "En négociation", proposal_sent: "Proposition envoyée", pending_signature: "À signer" }
    : { initial_contact: "Initial contact", qualification: "Qualification", negotiation: "Negotiation", proposal_sent: "Proposal sent", pending_signature: "Pending signature" };
  return <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/10 px-3 py-1 text-xs tracking-wide text-primary">{labels[stage]}</Badge>;
}
