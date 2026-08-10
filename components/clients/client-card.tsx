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
      <Card className="surface-highlight group overflow-hidden rounded-[30px] border-border/70 bg-white/96 shadow-[0_24px_64px_-46px_rgba(37,99,235,0.24)] transition-all duration-300 hover:-translate-y-1 hover:border-sky-200/80 hover:shadow-[0_30px_72px_-48px_rgba(37,99,235,0.3)] dark:bg-[#161b26] dark:shadow-none dark:hover:border-sky-400/20">
        <CardContent className="space-y-5 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <ClientStatusBadge status={client.status} />
                {isOpportunity && client.prospect_stage ? <ProspectStageBadge stage={client.prospect_stage} /> : null}
                <Badge variant="secondary" className="rounded-full px-3 py-1">{typeLabel}</Badge>
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold tracking-[-0.05em] text-slate-950 transition-colors group-hover:text-primary dark:text-white dark:group-hover:text-sky-200">{client.name}</h3>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {client.legal_name || client.industry || (isOpportunity ? (isFr ? "Opportunité commerciale à suivre avant signature." : "Sales opportunity to follow before signing.") : (isFr ? "Client sous contrat et dans le cycle de prestation." : "Client under contract and in the delivery cycle."))}
                </p>
              </div>
            </div>
            <div className="flex size-14 shrink-0 items-center justify-center rounded-[22px] border border-white/70 bg-white/84 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.42)] dark:border-white/10 dark:bg-white/5 dark:shadow-none"><Building2 className="size-5 text-primary dark:text-sky-200" /></div>
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
            <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 transition-colors group-hover:text-[#244b86] dark:text-slate-200 dark:group-hover:text-sky-300">{isFr ? "Voir le détail" : "View detail"}<span className="flex size-8 items-center justify-center rounded-full border border-border/70 bg-white/75 dark:border-white/10 dark:bg-white/5"><ArrowRight className="size-4" /></span></div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function OwnerCard({ client, isFr }: { client: ClientRecord; isFr: boolean }) {
  return <div className="rounded-[26px] border border-white/70 bg-white/84 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-white/8 dark:bg-white/4 dark:shadow-none"><p className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">{isFr ? "Responsable" : "Owner"}</p><p className="mt-3 text-base font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">{client.accountManager?.full_name ?? (isFr ? "À attribuer" : "To assign")}</p><p className="mt-1 text-sm text-muted-foreground">{isFr ? "Personne chargée du suivi." : "Person in charge of follow-up."}</p></div>;
}

function stageLabel(stage: ClientRecord["prospect_stage"], isFr: boolean) {
  const labels = isFr ? { initial_contact: "Premier contact", qualification: "À qualifier", negotiation: "En négociation", proposal_sent: "Proposition envoyée", pending_signature: "À signer" } : { initial_contact: "Initial contact", qualification: "Qualification", negotiation: "Negotiation", proposal_sent: "Proposal sent", pending_signature: "Pending signature" };
  return stage ? labels[stage] : (isFr ? "Premier contact" : "Initial contact");
}

function InsightPill({ label, value, tone }: { label: string; value: string; tone: "sky" | "violet" | "slate" }) {
  const toneClass = tone === "sky" ? "border-sky-100/80 bg-sky-50/70 dark:border-sky-400/15 dark:bg-sky-400/8" : tone === "violet" ? "border-violet-100/80 bg-violet-50/70 dark:border-violet-400/15 dark:bg-violet-400/8" : "border-slate-200/80 bg-slate-100/76 dark:border-white/8 dark:bg-white/3";
  return <div className={`rounded-[24px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:shadow-none ${toneClass}`}><p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">{label}</p><p className="mt-3 text-base font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">{value}</p></div>;
}
