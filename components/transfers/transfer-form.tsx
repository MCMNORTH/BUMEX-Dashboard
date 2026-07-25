"use client";

import { useActionState } from "react";
import { Plus, SquarePen } from "lucide-react";

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
            <label className="text-sm font-medium" htmlFor={`${mode}-reference`}>{t("finance.transferForm.fields.reference", "Transfer reference")}</label>
            <Input id={`${mode}-reference`} name="transfer_reference" defaultValue={defaults?.transfer_reference ?? ""} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-beneficiary`}>{t("finance.transferForm.fields.beneficiary", "Beneficiary")}</label>
            <Input id={`${mode}-beneficiary`} name="beneficiary_name" defaultValue={defaults?.beneficiary_name ?? ""} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-bank`}>{t("finance.transferForm.fields.bank", "Beneficiary bank")}</label>
            <Input id={`${mode}-bank`} name="beneficiary_bank" defaultValue={defaults?.beneficiary_bank ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-account`}>{t("finance.transferForm.fields.account", "Beneficiary account")}</label>
            <Input id={`${mode}-account`} name="beneficiary_account" defaultValue={defaults?.beneficiary_account ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-amount`}>{t("finance.transferForm.fields.amount", "Amount")}</label>
            <Input id={`${mode}-amount`} name="amount" type="number" min="0" step="0.01" defaultValue={defaults?.amount ?? ""} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-currency`}>{t("finance.transferForm.fields.currency", "Currency")}</label>
            <Input id={`${mode}-currency`} name="currency" defaultValue={defaults?.currency ?? "USD"} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-date`}>{t("finance.transferForm.fields.transferDate", "Transfer date")}</label>
            <Input id={`${mode}-date`} name="transfer_date" type="date" defaultValue={defaults?.transfer_date ?? ""} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-status`}>{t("finance.transferForm.fields.status", "Status")}</label>
            <ModernSelect
              id={`${mode}-status`}
              name="status"
              defaultValue={defaults?.status ?? "planned"}
              options={[
                { value: "planned", label: t("finance.status.transfer.planned", "Planned") },
                { value: "pending", label: t("finance.status.transfer.pending", "Pending") },
                { value: "sent", label: t("finance.status.transfer.sent", "Sent") },
                { value: "confirmed", label: t("finance.status.transfer.confirmed", "Confirmed") },
                { value: "failed", label: t("finance.status.transfer.failed", "Failed") },
                { value: "cancelled", label: t("finance.status.transfer.cancelled", "Cancelled") },
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
                { value: "hosting", label: t("finance.categories.hosting", "Hosting") },
                { value: "taxes", label: t("finance.categories.taxes", "Taxes") },
                { value: "rent", label: t("finance.categories.rent", "Rent") },
                { value: "other", label: t("finance.categories.other", "Other") },
              ]}
            />
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
