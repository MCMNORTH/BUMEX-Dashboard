import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CircleDollarSign, FileStack, ReceiptText } from "lucide-react";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { NotesPanel } from "@/components/notes/notes-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getClientById } from "@/lib/clients/service";
import { getCommentsForEntity } from "@/lib/comments/service";
import { getNotesForEntity } from "@/lib/notes/service";
import { getMentionCandidates } from "@/lib/notifications/service";
import { getContractById, getContractsFilterData } from "@/lib/contracts/service";
import { getProjectById } from "@/lib/projects/service";
import { formatCurrency, formatDate } from "@/lib/projects/helpers";
import { ContractDetailHeader } from "@/components/contracts/contract-detail-header";
import { ContractToast } from "@/components/contracts/contract-toast";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireRouteAccess("contracts");
  const isFr = (await getCurrentLocale()) === "fr";
  const { id } = await params;
  const [contract, filterData, comments, notes, mentionCandidates] = await Promise.all([
    getContractById(id, auth.role),
    getContractsFilterData(),
    getCommentsForEntity("contract", id),
    getNotesForEntity("contract", id),
    getMentionCandidates(),
  ]);

  if (!contract) {
    notFound();
  }

  const [linkedClient, linkedProject] = await Promise.all([
    getClientById(contract.client_id, auth.role),
    contract.project_id ? getProjectById(contract.project_id) : Promise.resolve(null),
  ]);

  const canManage =
    auth.role === "admin"
    || (
      auth.role === "manager"
      && (
        linkedClient?.account_manager_id === auth.profile.id
        || linkedProject?.owner_id === auth.profile.id
        || contract.responsible_user_id === auth.profile.id
      )
    );

  return (
    <div className="space-y-6">
      <ContractToast />
      <ContractDetailHeader contract={contract} role={auth.role} canManage={canManage} filterData={filterData} />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>{isFr ? "Vue d’ensemble du contrat" : "Contract overview"}</CardTitle>
            <CardDescription>{isFr ? "Contexte commercial, responsabilité, échéances et conditions de l’accord." : "Commercial context, ownership, timing, and agreement details."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Valeur" : "Value"}</p>
                <p className="mt-2 text-sm font-medium">{formatCurrency(contract.amount)}</p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Numéro du contrat" : "Contract number"}</p>
                <p className="mt-2 text-sm font-medium">{contract.contract_number ?? (isFr ? "Non renseigné" : "Not set")}</p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "État du renouvellement" : "Renewal state"}</p>
                <p className="mt-2 text-sm font-medium">{renewalLabel(contract.renewalState, isFr)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">{isFr ? "Dates importantes" : "Key dates"}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                  <p className="text-sm font-medium">{isFr ? "Date de début" : "Start date"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(contract.start_date)}</p>
                </div>
                <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                  <p className="text-sm font-medium">{isFr ? "Date de fin" : "End date"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(contract.end_date)}</p>
                </div>
                <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                  <p className="text-sm font-medium">{isFr ? "Date de signature" : "Signed date"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(contract.signed_date)}</p>
                </div>
                <div className="rounded-2xl border border-border/65 bg-background/45 p-4">
                  <p className="text-sm font-medium">{isFr ? "Date de renouvellement" : "Renewal date"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(contract.renewal_date)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">{isFr ? "Conditions de paiement" : "Payment terms"}</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{contract.payment_terms ?? (isFr ? "Aucune condition de paiement enregistrée." : "No payment terms recorded.")}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>{isFr ? "Client associé" : "Linked client"}</CardTitle>
              <CardDescription>{isFr ? "Compte commercial auquel cet accord est rattaché." : "Commercial account attached to this agreement."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {linkedClient ? <Link href={`/clients/${linkedClient.id}`} className="group flex items-center justify-between gap-3 rounded-2xl border border-border/65 bg-background/38 p-4 transition-colors hover:bg-accent/40">
                <div><p className="text-sm font-medium">{contract.client?.name}</p><p className="mt-1 text-sm text-muted-foreground">{contract.client?.contact_email ?? (isFr ? "Aucun e-mail de contact" : "No contact email")}</p></div>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Link> : <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-4 text-sm text-muted-foreground">{isFr ? "Aucun client associé" : "No client linked"}</div>}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>{isFr ? "Projet associé" : "Linked project"}</CardTitle>
              <CardDescription>{isFr ? "Projet de réalisation éventuellement couvert par ce contrat." : "Optional delivery stream associated with this contract."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {linkedProject ? <Link href={`/projects/${linkedProject.id}`} className="group flex items-center justify-between gap-3 rounded-2xl border border-border/65 bg-background/38 p-4 transition-colors hover:bg-accent/40">
                <div><p className="text-sm font-medium">{contract.project?.name}</p><p className="mt-1 text-sm text-muted-foreground">{projectStatusLabel(contract.project?.status, isFr)}</p></div>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Link> : <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-4 text-sm text-muted-foreground">{isFr ? "Aucun projet associé" : "No linked project"}</div>}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileStack className="size-4 text-primary" />
                <CardTitle>{isFr ? "Documents" : "Documents"}</CardTitle>
              </div>
              <CardDescription>{isFr ? "Consultez les fichiers, justificatifs et validations du contrat." : "Review contract files, evidence, and approvals."}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/documents" className="group flex items-center justify-between gap-3 rounded-2xl border border-border/65 bg-background/38 p-4 text-sm font-medium transition-colors hover:bg-accent/40">
                {isFr ? "Ouvrir l’espace Documents" : "Open Documents"}<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Link>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CircleDollarSign className="size-4 text-primary" />
                <CardTitle>{isFr ? "Paiements" : "Payments"}</CardTitle>
              </div>
              <CardDescription>{isFr ? "Accédez à la facturation et au suivi des règlements." : "Access billing and payment tracking."}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/finance/payments" className="group flex items-center justify-between gap-3 rounded-2xl border border-border/65 bg-background/38 p-4 text-sm font-medium transition-colors hover:bg-accent/40">
                {isFr ? "Ouvrir le suivi des paiements" : "Open payment tracking"}<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ReceiptText className="size-4 text-primary" />
            <CardTitle>{isFr ? "Situation du renouvellement" : "Renewal status"}</CardTitle>
          </div>
          <CardDescription>{isFr ? "Synthèse de l’échéance et de l’état actuel de l’accord." : "Summary of renewal timing and current agreement state."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl border border-border/65 bg-background/38 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{renewalLabel(contract.renewalState, isFr)}</p>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {contract.daysUntilRenewal !== null ? `${contract.daysUntilRenewal} ${isFr ? "jours" : "days"}` : (isFr ? "Aucune date de renouvellement" : "No renewal date")}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {isFr ? "Le délai est calculé à partir de la date de renouvellement renseignée, ou de la date de fin du contrat si aucune date spécifique n’est définie." : "Renewal review is based on the configured renewal date, or the contract end date when renewal is not explicitly set."}
            </p>
          </div>
        </CardContent>
      </Card>

      <ActivityFeed
        activities={contract.recentActivity}
        title={isFr ? "Activité récente" : "Recent activity"}
        description={isFr ? "Dernières modifications enregistrées pour ce contrat." : "Latest contract-level changes recorded for this agreement."}
      />

      <NotesPanel
        notes={notes}
        entityType="contract"
        entityId={contract.id}
        returnPath={`/contracts/${contract.id}`}
        role={auth.role}
        currentUserId={auth.profile.id}
        title={isFr ? "Notes du contrat" : "Contract notes"}
        description={isFr ? "Notes utiles pour les renouvellements, validations, conditions commerciales et suivis de direction." : "Structured contract notes for renewals, approvals, commercial context, and executive follow-up."}
      />

      <CommentsPanel
        comments={comments}
        entityType="contract"
        entityId={contract.id}
        returnPath={`/contracts/${contract.id}`}
        role={auth.role}
        currentUserId={auth.profile.id}
        mentionCandidates={mentionCandidates}
      />
    </div>
  );
}

function renewalLabel(state: string, isFr: boolean) {
  const labels: Record<string, [string, string]> = {
    upcoming: ["À renouveler prochainement", "Upcoming"],
    overdue: ["Renouvellement en retard", "Overdue"],
    renewed: ["Renouvelé", "Renewed"],
    none: ["Aucun renouvellement prévu", "No renewal scheduled"],
  };
  const label = labels[state];
  return label ? label[isFr ? 0 : 1] : state.replaceAll("_", " ");
}

function projectStatusLabel(status: string | null | undefined, isFr: boolean) {
  if (!status) return isFr ? "Statut non renseigné" : "No status";
  const labels: Record<string, [string, string]> = {
    planning: ["En préparation", "Planning"],
    active: ["Actif", "Active"],
    on_hold: ["En pause", "On hold"],
    completed: ["Terminé", "Completed"],
    cancelled: ["Annulé", "Cancelled"],
  };
  return labels[status]?.[isFr ? 0 : 1] ?? status.replaceAll("_", " ");
}
