"use client";

import { useActionState, useState } from "react";
import { CalendarClock, ChevronDown, Landmark, Plus, Repeat2, SquarePen } from "lucide-react";

import {
  createTransferAction,
  updateTransferAction,
  type TransferActionState,
} from "@/app/(app)/finance/transfers/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/layout/i18n-provider";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { Textarea } from "@/components/ui/textarea";
import type { TransferFiltersData, TransferFormValues } from "@/types/finance";

const initialState: TransferActionState = {};

function suggestNextRenewalDate(value: string | undefined, intervalMonths: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";

  const date = new Date(`${value}T12:00:00`);
  const months = Number(intervalMonths ?? "12");
  date.setMonth(date.getMonth() + (Number.isFinite(months) && months > 0 ? months : 12));
  return date.toISOString().slice(0, 10);
}

export function TransferForm({
  mode,
  filterData,
  defaults,
  triggerLabel,
  returnPath,
}: {
  mode: "create" | "edit";
  filterData: TransferFiltersData;
  defaults?: Partial<TransferFormValues> & { transfer_id?: string };
  triggerLabel?: string;
  returnPath?: string;
}) {
  const { locale, t } = useI18n();
  const [state, formAction] = useActionState(
    mode === "create" ? createTransferAction : updateTransferAction,
    initialState,
  );
  const [renewalEnabled, setRenewalEnabled] = useState(defaults?.renewal_enabled ?? false);
  const [showBankDetails, setShowBankDetails] = useState(Boolean(defaults?.beneficiary_bank || defaults?.beneficiary_account));
  const suggestedRenewalDate =
    defaults?.renewal_next_due_date ||
    suggestNextRenewalDate(defaults?.transfer_date, defaults?.renewal_interval_months);

  return (
    <Dialog>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="rounded-full px-5">
            <Plus className="size-4" />
            {triggerLabel ?? t("finance.transferForm.actions.create", "Create transfer")}
          </Button>
        ) : (
          <Button variant="secondary" className="rounded-full px-5">
            <SquarePen className="size-4" />
            {triggerLabel ?? t("finance.transferForm.actions.edit", "Edit transfer")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-[min(94vw,1240px)] rounded-[28px]">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("finance.transferForm.titleCreate", "Create transfer") : t("finance.transferForm.titleEdit", "Edit transfer")}</DialogTitle>
          <DialogDescription>
            {t("finance.transferForm.description", "Track outgoing transfers without processing real banking operations.")}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {defaults?.transfer_id ? <input type="hidden" name="transfer_id" value={defaults.transfer_id} /> : null}
          {returnPath ? <input type="hidden" name="return_path" value={returnPath} /> : null}
          <input type="hidden" name="ui_locale" value={locale} />

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-supporting-file`}>{t("finance.transferForm.fields.supportingDocument", "Supporting document")}</label>
            <Input
              id={`${mode}-supporting-file`}
              name="supporting_file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
              required={mode === "create"}
            />
            <p className="text-xs text-muted-foreground">
              {t("finance.transferForm.supportingFileHint", "Upload supplier invoice, receipt, transfer proof, tax slip, or any supporting outgoing expense file.")}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-reference`}>Référence de la facture ou du paiement</label>
            <Input id={`${mode}-reference`} name="transfer_reference" defaultValue={defaults?.transfer_reference ?? ""} required />
            <p className="text-xs text-muted-foreground">Ex. facture Kapen, numéro de reçu ou votre propre référence.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-beneficiary`}>Fournisseur ou site payé</label>
            <Input id={`${mode}-beneficiary`} name="beneficiary_name" defaultValue={defaults?.beneficiary_name ?? ""} required />
            <p className="text-xs text-muted-foreground">Ex. Kapen, OVH, Google, Microsoft ou un prestataire.</p>
          </div>

          <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50/75 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
            <button type="button" onClick={() => setShowBankDetails((current) => !current)} className="flex w-full items-center justify-between gap-3 text-left text-sm font-medium">
              <span className="flex items-center gap-2"><Landmark className="size-4 text-primary" /> Informations bancaires <span className="text-xs font-normal text-muted-foreground">(uniquement pour un virement)</span></span>
              <ChevronDown className={`size-4 text-muted-foreground transition-transform ${showBankDetails ? "rotate-180" : ""}`} />
            </button>
            {showBankDetails ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-bank`}>Banque du fournisseur</label>
                  <Input id={`${mode}-bank`} name="beneficiary_bank" defaultValue={defaults?.beneficiary_bank ?? ""} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-account`}>Compte / IBAN du fournisseur</label>
                  <Input id={`${mode}-account`} name="beneficiary_account" defaultValue={defaults?.beneficiary_account ?? ""} />
                </div>
              </div>
            ) : (
              <>
                <input type="hidden" name="beneficiary_bank" value="" />
                <input type="hidden" name="beneficiary_account" value="" />
              </>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-amount`}>{t("finance.transferForm.fields.amount", "Amount")}</label>
            <Input id={`${mode}-amount`} name="amount" type="number" min="0" step="0.01" defaultValue={defaults?.amount ?? ""} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-currency`}>{t("finance.transferForm.fields.currency", "Currency")}</label>
            <Input id={`${mode}-currency`} name="currency" defaultValue={defaults?.currency ?? "USD"} placeholder="Ex. MAD, MRU, EUR ou USD" required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-date`}>Date de paiement</label>
            <Input id={`${mode}-date`} name="transfer_date" type="date" defaultValue={defaults?.transfer_date ?? ""} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-status`}>Statut du paiement</label>
            <ModernSelect
              id={`${mode}-status`}
              name="status"
              defaultValue={defaults?.status ?? "planned"}
              options={[
                { value: "planned", label: "À prévoir — pas encore payé" },
                { value: "pending", label: "En attente de paiement" },
                { value: "sent", label: "Paiement envoyé — en attente de confirmation" },
                { value: "confirmed", label: "Payé et confirmé" },
                { value: "failed", label: "Échec du paiement" },
                { value: "cancelled", label: "Annulé" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-category`}>{t("finance.transferForm.fields.category", "Category")}</label>
            <ModernSelect
              id={`${mode}-category`}
              name="category"
              defaultValue={defaults?.category ?? "supplier"}
              options={[
                { value: "supplier", label: t("finance.categories.supplier", "Supplier") },
                { value: "salary", label: t("finance.categories.salary", "Salary") },
                { value: "subcontractor", label: t("finance.categories.subcontractor", "Subcontractor") },
                { value: "software", label: t("finance.categories.software", "Software") },
                { value: "hosting", label: "Domaine, DNS ou hébergement" },
                { value: "taxes", label: t("finance.categories.taxes", "Taxes") },
                { value: "rent", label: t("finance.categories.rent", "Rent") },
                { value: "other", label: t("finance.categories.other", "Other") },
              ]}
            />
          </div>

          <div className="sm:col-span-2 rounded-[22px] border border-indigo-200 bg-[linear-gradient(135deg,#eef5ff_0%,#f8f7ff_100%)] p-4 dark:border-indigo-400/20 dark:bg-indigo-500/10">
            <label className="flex cursor-pointer items-start gap-3">
              <input name="renewal_enabled" type="checkbox" checked={renewalEnabled} onChange={(event) => setRenewalEnabled(event.target.checked)} className="mt-1 size-4 rounded border-slate-300 text-primary focus:ring-primary" />
              <span><span className="flex items-center gap-2 text-sm font-semibold"><Repeat2 className="size-4 text-indigo-600 dark:text-indigo-300" /> Paiement récurrent ou renouvellement</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Activez cette option pour un domaine, un hébergement, un abonnement ou tout service à payer à nouveau.</span></span>
            </label>
            {renewalEnabled ? (
              <div className="mt-4 grid gap-4 border-t border-indigo-200/70 pt-4 sm:grid-cols-3 dark:border-indigo-400/15">
                <div className="space-y-2 sm:col-span-1"><label className="text-sm font-medium" htmlFor={`${mode}-next-due`}>Prochaine échéance</label><Input id={`${mode}-next-due`} name="renewal_next_due_date" type="date" defaultValue={suggestedRenewalDate} required={renewalEnabled} /></div>
                <div className="space-y-2"><label className="text-sm font-medium" htmlFor={`${mode}-interval`}>Fréquence (mois)</label><Input id={`${mode}-interval`} name="renewal_interval_months" type="number" min="1" defaultValue={defaults?.renewal_interval_months ?? "12"} required={renewalEnabled} /></div>
                <div className="space-y-2"><label className="text-sm font-medium" htmlFor={`${mode}-reminder`}>Alerter avant (jours)</label><Input id={`${mode}-reminder`} name="renewal_reminder_days" type="number" min="0" defaultValue={defaults?.renewal_reminder_days ?? "30"} required={renewalEnabled} /></div>
                <p className="sm:col-span-3 flex items-center gap-2 text-xs leading-5 text-muted-foreground"><CalendarClock className="size-3.5" /> L’alerte apparaîtra dans Finance et vos notifications à partir de la date choisie.</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-entity`}>Entity</label>
            <ModernSelect
              id={`${mode}-entity`}
              name="entity"
              defaultValue={defaults?.entity ?? "bumex_it"}
              options={[
                { value: "bumex_it", label: "BUMEX IT" },
                { value: "insec", label: "INSEC" },
                { value: "cnam_intec", label: "CNAM INTEC" },
                { value: "ltm_yh", label: "LTM-YH" },
                { value: "unassigned", label: "Unassigned" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-project`}>{t("finance.transferForm.fields.relatedProject", "Related project")}</label>
            <ModernSelect
              id={`${mode}-project`}
              name="related_project_id"
              defaultValue={defaults?.related_project_id ?? ""}
              placeholder={t("finance.transferForm.placeholders.noLinkedProject", "No linked project")}
              options={[
                { value: "", label: t("finance.transferForm.placeholders.noLinkedProject", "No linked project") },
                ...filterData.projects.map((project) => ({
                  value: project.id,
                  label: project.name,
                })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-client`}>{t("finance.transferForm.fields.relatedClient", "Related client")}</label>
            <ModernSelect
              id={`${mode}-client`}
              name="related_client_id"
              defaultValue={defaults?.related_client_id ?? ""}
              placeholder={t("finance.transferForm.placeholders.noLinkedClient", "No linked client")}
              options={[
                { value: "", label: t("finance.transferForm.placeholders.noLinkedClient", "No linked client") },
                ...filterData.clients.map((client) => ({
                  value: client.id,
                  label: client.name,
                })),
              ]}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-notes`}>{t("finance.transferForm.fields.notes", "Notes")}</label>
            <Textarea id={`${mode}-notes`} name="notes" defaultValue={defaults?.notes ?? ""} />
          </div>

          {state.error ? (
            <div className="sm:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {state.error}
            </div>
          ) : null}

          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="submit" className="rounded-2xl px-5">
              {mode === "create" ? t("finance.transferForm.actions.create", "Create transfer") : t("finance.transferForm.actions.save", "Save changes")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
