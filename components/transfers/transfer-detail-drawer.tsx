"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Download, History, Link2, Repeat2, ShieldAlert, Trash2 } from "lucide-react";

import { deleteTransferAction } from "@/app/(app)/finance/transfers/actions";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { useI18n } from "@/components/layout/i18n-provider";
import { TransferCategoryBadge } from "@/components/transfers/transfer-category-badge";
import { TransferEntityBadge } from "@/components/transfers/transfer-entity-badge";
import { TransferForm } from "@/components/transfers/transfer-form";
import { TransferStatusBadge } from "@/components/transfers/transfer-status-badge";
import { ConfirmActionForm } from "@/components/shared/confirm-action-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatFinanceCurrency, getTransferEntityLabel } from "@/lib/finance/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type { AppRole } from "@/types/auth";
import type { CommentRecord } from "@/types/comment";
import type { MentionCandidate } from "@/types/notification";
import type { TransferFiltersData, TransferRecord } from "@/types/finance";

function getRestrictedValue(value: string | null, isFr: boolean) {
  if (value) return isFr ? "Restreint" : "Restricted";
  return isFr ? "Non renseigné" : "Not set";
}

export function TransferDetailDrawer({
  transfer,
  trigger,
  canManage,
  filterData,
  comments = [],
  role,
  currentUserId,
  mentionCandidates = [],
  returnPath = "/finance/transfers",
}: {
  transfer: TransferRecord;
  trigger: ReactNode;
  canManage: boolean;
  filterData?: TransferFiltersData;
  comments?: CommentRecord[];
  role: AppRole;
  currentUserId: string;
  mentionCandidates?: MentionCandidate[];
  returnPath?: string;
}) {
  const isSummary = transfer.viewMode === "summary";
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const tr = (fr: string, en: string) => (isFr ? fr : en);

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="top-0 right-0 left-auto h-screen max-h-screen w-full max-w-3xl translate-x-0 translate-y-0 rounded-none border-l border-border/70 px-0 py-0">
        <div className="flex h-full flex-col overflow-hidden">
          <DialogHeader className="border-b border-border/65 px-6 py-5">
            <DialogTitle className="text-xl">
              {isSummary ? transfer.beneficiary_name : transfer.transfer_reference}
            </DialogTitle>
            <DialogDescription>
              {tr("Virement sortant avec bénéficiaire, catégorie, éléments liés et historique.", "Outgoing transfer with beneficiary, category, linked records, and history.")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="flex flex-wrap gap-2">
              <TransferStatusBadge status={transfer.status} />
              <TransferEntityBadge entity={transfer.entity} />
              <TransferCategoryBadge category={transfer.category} />
            </div>

            {isSummary ? (
              <div className="rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm text-warning">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldAlert className="size-4" />
                  {tr("Les informations sensibles sont masquées en mode synthèse.", "Sensitive fields are hidden in summary mode.")}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label={tr("Bénéficiaire", "Beneficiary")} value={transfer.beneficiary_name} detail={tr("Destinataire du virement", "Transfer recipient")} />
              <Metric label={tr("Montant", "Amount")} value={formatFinanceCurrency(transfer.amount, transfer.currency)} detail={transfer.currency} />
              <Metric label={tr("Date du virement", "Transfer date")} value={formatDate(transfer.transfer_date)} detail={tr("Date prévue ou exécutée", "Planned or executed date")} />
              <Metric label={tr("Entité", "Entity")} value={getTransferEntityLabel(transfer.entity)} detail={tr("Société concernée", "Company concerned")} />
              <Metric label={tr("Client", "Client")} value={transfer.relatedClient?.name ?? tr("Aucun client lié", "No linked client")} detail={transfer.relatedClient?.contact_email ?? "—"} />
              <Metric label={tr("Projet", "Project")} value={transfer.relatedProject?.name ?? tr("Aucun projet lié", "No linked project")} detail={transfer.relatedProject?.status ?? "—"} />
              <Metric
                label={tr("Référence", "Reference")}
                value={isSummary ? getRestrictedValue(transfer.transfer_reference, isFr) : transfer.transfer_reference}
                detail={tr("Référence interne du virement", "Internal transfer reference")}
              />
            </div>

            {transfer.renewal.enabled ? (
              <div className="rounded-xl border border-primary/25 bg-primary/10 p-4 dark:border-primary/20 dark:bg-primary/10">
                <div className="flex items-center gap-2"><Repeat2 className="size-4 text-primary" /><p className="text-sm font-semibold text-primary">{tr("Renouvellement suivi", "Tracked renewal")}</p></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Metric label={tr("Prochaine échéance", "Next due date")} value={transfer.renewal.next_due_date ? formatDate(transfer.renewal.next_due_date) : tr("À définir", "Not set")} detail={tr("Date du prochain paiement", "Next payment date")} />
                  <Metric label={tr("Alerte", "Reminder")} value={tr(`${transfer.renewal.reminder_days} jours avant`, `${transfer.renewal.reminder_days} days before`)} detail={tr("Notification dans le logiciel", "In-app notification")} />
                  <Metric label={tr("Fréquence", "Frequency")} value={tr(`${transfer.renewal.interval_months} mois`, `Every ${transfer.renewal.interval_months} months`)} detail={tr("Période de renouvellement", "Renewal period")} />
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">{tr("Coordonnées bancaires", "Bank details")}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Metric
                  label={tr("Banque", "Bank")}
                  value={isSummary ? getRestrictedValue(transfer.beneficiary_bank, isFr) : (transfer.beneficiary_bank ?? tr("Non renseigné", "Not set"))}
                  detail={tr("Banque du bénéficiaire", "Beneficiary bank")}
                />
                <Metric
                  label={tr("Compte", "Account")}
                  value={isSummary ? getRestrictedValue(transfer.beneficiary_account, isFr) : (transfer.beneficiary_account ?? tr("Non renseigné", "Not set"))}
                  detail={tr("Compte du bénéficiaire", "Beneficiary account")}
                />
              </div>
            </div>

            <div className="rounded-xl border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">{tr("Notes", "Notes")}</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {isSummary ? getRestrictedValue(transfer.notes, isFr) : (transfer.notes ?? tr("Aucune note.", "No notes."))}
              </p>
              <Separator className="my-4 bg-border/60" />
              <p className="text-sm font-medium">{tr("Justificatifs", "Supporting documents")}</p>
              {transfer.supportingDocuments.length ? (
                <div className="mt-4 space-y-3">
                  {transfer.supportingDocuments.map((document) => (
                    <div key={document.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/65 bg-background/35 p-4">
                      <div>
                        <p className="text-sm font-medium">{document.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{document.file_name}</p>
                      </div>
                      <Button asChild variant="secondary" className="rounded-full px-4">
                        <a href={`/api/documents/${document.id}/download`} target="_blank" rel="noreferrer">
                          <Download className="size-4" />
                          {tr("Ouvrir", "Open")}
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {tr("Aucun justificatif joint.", "No proof attached yet.")}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border/65 bg-background/38 p-4">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-primary" />
                <h3 className="text-base font-semibold">{tr("Éléments liés", "Linked records")}</h3>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <LinkButton href={transfer.relatedClient ? `/clients/${transfer.relatedClient.id}` : undefined} label={tr("Fiche client", "Client profile")} unavailableLabel={tr("Non disponible", "Not available")} />
                <LinkButton href={transfer.relatedProject ? `/projects/${transfer.relatedProject.id}` : undefined} label={tr("Projet", "Project")} unavailableLabel={tr("Non disponible", "Not available")} />
              </div>
            </div>

            {canManage && filterData ? (
              <div className="flex flex-wrap gap-3">
                <TransferForm
                  mode="edit"
                  filterData={filterData}
                  defaults={{
                    transfer_id: transfer.id,
                    transfer_reference: transfer.transfer_reference,
                    beneficiary_name: transfer.beneficiary_name,
                    beneficiary_bank: transfer.beneficiary_bank ?? "",
                    beneficiary_account: transfer.beneficiary_account ?? "",
                    amount: transfer.amount.toString(),
                    currency: transfer.currency,
                    transfer_date: transfer.transfer_date,
                    status: transfer.status,
                    category: transfer.category,
                    entity: transfer.entity,
                    related_project_id: transfer.related_project_id ?? "",
                    related_client_id: transfer.related_client_id ?? "",
                    notes: transfer.notes ?? "",
                    renewal_enabled: transfer.renewal.enabled,
                    renewal_next_due_date: transfer.renewal.next_due_date ?? "",
                    renewal_reminder_days: String(transfer.renewal.reminder_days),
                    renewal_interval_months: String(transfer.renewal.interval_months),
                  }}
                />
                <ConfirmActionForm
                  action={deleteTransferAction}
                  fields={{ transfer_id: transfer.id, return_path: returnPath }}
                  title={tr("Supprimer ce virement ?", "Delete transfer?")}
                  description={tr(
                    `Le virement ${transfer.transfer_reference} sera définitivement supprimé. Cette action est irréversible.`,
                    `This will permanently delete transfer ${transfer.transfer_reference}. This action cannot be undone.`,
                  )}
                  confirmLabel={tr("Supprimer le virement", "Delete transfer")}
                  trigger={(
                    <Button type="button" variant="ghost" className="rounded-xl px-5 text-danger hover:bg-danger/10 hover:text-danger">
                      <Trash2 className="size-4" />
                      {tr("Supprimer le virement", "Delete transfer")}
                    </Button>
                  )}
                />
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <History className="size-4 text-primary" />
                <h3 className="text-base font-semibold">{tr("Historique", "Activity history")}</h3>
              </div>
              {transfer.recentActivity.length ? (
                transfer.recentActivity.map((activity) => (
                  <div key={activity.id} className="rounded-xl border border-border/65 bg-background/38 p-4">
                    <p className="text-sm font-medium">{activity.action}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {activity.metadata.summary
                        ?? (activity.metadata.field
                          ? tr(
                              `${activity.metadata.field} : ${activity.metadata.from ?? "vide"} → ${activity.metadata.to ?? "vide"}`,
                              `${activity.metadata.field} changed from ${activity.metadata.from ?? "empty"} to ${activity.metadata.to ?? "empty"}`,
                            )
                          : tr("Activité enregistrée.", "Transfer activity recorded."))}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {activity.user?.full_name ?? tr("Système", "System")} / {formatDate(activity.created_at)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                  {tr("Aucune activité pour le moment.", "No activity yet.")}
                </div>
              )}
            </div>

            <CommentsPanel
              comments={comments}
              entityType="transfer"
              entityId={transfer.id}
              returnPath={returnPath}
              role={role}
              currentUserId={currentUserId}
              mentionCandidates={mentionCandidates}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border/65 bg-background/38 p-4">
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 text-sm font-medium">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function LinkButton({ href, label, unavailableLabel }: { href?: string; label: string; unavailableLabel: string }) {
  if (!href) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        {label} · {unavailableLabel}
      </div>
    );
  }

  return (
    <Button asChild variant="secondary" className="justify-start rounded-xl px-4">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
