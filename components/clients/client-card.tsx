"use client";

import Link from "next/link";
import { ArrowRight, Building2, CalendarClock, FolderKanban, UserRound } from "lucide-react";

import { ClientStatusBadge, ProspectStageBadge } from "@/components/clients/client-status-badge";
import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/projects/helpers";
import type { ClientRecord } from "@/types/client";

export function ClientCard({ client }: { client: ClientRecord }) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const isOpportunity = client.status === "prospect";
  const typeLabel = client.type === "company" ? (isFr ? "Entreprise" : "Company") : client.type.replaceAll("_", " ");

  return (
    <Link href={`/clients/${client.id}`} className="block">
      <Card className="surface-highlight group overflow-hidden rounded-xl border-border/70 bg-card shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 dark:shadow-none dark:hover:border-primary/20">
        <CardContent className="space-y-5 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <ClientStatusBadge status={client.status} />
                {isOpportunity && client.prospect_stage ? <ProspectStageBadge stage={client.prospect_stage} /> : null}
                <Badge variant="secondary" className="rounded-full px-3 py-1">{typeLabel}</Badge>
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold tracking-[-0.05em] text-slate-950 transition-colors group-hover:text-primary dark:text-white">{client.name}</h3>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {client.legal_name || client.industry || (isOpportunity ? (isFr ? "Opportunité commerciale à suivre avant signature." : "Sales opportunity to follow before signing.") : (isFr ? "Client sous contrat et dans le cycle de prestation." : "Client under contract and in the delivery cycle."))}
                </p>
              </div>
            </div>
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-[0_16px_30px_-24px_rgba(15,23,42,0.42)]"><Building2 className="size-5 text-primary" /></div>
          </div>

          {isOpportunity ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.72fr))]">
              <OwnerCard client={client} isFr={isFr} />
              <InsightPill label={isFr ? "Étape" : "Stage"} value={stageLabel(client.prospect_stage, isFr)} tone="violet" />
              <InsightPill label={isFr ? "Prochaine relance" : "Next follow-up"} value={formatDate(client.next_follow_up_at)} tone="sky" />
              <InsightPill label={isFr ? "Dernière activité" : "Last activity"} value={formatDate(client.lastActivityAt)} tone="slate" />
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.72fr))]">
              <OwnerCard client={client} isFr={isFr} />
              <InsightPill label={isFr ? "Projets" : "Projects"} value={isFr ? `${client.activeProjectsCount} actif${client.activeProjectsCount === 1 ? "" : "s"}` : `${client.activeProjectsCount} active`} tone="sky" />
              <InsightPill label={isFr ? "Valeur contrat" : "Contract value"} value={isFr ? "À définir" : "To be defined"} tone="violet" />
              <InsightPill label={isFr ? "Dernière activité" : "Last activity"} value={formatDate(client.lastActivityAt)} tone="slate" />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-1 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {!isOpportunity ? <span className="flex items-center gap-2"><FolderKanban className="size-4" />{client.linkedProjects.length} {isFr ? "projet(s) lié(s)" : "linked projects"}</span> : null}
              <span className="flex items-center gap-2"><UserRound className="size-4" />{client.contact_email ?? (isFr ? "Aucun e-mail de contact" : "No contact email")}</span>
              {isOpportunity ? <span className="flex items-center gap-2"><CalendarClock className="size-4" />{isFr ? "Relance" : "Follow-up"} : {formatDate(client.next_follow_up_at)}</span> : null}
            </div>
            <div className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors group-hover:text-primary">{isFr ? "Voir le détail" : "View detail"}<span className="flex size-8 items-center justify-center rounded-full border border-border/70 bg-card"><ArrowRight className="size-4" /></span></div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function OwnerCard({ client, isFr }: { client: ClientRecord; isFr: boolean }) {
  return <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]"><p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Responsable" : "Owner"}</p><p className="mt-3 text-base font-semibold tracking-[-0.03em] text-foreground">{client.accountManager?.full_name ?? (isFr ? "À attribuer" : "To assign")}</p><p className="mt-1 text-sm text-muted-foreground">{isFr ? "Personne chargée du suivi." : "Person in charge of follow-up."}</p></div>;
}

function stageLabel(stage: ClientRecord["prospect_stage"], isFr: boolean) {
  const labels = isFr ? { initial_contact: "Premier contact", qualification: "À qualifier", negotiation: "En négociation", proposal_sent: "Proposition envoyée", pending_signature: "À signer" } : { initial_contact: "Initial contact", qualification: "Qualification", negotiation: "Negotiation", proposal_sent: "Proposal sent", pending_signature: "Pending signature" };
  return stage ? labels[stage] : (isFr ? "Premier contact" : "Initial contact");
}

function InsightPill({ label, value, tone }: { label: string; value: string; tone: "sky" | "violet" | "slate" }) {
  const toneClass = tone === "sky" ? "border-primary/20 bg-primary/10 dark:border-primary/15 dark:bg-primary/8" : tone === "violet" ? "border-primary/20 bg-primary/10 dark:border-primary/15 dark:bg-primary/8" : "border-border bg-muted/76";
  return <div className={`rounded-xl border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:shadow-none ${toneClass}`}><p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p><p className="mt-3 text-base font-semibold tracking-[-0.03em] text-foreground">{value}</p></div>;
}
